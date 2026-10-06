import './env.ts'
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { createAdminClient, newClient, startTestServer, type Client, type TestContext } from './harness.ts'

/**
 * CMS coverage: product CRUD, inventory adjustments, and Stripe credential
 * management (encryption at rest, masking, sandbox/production modes).
 */

function productPayload(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'aurora-test-unit',
    name: 'Aurora Test Unit',
    series: 'Test',
    category: 'portable',
    btu: 9000,
    coverage: 400,
    priceCents: 59900,
    compareAtCents: 69900,
    rating: 4.4,
    reviews: 12,
    noise: 50,
    energyClass: 'A',
    modes: ['cool', 'fan'],
    features: ['Test feature one', 'Test feature two'],
    badge: 'New',
    blurb: 'A unit created by the CMS test suite.',
    description: 'Long-form description used to exercise validation.',
    specs: [
      { label: 'BTU', value: '9,000' },
      { label: 'Noise', value: '50 dB' },
    ],
    art: { hue: 200, accent: '#4fe3d0', vents: 5, proportions: 'standard' },
    active: true,
    ...overrides,
  }
}

describe('CMS: products', () => {
  let ctx: TestContext
  let admin: Client

  before(async () => {
    ctx = await startTestServer()
    admin = await createAdminClient(ctx)
  })
  after(async () => {
    await ctx.close()
  })

  it('requires an admin session', async () => {
    const anon = newClient(ctx)
    const res = await anon.get('/api/admin/products')
    assert.equal(res.status, 401)
  })

  it('creates a product with inventory and lists it', async () => {
    const created = await admin.post<{ product: { id: string; slug: string; available: number } }>(
      '/api/admin/products',
      { ...productPayload(), onHand: 25, lowStockThreshold: 4 },
    )
    assert.equal(created.status, 201)
    assert.equal(created.body.product.slug, 'aurora-test-unit')

    const list = await admin.get<{ items: { slug: string }[] }>('/api/admin/products?q=aurora')
    assert.ok(list.body.items.some((p) => p.slug === 'aurora-test-unit'))

    const stock = await admin.get<{ inventory: { slug: string; onHand: number; available: number }[] }>(
      '/api/admin/inventory',
    )
    const line = stock.body.inventory.find((i) => i.slug === 'aurora-test-unit')
    assert.ok(line, 'the new product should have an inventory row')
    assert.equal(line!.onHand, 25)
    assert.equal(line!.available, 25)
  })

  it('rejects a duplicate slug', async () => {
    const res = await admin.post('/api/admin/products', productPayload({ slug: 'aurora-test-unit' }))
    assert.equal(res.status, 409)
  })

  it('rejects an invalid slug', async () => {
    const res = await admin.post('/api/admin/products', productPayload({ slug: 'Not A Slug' }))
    assert.equal(res.status, 400)
  })

  it('rejects missing required fields with field errors', async () => {
    const res = await admin.post<{ error: { details?: Record<string, string> } }>('/api/admin/products', {
      slug: 'incomplete-unit',
      name: '',
    })
    assert.equal(res.status, 400)
    assert.ok(res.body.error.details && Object.keys(res.body.error.details).length > 0)
  })

  it('updates a product and reflects the new price', async () => {
    const list = await admin.get<{ items: { id: string; slug: string }[] }>('/api/admin/products?q=aurora')
    const target = list.body.items.find((p) => p.slug === 'aurora-test-unit')!

    const updated = await admin.request<{ product: { priceCents: number; name: string } }>(
      'PUT',
      `/api/admin/products/${target.id}`,
      { body: productPayload({ priceCents: 54900, name: 'Aurora Test Unit Mk II' }) },
    )
    assert.equal(updated.status, 200)
    assert.equal(updated.body.product.priceCents, 54900)
    assert.equal(updated.body.product.name, 'Aurora Test Unit Mk II')
  })

  it('deactivates a product that appears on an order instead of deleting it', async () => {
    // Sell the unit so it has order history.
    const shopper = newClient(ctx)
    const list = await admin.get<{ items: { id: string; slug: string }[] }>('/api/admin/products?q=aurora')
    const target = list.body.items.find((p) => p.slug === 'aurora-test-unit')!

    await shopper.post('/api/cart/items', { productId: target.id, qty: 1 })
    const order = await shopper.post<{ order: { ref: string }; payment: { intentId: string } }>('/api/checkout', {
      email: 'cms-buyer@example.com',
      firstName: 'Cms',
      lastName: 'Buyer',
      addressLine1: '1 Test Way',
      city: 'Testville',
      postcode: '12345',
      country: 'United States',
    })
    assert.equal(order.status, 201)

    const removed = await admin.delete<{ deleted: boolean; deactivated: boolean }>(`/api/admin/products/${target.id}`)
    assert.equal(removed.status, 200)
    assert.equal(removed.body.deleted, false)
    assert.equal(removed.body.deactivated, true)

    // Still resolvable for the historical order, but hidden from the storefront.
    const storefront = await shopper.get(`/api/products/aurora-test-unit`)
    assert.equal(storefront.status, 404)
  })

  it('hard-deletes a product with no order history', async () => {
    const created = await admin.post<{ product: { id: string } }>('/api/admin/products', {
      ...productPayload({ slug: 'ephemeral-unit', name: 'Ephemeral Unit' }),
      onHand: 0,
    })
    const id = created.body.product.id

    const removed = await admin.delete<{ deleted: boolean }>(`/api/admin/products/${id}`)
    assert.equal(removed.body.deleted, true)

    const after = await admin.get(`/api/admin/products/${id}`)
    assert.equal(after.status, 404)
  })
})

describe('CMS: Stripe payment settings', () => {
  let ctx: TestContext
  let admin: Client

  before(async () => {
    ctx = await startTestServer()
    admin = await createAdminClient(ctx, 'payments-admin@test.borealis')
  })
  after(async () => {
    await ctx.close()
  })

  it('requires an admin session', async () => {
    const anon = newClient(ctx)
    assert.equal((await anon.get('/api/admin/settings/payments')).status, 401)
    assert.equal((await anon.request('PUT', '/api/admin/settings/payments', { body: {} })).status, 401)
  })

  it('starts with nothing configured and defaults to mock checkout', async () => {
    const res = await admin.get<{ stripe: { mode: string; checkoutStyle: string; sandbox: { secretKey: string } } }>(
      '/api/admin/settings/payments',
    )
    assert.equal(res.status, 200)
    assert.equal(res.body.stripe.checkoutStyle, 'mock')
    assert.equal(res.body.stripe.sandbox.secretKey, '')
  })

  it('stores sandbox keys encrypted and only ever returns a mask', async () => {
    const secret = 'sk_test_' + 'a'.repeat(24)
    const publishable = 'pk_test_' + 'b'.repeat(24)
    const webhook = 'whsec_' + 'c'.repeat(24)

    const saved = await admin.request<{ stripe: { sandbox: { secretKey: string; source: { secretKey: string } } } }>(
      'PUT',
      '/api/admin/settings/payments',
      {
        body: {
          mode: 'sandbox',
          checkoutStyle: 'stripe',
          sandboxSecretKey: secret,
          sandboxPublishableKey: publishable,
          sandboxWebhookSecret: webhook,
        },
      },
    )
    assert.equal(saved.status, 200)

    const view = saved.body.stripe.sandbox
    assert.ok(view.secretKey.startsWith('sk_test'), 'mask should keep the recognisable prefix')
    assert.ok(!view.secretKey.includes('a'.repeat(24)), 'the raw secret must never be returned')
    assert.equal(view.source.secretKey, 'database')

    // At rest the value must be ciphertext, not the plaintext key.
    const { queryOne } = await import('../db/index.ts')
    const row = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['stripe.sandbox.secret_key'])
    assert.ok(row, 'the setting should be persisted')
    assert.ok(row!.value.startsWith('v1:'), 'stored secrets should be AES-GCM envelopes')
    assert.ok(!row!.value.includes(secret), 'the plaintext key must not be stored')
  })

  it('reports stripe checkout once configured and exposes only the publishable key', async () => {
    const config = await newClient(ctx).get<{ checkoutStyle: string; publishableKey: string | null; stripeMode: string }>(
      '/api/checkout/config',
    )
    assert.equal(config.status, 200)
    assert.equal(config.body.checkoutStyle, 'stripe')
    assert.equal(config.body.stripeMode, 'sandbox')
    assert.ok(config.body.publishableKey?.startsWith('pk_test'))
    // The public endpoint must not leak the secret key shape at all.
    assert.ok(!JSON.stringify(config.body).includes('sk_test_'))
  })

  it('accepts a webhook signed with the stored sandbox secret', async () => {
    const { hmacSha256Hex } = await import('../lib/crypto.ts')
    const webhook = 'whsec_' + 'c'.repeat(24)

    const payload = JSON.stringify({
      id: 'evt_cms_test_1',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test_unknown', payment_intent: 'pi_test_unknown', amount_total: 1000 } },
    })
    const timestamp = Math.floor(Date.now() / 1000)
    const signature = hmacSha256Hex(webhook, `${timestamp}.${payload}`)

    const res = await newClient(ctx).request('POST', '/api/webhooks/payments', {
      raw: payload,
      headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
    })
    // No matching order, but the signature is valid so the endpoint accepts it.
    assert.equal(res.status, 200)
  })

  it('rejects a webhook signed with the wrong secret', async () => {
    const payload = JSON.stringify({ id: 'evt_cms_test_bad', type: 'checkout.session.completed', data: { object: {} } })
    const timestamp = Math.floor(Date.now() / 1000)
    const res = await newClient(ctx).request('POST', '/api/webhooks/payments', {
      raw: payload,
      headers: { 'stripe-signature': `t=${timestamp},v1=deadbeef` },
    })
    assert.equal(res.status, 400)
  })

  it('switches to production mode and keeps the modes independent', async () => {
    const res = await admin.request<{
      stripe: { mode: string; sandbox: { secretKey: string }; production: { secretKey: string } }
    }>('PUT', '/api/admin/settings/payments', { body: { mode: 'production' } })

    assert.equal(res.body.stripe.mode, 'production')
    // Sandbox keys remain, but the production slot is still empty.
    assert.ok(res.body.stripe.sandbox.secretKey.startsWith('sk_test'))
    assert.equal(res.body.stripe.production.secretKey, '')
  })

  it('clears stored sandbox keys on request', async () => {
    const res = await admin.request<{ stripe: { sandbox: { secretKey: string } } }>(
      'PUT',
      '/api/admin/settings/payments',
      { body: { clearSandbox: true, mode: 'sandbox', checkoutStyle: 'mock' } },
    )
    assert.equal(res.body.stripe.sandbox.secretKey, '')
  })
})
