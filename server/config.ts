import { randomBytes } from 'node:crypto'

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}

function int(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : fallback
}

function list(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const env = process.env.NODE_ENV ?? 'development'
const isProd = env === 'production'
const port = int(process.env.PORT, 12001)

/**
 * A random secret is generated per boot when none is supplied. That keeps the
 * dev server zero-config, but it invalidates sessions on restart — so a
 * production boot without SESSION_SECRET is treated as a hard error.
 */
const generatedSecret = randomBytes(32).toString('hex')

export const config = {
  env,
  isProd,
  host: process.env.HOST ?? '0.0.0.0',
  port,

  databasePath: process.env.DATABASE_PATH ?? 'server/data/borealis.db',

  /** Origins allowed to call the API with credentials. */
  corsOrigins: list(process.env.CORS_ORIGINS),
  /** Public origin of the API itself, used for absolute links. */
  appUrl: process.env.APP_URL ?? `http://localhost:${port}`,
  /**
   * Public origin of the storefront. Checkout redirects here after the shopper
   * pays or cancels, so it must be reachable by the browser. Defaults to the
   * Vite dev port, which is separate from the API port.
   */
  storefrontUrl: (
    process.env.STOREFRONT_URL ??
    process.env.APP_URL ??
    `http://localhost:${isProd ? port : int(process.env.STOREFRONT_PORT, 12000)}`
  ).replace(/\/$/, ''),

  sessionSecret: process.env.SESSION_SECRET ?? generatedSecret,
  /**
   * Key material for encrypting stored provider credentials. A stable value is
   * required in production: rotating it makes existing ciphertext unreadable.
   */
  settingsEncryptionKey: process.env.SETTINGS_ENCRYPTION_KEY ?? process.env.SESSION_SECRET ?? generatedSecret,
  sessionTtlDays: int(process.env.SESSION_TTL_DAYS, 30),
  /** Held stock is released if payment has not settled within this window. */
  reservationTtlMinutes: int(process.env.RESERVATION_TTL_MINUTES, 30),
  /** Storefront currency for new orders. */
  currency: (process.env.CURRENCY ?? 'usd').toLowerCase(),

  /** Free shipping threshold and flat rate, in cents. Mirrors the storefront. */
  freeShippingThresholdCents: int(process.env.FREE_SHIPPING_THRESHOLD_CENTS, 30000),
  shippingFlatCents: int(process.env.SHIPPING_FLAT_CENTS, 2900),
  /** Sales tax rate applied to the subtotal. */
  taxRate: Number(process.env.TAX_RATE ?? '0.0825'),

  payments: {
    provider: (process.env.PAYMENT_PROVIDER ?? 'mock') as 'mock' | 'stripe',
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY ?? '',
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    },
  },

  /** Trust X-Forwarded-For for client IPs. Enable only behind a known proxy. */
  trustProxy: bool(process.env.TRUST_PROXY, true),

  /** Request throttles, overridable so tests can run without tripping them. */
  rateLimits: {
    registerPerHour: int(process.env.RL_REGISTER_PER_HOUR, 10),
    loginPerIpPer15Min: int(process.env.RL_LOGIN_IP_PER_15MIN, 20),
    loginPerEmailPer15Min: int(process.env.RL_LOGIN_EMAIL_PER_15MIN, 10),
    checkoutPerMinute: int(process.env.RL_CHECKOUT_PER_MINUTE, 20),
  },
} as const

export function validateConfig(): string[] {
  const problems: string[] = []

  if (config.isProd && !process.env.SESSION_SECRET) {
    problems.push('SESSION_SECRET must be set in production (otherwise sessions reset on every restart).')
  }
  if (config.isProd && !process.env.SETTINGS_ENCRYPTION_KEY && !process.env.SESSION_SECRET) {
    problems.push(
      'SETTINGS_ENCRYPTION_KEY (or SESSION_SECRET) must be set in production so stored payment credentials stay decryptable.',
    )
  }
  if (config.isProd && config.corsOrigins.length === 0) {
    problems.push('CORS_ORIGINS must list the storefront origin(s) in production.')
  }
  if (config.payments.provider === 'stripe') {
    if (!config.payments.stripe.secretKey) {
      problems.push('STRIPE_SECRET_KEY is required when PAYMENT_PROVIDER=stripe.')
    }
    if (!config.payments.stripe.webhookSecret) {
      problems.push('STRIPE_WEBHOOK_SECRET is required when PAYMENT_PROVIDER=stripe (webhooks cannot be verified without it).')
    }
  }
  if (!Number.isFinite(config.taxRate) || config.taxRate < 0 || config.taxRate > 0.5) {
    problems.push('TAX_RATE must be a number between 0 and 0.5.')
  }

  return problems
}
