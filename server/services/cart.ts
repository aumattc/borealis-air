import { query, queryOne, run, transaction, type Row } from '../db/index.ts'
import { badRequest, notFound } from '../lib/errors.ts'
import { uuid } from '../lib/crypto.ts'
import { getProductById } from './catalog.ts'
import { computeTotals, type Totals } from './pricing.ts'

export interface CartDTO {
  id: string
  customerId: string | null
  items: {
    productId: string
    slug: string
    name: string
    unitPriceCents: number
    qty: number
    lineTotalCents: number
    available: number
    stockStatus: string
  }[]
  totals: Totals
  updatedAt: string
}

const MAX_QTY_PER_LINE = 99
const MAX_LINES = 25

function loadItems(cartId: string) {
  const rows = query<Row>(
    `SELECT ci.product_id, ci.qty, p.slug, p.name, p.price_cents, i.available, i.stock_status
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     JOIN inventory_levels i ON i.product_id = p.id
     WHERE ci.cart_id = ?
     ORDER BY ci.added_at`,
    [cartId],
  )
  return rows.map((r) => ({
    productId: String(r.product_id),
    slug: String(r.slug),
    name: String(r.name),
    unitPriceCents: Number(r.price_cents),
    qty: Number(r.qty),
    lineTotalCents: Number(r.price_cents) * Number(r.qty),
    available: Number(r.available),
    stockStatus: String(r.stock_status),
  }))
}

export function buildCart(cartId: string): CartDTO {
  const cart = queryOne<Row>('SELECT * FROM carts WHERE id = ?', [cartId])
  if (!cart) throw notFound('Cart not found.')
  const items = loadItems(cartId)
  return {
    id: String(cart.id),
    customerId: cart.customer_id === null ? null : String(cart.customer_id),
    items,
    totals: computeTotals(items.map((i) => ({
      productId: i.productId,
      slug: i.slug,
      name: i.name,
      unitPriceCents: i.unitPriceCents,
      qty: i.qty,
      lineTotalCents: i.lineTotalCents,
    }))),
    updatedAt: String(cart.updated_at),
  }
}

export function getOrCreateCart(cartId: string | null, customerId: string | null): string {
  if (cartId) {
    const existing = queryOne<Row>("SELECT id FROM carts WHERE id = ? AND status = 'active'", [cartId])
    if (existing) {
      // Claim a guest cart once its owner signs in.
      if (customerId) {
        run('UPDATE carts SET customer_id = ?, updated_at = ? WHERE id = ? AND customer_id IS NULL', [
          customerId,
          new Date().toISOString(),
          cartId,
        ])
      }
      return String(existing.id)
    }
  }

  // Reuse the customer's most recent active cart if they have one.
  if (customerId) {
    const existing = queryOne<Row>(
      "SELECT id FROM carts WHERE customer_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1",
      [customerId],
    )
    if (existing) return String(existing.id)
  }

  const id = uuid()
  const now = new Date().toISOString()
  run('INSERT INTO carts (id, customer_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [
    id,
    customerId,
    'active',
    now,
    now,
  ])
  return id
}

export function addItem(cartId: string, productId: string, qty: number): CartDTO {
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
    throw badRequest(`Quantity must be between 1 and ${MAX_QTY_PER_LINE}.`)
  }

  const product = getProductById(productId)
  if (!product) throw notFound('That product does not exist.')

  return transaction(() => {
    const lineCount = queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM cart_items WHERE cart_id = ?', [cartId])
    const existing = queryOne<Row>('SELECT qty FROM cart_items WHERE cart_id = ? AND product_id = ?', [
      cartId,
      productId,
    ])

    if (!existing && Number(lineCount?.n ?? 0) >= MAX_LINES) {
      throw badRequest(`A cart can hold at most ${MAX_LINES} different units.`)
    }

    const now = new Date().toISOString()
    const nextQty = Math.min((existing ? Number(existing.qty) : 0) + qty, MAX_QTY_PER_LINE)

    // Warn rather than silently oversell; backorders are allowed to exceed.
    if (nextQty > product.available && product.stockStatus !== 'backorder') {
      throw badRequest(
        `Only ${Math.max(product.available, 0)} of ${product.name} ${product.available === 1 ? 'is' : 'are'} available.`,
        { productId, available: Math.max(product.available, 0) },
      )
    }

    run(
      `INSERT INTO cart_items (cart_id, product_id, qty, added_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(cart_id, product_id) DO UPDATE SET qty = excluded.qty`,
      [cartId, productId, nextQty, now],
    )
    run('UPDATE carts SET updated_at = ? WHERE id = ?', [now, cartId])

    return buildCart(cartId)
  })
}

export function setItemQty(cartId: string, productId: string, qty: number): CartDTO {
  if (qty <= 0) return removeItem(cartId, productId)
  if (!Number.isInteger(qty) || qty > MAX_QTY_PER_LINE) {
    throw badRequest(`Quantity must be between 1 and ${MAX_QTY_PER_LINE}.`)
  }

  const product = getProductById(productId)
  if (!product) throw notFound('That product does not exist.')
  if (qty > product.available && product.stockStatus !== 'backorder') {
    throw badRequest(
      `Only ${Math.max(product.available, 0)} of ${product.name} ${product.available === 1 ? 'is' : 'are'} available.`,
      { productId, available: Math.max(product.available, 0) },
    )
  }

  return transaction(() => {
    const result = run('UPDATE cart_items SET qty = ? WHERE cart_id = ? AND product_id = ?', [qty, cartId, productId])
    if (result.changes === 0) throw notFound('That item is not in the cart.')
    run('UPDATE carts SET updated_at = ? WHERE id = ?', [new Date().toISOString(), cartId])
    return buildCart(cartId)
  })
}

export function removeItem(cartId: string, productId: string): CartDTO {
  return transaction(() => {
    run('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?', [cartId, productId])
    run('UPDATE carts SET updated_at = ? WHERE id = ?', [new Date().toISOString(), cartId])
    return buildCart(cartId)
  })
}

export function clearCart(cartId: string): CartDTO {
  return transaction(() => {
    run('DELETE FROM cart_items WHERE cart_id = ?', [cartId])
    run('UPDATE carts SET updated_at = ? WHERE id = ?', [new Date().toISOString(), cartId])
    return buildCart(cartId)
  })
}

export function markCartConverted(cartId: string): void {
  run("UPDATE carts SET status = 'converted', updated_at = ? WHERE id = ?", [new Date().toISOString(), cartId])
}
