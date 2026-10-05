import './env.ts'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { newClient, startTestServer, type TestContext } from './harness.ts'

describe('catalog', () => {
  let ctx: TestContext

  before(async () => {
    ctx = await startTestServer()
  })
  after(async () => {
    await ctx.close()
  })

  it('lists the seeded catalog', async () => {
    const client = newClient(ctx)
    const res = await client.get<{ products: unknown[]; total: number }>('/api/products')

    assert.equal(res.status, 200)
    assert.equal(res.body.total, 8)
    assert.equal(res.body.products.length, 8)
  })

  it('filters by category', async () => {
    const client = newClient(ctx)
    const res = await client.get<{ products: { category: string }[]; total: number }>(
      '/api/products?category=pro',
    )

    assert.equal(res.status, 200)
    assert.ok(res.body.total >= 1)
    assert.ok(res.body.products.every((p) => p.category === 'pro'))
  })

  it('filters by BTU range', async () => {
    const client = newClient(ctx)
    const res = await client.get<{ products: { btu: number }[] }>('/api/products?minBtu=12000')

    assert.equal(res.status, 200)
    assert.ok(res.body.products.length > 0)
    assert.ok(res.body.products.every((p) => p.btu >= 12000))
  })

  it('sorts by price ascending', async () => {
    const client = newClient(ctx)
    const res = await client.get<{ products: { priceCents: number }[] }>(
      '/api/products?sort=price_asc',
    )
    const prices = res.body.products.map((p) => p.priceCents)
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b))
  })

  it('returns a single product with stock status', async () => {
    const client = newClient(ctx)
    const res = await client.get<{
      product: { slug: string; priceCents: number; available: number; stockStatus: string }
      related: unknown[]
    }>('/api/products/borealis-glacier')

    assert.equal(res.status, 200)
    assert.equal(res.body.product.slug, 'borealis-glacier')
    assert.equal(res.body.product.priceCents, 64900)
    assert.ok(['in_stock', 'low_stock', 'backorder', 'out_of_stock'].includes(res.body.product.stockStatus))
  })

  it('404s an unknown slug', async () => {
    const client = newClient(ctx)
    const res = await client.get('/api/products/not-a-real-unit')
    assert.equal(res.status, 404)
  })

  it('reports categories with counts', async () => {
    const client = newClient(ctx)
    const res = await client.get<{ categories: { id: string; count: number }[] }>('/api/categories')
    assert.equal(res.status, 200)
    const total = res.body.categories.reduce((sum, c) => sum + c.count, 0)
    assert.equal(total, 8)
  })
})
