import { query, queryOne, type Row } from '../db/index.ts'

export interface ProductDTO {
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

export interface CatalogFilters {
  category?: string
  minBtu?: number
  maxBtu?: number
  maxPriceCents?: number
  inStockOnly?: boolean
  search?: string
  sort?: 'featured' | 'price_asc' | 'price_desc' | 'btu_desc' | 'noise_asc' | 'rating_desc'
  limit?: number
  offset?: number
}

/** Columns joined from the inventory_levels view. */
const SELECT = `
  SELECT
    p.*,
    i.on_hand, i.reserved, i.available, i.low_stock_threshold, i.backorderable, i.stock_status
  FROM products p
  JOIN inventory_levels i ON i.product_id = p.id
`

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function toProduct(row: Row): ProductDTO {
  const stockStatus = row.stock_status as ProductDTO['stockStatus']
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    series: String(row.series),
    category: String(row.category),
    btu: Number(row.btu),
    coverage: Number(row.coverage),
    priceCents: Number(row.price_cents),
    compareAtCents: row.compare_at_cents === null ? null : Number(row.compare_at_cents),
    rating: Number(row.rating),
    reviews: Number(row.reviews),
    noise: Number(row.noise),
    energyClass: String(row.energy_class),
    modes: parseJson<string[]>(row.modes, []),
    features: parseJson<string[]>(row.features, []),
    badge: row.badge === null ? null : String(row.badge),
    blurb: String(row.blurb),
    description: String(row.description),
    specs: parseJson<{ label: string; value: string }[]>(row.specs, []),
    art: parseJson<unknown>(row.art, {}),
    inStock: Number(row.available) > 0 || Number(row.backorderable) === 1,
    available: Number(row.available),
    stockStatus,
  }
}

const SORTS: Record<string, string> = {
  featured: 'p.badge IS NULL, p.rating DESC, p.price_cents ASC',
  price_asc: 'p.price_cents ASC',
  price_desc: 'p.price_cents DESC',
  btu_desc: 'p.btu DESC',
  noise_asc: 'p.noise ASC',
  rating_desc: 'p.rating DESC, p.reviews DESC',
}

export function listProducts(filters: CatalogFilters = {}): { items: ProductDTO[]; total: number } {
  const where: string[] = ['p.active = 1']
  const params: unknown[] = []

  if (filters.category && filters.category !== 'all') {
    where.push('p.category = ?')
    params.push(filters.category)
  }
  if (filters.minBtu !== undefined) {
    where.push('p.btu >= ?')
    params.push(filters.minBtu)
  }
  if (filters.maxBtu !== undefined) {
    where.push('p.btu <= ?')
    params.push(filters.maxBtu)
  }
  if (filters.maxPriceCents !== undefined) {
    where.push('p.price_cents <= ?')
    params.push(filters.maxPriceCents)
  }
  if (filters.inStockOnly) {
    where.push('(i.available > 0 OR i.backorderable = 1)')
  }
  if (filters.search) {
    where.push('(p.name LIKE ? OR p.blurb LIKE ? OR p.series LIKE ?)')
    const like = `%${filters.search}%`
    params.push(like, like, like)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const orderSql = SORTS[filters.sort ?? 'featured'] ?? SORTS.featured!
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100)
  const offset = Math.max(filters.offset ?? 0, 0)

  const rows = query<Row>(
    `${SELECT} ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  )
  const countRow = queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM products p JOIN inventory_levels i ON i.product_id = p.id ${whereSql}`,
    params,
  )

  return { items: rows.map(toProduct), total: Number(countRow?.n ?? 0) }
}

export function getProductBySlug(slug: string): ProductDTO | null {
  const row = queryOne<Row>(`${SELECT} WHERE p.slug = ? AND p.active = 1`, [slug])
  return row ? toProduct(row) : null
}

export function getProductById(id: string): ProductDTO | null {
  const row = queryOne<Row>(`${SELECT} WHERE p.id = ?`, [id])
  return row ? toProduct(row) : null
}

export function relatedProducts(slug: string, limit = 3): ProductDTO[] {
  const row = queryOne<Row>('SELECT id, category FROM products WHERE slug = ?', [slug])
  if (!row) return []
  const rows = query<Row>(
    `${SELECT} WHERE p.slug != ? AND p.category = ? AND p.active = 1
     ORDER BY p.rating DESC LIMIT ?`,
    [slug, row.category, limit],
  )
  return rows.map(toProduct)
}

export function listCategories(): { id: string; label: string; note: string; count: number }[] {
  const rows = query<{ category: string; n: number }>(
    `SELECT category, COUNT(*) AS n FROM products WHERE active = 1 GROUP BY category`,
  )
  const counts = new Map(rows.map((r) => [r.category, Number(r.n)]))
  const labels: Record<string, { label: string; note: string }> = {
    portable: { label: 'Portable', note: 'Roll anywhere, vent out a window' },
    windowless: { label: 'Windowless', note: 'No exterior venting required' },
    evaporative: { label: 'Evaporative', note: 'Dry-climate cooling' },
    pro: { label: 'Pro / Commercial', note: 'Workshops, studios, server rooms' },
  }
  const order = ['portable', 'windowless', 'evaporative', 'pro']
  return order
    .filter((id) => counts.has(id))
    .map((id) => ({
      id,
      label: labels[id]?.label ?? id,
      note: labels[id]?.note ?? '',
      count: counts.get(id) ?? 0,
    }))
}
