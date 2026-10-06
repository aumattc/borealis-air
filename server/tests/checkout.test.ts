import './env.ts'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { newClient, startTestServer, createAdminClient, type TestContext } from './harness.ts'

const ADDRESS = {
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  addressLine1: '12 Frost Lane',
  city: 'Reykjavik',
  postcode: '101',
  country: 'Iceland',
}

interface CheckoutBody {
  order: {
    ref: string
    status: string
    paymentStatus: string
    totalCents: number
    subtotalCents: number
    taxCents: number
    lines: { productId: string; qty: number }[]
  }
  payment: {
    provider: string
    intentId: string
    clientSecret: string | null
    status: string
    checkoutUrl?: string
    sessionId?: string
    checkoutStyle: 'stripe' | 'mock'
  }
}

describe('checkout and payment', () => {
  let ctx: TestContext

  before(async () => {
    ctx = await startTestServer()
  })
  after(async () => {
    await ctx.close()
  })

  it('rejects checkout with an empty cart', async () => {
    const client = newClient(ctx)
    const res = await client.post('/api/checkout', ADDRESS)
    assert.equal(res.status, 400)
  })

  it('creates a pending order, holds stock and returns a hosted checkout URL', async () => {
    const client = newClient(ctx)
    await client.post('/api/cart/items', { productId: 'ba-02', qty: 2 })

    const before = await client.get<{ product: { available: number } }>('/api/products/borealis-glacier')
    const availableBefore = before.body.product.available

    const res = await client.post<CheckoutBody>('/api/checkout', ADDRESS)
    assert.equal(res.status, 201)
    assert.equal(res.body.order.status, 'pending')
    assert.equal(res.body.order.paymentStatus, 'requires_payment')
    assert.equal(res.body.order.subtotalCents, 129800)
    assert.equal(res.body.payment.provider, 'mock')
    assert.equal(res.body.payment.checkoutStyle, 'mock')
    assert.ok(res.body.payment.checkoutUrl, 'a hosted checkout URL should be returned')
    assert.ok(res.body.payment.sessionId, 'a checkout session id should be returned')
    assert.ok(res.body.order.ref.startsWith('BA-'))

    // Stock should now be held, not yet sold.
    const after = await client.get<{ product: { available: number } }>('/api/products/borealis-glacier')
    assert.equal(after.body.product.available, availableBefore - 2)
  })

  it('marks the order paid on a signed webhook and converts the hold to a sale', async () => {
    const client = newClient(ctx)
    await client.post('/api/cart/items', { productId: 'ba-04', qty: 1 })
    const created = await client.post<CheckoutBody>('/api/checkout', { ...ADDRESS, email: 'pay@example.com' })

    const confirm = await client.post<{ ok: boolean }>(
      `/api/dev/payments/${created.body.payment.intentId}/confirm`,
      { outcome: 'succeed' },
    )
    assert.equal(confirm.status, 200)

    const order = await client.get<{ order: { status: string; paymentStatus: string } }>(
      `/api/orders/${created.body.order.ref}`,
    )
    assert.equal(order.body.order.status, 'paid')
    assert.equal(order.body.order.paymentStatus, 'succeeded')
  })

  it('is idempotent when the same webhook is delivered twice', async () => {
    const client = newClient(ctx)
    const admin = await createAdminClient(ctx, 'admin-twice@test.borealis')

    await client.post('/api/cart/items', { productId: 'ba-05', qty: 1 })
    const created = await client.post<CheckoutBody>('/api/checkout', { ...ADDRESS, email: 'twice@example.com' })

    const read = async () => {
      const res = await admin.get<{ inventory: { productId: string; onHand: number; reserved: number }[] }>(
        '/api/admin/inventory',
      )
      return res.body.inventory.find((i) => i.productId === 'ba-05')!
    }

    const before = await read()
    // One unit is now held for this order.
    assert.equal(before.reserved, 1)
    const onHandBefore = before.onHand

    await client.post(`/api/dev/payments/${created.body.payment.intentId}/confirm`, { outcome: 'succeed' })
    const afterFirst = await read()

    // The hold became a sale: stock leaves the shelf and the hold clears.
    assert.equal(afterFirst.onHand, onHandBefore - 1)
    assert.equal(afterFirst.reserved, 0)

    // Replay the exact same event.
    await client.post(`/api/dev/payments/${created.body.payment.intentId}/confirm`, { outcome: 'succeed' })
    const afterSecond = await read()

    assert.equal(afterSecond.onHand, onHandBefore - 1, 'replay must not sell twice')
    assert.equal(afterSecond.reserved, 0)
  })

  it('releases held stock when payment fails', async () => {
    const client = newClient(ctx)
    await client.post('/api/cart/items', { productId: 'ba-06', qty: 2 })

    const before = await client.get<{ product: { available: number } }>('/api/products/borealis-aurora')
    const availableBefore = before.body.product.available

    const created = await client.post<CheckoutBody>('/api/checkout', { ...ADDRESS, email: 'fail@example.com' })
    const held = await client.get<{ product: { available: number } }>('/api/products/borealis-aurora')
    assert.equal(held.body.product.available, availableBefore - 2)

    await client.post(`/api/dev/payments/${created.body.payment.intentId}/confirm`, { outcome: 'fail' })

    const released = await client.get<{ product: { available: number } }>('/api/products/borealis-aurora')
    assert.equal(released.body.product.available, availableBefore)

    const order = await client.get<{ order: { status: string } }>(`/api/orders/${created.body.order.ref}`)
    assert.equal(order.body.order.status, 'failed')
  })

  it('rejects an unsigned webhook', async () => {
    const client = newClient(ctx)
    const res = await client.request('POST', '/api/webhooks/payments', {
      raw: JSON.stringify({
        id: 'evt_unsigned',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_fake', amount: 100, metadata: {} } },
      }),
    })
    assert.equal(res.status, 400)
  })

  it('rejects a webhook with a forged signature', async () => {
    const client = newClient(ctx)
    const res = await client.request('POST', '/api/webhooks/payments', {
      raw: JSON.stringify({
        id: 'evt_forged',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_fake', amount: 100, metadata: {} } },
      }),
      headers: { 'Stripe-Signature': 't=1700000000,v1=deadbeefdeadbeef' },
    })
    assert.equal(res.status, 400)
  })

  it('does not mark an order paid when the webhook amount is wrong', async () => {
    const client = newClient(ctx)
    await client.post('/api/cart/items', { productId: 'ba-01', qty: 1 })
    const created = await client.post<CheckoutBody>('/api/checkout', { ...ADDRESS, email: 'amount@example.com' })

    const { signWebhookPayload } = await import('../payments/mock.ts')
    const payload = JSON.stringify({
      id: 'evt_wrong_amount',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: created.body.payment.intentId,
          // One cent short of the real total.
          amount: created.body.order.totalCents - 1,
          status: 'succeeded',
          metadata: { order_ref: created.body.order.ref },
        },
      },
    })

    const res = await client.request('POST', '/api/webhooks/payments', {
      raw: payload,
      headers: { 'Stripe-Signature': signWebhookPayload(payload) },
    })
    assert.equal(res.status, 200)

    const order = await client.get<{ order: { status: string } }>(`/api/orders/${created.body.order.ref}`)
    assert.equal(order.body.order.status, 'pending', 'a mismatched amount must not settle the order')
  })

  it('accepts a correctly signed webhook and marks the order paid', async () => {
    const client = newClient(ctx)
    await client.post('/api/cart/items', { productId: 'ba-02', qty: 1 })
    const created = await client.post<CheckoutBody>('/api/checkout', { ...ADDRESS, email: 'signed@example.com' })

    const { signWebhookPayload } = await import('../payments/mock.ts')
    const payload = JSON.stringify({
      id: 'evt_signed_ok',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: created.body.payment.intentId,
          amount: created.body.order.totalCents,
          status: 'succeeded',
          metadata: { order_ref: created.body.order.ref },
        },
      },
    })

    const res = await client.request('POST', '/api/webhooks/payments', {
      raw: payload,
      headers: { 'Stripe-Signature': signWebhookPayload(payload) },
    })
    assert.equal(res.status, 200)

    const order = await client.get<{ order: { status: string } }>(`/api/orders/${created.body.order.ref}`)
    assert.equal(order.body.order.status, 'paid')
  })

  it('cannot oversell the last units under concurrent checkouts', async () => {
    const a = newClient(ctx)
    const b = newClient(ctx)

    // ba-07 has 3 on hand.
    await a.post('/api/cart/items', { productId: 'ba-07', qty: 3 })
    await b.post('/api/cart/items', { productId: 'ba-07', qty: 3 })

    const [ra, rb] = await Promise.all([
      a.post<CheckoutBody>('/api/checkout', { ...ADDRESS, email: 'race-a@example.com' }),
      b.post<CheckoutBody>('/api/checkout', { ...ADDRESS, email: 'race-b@example.com' }),
    ])

    const statuses = [ra.status, rb.status].sort()
    assert.deepEqual(statuses, [201, 409], 'exactly one checkout should win')

    const product = await a.get<{ product: { available: number } }>('/api/products/borealis-rime')
    assert.equal(product.body.product.available, 0)
  })

  it('404s an unknown order reference', async () => {
    const client = newClient(ctx)
    const res = await client.get('/api/orders/BA-DOESNOTEXIST')
    assert.equal(res.status, 404)
  })
})
