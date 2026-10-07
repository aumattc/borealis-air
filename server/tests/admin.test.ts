import './env.ts'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createAdminClient, newClient, startTestServer, type Client, type TestContext } from './harness.ts'

describe('admin', () => {
  let ctx: TestContext
  let admin: Client

  before(async () => {
    ctx = await startTestServer()
    admin = await createAdminClient(ctx)
  })

  after(async () => {
    await ctx.close()
  })

  it('rejects anonymous access', async () => {
    const client = newClient(ctx)
    const res = await client.get('/api/admin/overview')
    assert.equal(res.status, 401)
  })

  it('rejects a non-admin customer', async () => {
    const client = newClient(ctx)
    await client.post('/api/auth/register', {
      email: 'plain@example.com',
      password: 'correct-horse-battery',
      firstName: 'P',
      lastName: 'U',
    })
    const res = await client.get('/api/admin/overview')
    assert.equal(res.status, 401)
  })

  it('returns an overview with inventory and order stats', async () => {
    const res = await admin.get<{
      orders: Record<string, number>
      customers: number
      inventory: { productId: string }[]
    }>('/api/admin/overview')

    assert.equal(res.status, 200)
    assert.equal(res.body.inventory.length, 8)
    assert.ok(res.body.customers >= 1)
    assert.ok(typeof res.body.orders.total === 'number')
  })

  it('lists inventory with stock status', async () => {
    const res = await admin.get<{ inventory: { productId: string; stockStatus: string }[] }>(
      '/api/admin/inventory',
    )
    assert.equal(res.status, 200)
    const tundra = res.body.inventory.find((i) => i.productId === 'ba-08')
    assert.equal(tundra?.stockStatus, 'backorder')
  })

  it('adjusts stock and records a movement', async () => {
    const before = await admin.get<{ inventory: { productId: string; onHand: number }[] }>(
      '/api/admin/inventory',
    )
    const beforeOnHand = before.body.inventory.find((i) => i.productId === 'ba-01')!.onHand

    const res = await admin.patch<{ inventory: { onHand: number } }>('/api/admin/inventory/ba-01', {
      onHandDelta: 5,
      note: 'delivery received',
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.inventory.onHand, beforeOnHand + 5)

    const movements = await admin.get<{ movements: { reason: string; onHandDelta: number }[] }>(
      '/api/admin/inventory/ba-01/movements',
    )
    assert.ok(movements.body.movements.some((m) => m.reason === 'restock' && m.onHandDelta === 5))
  })

  it('refuses to drive on-hand below reserved stock', async () => {
    const res = await admin.patch<{ error: { code: string } }>('/api/admin/inventory/ba-01', {
      onHandDelta: -100000,
    })
    assert.ok(res.status === 400 || res.status === 409)
  })

  it('lists and filters orders', async () => {
    const client = newClient(ctx)
    await client.post('/api/cart/items', { productId: 'ba-01', qty: 1 })
    await client.post('/api/checkout', {
      email: 'adminlist@example.com',
      firstName: 'A',
      lastName: 'L',
      addressLine1: '2 Cold Street',
      city: 'Helsinki',
      postcode: '00100',
      country: 'Finland',
    })

    const all = await admin.get<{ items: unknown[]; total: number }>('/api/admin/orders')
    assert.equal(all.status, 200)
    assert.ok(all.body.total >= 1)

    const pending = await admin.get<{ items: { status: string }[] }>('/api/admin/orders?status=pending')
    assert.ok(pending.body.items.every((o) => o.status === 'pending'))
  })

  it('fulfills a paid order and rejects fulfilling an unpaid one', async () => {
    const client = newClient(ctx)
    await client.post('/api/cart/items', { productId: 'ba-02', qty: 1 })
    const created = await client.post<{
      order: { ref: string }
      payment: { intentId: string }
    }>('/api/checkout', {
      email: 'fulfil@example.com',
      firstName: 'F',
      lastName: 'U',
      addressLine1: '3 Cold Street',
      city: 'Stockholm',
      postcode: '11122',
      country: 'Sweden',
    })

    // Cannot fulfil before payment.
    const tooEarly = await admin.post(`/api/admin/orders/${created.body.order.ref}/fulfill`)
    assert.equal(tooEarly.status, 409)

    await client.post(`/api/dev/payments/${created.body.payment.intentId}/confirm`, { outcome: 'succeed' })

    const fulfilled = await admin.post<{ order: { status: string } }>(
      `/api/admin/orders/${created.body.order.ref}/fulfill`,
    )
    assert.equal(fulfilled.status, 200)
    assert.equal(fulfilled.body.order.status, 'fulfilled')
  })

  it('refunds a paid order', async () => {
    const client = newClient(ctx)
    await client.post('/api/cart/items', { productId: 'ba-04', qty: 1 })
    const created = await client.post<{
      order: { ref: string }
      payment: { intentId: string }
    }>('/api/checkout', {
      email: 'refund@example.com',
      firstName: 'R',
      lastName: 'E',
      addressLine1: '4 Cold Street',
      city: 'Copenhagen',
      postcode: '1050',
      country: 'Denmark',
    })

    await client.post(`/api/dev/payments/${created.body.payment.intentId}/confirm`, { outcome: 'succeed' })

    const refunded = await admin.post<{ order: { status: string; paymentStatus: string } }>(
      `/api/admin/orders/${created.body.order.ref}/refund`,
    )
    assert.equal(refunded.status, 200)
    assert.equal(refunded.body.order.paymentStatus, 'refunded')
  })

  it('releases expired holds, closes the order, and ignores a late payment', async () => {
    const { run, query } = await import('../db/index.ts')

    const stock = () => {
      const row = query<{ on_hand: number; reserved: number }>(
        'SELECT on_hand, reserved FROM inventory WHERE product_id = ?',
        ['ba-01'],
      )[0]!
      return { onHand: Number(row.on_hand), reserved: Number(row.reserved) }
    }
    const before = stock()

    const client = newClient(ctx)
    await client.post('/api/cart/items', { productId: 'ba-01', qty: 3 })
    const created = await client.post<{
      order: { ref: string }
      payment: { intentId: string }
    }>('/api/checkout', {
      email: 'expire@example.com',
      firstName: 'X',
      lastName: 'P',
      addressLine1: '5 Cold Street',
      city: 'Oslo',
      postcode: '0150',
      country: 'Norway',
    })

    assert.equal(stock().reserved, before.reserved + 3)

    // Age the hold past the reservation window.
    run('UPDATE stock_reservations SET created_at = ? WHERE order_id = ?', [
      new Date(Date.now() - 31 * 60_000).toISOString(),
      query<{ id: string }>('SELECT id FROM orders WHERE ref = ?', [created.body.order.ref])[0]!.id,
    ])

    const released = await admin.post<{ releasedOrders: number }>('/api/admin/inventory/release-expired')
    assert.equal(released.status, 200)
    assert.ok(released.body.releasedOrders >= 1)

    assert.equal(stock().reserved, before.reserved)
    assert.equal(stock().onHand, before.onHand, 'a released hold must not change on-hand')

    const closed = await admin.get<{ order: { status: string } }>(
      `/api/admin/orders/${created.body.order.ref}`,
    )
    assert.equal(closed.body.order.status, 'cancelled')

    // A webhook arriving after the hold expired must not resurrect the order.
    await client.post(`/api/dev/payments/${created.body.payment.intentId}/confirm`, { outcome: 'succeed' })
    const after = await admin.get<{ order: { status: string; paymentStatus: string } }>(
      `/api/admin/orders/${created.body.order.ref}`,
    )
    assert.equal(after.body.order.status, 'cancelled')
    assert.notEqual(after.body.order.paymentStatus, 'succeeded')
    assert.equal(stock().onHand, before.onHand, 'an orphaned payment must not decrement stock')
  })
})
