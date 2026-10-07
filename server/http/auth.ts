import { unauthorized } from '../lib/errors.ts'
import { resolveSession } from '../services/customers.ts'
import type { RequestContext } from './context.ts'

export const SESSION_COOKIE = 'borealis_session'

/**
 * Resolves the caller from either an `Authorization: Bearer` token or the
 * session cookie. Bearer wins so API clients and the browser can coexist.
 */
export function resolveAuth(ctx: RequestContext): void {
  const header = ctx.header('authorization')
  const bearer = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null
  const token = bearer || ctx.cookies[SESSION_COOKIE]

  if (!token) return

  const session = resolveSession(token)
  if (!session) return

  ctx.customerId = session.customer.id
  ctx.sessionId = session.sessionId
  ctx.role = session.customer.role
}

export function requireCustomer(ctx: RequestContext): string {
  if (!ctx.customerId) throw unauthorized()
  return ctx.customerId
}

export function requireAdmin(ctx: RequestContext): string {
  if (!ctx.customerId) throw unauthorized()
  if (ctx.role !== 'admin') throw unauthorized('Administrator access required.')
  return ctx.customerId
}

/**
 * Cart identity: a signed-in customer uses their own cart; a guest gets a
 * dedicated cookie. The id itself is opaque and validated against the
 * database, so a forged value simply creates a fresh cart.
 */
export const CART_COOKIE = 'borealis_cart'

export function readCartCookie(ctx: RequestContext): string | null {
  return ctx.cookies[CART_COOKIE] ?? null
}

export function writeCartCookie(ctx: RequestContext, cartId: string): void {
  ctx.setCookie(CART_COOKIE, cartId, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: ctx.url.protocol === 'https:',
    maxAge: 60 * 60 * 24 * 90,
  })
}
