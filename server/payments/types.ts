/**
 * Payment gateway abstraction.
 *
 * Cardinal rule: card data never reaches this server. The storefront collects
 * card details with the provider's own client-side library and sends us only a
 * provider token or PaymentIntent id. Nothing here accepts a PAN or CVC.
 */

export type IntentStatus = 'requires_payment' | 'processing' | 'succeeded' | 'failed'

export interface CreateIntentInput {
  orderRef: string
  amountCents: number
  currency: string
  email: string
  metadata: Record<string, string>
  /**
   * Sent upstream as an idempotency key so a retried request cannot create a
   * second charge.
   */
  idempotencyKey: string
}

export interface PaymentIntentResult {
  id: string
  /** Passed to the provider's client-side confirmation step. Never persisted. */
  clientSecret: string | null
  status: IntentStatus
  /** Present so the client knows which key to initialise its library with. */
  publishableKey?: string
}

export interface WebhookEvent {
  /** Provider event id — used to make webhook handling idempotent. */
  id: string
  type: string
  intentId: string | null
  orderRef: string | null
  amountCents: number | null
  status: IntentStatus | null
}

export interface PaymentProvider {
  readonly name: string
  createIntent(input: CreateIntentInput): Promise<PaymentIntentResult>
  retrieveIntent(id: string): Promise<PaymentIntentResult>
  refund(id: string, amountCents?: number): Promise<{ id: string; status: string }>
  /**
   * Verifies the signature and returns the parsed event. Must throw when the
   * signature is absent, malformed, stale, or does not match.
   */
  verifyWebhook(rawBody: string, signatureHeader: string | undefined): WebhookEvent
}

export function mapStatus(raw: string | undefined | null): IntentStatus {
  switch (raw) {
    case 'succeeded':
      return 'succeeded'
    case 'processing':
      return 'processing'
    case 'requires_payment_method':
    case 'requires_confirmation':
    case 'requires_action':
    case 'requires_capture':
      return 'requires_payment'
    case 'canceled':
      return 'failed'
    default:
      return 'requires_payment'
  }
}
