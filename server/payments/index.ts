import { config } from '../config.ts'
import { mockProvider } from './mock.ts'
import { createStripeProvider } from './stripe.ts'
import { activeCheckoutStyle, stripeCredentials } from '../services/settings.ts'
import type { PaymentProvider } from './types.ts'

export type {
  PaymentProvider,
  PaymentIntentResult,
  CheckoutSessionInput,
  CheckoutSessionResult,
  WebhookEvent,
  IntentStatus,
} from './types.ts'
export { signWebhookPayload, webhookToleranceSeconds } from './mock.ts'

/**
 * Resolves the provider for the current request.
 *
 * Credentials come from the admin settings (falling back to the environment),
 * and the sandbox/production mode is chosen there too — so an operator can
 * switch keys without a redeploy. In production the mock is refused outright
 * rather than silently accepting fake payments.
 */
export function getProvider(): PaymentProvider {
  const style = activeCheckoutStyle()

  if (style === 'stripe') {
    const creds = stripeCredentials()
    if (!creds.secretKey) {
      // A production boot with no key is a misconfiguration, not a fallback.
      if (config.isProd) {
        throw new Error(
          'Stripe is selected but no secret key is configured. Add one in the admin settings or set STRIPE_SECRET_KEY.',
        )
      }
      return mockProvider
    }
    return createStripeProvider({
      secretKey: creds.secretKey,
      publishableKey: creds.publishableKey,
      webhookSecret: creds.webhookSecret,
    })
  }

  if (config.isProd) {
    throw new Error(
      'PAYMENT_PROVIDER=mock cannot be used in production. Configure Stripe credentials in the admin settings.',
    )
  }
  return mockProvider
}

export function providerName(): string {
  return getProvider().name
}

/** Which mode the resolved credentials belong to, for logging and the UI. */
export function activePaymentMode(): string {
  return activeCheckoutStyle() === 'stripe' ? `stripe:${stripeCredentials().mode}` : 'mock'
}
