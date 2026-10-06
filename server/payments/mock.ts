import { hmacSha256Hex, safeEqual, uuid } from '../lib/crypto.ts'
import { badRequest } from '../lib/errors.ts'
import { config } from '../config.ts'
import {
  mapStatus,
  type CheckoutSessionInput,
  type CheckoutSessionResult,
  type CreateIntentInput,
  type PaymentIntentResult,
  type PaymentProvider,
  type WebhookEvent,
} from './types.ts'

/**
 * Development / test provider.
 *
 * It signs webhooks with the same HMAC scheme Stripe uses, so the production
 * verification path is exercised in tests rather than bypassed. It must never
 * be enabled in production — `assertUsable()` guards that.
 */

const WEBHOOK_TOLERANCE_SECONDS = 300

function secret(): string {
  return config.payments.stripe.webhookSecret || 'whsec_mock_dev_only'
}

export const mockProvider: PaymentProvider = {
  name: 'mock',

  async createIntent(input: CreateIntentInput): Promise<PaymentIntentResult> {
    if (config.isProd) {
      throw new Error('The mock payment provider cannot be used in production.')
    }
    if (input.amountCents <= 0) throw badRequest('Payment amount must be greater than zero.')

    const id = `pi_mock_${uuid().replace(/-/g, '').slice(0, 20)}`
    return {
      id,
      // Mirrors Stripe's `pi_..._secret_...` shape without being usable anywhere.
      clientSecret: `${id}_secret_${uuid().replace(/-/g, '').slice(0, 16)}`,
      status: 'requires_payment',
      publishableKey: config.payments.stripe.publishableKey || 'pk_test_mock',
    }
  },

  async retrieveIntent(id: string): Promise<PaymentIntentResult> {
    return { id, clientSecret: null, status: 'requires_payment' }
  },

  async refund(id: string): Promise<{ id: string; status: string }> {
    return { id: `re_mock_${id.slice(-10)}`, status: 'succeeded' }
  },

  /**
   * Stands in for Stripe hosted Checkout: instead of redirecting to Stripe, it
   * sends the shopper to an in-app page that settles the intent through the
   * same signed-webhook path the real provider uses.
   */
  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    if (config.isProd) throw new Error('The mock payment provider cannot be used in production.')

    const intentId = `pi_mock_${uuid().replace(/-/g, '').slice(0, 20)}`
    const sessionId = `cs_mock_${uuid().replace(/-/g, '').slice(0, 20)}`
    const url = `${config.storefrontUrl}/checkout/mock?session=${sessionId}&ref=${encodeURIComponent(input.orderRef)}&intent=${intentId}`

    return {
      id: sessionId,
      url,
      paymentIntentId: intentId,
      expiresAt: Math.floor(Date.now() / 1000) + 30 * 60,
      publishableKey: config.payments.stripe.publishableKey || 'pk_test_mock',
    }
  },

  async retrieveCheckoutSession(_id: string): Promise<{ paymentIntentId: string | null; status: string }> {
    return { paymentIntentId: null, status: 'open' }
  },

  verifyWebhook(rawBody: string, signatureHeader: string | undefined): WebhookEvent {
    if (!signatureHeader) throw badRequest('Missing webhook signature.')

    const parsed = parseSignatureHeader(signatureHeader)
    if (!parsed) throw badRequest('Malformed webhook signature header.')

    const age = Math.abs(Math.floor(Date.now() / 1000) - parsed.timestamp)
    if (age > WEBHOOK_TOLERANCE_SECONDS) {
      throw badRequest('Webhook timestamp is outside the tolerance window.')
    }

    const expected = hmacSha256Hex(secret(), `${parsed.timestamp}.${rawBody}`)
    if (!safeEqual(expected, parsed.signature)) {
      throw badRequest('Webhook signature does not match.')
    }

    const event = JSON.parse(rawBody) as {
      id?: string
      type?: string
      data?: { object?: { id?: string; metadata?: Record<string, string>; amount?: number; status?: string } }
    }

    const object = event.data?.object
    return {
      id: event.id ?? `evt_mock_${uuid().slice(0, 12)}`,
      type: event.type ?? 'unknown',
      intentId: object?.id ?? null,
      orderRef: object?.metadata?.order_ref ?? null,
      amountCents: typeof object?.amount === 'number' ? object.amount : null,
      status: mapStatus(object?.status),
    }
  },
}

export interface ParsedSignature {
  timestamp: number
  signature: string
}

/** Parses `t=1699999999,v1=abcdef...`, ignoring unknown scheme keys. */
export function parseSignatureHeader(header: string): ParsedSignature | null {
  let timestamp: number | null = null
  let signature: string | null = null

  for (const part of header.split(',')) {
    const [key, value] = part.split('=').map((s) => s.trim())
    if (key === 't' && value) {
      const n = Number.parseInt(value, 10)
      if (Number.isFinite(n)) timestamp = n
    } else if (key === 'v1' && value) {
      signature = value
    }
  }

  if (timestamp === null || signature === null) return null
  return { timestamp, signature }
}

/**
 * Builds a signature header for a payload. Used by the dev simulator and the
 * test suite so the verification path is genuinely exercised.
 */
export function signWebhookPayload(rawBody: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = hmacSha256Hex(secret(), `${timestamp}.${rawBody}`)
  return `t=${timestamp},v1=${signature}`
}

export const webhookToleranceSeconds = WEBHOOK_TOLERANCE_SECONDS
