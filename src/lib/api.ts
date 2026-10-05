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
  }
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
