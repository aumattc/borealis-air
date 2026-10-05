import { badRequest, notFound, unauthorized } from '../lib/errors.ts'
import { queryOne } from '../db/index.ts'
import { logger } from '../lib/log.ts'
import { rateLimit } from '../lib/rateLimit.ts'
import { config } from '../config.ts'
import { readCartCookie, writeCartCookie } from '../http/auth.ts'
import type { Router } from '../http/router.ts'
import { Validator, asString } from '../lib/validate.ts'
import { getOrCreateCart, markCartConverted } from '../services/cart.ts'
import {
  cancelOrder,
  createOrder,
  getOrderByRef,
  getOrderRowByIntent,
  markFailed,
  markPaid,
} from '../services/orders.ts'
import { recordWebhookEvent, wasWebhookHandled } from '../services/webhooks.ts'
import { getProvider, providerName } from '../payments/index.ts'

export function registerCheckoutRoutes(router: Router): void {
  /**
   * Creates a pending order and returns the client secret needed to confirm
   * payment. Totals are computed server-side from the catalog.
   */
  router.post('/api/checkout', async (ctx) => {
    rateLimit(`checkout:${ctx.ip}`, { windowMs: 60_000, max: config.rateLimits.checkoutPerMinute })

    const body = new Validator(ctx.body)
      .email('email')
      .string('firstName', { min: 1, max: 80 })
      .string('lastName', { min: 1, max: 80 })
      .string('addressLine1', { min: 3, max: 200 })
      .string('addressLine2', { max: 200, required: false })
      .string('city', { min: 1, max: 100 })
      .string('postcode', { min: 2, max: 20 })
      .string('country', { min: 2, max: 80 })
      .done()

    const cartId = getOrCreateCart(readCartCookie(ctx), ctx.customerId)
    writeCartCookie(ctx, cartId)

    const result = await createOrder({
      cartId,
      customerId: ctx.customerId,
      email: asString(body.email),
      shipping: {
        firstName: asString(body.firstName),
        lastName: asString(body.lastName),
        addressLine1: asString(body.addressLine1),
        addressLine2: body.addressLine2 === undefined ? undefined : asString(body.addressLine2),
        city: asString(body.city),
        postcode: asString(body.postcode),
        country: asString(body.country),
      },
    })

    markCartConverted(cartId)
    logger.info('order created', { ref: result.order.ref, totalCents: result.order.totalCents })

    return { status: 201, body: result }
  })

  /**
   * Order lookup for the confirmation page. Signed-in customers may read their
   * own orders; a guest must present the reference, which acts as a shared
   * secret. Email addresses are never exposed on this endpoint for guests.
   */
  router.get('/api/orders/:ref', (ctx) => {
    const ref = ctx.params.ref
    if (!ref) throw badRequest('An order reference is required.')

    const order = getOrderByRef(ref)
    if (!order) throw notFound('We cannot find that order.')

    const row = getOrderRowByIntentForRef(ref)
    const ownerId = row?.customer_id ?? null

    if (ownerId && ctx.customerId !== ownerId) {
      // Do not confirm that the order exists to anyone else.
      throw notFound('We cannot find that order.')
    }

    return { body: { order } }
  })

  /** Cancels an unpaid order and releases its stock hold. */
  router.post('/api/orders/:ref/cancel', (ctx) => {
    const ref = ctx.params.ref
    if (!ref) throw badRequest('An order reference is required.')

    const order = getOrderByRef(ref)
    if (!order) throw notFound('We cannot find that order.')

    const row = getOrderRowByIntentForRef(ref)
    if (row?.customer_id && ctx.customerId !== row.customer_id) {
      throw unauthorized('You cannot cancel that order.')
    }

    return { body: { order: cancelOrder(String(row?.id), 'cancelled from the storefront') } }
  })

  /**
   * Development-only payment simulator. It produces a properly signed webhook
   * and feeds it through the real handler, so the production path is exercised
   * rather than bypassed. Refused outside development.
   */
  router.post('/api/dev/payments/:intentId/confirm', async (ctx) => {
    if (providerName() !== 'mock') {
      throw badRequest('The payment simulator is only available with the mock provider.')
    }

    const intentId = ctx.params.intentId
    if (!intentId) throw badRequest('A payment intent id is required.')

    const body = (ctx.body ?? {}) as { outcome?: unknown }
    const outcome = body.outcome === 'fail' ? 'fail' : 'succeed'

    const row = getOrderRowByIntent(intentId)
    if (!row) throw notFound('No order is waiting on that payment intent.')

    const { signWebhookPayload } = await import('../payments/mock.ts')
    const eventId = `evt_dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const payload = JSON.stringify({
      id: eventId,
      type: outcome === 'succeed' ? 'payment_intent.succeeded' : 'payment_intent.payment_failed',
      data: {
        object: {
          id: intentId,
          amount: Number(row.total_cents),
          status: outcome === 'succeed' ? 'succeeded' : 'requires_payment_method',
          metadata: { order_ref: String(row.ref) },
        },
      },
    })

    await applyWebhookPayload(payload, signWebhookPayload(payload))
    return { body: { ok: true, outcome, ref: String(row.ref) } }
  })
}

/* ------------------------------------------------------------------ */
/*  Webhooks                                                           */
/* ------------------------------------------------------------------ */

function getOrderRowByIntentForRef(ref: string) {
  // Only the id and owner are needed here, so this stays a narrow query.
  return queryOne<{ id: string; customer_id: string | null }>(
    'SELECT id, customer_id FROM orders WHERE ref = ?',
    [ref],
  )
}

/**
 * Applies a verified webhook payload. Shared by the HTTP endpoint and the dev
 * simulator so both go through identical verification and idempotency logic.
 */
export async function applyWebhookPayload(rawBody: string, signature: string | undefined): Promise<void> {
  const provider = getProvider()
  const event = provider.verifyWebhook(rawBody, signature)

  if (event.id && wasWebhookHandled(provider.name, event.id)) {
    logger.debug('duplicate webhook ignored', { eventId: event.id })
    return
  }

  const row = event.intentId ? getOrderRowByIntent(event.intentId) : undefined
  const orderId = row ? String(row.id) : null

  switch (event.type) {
    case 'payment_intent.succeeded':
    case 'payment_intent.amount_capturable_updated':
      if (orderId) {
        markPaid(orderId, {
          provider: provider.name,
          intentId: event.intentId,
          amountCents: event.amountCents,
          eventId: event.id,
        })
      } else {
        logger.warn('webhook for unknown payment intent', { intentId: event.intentId })
      }
      break

    case 'payment_intent.payment_failed':
    case 'payment_intent.canceled':
      if (orderId) {
        markFailed(orderId, {
          provider: provider.name,
          intentId: event.intentId,
          reason: event.type,
          eventId: event.id,
        })
      }
      break

    default:
      logger.debug('unhandled webhook type', { type: event.type })
  }

  if (event.id) recordWebhookEvent(provider.name, event.id)
}

export function registerWebhookRoutes(router: Router): void {
  router.post('/api/webhooks/payments', async (ctx) => {
    // Signature verification happens inside; a bad signature throws a 400.
    await applyWebhookPayload(ctx.rawBody, ctx.header('stripe-signature'))
    return { body: { received: true } }
  })
}
