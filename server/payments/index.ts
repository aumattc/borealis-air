import { config } from '../config.ts'
import { mockProvider } from './mock.ts'
import { stripeProvider } from './stripe.ts'
import type { PaymentProvider } from './types.ts'

export type { PaymentProvider, PaymentIntentResult, WebhookEvent, IntentStatus } from './types.ts'
export { signWebhookPayload, webhookToleranceSeconds } from './mock.ts'

/**
 * Resolves the configured provider. In production the mock is refused outright
 * rather than silently accepting fake payments.
 */
export function getProvider(): PaymentProvider {
  if (config.payments.provider === 'stripe') return stripeProvider

  if (config.isProd) {
    throw new Error(
      'PAYMENT_PROVIDER=mock cannot be used in production. Set PAYMENT_PROVIDER=stripe and provide Stripe keys.',
    )
  }
  return mockProvider
}

export function providerName(): string {
  return config.payments.provider
}
