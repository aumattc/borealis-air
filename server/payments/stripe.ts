import { hmacSha256Hex, safeEqual } from '../lib/crypto.ts'
import { badGateway, badRequest, serviceUnavailable } from '../lib/errors.ts'
import { logger } from '../lib/log.ts'
import { mapStatus, type CreateIntentInput, type PaymentIntentResult, type PaymentProvider, type WebhookEvent } from './types.ts'

/**
 * Stripe provider built on the REST API via fetch.
 *
 * Deliberately does not depend on the Stripe SDK: the surface we use is small,
 * and keeping it here makes the request shapes and the signature verification
 * auditable in one file.
 *
 * Credentials are injected rather than read from config, so the same code path
 * serves both the sandbox and production key sets selected in the admin CMS.
 */

const API_BASE = 'https://api.stripe.com/v1'
const TIMEOUT_MS = 15_000
/** Stripe's recommended replay window. */
const WEBHOOK_TOLERANCE_SECONDS = 300

export interface StripeCredentialsInput {
  secretKey: string
  publishableKey: string
  webhookSecret: string
}

interface StripeErrorBody {
  error?: { message?: string; type?: string; code?: string }
}

interface StripeIntent {
  id: string
  client_secret?: string | null
  status?: string
  amount?: number
  metadata?: Record<string, string>
}

export interface CheckoutSessionInput {
  orderRef: string
  orderId: string
  amountCents: number
  currency: string
  email: string
  successUrl: string
  cancelUrl: string
  productName: string
  metadata: Record<string, string>
  idempotencyKey: string
}

export interface CheckoutSessionResult {
  id: string
  url: string
  paymentIntentId: string | null
  expiresAt: number | null
  publishableKey: string
}

interface StripeSession {
  id: string
  url?: string | null
  payment_intent?: string | null
  expires_at?: number
  status?: string
}

/**
 * Builds a provider bound to one set of credentials. Signature verification and
 * API calls all use the injected values, so switching modes in the CMS takes
 * effect on the next request without a restart.
 */
export function createStripeProvider(credentials: StripeCredentialsInput): PaymentProvider {
  const { secretKey, publishableKey, webhookSecret } = credentials

  async function stripeRequest<T>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: URLSearchParams; idempotencyKey?: string },
  ): Promise<T> {
    if (!secretKey) {
      throw serviceUnavailable('Stripe is not configured. Add a secret key in the admin settings.')
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }
    if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey

    let response: Response
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method: init.method,
        headers,
        body: init.body?.toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (err) {
      logger.error('stripe request failed', { path, message: String(err) })
      throw badGateway('Could not reach the payment provider. Please try again.')
    }

    const text = await response.text()
    let parsed: unknown
    try {
      parsed = text ? JSON.parse(text) : {}
    } catch {
      parsed = {}
    }

    if (!response.ok) {
      const message = (parsed as StripeErrorBody)?.error?.message ?? `HTTP ${response.status}`
      // Log the provider's reason, but return something safe to the client.
      logger.warn('stripe error', { path, status: response.status, message })
      throw badGateway(`Payment provider rejected the request: ${message}`)
    }

    return parsed as T
  }

  function toResult(intent: StripeIntent): PaymentIntentResult {
    return {
      id: intent.id,
      clientSecret: intent.client_secret ?? null,
      status: mapStatus(intent.status),
      publishableKey,
    }
  }

  return {
    name: 'stripe',

    async createIntent(input: CreateIntentInput): Promise<PaymentIntentResult> {
      if (input.amountCents <= 0) throw badRequest('Payment amount must be greater than zero.')

      const body = new URLSearchParams()
      body.set('amount', String(input.amountCents))
      body.set('currency', input.currency)
      body.set('receipt_email', input.email)
      // Automatic methods let Stripe decide which wallets/cards to offer.
      body.set('automatic_payment_methods[enabled]', 'true')
      for (const [key, value] of Object.entries(input.metadata)) {
        body.set(`metadata[${key}]`, value)
      }

      const intent = await stripeRequest<StripeIntent>('/payment_intents', {
        method: 'POST',
        body,
        idempotencyKey: input.idempotencyKey,
      })
      return toResult(intent)
    },

    async retrieveIntent(id: string): Promise<PaymentIntentResult> {
      const intent = await stripeRequest<StripeIntent>(`/payment_intents/${encodeURIComponent(id)}`, {
        method: 'GET',
      })
      return toResult(intent)
    },

    async refund(id: string, amountCents?: number): Promise<{ id: string; status: string }> {
      const body = new URLSearchParams()
      body.set('payment_intent', id)
      if (amountCents !== undefined) body.set('amount', String(amountCents))

      const refund = await stripeRequest<{ id: string; status: string }>('/refunds', {
        method: 'POST',
        body,
        // Refunding the same intent twice must not double-refund.
        idempotencyKey: `refund_${id}_${amountCents ?? 'full'}`,
      })
      return { id: refund.id, status: refund.status }
    },

    verifyWebhook(rawBody: string, signatureHeader: string | undefined): WebhookEvent {
      if (!webhookSecret) throw serviceUnavailable('Webhook secret is not configured.')
      if (!signatureHeader) throw badRequest('Missing webhook signature.')

      const { timestamp, signatures } = parseStripeSignature(signatureHeader)
      if (timestamp === null || signatures.length === 0) {
        throw badRequest('Malformed webhook signature header.')
      }

      // Reject replays outside the tolerance window.
      const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp)
      if (age > WEBHOOK_TOLERANCE_SECONDS) {
        throw badRequest('Webhook timestamp is outside the tolerance window.')
      }

      const expected = hmacSha256Hex(webhookSecret, `${timestamp}.${rawBody}`)
      // Stripe may include several v1 signatures during secret rotation.
      const matched = signatures.some((sig) => safeEqual(expected, sig))
      if (!matched) throw badRequest('Webhook signature does not match.')

      return parseEvent(rawBody)
    },

    async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
      if (input.amountCents <= 0) throw badRequest('Payment amount must be greater than zero.')

      const body = new URLSearchParams()
      body.set('mode', 'payment')
      body.set('success_url', input.successUrl)
      body.set('cancel_url', input.cancelUrl)
      body.set('customer_email', input.email)
      // A single line item priced at the server-computed order total keeps the
      // catalog and the charge in lockstep; the breakdown travels in metadata.
      body.set('line_items[0][quantity]', '1')
      body.set('line_items[0][price_data][currency]', input.currency)
      body.set('line_items[0][price_data][unit_amount]', String(input.amountCents))
      body.set('line_items[0][price_data][product_data][name]', input.productName)
      for (const [key, value] of Object.entries(input.metadata)) {
        body.set(`metadata[${key}]`, value)
        // Copy onto the PaymentIntent so intent-scoped webhooks carry the ref.
        body.set(`payment_intent_data[metadata][${key}]`, value)
      }

      const session = await stripeRequest<StripeSession>('/checkout/sessions', {
        method: 'POST',
        body,
        idempotencyKey: input.idempotencyKey,
      })

      if (!session.url) throw badGateway('Stripe did not return a checkout URL.')

      return {
        id: session.id,
        url: session.url,
        paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        expiresAt: typeof session.expires_at === 'number' ? session.expires_at : null,
        publishableKey,
      }
    },

    async retrieveCheckoutSession(id: string): Promise<{ paymentIntentId: string | null; status: string }> {
      const session = await stripeRequest<StripeSession>(`/checkout/sessions/${encodeURIComponent(id)}`, {
        method: 'GET',
      })
      return {
        paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        status: session.status ?? 'unknown',
      }
    },
  }
}

/** Parses a verified payload into the provider-neutral event shape. */
export function parseEvent(rawBody: string): WebhookEvent {
  const event = JSON.parse(rawBody) as {
    id?: string
    type?: string
    data?: {
      object?: StripeIntent & { payment_intent?: string | null; amount_total?: number; metadata?: Record<string, string> }
    }
  }
  const object = event.data?.object

  // Checkout Session events expose the PaymentIntent id under `payment_intent`;
  // PaymentIntent events expose it as `id`.
  const isSession = typeof event.type === 'string' && event.type.startsWith('checkout.session')
  const intentId = isSession
    ? typeof object?.payment_intent === 'string'
      ? object.payment_intent
      : null
    : object?.id ?? null

  const amount = isSession
    ? typeof object?.amount_total === 'number'
      ? object.amount_total
      : null
    : typeof object?.amount === 'number'
      ? object.amount
      : null

  return {
    id: event.id ?? '',
    type: event.type ?? 'unknown',
    intentId,
    sessionId: isSession ? object?.id ?? null : null,
    orderRef: object?.metadata?.order_ref ?? null,
    amountCents: amount,
    status: object?.status ? mapStatus(object.status) : null,
  }
}

export interface StripeSignature {
  timestamp: number | null
  signatures: string[]
}

/** Collects every `v1` value so secret rotation does not break verification. */
export function parseStripeSignature(header: string): StripeSignature {
  let timestamp: number | null = null
  const signatures: string[] = []

  for (const part of header.split(',')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const key = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (key === 't') {
      const n = Number.parseInt(value, 10)
      if (Number.isFinite(n)) timestamp = n
    } else if (key === 'v1' && value) {
      signatures.push(value)
    }
  }

  return { timestamp, signatures }
}

export const stripeWebhookToleranceSeconds = WEBHOOK_TOLERANCE_SECONDS
