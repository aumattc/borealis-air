import { query, queryOne, run, transaction, type Row } from '../db/index.ts'
import { conflict, notFound } from '../lib/errors.ts'
import { uuid } from '../lib/crypto.ts'

export interface StockLine {
  productId: string
  qty: number
}

export interface StockLevel {
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

function toLevel(row: Row): StockLevel {
  return {
    productId: String(row.product_id),
    slug: String(row.slug),
    name: String(row.name),
    onHand: Number(row.on_hand),
    reserved: Number(row.reserved),
    available: Number(row.available),
    lowStockThreshold: Number(row.low_stock_threshold),
    backorderable: Number(row.backorderable) === 1,
    stockStatus: String(row.stock_status),
    priceCents: Number(row.price_cents),
  }
}

export function listStock(): StockLevel[] {
  return query<Row>('SELECT * FROM inventory_levels ORDER BY name').map(toLevel)
}

export function getStock(productId: string): StockLevel | null {
  const row = queryOne<Row>('SELECT * FROM inventory_levels WHERE product_id = ?', [productId])
  return row ? toLevel(row) : null
}

function recordMovement(
  productId: string,
  onHandDelta: number,
  reservedDelta: number,
  reason: string,
  orderId: string | null,
  note: string | null,
): void {
  run(
    `INSERT INTO stock_movements
       (id, product_id, on_hand_delta, reserved_delta, reason, order_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), productId, onHandDelta, reservedDelta, reason, orderId, note, new Date().toISOString()],
  )
}

/**
 * Holds stock for an order. All lines succeed or none do — the whole call runs
 * in one transaction, so a partial reservation can never be left behind.
 *
 * Backorderable products are allowed to go negative on available stock; their
 * reserved counter still rises so the shortfall is visible.
 */
export function reserveStock(orderId: string, lines: StockLine[]): void {
  transaction(() => {
    const now = new Date().toISOString()

    for (const line of lines) {
      const inv = queryOne<Row>('SELECT * FROM inventory WHERE product_id = ?', [line.productId])
      if (!inv) throw notFound(`No inventory record for product ${line.productId}.`)

      const onHand = Number(inv.on_hand)
      const reserved = Number(inv.reserved)
      const available = onHand - reserved
      const backorderable = Number(inv.backorderable) === 1

      if (line.qty > available && !backorderable) {
        const product = queryOne<Row>('SELECT name FROM products WHERE id = ?', [line.productId])
        throw conflict(
          `${product ? String(product.name) : 'That unit'} only has ${Math.max(available, 0)} left in stock.`,
          { productId: line.productId, available: Math.max(available, 0) },
        )
      }

      run('UPDATE inventory SET reserved = reserved + ?, updated_at = ? WHERE product_id = ?', [
        line.qty,
        now,
        line.productId,
      ])

      run(
        `INSERT INTO stock_reservations (order_id, product_id, qty, status, created_at, updated_at)
         VALUES (?, ?, ?, 'held', ?, ?)
         ON CONFLICT(order_id, product_id)
         DO UPDATE SET qty = excluded.qty, status = 'held', updated_at = excluded.updated_at`,
        [orderId, line.productId, line.qty, now, now],
      )

      recordMovement(line.productId, 0, line.qty, 'reservation', orderId, null)
    }
  })
}

/**
 * Converts a hold into a real sale: stock leaves the shelf and the hold is
 * cleared. Idempotent — a second call for the same order does nothing.
 */
export function commitStock(orderId: string): boolean {
  return transaction(() => {
    const held = query<Row>(
      "SELECT product_id, qty FROM stock_reservations WHERE order_id = ? AND status = 'held'",
      [orderId],
    )
    if (held.length === 0) return false

    const now = new Date().toISOString()
    for (const row of held) {
      const productId = String(row.product_id)
      const qty = Number(row.qty)

      run(
        `UPDATE inventory
           SET on_hand = on_hand - ?, reserved = reserved - ?, updated_at = ?
         WHERE product_id = ?`,
        [qty, qty, now, productId],
      )

      run("UPDATE stock_reservations SET status = 'committed', updated_at = ? WHERE order_id = ? AND product_id = ?", [
        now,
        orderId,
        productId,
      ])

      recordMovement(productId, -qty, -qty, 'sale', orderId, null)
    }
    return true
  })
}

/** Releases a hold without selling, e.g. a failed or cancelled payment. */
export function releaseStock(orderId: string, note: string | null = null): boolean {
  return transaction(() => {
    const held = query<Row>(
      "SELECT product_id, qty FROM stock_reservations WHERE order_id = ? AND status = 'held'",
      [orderId],
    )
    if (held.length === 0) return false

    const now = new Date().toISOString()
    for (const row of held) {
      const productId = String(row.product_id)
      const qty = Number(row.qty)

      run('UPDATE inventory SET reserved = reserved - ?, updated_at = ? WHERE product_id = ?', [
        qty,
        now,
        productId,
      ])
      run("UPDATE stock_reservations SET status = 'released', updated_at = ? WHERE order_id = ? AND product_id = ?", [
        now,
        orderId,
        productId,
      ])
      recordMovement(productId, 0, -qty, 'release', orderId, note)
    }
    return true
  })
}

/** Frees holds older than the reservation window (abandoned checkouts). */
export function releaseExpiredReservations(olderThanMinutes: number): number {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString()
  const stale = query<{ order_id: string }>(
    "SELECT DISTINCT order_id FROM stock_reservations WHERE status = 'held' AND created_at < ?",
    [cutoff],
  )
  let released = 0
  for (const row of stale) {
    const orderId = String(row.order_id)
    if (releaseStock(orderId, 'reservation expired')) {
      // Close the order too, otherwise a late webhook could still mark an
      // order paid after its hold has already been freed.
      run(
        `UPDATE orders SET status = 'cancelled', updated_at = ?
           WHERE id = ? AND status = 'pending'`,
        [new Date().toISOString(), orderId],
      )
      released++
    }
  }
  return released
}

/* ------------------------------------------------------------------ */
/*  Admin operations                                                   */
/* ------------------------------------------------------------------ */

export interface AdjustInput {
  onHandDelta?: number
  lowStockThreshold?: number
  backorderable?: boolean
  note?: string
}

export function adjustStock(productId: string, input: AdjustInput): StockLevel {
  return transaction(() => {
    const inv = queryOne<Row>('SELECT * FROM inventory WHERE product_id = ?', [productId])
    if (!inv) throw notFound('No inventory record for that product.')

    const now = new Date().toISOString()
    const delta = input.onHandDelta ?? 0

    if (delta !== 0) {
      const nextOnHand = Number(inv.on_hand) + delta
      if (nextOnHand < 0) throw conflict('On-hand stock cannot go below zero.')
      if (nextOnHand < Number(inv.reserved)) {
        throw conflict(
          `Cannot set on-hand below the ${inv.reserved} units currently reserved. Release those holds first.`,
        )
      }
      run('UPDATE inventory SET on_hand = ?, updated_at = ? WHERE product_id = ?', [nextOnHand, now, productId])
      recordMovement(productId, delta, 0, delta > 0 ? 'restock' : 'adjustment', null, input.note ?? null)
    }

    if (input.lowStockThreshold !== undefined) {
      run('UPDATE inventory SET low_stock_threshold = ?, updated_at = ? WHERE product_id = ?', [
        input.lowStockThreshold,
        now,
        productId,
      ])
    }
    if (input.backorderable !== undefined) {
      run('UPDATE inventory SET backorderable = ?, updated_at = ? WHERE product_id = ?', [
        input.backorderable ? 1 : 0,
        now,
        productId,
      ])
    }

    const level = getStock(productId)
    if (!level) throw notFound('No inventory record for that product.')
    return level
  })
}

export interface StockMovementDTO {
  id: string
  productId: string
  onHandDelta: number
  reservedDelta: number
  reason: string
  orderId: string | null
  note: string | null
  createdAt: string
}

export function stockMovements(productId: string, limit = 50): StockMovementDTO[] {
  return query<Row>(
    `SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    [productId, Math.min(limit, 200)],
  ).map((row) => ({
    id: String(row.id),
    productId: String(row.product_id),
    onHandDelta: Number(row.on_hand_delta),
    reservedDelta: Number(row.reserved_delta),
    reason: String(row.reason),
    orderId: row.order_id === null ? null : String(row.order_id),
    note: row.note === null ? null : String(row.note),
    createdAt: String(row.created_at),
  }))
}
