import './env.ts'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { newClient, startTestServer, type TestContext } from './harness.ts'

describe('authentication', () => {
  let ctx: TestContext

  before(async () => {
    ctx = await startTestServer()
  })
  after(async () => {
    await ctx.close()
  })

  it('registers a customer and issues a session', async () => {
    const client = newClient(ctx)
    const res = await client.post<{ customer: { email: string; role: string }; token: string }>(
      '/api/auth/register',
      {
        email: 'grace@example.com',
        password: 'correct-horse-battery',
        firstName: 'Grace',
        lastName: 'Hopper',
      },
    )

    assert.equal(res.status, 201)
    assert.equal(res.body.customer.email, 'grace@example.com')
    assert.equal(res.body.customer.role, 'customer')
    assert.ok(res.body.token.length > 20)
  })

  it('rejects a weak password', async () => {
    const client = newClient(ctx)
    const res = await client.post<{ error: { details: Record<string, string> } }>(
      '/api/auth/register',
      { email: 'weak@example.com', password: 'short', firstName: 'A', lastName: 'B' },
    )
    assert.equal(res.status, 400)
    assert.ok(res.body.error.details.password)
  })

  it('rejects a duplicate email', async () => {
    const client = newClient(ctx)
    const res = await client.post('/api/auth/register', {
      email: 'grace@example.com',
      password: 'another-good-password',
      firstName: 'Grace',
      lastName: 'Hopper',
    })
    assert.equal(res.status, 409)
  })

  it('never returns the password hash', async () => {
    const client = newClient(ctx)
    await client.post('/api/auth/register', {
      email: 'hash@example.com',
      password: 'correct-horse-battery',
      firstName: 'H',
      lastName: 'H',
    })
    const res = await client.get<{ customer: Record<string, unknown> }>('/api/auth/me')
    assert.equal(res.body.customer.passwordHash, undefined)
    assert.equal(res.body.customer.password_hash, undefined)
  })

  it('signs in with correct credentials', async () => {
    const client = newClient(ctx)
    const res = await client.post<{ customer: { email: string } }>('/api/auth/login', {
      email: 'grace@example.com',
      password: 'correct-horse-battery',
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.customer.email, 'grace@example.com')
  })

  it('rejects a wrong password', async () => {
    const client = newClient(ctx)
    const res = await client.post('/api/auth/login', {
      email: 'grace@example.com',
      password: 'not-the-password',
    })
    assert.equal(res.status, 401)
  })

  it('rejects an unknown email with the same message', async () => {
    const client = newClient(ctx)
    const res = await client.post<{ error: { message: string } }>('/api/auth/login', {
      email: 'nobody@example.com',
      password: 'not-the-password',
    })
    assert.equal(res.status, 401)
    assert.equal(res.body.error.message, 'Email or password is incorrect.')
  })

  it('requires a session for /api/auth/me', async () => {
    const client = newClient(ctx)
    const res = await client.get('/api/auth/me')
    assert.equal(res.status, 401)
  })

  it('adopts a guest cart on sign-in', async () => {
    const client = newClient(ctx)
    // Fill a cart as a guest.
    await client.post('/api/cart/items', { productId: 'ba-01', qty: 1 })

    await client.post('/api/auth/register', {
      email: 'cartadopt@example.com',
      password: 'correct-horse-battery',
      firstName: 'C',
      lastName: 'A',
    })

    const cart = await client.get<{ cart: { customerId: string | null; items: unknown[] } }>('/api/cart')
    assert.ok(cart.body.cart.customerId, 'cart should now belong to the customer')
    assert.equal(cart.body.cart.items.length, 1, 'guest cart contents should survive sign-in')
  })

  it('returns the customer order history', async () => {
    const client = newClient(ctx)
    await client.post('/api/auth/register', {
      email: 'history@example.com',
      password: 'correct-horse-battery',
      firstName: 'H',
      lastName: 'I',
    })

    await client.post('/api/cart/items', { productId: 'ba-02', qty: 1 })
    const created = await client.post<{ order: { ref: string } }>('/api/checkout', {
      email: 'history@example.com',
      firstName: 'H',
      lastName: 'I',
      addressLine1: '1 Cold Street',
      city: 'Oslo',
      postcode: '0150',
      country: 'Norway',
    })

    const orders = await client.get<{ orders: { ref: string }[] }>('/api/account/orders')
    assert.equal(orders.status, 200)
    assert.ok(orders.body.orders.some((o) => o.ref === created.body.order.ref))
  })

  it('invalidates other sessions when the password changes', async () => {
    const client = newClient(ctx)
    await client.post('/api/auth/register', {
      email: 'rotate@example.com',
      password: 'original-password-1',
      firstName: 'R',
      lastName: 'R',
    })

    const change = await client.post<{ ok: boolean }>('/api/auth/password', {
      currentPassword: 'original-password-1',
      newPassword: 'replacement-password-2',
    })
    assert.equal(change.status, 200)

    // The session used to make the change is revoked too.
    const me = await client.get('/api/auth/me')
    assert.equal(me.status, 401)

    const oldPassword = await client.post('/api/auth/login', {
      email: 'rotate@example.com',
      password: 'original-password-1',
    })
    assert.equal(oldPassword.status, 401)

    const newPassword = await client.post('/api/auth/login', {
      email: 'rotate@example.com',
      password: 'replacement-password-2',
    })
    assert.equal(newPassword.status, 200)
  })

  it('logs out', async () => {
    const client = newClient(ctx)
    await client.post('/api/auth/register', {
      email: 'logout@example.com',
      password: 'correct-horse-battery',
      firstName: 'L',
      lastName: 'O',
    })
    await client.post('/api/auth/logout')
    const me = await client.get('/api/auth/me')
    assert.equal(me.status, 401)
  })
})
