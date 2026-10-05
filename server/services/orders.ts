import { query, queryOne, run, transaction, type Row } from '../db/index.ts'
import { badRequest, conflict, notFound } from '../lib/errors.ts'
import { logger } from '../lib/log.ts'
import { orderReference, uuid } from '../lib/crypto.ts'
import { getProvider } from '../payments/index.ts'
import type { IntentStatus } from '../payments/types.ts'
import { buildCart, markCartConverted } from './cart.ts'
import { commitStock, releaseStock, reserveStock } from './inventory.ts'
import { computeTotals, type PricedLine, type Totals } from './pricing.ts'

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'fulfilled' | 'refunded'
export type PaymentStatus = 'requires_payment' | 'processing' | 'succeeded' | 'failed' | 'refunded'

export interface ShippingAddress {
  firstName: string
  lastName: string
  addressLine1: string
  addressLine2?: string
  city: string
  postcode: string
  country: string
}

export interface OrderLineDTO {
  productId: string | null
  slug: string
  name: string
  unitPriceCents: number
  qty: number
  lineTotalCents: number
}

export interface OrderDTO {
  ref: string
  status: OrderStatus
  paymentStatus: PaymentStatus | null
  placedAt: string
  updatedAt: string
  email: string
  name: string
  address: string
  lines: OrderLineDTO[]
  subtotalCents: number
  shippingCents: number
  taxCents: number
  totalCents: number
  currency: string
  estimatedDelivery: string
}

function toOrderDTO(row: Row, lines: OrderLineDTO[]): OrderDTO {
  const placedAt = String(row.placed_at)
  const address = [
    row.address_line1,
    row.address_line2,
    `${row.city} ${row.postcode}`,
    row.country,
  ]
    .filter(Boolean)
    .join(', ')

  return {
    ref: String(row.ref),
    status: String(row.status) as OrderStatus,
    paymentStatus: row.payment_status === null ? null : (String(row.payment_status) as PaymentStatus),
    placedAt,
    updatedAt: String(row.updated_at),
    email: String(row.email),
    name: `${row.first_name} ${row.last_name}`,
    address,
    lines,
    subtotalCents: Number(row.subtotal_cents),
    shippingCents: Number(row.shipping_cents),
    taxCents: Number(row.tax_cents),
    totalCents: Number(row.total_cents),
    currency: String(row.currency),
    estimatedDelivery: new Date(new Date(placedAt).getTime() + 3 * 86_400_000).toISOString(),
  }
}

function loadLines(orderId: string): OrderLineDTO[] {
  return query<Row>('SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid', [orderId]).map((r) => ({
    productId: r.product_id === null ? null : String(r.product_id),
    slug: String(r.slug),
    name: String(r.name),
    unitPriceCents: Number(r.unit_price_cents),
    qty: Number(r.qty),
    lineTotalCents: Number(r.line_total_cents),
  }))
}

function getOrderRow(orderId: string): Row | undefined {
  return queryOne<Row>('SELECT * FROM orders WHERE id = ?', [orderId])
}

function recordPaymentEvent(
  orderId: string | null,
  provider: string,
  type: string,
  providerEventId: string | null,
  amountCents: number | null,
  payload: unknown,
): void {
  run(
    `INSERT INTO payment_events
       (id, order_id, provider, type, provider_event_id, amount_cents, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      orderId,
      provider,
      type,
      providerEventId,
      amountCents,
      JSON.stringify(payload),
      new Date().toISOString(),
    ],
  )
}

/* ------------------------------------------------------------------ */
/*  Checkout                                                           */
/* ------------------------------------------------------------------ */

export interface CreateOrderInput {
  cartId: string
  customerId: string | null
  email: string
  shipping: ShippingAddress
}

export interface CreateOrderResult {
  order: OrderDTO
  payment: {
    provider: string
    intentId: string
    /** Only returned once, to the client that created the order. Never stored. */
    clientSecret: string | null
    status: IntentStatus
    publishableKey?: string
  }
}

/**
 * Turns a cart into a pending order and holds the stock.
 *
 * Prices come from the catalog, never from the client. If the payment intent
 * cannot be created the hold is released immediately, so failed checkouts do
 * not lock up inventory.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const cart = buildCart(input.cartId)
  if (cart.items.length === 0) throw badRequest('Your cart is empty.')

  const totals: Totals = computeTotals(
    cart.items.map((i) => ({
      productId: i.productId,
      slug: i.slug,
      name: i.name,
      unitPriceCents: i.unitPriceCents,
      qty: i.qty,
      lineTotalCents: i.lineTotalCents,
    })),
  )

  const orderId = uuid()
  const ref = orderReference()
  const now = new Date().toISOString()
  const provider = getProvider()

  // Reserve first: if stock is short, no order row is written at all.
  transaction(() => {
    run(
      `INSERT INTO orders (
         id, ref, customer_id, email, first_name, last_name,
         address_line1, address_line2, city, postcode, country,
         subtotal_cents, shipping_cents, tax_cents, total_cents, currency,
         status, payment_provider, payment_status, placed_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'usd', 'pending', ?, 'requires_payment', ?, ?)`,
      [
        orderId,
        ref,
        input.customerId,
        input.email,
        input.shipping.firstName,
        input.shipping.lastName,
        input.shipping.addressLine1,
        input.shipping.addressLine2 ?? null,
        input.shipping.city,
        input.shipping.postcode,
        input.shipping.country,
        totals.subtotalCents,
        totals.shippingCents,
        totals.taxCents,
        totals.totalCents,
        provider.name,
        now,
        now,
      ],
    )

    for (const line of totals.lines) {
      run(
        `INSERT INTO order_items
           (id, order_id, product_id, slug, name, unit_price_cents, qty, line_total_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid(),
          orderId,
          line.productId,
          line.slug,
          line.name,
          line.unitPriceCents,
          line.qty,
          line.lineTotalCents,
        ],
      )
    }

    reserveStock(
      orderId,
      totals.lines.map((l) => ({ productId: l.productId, qty: l.qty })),
    )
  })

  // The network call sits outside the transaction so a slow provider never
  // holds a database write lock.
  let intent
  try {
    intent = await provider.createIntent({
      orderRef: ref,
      amountCents: totals.totalCents,
      currency: 'usd',
      email: input.email,
      metadata: { order_ref: ref, order_id: orderId },
      idempotencyKey: `order_${orderId}`,
    })
  } catch (err) {
    // Give the stock back and close the order out.
    try {
      releaseStock(orderId, 'payment intent creation failed')
      transaction(() => {
        run(
          "UPDATE orders SET status = 'failed', payment_status = 'failed', updated_at = ? WHERE id = ?",
          [new Date().toISOString(), orderId],
        )
      })
    } catch (cleanupErr) {
      logger.error('failed to release stock after intent failure', {
        orderId,
        message: String(cleanupErr),
      })
    }
    throw err
  }

  run('UPDATE orders SET payment_intent_id = ?, updated_at = ? WHERE id = ?', [
    intent.id,
    new Date().toISOString(),
    orderId,
  ])

  recordPaymentEvent(orderId, provider.name, 'intent.created', null, totals.totalCents, {
    intentId: intent.id,
    status: intent.status,
  })

  const row = getOrderRow(orderId)!
  return {
    order: toOrderDTO(row, loadLines(orderId)),
    payment: {
      provider: provider.name,
      intentId: intent.id,
      clientSecret: intent.clientSecret,
      status: intent.status,
      publishableKey: intent.publishableKey,
    },
  }
}

/* ------------------------------------------------------------------ */
/*  Payment state transitions                                          */
/* ------------------------------------------------------------------ */

/**
 * Marks an order paid and converts the stock hold into a sale.
 *
 * Idempotent: a repeated webhook or a double confirmation changes nothing.
 * The charged amount is checked against the order total before accepting.
 */
export function markPaid(
  orderId: string,
  details: { provider: string; intentId: string | null; amountCents: number | null; eventId?: string | null },
): boolean {
  return transaction(() => {
    const row = getOrderRow(orderId)
    if (!row) throw notFound('Order not found.')

    const status = String(row.status)
    if (status === 'paid' || status === 'fulfilled') return false // already settled
    if (status === 'cancelled' || status === 'refunded') {
      logger.warn('payment for a closed order ignored', { orderId, status })
      return false
    }

    // Never trust the webhook amount blindly.
    if (details.amountCents !== null && details.amountCents !== Number(row.total_cents)) {
      logger.error('payment amount does not match order total', {
        orderId,
        expected: row.total_cents,
        received: details.amountCents,
      })
      recordPaymentEvent(orderId, details.provider, 'amount.mismatch', details.eventId ?? null, details.amountCents, {
        expected: row.total_cents,
      })
      return false
    }

    // The money is real even if the hold is gone, so record it — but do not
    // mark the order paid without a hold, or stock would never be decremented.
    if (!commitStock(orderId)) {
      logger.error('payment received for an order with no active stock hold', { orderId })
      recordPaymentEvent(orderId, details.provider, 'payment.orphaned', details.eventId ?? null, details.amountCents, {
        intentId: details.intentId,
      })
      return false
    }

    const now = new Date().toISOString()
    run(
      `UPDATE orders
         SET status = 'paid', payment_status = 'succeeded', payment_intent_id = COALESCE(?, payment_intent_id), updated_at = ?
       WHERE id = ?`,
      [details.intentId, now, orderId],
    )

    recordPaymentEvent(orderId, details.provider, 'payment.succeeded', details.eventId ?? null, details.amountCents, {
      intentId: details.intentId,
    })

    return true
  })
}

/** Records a failed payment and returns the held stock to the shelf. */
export function markFailed(
  orderId: string,
  details: { provider: string; intentId: string | null; reason?: string; eventId?: string | null },
): boolean {
  return transaction(() => {
    const row = getOrderRow(orderId)
    if (!row) throw notFound('Order not found.')
    if (String(row.status) === 'paid' || String(row.status) === 'fulfilled') return false

    releaseStock(orderId, details.reason ?? 'payment failed')

    run("UPDATE orders SET status = 'failed', payment_status = 'failed', updated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      orderId,
    ])

    recordPaymentEvent(orderId, details.provider, 'payment.failed', details.eventId ?? null, null, {
      intentId: details.intentId,
      reason: details.reason ?? null,
    })
    return true
  })
}

export function cancelOrder(orderId: string, reason = 'cancelled by customer'): OrderDTO {
  return transaction(() => {
    const row = getOrderRow(orderId)
    if (!row) throw notFound('Order not found.')
    if (String(row.status) === 'paid' || String(row.status) === 'fulfilled') {
      throw conflict('A paid order cannot be cancelled here — issue a refund instead.')
    }

    releaseStock(orderId, reason)
    run("UPDATE orders SET status = 'cancelled', updated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      orderId,
    ])
    return toOrderDTO(getOrderRow(orderId)!, loadLines(orderId))
  })
}

export async function refundOrder(orderId: string, amountCents?: number): Promise<OrderDTO> {
  const row = getOrderRow(orderId)
  if (!row) throw notFound('Order not found.')
  if (!row.payment_intent_id) throw badRequest('This order has no payment to refund.')
  if (String(row.status) !== 'paid' && String(row.status) !== 'fulfilled') {
    throw conflict('Only paid orders can be refunded.')
  }

  const provider = getProvider()
  const refund = await provider.refund(String(row.payment_intent_id), amountCents)

  transaction(() => {
    const full = amountCents === undefined || amountCents >= Number(row.total_cents)
    run(
      `UPDATE orders SET status = ?, payment_status = 'refunded', updated_at = ? WHERE id = ?`,
      [full ? 'refunded' : 'paid', new Date().toISOString(), orderId],
    )
    recordPaymentEvent(orderId, provider.name, 'refund.created', null, amountCents ?? Number(row.total_cents), {
      refundId: refund.id,
      status: refund.status,
      full,
    })
  })

  return toOrderDTO(getOrderRow(orderId)!, loadLines(orderId))
}

export function fulfillOrder(orderId: string): OrderDTO {
  return transaction(() => {
    const row = getOrderRow(orderId)
    if (!row) throw notFound('Order not found.')
    if (String(row.status) !== 'paid') throw conflict('Only paid orders can be fulfilled.')

    run("UPDATE orders SET status = 'fulfilled', updated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      orderId,
    ])
    return toOrderDTO(getOrderRow(orderId)!, loadLines(orderId))
  })
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export function getOrderByRef(ref: string): OrderDTO | null {
  const row = queryOne<Row>('SELECT * FROM orders WHERE ref = ?', [ref])
  if (!row) return null
  return toOrderDTO(row, loadLines(String(row.id)))
}

export function getOrderById(id: string): OrderDTO | null {
  const row = getOrderRow(id)
  if (!row) return null
  return toOrderDTO(row, loadLines(id))
}

export function getOrderRowByIntent(intentId: string): Row | undefined {
  return queryOne<Row>('SELECT * FROM orders WHERE payment_intent_id = ?', [intentId])
}

/** Internal id for a public reference, or null when it does not exist. */
export function getOrderIdByRef(ref: string): string | null {
  const row = queryOne<{ id: string }>('SELECT id FROM orders WHERE ref = ?', [ref])
  return row ? String(row.id) : null
}

export function fulfillOrderByRef(ref: string): OrderDTO {
  const id = getOrderIdByRef(ref)
  if (!id) throw notFound('Order not found.')
  return fulfillOrder(id)
}

export async function refundOrderByRef(ref: string, amountCents?: number): Promise<OrderDTO> {
  const id = getOrderIdByRef(ref)
  if (!id) throw notFound('Order not found.')
  return refundOrder(id, amountCents)
}

export function listOrdersForCustomer(customerId: string): OrderDTO[] {
  return query<Row>('SELECT * FROM orders WHERE customer_id = ? ORDER BY placed_at DESC', [customerId]).map((row) =>
    toOrderDTO(row, loadLines(String(row.id))),
  )
}

export interface AdminOrderFilters {
  status?: OrderStatus
  email?: string
  limit?: number
  offset?: number
}

export function listOrders(filters: AdminOrderFilters = {}): { items: OrderDTO[]; total: number } {
  const where: string[] = []
  const params: unknown[] = []
  if (filters.status) {
    where.push('status = ?')
    params.push(filters.status)
  }
  if (filters.email) {
    where.push('email = ?')
    params.push(filters.email)
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200)
  const offset = Math.max(filters.offset ?? 0, 0)

  const rows = query<Row>(`SELECT * FROM orders ${whereSql} ORDER BY placed_at DESC LIMIT ? OFFSET ?`, [
    ...params,
    limit,
    offset,
  ])
  const total = Number(queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM orders ${whereSql}`, params)?.n ?? 0)

  return { items: rows.map((row) => toOrderDTO(row, loadLines(String(row.id)))), total }
}

export function orderStats(): Record<string, number> {
  const rows = query<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM orders GROUP BY status')
  const stats: Record<string, number> = { total: 0 }
  for (const row of rows) {
    stats[row.status] = Number(row.n)
    stats.total = (stats.total ?? 0) + Number(row.n)
  }
  const revenue = queryOne<{ cents: number | null }>(
    "SELECT SUM(total_cents) AS cents FROM orders WHERE status IN ('paid','fulfilled')",
  )
  stats.revenueCents = Number(revenue?.cents ?? 0)
  return stats
}

export function markCartConvertedForOrder(cartId: string): void {
  markCartConverted(cartId)
}

export function computeOrderTotals(lines: PricedLine[]): Totals {
  return computeTotals(lines)
}
