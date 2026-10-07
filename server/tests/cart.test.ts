import './env.ts'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { newClient, startTestServer, type TestContext } from './harness.ts'

describe('cart', () => {
  let ctx: TestContext

  before(async () => {
    ctx = await startTestServer()
  })
  after(async () => {
    await ctx.close()
  })

  it('starts empty for a new visitor', async () => {
    const client = newClient(ctx)
    const res = await client.get<{ cart: { items: unknown[] } }>('/api/cart')
    assert.equal(res.status, 200)
    assert.equal(res.body.cart.items.length, 0)
  })

  it('adds an item and computes totals server-side', async () => {
    const client = newClient(ctx)
    const res = await client.post<{ cart: { items: { qty: number }[]; totals: { subtotalCents: number; taxCents: number; totalCents: number } } }>(
      '/api/cart/items',
      { productId: 'ba-01', qty: 2 },
    )

    assert.equal(res.status, 201)
    assert.equal(res.body.cart.items[0]!.qty, 2)
    // 2 x $449.00
    assert.equal(res.body.cart.totals.subtotalCents, 89800)
    // 8.25% of 89800
    assert.equal(res.body.cart.totals.taxCents, 7409)
    assert.equal(res.body.cart.totals.totalCents, 97209)
  })

  it('merges duplicate adds into one line', async () => {
    const client = newClient(ctx)
    await client.post('/api/cart/items', { productId: 'ba-04', qty: 1 })
    const res = await client.post<{ cart: { items: { productId: string; qty: number }[] } }>(
      '/api/cart/items',
      { productId: 'ba-04', qty: 2 },
    )

    const line = res.body.cart.items.find((i) => i.productId === 'ba-04')
    assert.ok(line)
    assert.equal(line!.qty, 3)
  })

  it('updates a line quantity', async () => {
    const client = newClient(ctx)
    await client.post('/api/cart/items', { productId: 'ba-05', qty: 1 })
    const res = await client.patch<{ cart: { items: { productId: string; qty: number }[] } }>(
      '/api/cart/items/ba-05',
      { qty: 4 },
    )
    assert.equal(res.status, 200)
    assert.equal(res.body.cart.items.find((i) => i.productId === 'ba-05')!.qty, 4)
  })

  it('removes a line when quantity drops to zero', async () => {
    const client = newClient(ctx)
    await client.post('/api/cart/items', { productId: 'ba-06', qty: 1 })
    const res = await client.patch<{ cart: { items: { productId: string }[] } }>(
      '/api/cart/items/ba-06',
      { qty: 0 },
    )
    assert.equal(res.body.cart.items.some((i) => i.productId === 'ba-06'), false)
  })

  it('refuses to add more than available stock', async () => {
    const client = newClient(ctx)
    // ba-07 has 3 on hand.
    const res = await client.post<{ error: { code: string } }>('/api/cart/items', {
      productId: 'ba-07',
      qty: 10,
    })
    assert.equal(res.status, 400)
    assert.equal(res.body.error.code, 'bad_request')
  })

  it('allows backordering an out-of-stock unit', async () => {
    const client = newClient(ctx)
    // ba-08 is backorderable at zero on hand.
    const res = await client.post<{ cart: { items: unknown[] } }>('/api/cart/items', {
      productId: 'ba-08',
      qty: 2,
    })
    assert.equal(res.status, 201)
    assert.equal(res.body.cart.items.length, 1)
  })

  it('rejects an unknown product', async () => {
    const client = newClient(ctx)
    const res = await client.post('/api/cart/items', { productId: 'ba-999', qty: 1 })
    assert.equal(res.status, 404)
  })

  it('rejects a non-integer quantity', async () => {
    const client = newClient(ctx)
    const res = await client.post('/api/cart/items', { productId: 'ba-01', qty: 1.5 })
    assert.equal(res.status, 400)
  })

  it('clears the cart', async () => {
    const client = newClient(ctx)
    await client.post('/api/cart/items', { productId: 'ba-01', qty: 1 })
    const res = await client.delete<{ cart: { items: unknown[] } }>('/api/cart')
    assert.equal(res.body.cart.items.length, 0)
  })

  it('keeps separate carts for separate visitors', async () => {
    const a = newClient(ctx)
    const b = newClient(ctx)
    await a.post('/api/cart/items', { productId: 'ba-01', qty: 1 })

    const bCart = await b.get<{ cart: { items: unknown[] } }>('/api/cart')
    assert.equal(bCart.body.cart.items.length, 0)
  })
})
