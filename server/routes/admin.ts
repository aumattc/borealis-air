import { badRequest, notFound } from '../lib/errors.ts'
import type { Router } from '../http/router.ts'
import { Validator, asInt, asNumber, asString } from '../lib/validate.ts'
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
import {
  createProduct,
  deleteProduct,
  getProductForAdmin,
  listProductsForAdmin,
  restoreProduct,
  updateProduct,
  type ProductInput,
} from '../services/products.ts'
import {
  SETTING_KEYS,
  activeCheckoutStyle,
  setCheckoutStyle,
  setSetting,
  setStripeMode,
  stripeConfigured,
  stripeSettingsView,
} from '../services/settings.ts'
import type { StripeMode } from '../services/settings.ts'

/** Validates and normalises the shared product payload for create and update. */
function productInput(body: unknown): ProductInput {
  const v = new Validator(body)
    .string('slug', { min: 2, max: 120 })
    .string('name', { min: 1, max: 200 })
    .string('series', { min: 1, max: 120 })
    .string('category', { min: 1, max: 60 })
    .int('btu', { min: 1, max: 1_000_000 })
    .int('coverage', { min: 0, max: 1_000_000 })
    .int('priceCents', { min: 0, max: 100_000_000 })
    .int('compareAtCents', { min: 0, max: 100_000_000, required: false })
    .number('rating', { min: 0, max: 5, required: false })
    .int('reviews', { min: 0, max: 10_000_000, required: false })
    .int('noise', { min: 0, max: 200 })
    .string('energyClass', { min: 1, max: 20 })
    .stringArray('modes', { max: 10 })
    .stringArray('features', { max: 50 })
    .string('badge', { max: 60, required: false })
    .string('blurb', { min: 1, max: 500 })
    .string('description', { min: 1, max: 5000 })
    .specArray('specs', { max: 50 })
    .passthrough('art')
    .bool('active', { required: false })
    .done()

  const slug = asString(v.slug)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw badRequest('The slug may contain only lowercase letters, numbers and single hyphens.', { slug })
  }

  return {
    slug,
    name: asString(v.name),
    series: asString(v.series),
    category: asString(v.category),
    btu: asInt(v.btu),
    coverage: asInt(v.coverage),
    priceCents: asInt(v.priceCents),
    compareAtCents: v.compareAtCents === undefined ? null : asInt(v.compareAtCents),
    rating: v.rating === undefined ? 0 : asNumber(v.rating),
    reviews: v.reviews === undefined ? 0 : asInt(v.reviews),
    noise: asInt(v.noise),
    energyClass: asString(v.energyClass),
    modes: (v.modes as string[]) ?? [],
    features: (v.features as string[]) ?? [],
    badge: v.badge === undefined ? null : asString(v.badge),
    blurb: asString(v.blurb),
    description: asString(v.description),
    specs: (v.specs as { label: string; value: string }[]) ?? [],
    art: v.art ?? {},
    active: v.active === undefined ? true : Boolean(v.active),
  }
}

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

  /* ---------------------------------------------------------------- */
  /*  Catalog management (CMS)                                        */
  /* ---------------------------------------------------------------- */

  router.get('/api/admin/products', (ctx) => {
    requireAdmin(ctx)
    const result = listProductsForAdmin({
      search: ctx.query.get('q') ?? undefined,
      category: ctx.query.get('category') ?? undefined,
      includeInactive: ctx.query.get('includeInactive') === 'true',
      limit: asInt(ctx.query.get('limit') ?? 100),
      offset: asInt(ctx.query.get('offset') ?? 0),
    })
    return { body: result }
  })

  router.get('/api/admin/products/:id', (ctx) => {
    requireAdmin(ctx)
    const product = getProductForAdmin(ctx.params.id ?? '')
    if (!product) throw notFound('No such product.')
    return { body: { product } }
  })

  router.post('/api/admin/products', (ctx) => {
    requireAdmin(ctx)
    const input = productInput(ctx.body)
    const body = (ctx.body ?? {}) as { onHand?: unknown; lowStockThreshold?: unknown; backorderable?: unknown }

    const product = createProduct(input, {
      onHand: body.onHand === undefined ? 0 : asInt(body.onHand),
      lowStockThreshold: body.lowStockThreshold === undefined ? 3 : asInt(body.lowStockThreshold),
      backorderable: Boolean(body.backorderable),
    })
    logger.info('product created', { id: product.id, slug: product.slug, by: ctx.customerId })
    return { status: 201, body: { product } }
  })

  router.put('/api/admin/products/:id', (ctx) => {
    requireAdmin(ctx)
    const id = ctx.params.id ?? ''
    const product = updateProduct(id, productInput(ctx.body))
    logger.info('product updated', { id, slug: product.slug, by: ctx.customerId })
    return { body: { product } }
  })

  router.delete('/api/admin/products/:id', (ctx) => {
    requireAdmin(ctx)
    const id = ctx.params.id ?? ''
    const result = deleteProduct(id)
    logger.info('product removed', { id, ...result, by: ctx.customerId })
    return { body: result }
  })

  router.post('/api/admin/products/:id/restore', (ctx) => {
    requireAdmin(ctx)
    const product = restoreProduct(ctx.params.id ?? '')
    logger.info('product restored', { id: product.id, by: ctx.customerId })
    return { body: { product } }
  })

  /* ---------------------------------------------------------------- */
  /*  Payment settings (Stripe credentials, sandbox / production)      */
  /* ---------------------------------------------------------------- */

  router.get('/api/admin/settings/payments', (ctx) => {
    requireAdmin(ctx)
    return { body: { stripe: stripeSettingsView() } }
  })

  router.put('/api/admin/settings/payments', (ctx) => {
    requireAdmin(ctx)
    const body = new Validator(ctx.body)
      .oneOf('mode', ['sandbox', 'production'], { required: false })
      .oneOf('checkoutStyle', ['stripe', 'mock'], { required: false })
      .string('sandboxSecretKey', { max: 500, required: false, trim: true })
      .string('sandboxPublishableKey', { max: 500, required: false, trim: true })
      .string('sandboxWebhookSecret', { max: 500, required: false, trim: true })
      .string('productionSecretKey', { max: 500, required: false, trim: true })
      .string('productionPublishableKey', { max: 500, required: false, trim: true })
      .string('productionWebhookSecret', { max: 500, required: false, trim: true })
      .bool('clearSandbox', { required: false })
      .bool('clearProduction', { required: false })
      .done()

    const by = ctx.customerId

    // Explicit clears let an operator remove a key without re-entering it.
    if (body.clearSandbox === true) {
      for (const key of [SETTING_KEYS.sandboxSecretKey, SETTING_KEYS.sandboxPublishableKey, SETTING_KEYS.sandboxWebhookSecret]) {
        setSetting(key, null, by)
      }
    }
    if (body.clearProduction === true) {
      for (const key of [SETTING_KEYS.productionSecretKey, SETTING_KEYS.productionPublishableKey, SETTING_KEYS.productionWebhookSecret]) {
        setSetting(key, null, by)
      }
    }

    const writes: [string, unknown][] = [
      [SETTING_KEYS.sandboxSecretKey, body.sandboxSecretKey],
      [SETTING_KEYS.sandboxPublishableKey, body.sandboxPublishableKey],
      [SETTING_KEYS.sandboxWebhookSecret, body.sandboxWebhookSecret],
      [SETTING_KEYS.productionSecretKey, body.productionSecretKey],
      [SETTING_KEYS.productionPublishableKey, body.productionPublishableKey],
      [SETTING_KEYS.productionWebhookSecret, body.productionWebhookSecret],
    ]
    for (const [key, value] of writes) {
      if (value !== undefined) setSetting(key, asString(value), by)
    }

    if (body.mode !== undefined) setStripeMode(body.mode as StripeMode, by)
    if (body.checkoutStyle !== undefined) setCheckoutStyle(body.checkoutStyle as 'stripe' | 'mock', by)

    logger.info('payment settings updated', {
      by,
      mode: body.mode ?? null,
      checkoutStyle: body.checkoutStyle ?? null,
    })

    return {
      body: {
        stripe: stripeSettingsView(),
        checkoutStyle: activeCheckoutStyle(),
        configured: stripeConfigured(),
      },
    }
  })
}
