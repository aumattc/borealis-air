import { config } from '../config.ts'
import { unauthorized } from '../lib/errors.ts'
import { rateLimit } from '../lib/rateLimit.ts'
import { logger } from '../lib/log.ts'
import { readCartCookie, requireCustomer, SESSION_COOKIE, writeCartCookie } from '../http/auth.ts'
import type { RequestContext } from '../http/context.ts'
import type { Router } from '../http/router.ts'
import { Validator, asString } from '../lib/validate.ts'
import { changePassword, getCustomer, login, logout, register, updateProfile } from '../services/customers.ts'
import { getOrCreateCart } from '../services/cart.ts'
import { listOrdersForCustomer } from '../services/orders.ts'

function setSessionCookie(ctx: RequestContext, token: string, expiresAt: string): void {
  const maxAge = Math.max(Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000), 0)
  ctx.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: ctx.url.protocol === 'https:',
    maxAge,
  })
}

function publicCustomer(customer: { id: string; email: string; firstName: string; lastName: string; role: string; createdAt: string }) {
  return customer
}

export function registerAuthRoutes(router: Router): void {
  router.post('/api/auth/register', (ctx) => {
    rateLimit(`register:${ctx.ip}`, { windowMs: 60 * 60 * 1000, max: config.rateLimits.registerPerHour })

    const body = new Validator(ctx.body)
      .email('email')
      .string('password', { min: 10, max: 200, trim: false })
      .string('firstName', { min: 1, max: 80 })
      .string('lastName', { min: 1, max: 80 })
      .done()

    const result = register({
      email: asString(body.email),
      password: asString(body.password),
      firstName: asString(body.firstName),
      lastName: asString(body.lastName),
      ip: ctx.ip,
      userAgent: ctx.header('user-agent') ?? '',
    })

    // Adopt any guest cart into the new account.
    const cartId = getOrCreateCart(readCartCookie(ctx), result.customer.id)
    writeCartCookie(ctx, cartId)

    setSessionCookie(ctx, result.token, result.expiresAt)
    logger.info('customer registered', { customerId: result.customer.id })

    return { status: 201, body: { customer: publicCustomer(result.customer), token: result.token } }
  })

  router.post('/api/auth/login', (ctx) => {
    // Throttle by IP and by email so neither can be hammered alone.
    const body = new Validator(ctx.body).email('email').string('password', { max: 200, trim: false }).done()
    const email = asString(body.email)

    rateLimit(`login:ip:${ctx.ip}`, { windowMs: 15 * 60 * 1000, max: config.rateLimits.loginPerIpPer15Min })
    rateLimit(`login:email:${email}`, { windowMs: 15 * 60 * 1000, max: config.rateLimits.loginPerEmailPer15Min })

    const result = login({
      email,
      password: asString(body.password),
      ip: ctx.ip,
      userAgent: ctx.header('user-agent') ?? '',
    })

    const cartId = getOrCreateCart(readCartCookie(ctx), result.customer.id)
    writeCartCookie(ctx, cartId)

    setSessionCookie(ctx, result.token, result.expiresAt)
    return { body: { customer: publicCustomer(result.customer), token: result.token } }
  })

  router.post('/api/auth/logout', (ctx) => {
    const header = ctx.header('authorization')
    const bearer = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null
    const token = bearer || ctx.cookies[SESSION_COOKIE]
    if (token) logout(token)

    ctx.clearCookie(SESSION_COOKIE)
    return { body: { ok: true } }
  })

  router.get('/api/auth/me', (ctx) => {
    const customerId = requireCustomer(ctx)
    const customer = getCustomer(customerId)
    if (!customer) throw unauthorized()
    return { body: { customer: publicCustomer(customer) } }
  })

  router.patch('/api/auth/me', (ctx) => {
    const customerId = requireCustomer(ctx)
    const body = new Validator(ctx.body)
      .string('firstName', { min: 1, max: 80, required: false })
      .string('lastName', { min: 1, max: 80, required: false })
      .done()

    const customer = updateProfile(customerId, {
      firstName: body.firstName === undefined ? undefined : asString(body.firstName),
      lastName: body.lastName === undefined ? undefined : asString(body.lastName),
    })
    return { body: { customer: publicCustomer(customer) } }
  })

  router.post('/api/auth/password', (ctx) => {
    const customerId = requireCustomer(ctx)
    const body = new Validator(ctx.body)
      .string('currentPassword', { max: 200, trim: false })
      .string('newPassword', { min: 10, max: 200, trim: false })
      .done()

    changePassword(customerId, asString(body.currentPassword), asString(body.newPassword))

    // changePassword revokes every session, including this one.
    ctx.clearCookie(SESSION_COOKIE)
    return { body: { ok: true, message: 'Password changed. Please sign in again.' } }
  })

  router.get('/api/account/orders', (ctx) => {
    const customerId = requireCustomer(ctx)
    return { body: { orders: listOrdersForCustomer(customerId) } }
  })
}

export { setSessionCookie }
