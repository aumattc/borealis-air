import { notFound } from '../lib/errors.ts'
import type { Router } from '../http/router.ts'
import { Validator, asInt, asString } from '../lib/validate.ts'
import { requireAdmin } from '../http/auth.ts'
import { config } from '../config.ts'
import { adjustStock, listStock, releaseExpiredReservations, stockMovements } from '../services/inventory.ts'
import {
  fulfillOrderByRef,
  getOrderByRef,
  listOrders,
  orderStats,
  refundOrderByRef,
} from '../services/orders.ts'
import { countCustomers } from '../services/customers.ts'
import { logger } from '../lib/log.ts'

/** Every route below requires an admin session. */
export function registerAdminRoutes(router: Router): void {
  router.get('/api/admin/overview', (ctx) => {
    requireAdmin(ctx)
    return {
      body: {
        orders: orderStats(),
        customers: countCustomers(),
        inventory: listStock(),
      },
    }
  })

  router.get('/api/admin/inventory', (ctx) => {
    requireAdmin(ctx)
    return { body: { inventory: listStock() } }
  })

  router.get('/api/admin/inventory/:productId/movements', (ctx) => {
    requireAdmin(ctx)
    const productId = ctx.params.productId
    if (!productId) throw notFound('No such product.')
    return { body: { movements: stockMovements(productId, asInt(ctx.query.get('limit') ?? 50)) } }
  })

  router.patch('/api/admin/inventory/:productId', (ctx) => {
    requireAdmin(ctx)
    const productId = ctx.params.productId
    if (!productId) throw notFound('No such product.')

    const body = new Validator(ctx.body)
      .int('onHandDelta', { min: -100_000, max: 100_000, required: false })
      .int('lowStockThreshold', { min: 0, max: 100_000, required: false })
      .passthrough('backorderable', (v) => Boolean(v))
      .string('note', { max: 300, required: false })
      .done()

    const level = adjustStock(productId, {
      onHandDelta: body.onHandDelta === undefined ? undefined : asInt(body.onHandDelta),
      lowStockThreshold:
        body.lowStockThreshold === undefined ? undefined : asInt(body.lowStockThreshold),
      backorderable: body.backorderable === undefined ? undefined : Boolean(body.backorderable),
      note: body.note === undefined ? undefined : asString(body.note),
    })

    logger.info('stock adjusted', { productId, by: ctx.customerId })
    return { body: { inventory: level } }
  })

  router.post('/api/admin/inventory/release-expired', (ctx) => {
    requireAdmin(ctx)
    const released = releaseExpiredReservations(config.reservationTtlMinutes)
    return { body: { releasedOrders: released } }
  })

  router.get('/api/admin/orders', (ctx) => {
    requireAdmin(ctx)
    const status = ctx.query.get('status')
    const valid = ['pending', 'paid', 'failed', 'cancelled', 'fulfilled', 'refunded']
    const result = listOrders({
      status: status && valid.includes(status) ? (status as never) : undefined,
      email: ctx.query.get('email') ?? undefined,
      limit: asInt(ctx.query.get('limit') ?? 50),
      offset: asInt(ctx.query.get('offset') ?? 0),
    })
    return { body: result }
  })

  router.get('/api/admin/orders/:ref', (ctx) => {
    requireAdmin(ctx)
    const order = getOrderByRef(ctx.params.ref ?? '')
    if (!order) throw notFound('No such order.')
    return { body: { order } }
  })

  router.post('/api/admin/orders/:ref/fulfill', (ctx) => {
    requireAdmin(ctx)
    const order = fulfillOrderByRef(ctx.params.ref ?? '')
    logger.info('order fulfilled', { ref: order.ref, by: ctx.customerId })
    return { body: { order } }
  })

  router.post('/api/admin/orders/:ref/refund', async (ctx) => {
    requireAdmin(ctx)
    const body = new Validator(ctx.body)
      .int('amountCents', { min: 1, max: 100_000_000, required: false })
      .done()

    const refunded = await refundOrderByRef(
      ctx.params.ref ?? '',
      body.amountCents === undefined ? undefined : asInt(body.amountCents),
    )
    logger.info('order refunded', { ref: refunded.ref, by: ctx.customerId })
    return { body: { order: refunded } }
  })
}
