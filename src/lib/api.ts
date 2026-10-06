import type { Order } from './orders'

/**
 * Storefront API client.
 *
 * In development Vite proxies `/api` to the API server, so requests are
 * same-origin and the session/cart cookies are first-party. Point
 * VITE_API_URL at the API origin when the two are hosted separately.
 */

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  /** Field-level messages from a 400, keyed by form field name. */
  get fieldErrors(): Record<string, string> {
    if (this.status === 400 && this.details && typeof this.details === 'object') {
      return this.details as Record<string, string>
    }
    return {}
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}/api${path}`, {
      method,
      // Send and accept the cart and session cookies.
      credentials: 'include',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network_error', 'We could not reach the store. Check your connection and try again.')
  }

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    const error = (parsed as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'request_failed',
      error?.message ?? 'Something went wrong. Please try again.',
      error?.details,
    )
  }

  return parsed as T
}

/* ------------------------------------------------------------------ */
/*  Wire types (match the API exactly, money in cents)                 */
/* ------------------------------------------------------------------ */

export interface ApiOrder {
  ref: string
  status: string
  paymentStatus: string | null
  placedAt: string
  updatedAt: string
  email: string
  name: string
  address: string
  lines: { productId: string | null; slug: string; name: string; unitPriceCents: number; qty: number; lineTotalCents: number }[]
  subtotalCents: number
  shippingCents: number
  taxCents: number
  totalCents: number
  currency: string
  estimatedDelivery: string
}

export interface CheckoutResponse {
  order: ApiOrder
  payment: {
    provider: string
    intentId: string
    clientSecret: string | null
    status: string
    publishableKey?: string
    /** Where to send the shopper to pay. Stripe Checkout in production. */
    checkoutUrl?: string
    sessionId?: string
    checkoutStyle: 'stripe' | 'mock'
  }
}

export interface CheckoutConfig {
  checkoutStyle: 'stripe' | 'mock'
  stripeMode: 'sandbox' | 'production'
  publishableKey: string | null
  currency: string
}

export interface CheckoutPayload {
  email: string
  firstName: string
  lastName: string
  addressLine1: string
  city: string
  postcode: string
  country: string
}

/* ------------------------------------------------------------------ */
/*  Admin wire types                                                   */
/* ------------------------------------------------------------------ */

export interface AdminCustomer {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  createdAt: string
}

export interface ApiProduct {
  id: string
  slug: string
  name: string
  series: string
  category: string
  btu: number
  coverage: number
  priceCents: number
  compareAtCents: number | null
  rating: number
  reviews: number
  noise: number
  energyClass: string
  modes: string[]
  features: string[]
  badge: string | null
  blurb: string
  description: string
  specs: { label: string; value: string }[]
  art: unknown
  inStock: boolean
  available: number
  stockStatus: 'in_stock' | 'low_stock' | 'backorder' | 'out_of_stock'
}

export interface ApiStockLevel {
  productId: string
  slug: string
  name: string
  onHand: number
  reserved: number
  available: number
  lowStockThreshold: number
  backorderable: boolean
  stockStatus: string
  priceCents: number
}

export interface ApiStockMovement {
  id: string
  productId: string
  onHandDelta: number
  reservedDelta: number
  reason: string
  note: string | null
  createdAt: string
}

export interface ApiOrderSummary extends ApiOrder {
  status: string
}

export interface StripeModeView {
  secretKey: string
  publishableKey: string
  webhookSecret: string
  source: { secretKey: string; publishableKey: string; webhookSecret: string }
}

export interface StripeSettings {
  mode: 'sandbox' | 'production'
  checkoutStyle: 'stripe' | 'mock'
  sandbox: StripeModeView
  production: StripeModeView
}

export interface ProductPayload {
  slug: string
  name: string
  series: string
  category: string
  btu: number
  coverage: number
  priceCents: number
  compareAtCents?: number | null
  rating?: number
  reviews?: number
  noise: number
  energyClass: string
  modes: string[]
  features: string[]
  badge?: string | null
  blurb: string
  description: string
  specs: { label: string; value: string }[]
  art: unknown
  active?: boolean
}

/* ------------------------------------------------------------------ */
/*  Adapters                                                           */
/* ------------------------------------------------------------------ */

/** Converts the API's cents back to the whole-dollar shape the UI uses. */
export function toFrontendOrder(order: ApiOrder): Order {
  return {
    ref: order.ref,
    placedAt: order.placedAt,
    email: order.email,
    name: order.name,
    address: order.address,
    lines: order.lines.map((l) => ({
      name: l.name,
      qty: l.qty,
      price: Math.round(l.unitPriceCents / 100),
      slug: l.slug,
    })),
    subtotal: Math.round(order.subtotalCents / 100),
    shipping: Math.round(order.shippingCents / 100),
    tax: Math.round(order.taxCents / 100),
    total: Math.round(order.totalCents / 100),
  }
}

/* ------------------------------------------------------------------ */
/*  Endpoints                                                          */
/* ------------------------------------------------------------------ */

export function createCheckout(payload: CheckoutPayload): Promise<CheckoutResponse> {
  return request<CheckoutResponse>('POST', '/checkout', payload)
}

/**
 * Replaces the server-side cart with the local one. The local cart is the
 * source of truth for what the shopper sees; the server re-prices it.
 */
export async function syncCart(lines: { productId: string; qty: number }[]): Promise<void> {
  await request('DELETE', '/cart')
  for (const line of lines) {
    await request('POST', '/cart/items', { productId: line.productId, qty: line.qty })
  }
}

export async function fetchOrder(ref: string): Promise<ApiOrder> {
  const res = await request<{ order: ApiOrder }>('GET', `/orders/${encodeURIComponent(ref)}`)
  return res.order
}

/**
 * Simulates a card authorisation when the mock provider is configured. In
 * production this step is performed by the provider's client library, which
 * returns the same outcome through a webhook.
 */
export function confirmMockPayment(intentId: string, outcome: 'succeed' | 'fail'): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('POST', `/dev/payments/${encodeURIComponent(intentId)}/confirm`, { outcome })
}

export function apiHealth(): Promise<{ status: string }> {
  return request<{ status: string }>('GET', '/health')
}

/** Public: which checkout the storefront should run, and the publishable key. */
export function fetchCheckoutConfig(): Promise<CheckoutConfig> {
  return request<CheckoutConfig>('GET', '/checkout/config')
}

/* ------------------------------------------------------------------ */
/*  Auth                                                               */
/* ------------------------------------------------------------------ */

export function login(email: string, password: string): Promise<{ customer: AdminCustomer }> {
  return request<{ customer: AdminCustomer }>('POST', '/auth/login', { email, password })
}

export function logout(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('POST', '/auth/logout')
}

export function currentCustomer(): Promise<{ customer: AdminCustomer }> {
  return request<{ customer: AdminCustomer }>('GET', '/auth/me')
}

/* ------------------------------------------------------------------ */
/*  Admin: catalog, inventory, orders, settings                        */
/* ------------------------------------------------------------------ */

export function adminProducts(params: { q?: string; includeInactive?: boolean } = {}): Promise<{
  items: ApiProduct[]
  total: number
}> {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.includeInactive) query.set('includeInactive', 'true')
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request<{ items: ApiProduct[]; total: number }>('GET', `/admin/products${suffix}`)
}

export function adminCreateProduct(
  payload: ProductPayload & { onHand?: number; lowStockThreshold?: number; backorderable?: boolean },
): Promise<{ product: ApiProduct }> {
  return request<{ product: ApiProduct }>('POST', '/admin/products', payload)
}

export function adminUpdateProduct(id: string, payload: ProductPayload): Promise<{ product: ApiProduct }> {
  return request<{ product: ApiProduct }>('PUT', `/admin/products/${encodeURIComponent(id)}`, payload)
}

export function adminDeleteProduct(id: string): Promise<{ deleted: boolean; deactivated: boolean; reason?: string }> {
  return request<{ deleted: boolean; deactivated: boolean; reason?: string }>(
    'DELETE',
    `/admin/products/${encodeURIComponent(id)}`,
  )
}

export function adminRestoreProduct(id: string): Promise<{ product: ApiProduct }> {
  return request<{ product: ApiProduct }>('POST', `/admin/products/${encodeURIComponent(id)}/restore`)
}

export function adminInventory(): Promise<{ inventory: ApiStockLevel[] }> {
  return request<{ inventory: ApiStockLevel[] }>('GET', '/admin/inventory')
}

export function adminAdjustStock(
  productId: string,
  payload: { onHandDelta?: number; lowStockThreshold?: number; backorderable?: boolean; note?: string },
): Promise<{ inventory: ApiStockLevel }> {
  return request<{ inventory: ApiStockLevel }>('PATCH', `/admin/inventory/${encodeURIComponent(productId)}`, payload)
}

export function adminStockMovements(productId: string): Promise<{ movements: ApiStockMovement[] }> {
  return request<{ movements: ApiStockMovement[] }>(
    'GET',
    `/admin/inventory/${encodeURIComponent(productId)}/movements`,
  )
}

export function adminOrders(params: { status?: string; email?: string } = {}): Promise<{
  items: ApiOrderSummary[]
  total: number
}> {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.email) query.set('email', params.email)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request<{ items: ApiOrderSummary[]; total: number }>('GET', `/admin/orders${suffix}`)
}

export function adminFulfillOrder(ref: string): Promise<{ order: ApiOrder }> {
  return request<{ order: ApiOrder }>('POST', `/admin/orders/${encodeURIComponent(ref)}/fulfill`)
}

export function adminRefundOrder(ref: string, amountCents?: number): Promise<{ order: ApiOrder }> {
  return request<{ order: ApiOrder }>('POST', `/admin/orders/${encodeURIComponent(ref)}/refund`, {
    ...(amountCents !== undefined ? { amountCents } : {}),
  })
}

export function adminPaymentSettings(): Promise<{ stripe: StripeSettings }> {
  return request<{ stripe: StripeSettings }>('GET', '/admin/settings/payments')
}

export interface PaymentSettingsUpdate {
  mode?: 'sandbox' | 'production'
  checkoutStyle?: 'stripe' | 'mock'
  sandboxSecretKey?: string
  sandboxPublishableKey?: string
  sandboxWebhookSecret?: string
  productionSecretKey?: string
  productionPublishableKey?: string
  productionWebhookSecret?: string
  clearSandbox?: boolean
  clearProduction?: boolean
}

export function adminUpdatePaymentSettings(
  payload: PaymentSettingsUpdate,
): Promise<{ stripe: StripeSettings; checkoutStyle: string; configured: boolean }> {
  return request<{ stripe: StripeSettings; checkoutStyle: string; configured: boolean }>(
    'PUT',
    '/admin/settings/payments',
    payload,
  )
}
