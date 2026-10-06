import { query, queryOne, run, type Row } from '../db/index.ts'
import { config } from '../config.ts'
import { decryptSecret, deriveKey, encryptSecret, maskSecret } from '../lib/secrets.ts'
import { badRequest } from '../lib/errors.ts'

/**
 * Runtime configuration managed from the admin CMS.
 *
 * Two kinds of value live here: plain strings (the active Stripe mode, the
 * checkout style) and secrets (API keys, webhook signing secrets). Secrets are
 * encrypted at rest with AES-256-GCM and are never returned in plaintext — the
 * admin UI only ever sees a masked preview.
 *
 * Environment variables act as the fallback for every key, so an operator who
 * prefers to manage credentials in the environment can ignore the CMS entirely.
 */

export type StripeMode = 'sandbox' | 'production'
export type CheckoutStyle = 'stripe' | 'mock'

export const SETTING_KEYS = {
  stripeMode: 'stripe.mode',
  checkoutStyle: 'checkout.style',
  sandboxSecretKey: 'stripe.sandbox.secret_key',
  sandboxPublishableKey: 'stripe.sandbox.publishable_key',
  sandboxWebhookSecret: 'stripe.sandbox.webhook_secret',
  productionSecretKey: 'stripe.production.secret_key',
  productionPublishableKey: 'stripe.production.publishable_key',
  productionWebhookSecret: 'stripe.production.webhook_secret',
} as const

/** Every key we accept through the admin API. */
const WRITABLE_KEYS = new Set<string>(Object.values(SETTING_KEYS))

const SECRET_KEYS = new Set<string>([
  SETTING_KEYS.sandboxSecretKey,
  SETTING_KEYS.sandboxPublishableKey,
  SETTING_KEYS.sandboxWebhookSecret,
  SETTING_KEYS.productionSecretKey,
  SETTING_KEYS.productionPublishableKey,
  SETTING_KEYS.productionWebhookSecret,
])

const encryptionKey = deriveKey(config.settingsEncryptionKey)

/* ------------------------------------------------------------------ */
/*  Raw access                                                         */
/* ------------------------------------------------------------------ */

export function getRaw(key: string): string | null {
  const row = queryOne<{ value: string | null }>('SELECT value FROM settings WHERE key = ?', [key])
  return row?.value ?? null
}

/** Reads a secret, decrypting it. Returns null when absent or unreadable. */
export function getSecret(key: string): string | null {
  const stored = getRaw(key)
  if (!stored) return null
  return decryptSecret(stored, encryptionKey)
}

export function setSetting(key: string, value: string | null, updatedBy: string | null): void {
  if (!WRITABLE_KEYS.has(key)) throw badRequest(`Unknown setting "${key}".`)

  const stored = value === null || value === '' ? null : SECRET_KEYS.has(key) ? encryptSecret(value, encryptionKey) : value
  run(
    `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    [key, stored, new Date().toISOString(), updatedBy],
  )
}

export function deleteSetting(key: string): void {
  run('DELETE FROM settings WHERE key = ?', [key])
}

/* ------------------------------------------------------------------ */
/*  Resolution                                                         */
/* ------------------------------------------------------------------ */

function normaliseMode(value: string | null | undefined): StripeMode | null {
  if (value === 'sandbox' || value === 'production') return value
  return null
}

/**
 * The mode the storefront charges in. The CMS setting wins; otherwise fall back
 * to whether a live key is present in the environment. Defaults to sandbox so
 * a misconfigured deployment cannot accidentally take real money.
 */
export function activeStripeMode(): StripeMode {
  const stored = normaliseMode(getRaw(SETTING_KEYS.stripeMode))
  if (stored) return stored
  return config.isProd && config.payments.stripe.secretKey.startsWith('sk_live') ? 'production' : 'sandbox'
}

export function setStripeMode(mode: StripeMode, updatedBy: string | null): void {
  setSetting(SETTING_KEYS.stripeMode, mode, updatedBy)
}

export interface StripeCredentials {
  secretKey: string
  publishableKey: string
  webhookSecret: string
  mode: StripeMode
  /** Where the values came from, for the admin UI and diagnostics. */
  source: { secretKey: 'database' | 'environment' | 'none'; publishableKey: 'database' | 'environment' | 'none'; webhookSecret: 'database' | 'environment' | 'none' }
}

function envForMode(mode: StripeMode): { secretKey: string; publishableKey: string; webhookSecret: string } {
  const env = config.payments.stripe
  if (mode === 'production') {
    return {
      secretKey: process.env.STRIPE_PRODUCTION_SECRET_KEY ?? '',
      publishableKey: process.env.STRIPE_PRODUCTION_PUBLISHABLE_KEY ?? '',
      webhookSecret: process.env.STRIPE_PRODUCTION_WEBHOOK_SECRET ?? '',
    }
  }
  return { secretKey: env.secretKey, publishableKey: env.publishableKey, webhookSecret: env.webhookSecret }
}

/**
 * Resolves the credentials for a mode: the CMS value first, then the
 * environment. A key stored for one mode is never used for the other, so a
 * sandbox key can never silently authorise live charges.
 */
export function stripeCredentials(mode: StripeMode = activeStripeMode()): StripeCredentials {
  const keys =
    mode === 'production'
      ? {
          secretKey: SETTING_KEYS.productionSecretKey,
          publishableKey: SETTING_KEYS.productionPublishableKey,
          webhookSecret: SETTING_KEYS.productionWebhookSecret,
        }
      : {
          secretKey: SETTING_KEYS.sandboxSecretKey,
          publishableKey: SETTING_KEYS.sandboxPublishableKey,
          webhookSecret: SETTING_KEYS.sandboxWebhookSecret,
        }

  const env = envForMode(mode)
  const dbSecret = getSecret(keys.secretKey)
  const dbPublishable = getSecret(keys.publishableKey)
  const dbWebhook = getSecret(keys.webhookSecret)

  return {
    mode,
    secretKey: dbSecret || env.secretKey,
    publishableKey: dbPublishable || env.publishableKey,
    webhookSecret: dbWebhook || env.webhookSecret,
    source: {
      secretKey: dbSecret ? 'database' : env.secretKey ? 'environment' : 'none',
      publishableKey: dbPublishable ? 'database' : env.publishableKey ? 'environment' : 'none',
      webhookSecret: dbWebhook ? 'database' : env.webhookSecret ? 'environment' : 'none',
    },
  }
}

export function stripeConfigured(mode: StripeMode = activeStripeMode()): boolean {
  const creds = stripeCredentials(mode)
  return Boolean(creds.secretKey && creds.webhookSecret)
}

/**
 * Which checkout the storefront should run.
 *
 * Stripe hosted Checkout requires a secret key; without one we fall back to the
 * built-in mock so development keeps working. In production the mock is refused
 * outright rather than quietly accepting fake payments.
 */
export function activeCheckoutStyle(): CheckoutStyle {
  const stored = getRaw(SETTING_KEYS.checkoutStyle)
  if (config.isProd) return 'stripe'
  if (stored === 'mock' || stored === 'stripe') {
    return stored === 'stripe' && !stripeConfigured() ? 'mock' : stored
  }
  return stripeConfigured() ? 'stripe' : 'mock'
}

export function setCheckoutStyle(style: CheckoutStyle, updatedBy: string | null): void {
  setSetting(SETTING_KEYS.checkoutStyle, style, updatedBy)
}

/* ------------------------------------------------------------------ */
/*  Admin views                                                        */
/* ------------------------------------------------------------------ */

export interface StripeModeView {
  secretKey: string
  publishableKey: string
  webhookSecret: string
  source: { secretKey: string; publishableKey: string; webhookSecret: string }
}

export interface StripeSettingsView {
  mode: StripeMode
  checkoutStyle: CheckoutStyle
  sandbox: StripeModeView
  production: StripeModeView
}

function modeView(mode: StripeMode): StripeModeView {
  const creds = stripeCredentials(mode)
  return {
    secretKey: maskSecret(creds.secretKey),
    publishableKey: maskSecret(creds.publishableKey),
    webhookSecret: maskSecret(creds.webhookSecret),
    source: creds.source,
  }
}

/** Safe to send to an authenticated admin: secrets are masked, never raw. */
export function stripeSettingsView(): StripeSettingsView {
  return {
    mode: activeStripeMode(),
    checkoutStyle: activeCheckoutStyle(),
    sandbox: modeView('sandbox'),
    production: modeView('production'),
  }
}

/** Public subset the storefront needs to render the checkout button. */
export function publicCheckoutConfig(): {
  checkoutStyle: CheckoutStyle
  stripeMode: StripeMode
  publishableKey: string | null
  currency: string
} {
  const style = activeCheckoutStyle()
  const mode = activeStripeMode()
  const creds = stripeCredentials(mode)
  return {
    checkoutStyle: style,
    stripeMode: mode,
    // Publishable keys are designed to be public; only send it for real Stripe.
    publishableKey: style === 'stripe' ? creds.publishableKey || null : null,
    currency: config.currency,
  }
}

export function allSettingsRows(): Row[] {
  return query<Row>('SELECT key, value, updated_at, updated_by FROM settings ORDER BY key')
}
