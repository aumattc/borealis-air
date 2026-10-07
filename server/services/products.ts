import { query, queryOne, run, transaction, type Row } from '../db/index.ts'
import { conflict, notFound } from '../lib/errors.ts'
import { uuid } from '../lib/crypto.ts'
import { getProductById, toProduct, type ProductDTO } from './catalog.ts'

/**
 * Catalog writes for the admin CMS.
 *
 * Products and their inventory row are created together, so a product is never
 * visible without stock tracking. Deleting is a soft delete (`active = 0`) when
 * the product has order history, because order lines reference the product id
 * and hard-deleting would orphan them.
 */

export interface ProductInput {
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

export interface ProductListFilters {
  search?: string
  category?: string
  includeInactive?: boolean
  limit?: number
  offset?: number
}

/** Admin listing: unlike the storefront this can include inactive products. */
export function listProductsForAdmin(filters: ProductListFilters = {}): { items: ProductDTO[]; total: number } {
  const where: string[] = []
  const params: unknown[] = []

  if (!filters.includeInactive) where.push('p.active = 1')
  if (filters.category && filters.category !== 'all') {
    where.push('p.category = ?')
    params.push(filters.category)
  }
  if (filters.search) {
    where.push('(p.name LIKE ? OR p.slug LIKE ? OR p.series LIKE ?)')
    const like = `%${filters.search}%`
    params.push(like, like, like)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500)
  const offset = Math.max(filters.offset ?? 0, 0)

  const rows = query<Row>(
    `SELECT p.*, i.on_hand, i.reserved, i.available, i.low_stock_threshold, i.backorderable, i.stock_status
     FROM products p
     LEFT JOIN inventory_levels i ON i.product_id = p.id
     ${whereSql}
     ORDER BY p.name
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )
  const total = Number(
    queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM products p ${whereSql}`, params)?.n ?? 0,
  )

  return { items: rows.map((r) => toProductWithFallback(r)), total }
}

/**
 * `inventory_levels` is a view over an inner join, so an inactive product with
 * no inventory row yields nulls. Coerce those to a sane "out of stock" shape.
 */
function toProductWithFallback(row: Row): ProductDTO {
  const safe: Row = {
    ...row,
    on_hand: row.on_hand ?? 0,
    reserved: row.reserved ?? 0,
    available: row.available ?? 0,
    low_stock_threshold: row.low_stock_threshold ?? 0,
    backorderable: row.backorderable ?? 0,
    stock_status: row.stock_status ?? 'out_of_stock',
  }
  return toProduct(safe)
}

export function getProductForAdmin(id: string): ProductDTO | null {
  const row = queryOne<Row>(
    `SELECT p.*, i.on_hand, i.reserved, i.available, i.low_stock_threshold, i.backorderable, i.stock_status
     FROM products p
     LEFT JOIN inventory_levels i ON i.product_id = p.id
     WHERE p.id = ?`,
    [id],
  )
  return row ? toProductWithFallback(row) : null
}

function assertSlugFree(slug: string, exceptId?: string): void {
  const existing = queryOne<{ id: string }>('SELECT id FROM products WHERE slug = ?', [slug])
  if (existing && existing.id !== exceptId) {
    throw conflict(`The slug "${slug}" is already used by another product.`, { slug })
  }
}

function productColumns(input: ProductInput): unknown[] {
  return [
    input.slug,
    input.name,
    input.series,
    input.category,
    input.btu,
    input.coverage,
    input.priceCents,
    input.compareAtCents ?? null,
    input.rating ?? 0,
    input.reviews ?? 0,
    input.noise,
    input.energyClass,
    JSON.stringify(input.modes),
    JSON.stringify(input.features),
    input.badge ?? null,
    input.blurb,
    input.description,
    JSON.stringify(input.specs),
    JSON.stringify(input.art ?? {}),
    input.active === false ? 0 : 1,
  ]
}

export interface CreateProductOptions {
  onHand?: number
  lowStockThreshold?: number
  backorderable?: boolean
}

export function createProduct(input: ProductInput, options: CreateProductOptions = {}): ProductDTO {
  assertSlugFree(input.slug)

  const id = uuid()
  const now = new Date().toISOString()

  transaction(() => {
    run(
      `INSERT INTO products (
         id, slug, name, series, category, btu, coverage,
         price_cents, compare_at_cents, rating, reviews, noise, energy_class,
         modes, features, badge, blurb, description, specs, art, active,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, ...productColumns(input), now, now],
    )

    run(
      `INSERT INTO inventory (product_id, on_hand, reserved, low_stock_threshold, backorderable, updated_at)
       VALUES (?, ?, 0, ?, ?, ?)`,
      [
        id,
        Math.max(0, Math.floor(options.onHand ?? 0)),
        Math.max(0, Math.floor(options.lowStockThreshold ?? 3)),
        options.backorderable ? 1 : 0,
        now,
      ],
    )

    if ((options.onHand ?? 0) > 0) {
      run(
        `INSERT INTO stock_movements
           (id, product_id, on_hand_delta, reserved_delta, reason, order_id, note, created_at)
         VALUES (?, ?, ?, 0, 'restock', NULL, 'initial stock', ?)`,
        [uuid(), id, Math.max(0, Math.floor(options.onHand ?? 0)), now],
      )
    }
  })

  return getProductForAdmin(id)!
}

export function updateProduct(id: string, input: ProductInput): ProductDTO {
  const existing = queryOne<{ id: string }>('SELECT id FROM products WHERE id = ?', [id])
  if (!existing) throw notFound('No such product.')
  assertSlugFree(input.slug, id)

  const now = new Date().toISOString()
  run(
    `UPDATE products SET
       slug = ?, name = ?, series = ?, category = ?, btu = ?, coverage = ?,
       price_cents = ?, compare_at_cents = ?, rating = ?, reviews = ?, noise = ?,
       energy_class = ?, modes = ?, features = ?, badge = ?, blurb = ?,
       description = ?, specs = ?, art = ?, active = ?, updated_at = ?
     WHERE id = ?`,
    [...productColumns(input), now, id],
  )

  return getProductForAdmin(id)!
}

export interface DeleteResult {
  deleted: boolean
  deactivated: boolean
  reason?: string
}

/**
 * Removes a product. If it appears on any order it is deactivated instead, so
 * historical order lines keep resolving.
 */
export function deleteProduct(id: string): DeleteResult {
  const existing = queryOne<{ id: string }>('SELECT id FROM products WHERE id = ?', [id])
  if (!existing) throw notFound('No such product.')

  const used = queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM order_items WHERE product_id = ?', [id])
  if (Number(used?.n ?? 0) > 0) {
    run('UPDATE products SET active = 0, updated_at = ? WHERE id = ?', [new Date().toISOString(), id])
    return {
      deleted: false,
      deactivated: true,
      reason: 'This product appears on past orders, so it was deactivated instead of deleted.',
    }
  }

  transaction(() => {
    run('DELETE FROM cart_items WHERE product_id = ?', [id])
    run('DELETE FROM products WHERE id = ?', [id])
  })
  return { deleted: true, deactivated: false }
}

/** Re-activates a product that was previously soft-deleted. */
export function restoreProduct(id: string): ProductDTO {
  const existing = queryOne<{ id: string }>('SELECT id FROM products WHERE id = ?', [id])
  if (!existing) throw notFound('No such product.')
  run('UPDATE products SET active = 1, updated_at = ? WHERE id = ?', [new Date().toISOString(), id])
  return getProductForAdmin(id)!
}

export function productExists(id: string): boolean {
  return Boolean(getProductById(id))
}
