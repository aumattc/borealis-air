import { badRequest, notFound } from '../lib/errors.ts'
import { listCategories, listProducts, getProductBySlug, relatedProducts } from '../services/catalog.ts'
import type { Router } from '../http/router.ts'

const SORTS = ['featured', 'price_asc', 'price_desc', 'btu_desc', 'noise_asc', 'rating_desc'] as const

function intParam(value: string | null, fallback?: number): number | undefined {
  if (value === null || value === '') return fallback
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

export function registerCatalogRoutes(router: Router): void {
  router.get('/api/categories', () => ({ body: { categories: listCategories() } }))

  router.get('/api/products', (ctx) => {
    const sortParam = ctx.query.get('sort')
    const sort = (SORTS as readonly string[]).includes(sortParam ?? '')
      ? (sortParam as (typeof SORTS)[number])
      : 'featured'

    const maxPrice = intParam(ctx.query.get('maxPriceCents'))

    const { items, total } = listProducts({
      category: ctx.query.get('category') ?? undefined,
      minBtu: intParam(ctx.query.get('minBtu')),
      maxBtu: intParam(ctx.query.get('maxBtu')),
      maxPriceCents: maxPrice,
      inStockOnly: ctx.query.get('inStock') === 'true',
      search: ctx.query.get('q') ?? undefined,
      sort,
      limit: intParam(ctx.query.get('limit'), 50),
      offset: intParam(ctx.query.get('offset'), 0),
    })

    return { body: { products: items, total, sort } }
  })

  router.get('/api/products/:slug', (ctx) => {
    const slug = ctx.params.slug
    if (!slug) throw badRequest('A product slug is required.')

    const product = getProductBySlug(slug)
    if (!product) throw notFound('We do not make a unit by that name.')

    return { body: { product, related: relatedProducts(slug, 3) } }
  })
}
