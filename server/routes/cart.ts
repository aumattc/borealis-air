import { badRequest } from '../lib/errors.ts'
import { readCartCookie, writeCartCookie } from '../http/auth.ts'
import type { Router } from '../http/router.ts'
import { addItem, buildCart, clearCart, getOrCreateCart, removeItem, setItemQty } from '../services/cart.ts'

/**
 * Carts work for guests and signed-in customers alike. The cart id lives in
 * an HttpOnly cookie; when someone signs in, their guest cart is adopted.
 */
function resolveCart(ctx: Parameters<Parameters<Router['get']>[1]>[0]): string {
  const cookieCart = readCartCookie(ctx)
  const cartId = getOrCreateCart(cookieCart, ctx.customerId)

  // Refresh the cookie whenever it is missing or has been replaced.
  if (cookieCart !== cartId) writeCartCookie(ctx, cartId)

  return cartId
}

export function registerCartRoutes(router: Router): void {
  router.get('/api/cart', (ctx) => {
    const cartId = resolveCart(ctx)
    return { body: { cart: buildCart(cartId) } }
  })

  router.post('/api/cart/items', (ctx) => {
    const cartId = resolveCart(ctx)
    const body = (ctx.body ?? {}) as { productId?: unknown; qty?: unknown }
    const productId = typeof body.productId === 'string' ? body.productId : ''
    const qty = body.qty === undefined ? 1 : Number(body.qty)

    if (!productId) throw badRequest('A productId is required.')
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw badRequest('Quantity must be a whole number between 1 and 99.')
    }

    return { status: 201, body: { cart: addItem(cartId, productId, qty) } }
  })

  router.patch('/api/cart/items/:productId', (ctx) => {
    const cartId = resolveCart(ctx)
    const body = (ctx.body ?? {}) as { qty?: unknown }
    const qty = Number(body.qty)

    if (!Number.isInteger(qty)) throw badRequest('Quantity must be a whole number.')

    const productId = ctx.params.productId
    if (!productId) throw badRequest('A product id is required.')

    return { body: { cart: setItemQty(cartId, productId, qty) } }
  })

  router.delete('/api/cart/items/:productId', (ctx) => {
    const cartId = resolveCart(ctx)
    const productId = ctx.params.productId
    if (!productId) throw badRequest('A product id is required.')
    return { body: { cart: removeItem(cartId, productId) } }
  })

  router.delete('/api/cart', (ctx) => {
    const cartId = resolveCart(ctx)
    return { body: { cart: clearCart(cartId) } }
  })
}
