import { Router } from './http/router.ts'
import { resolveAuth } from './http/auth.ts'
import { registerCatalogRoutes } from './routes/catalog.ts'
import { registerCartRoutes } from './routes/cart.ts'
import { registerAuthRoutes } from './routes/auth.ts'
import { registerCheckoutRoutes, registerWebhookRoutes } from './routes/checkout.ts'
import { registerAdminRoutes } from './routes/admin.ts'

/**
 * Builds the full route table. Kept separate from the process entry point so
 * tests can spin up an identical app on an ephemeral port.
 */
export function buildRouter(): Router {
  const router = new Router()

  router.get('/api/health', () => ({
    body: { status: 'ok', service: 'borealis-air-api', time: new Date().toISOString() },
  }))

  registerCatalogRoutes(router)
  registerCartRoutes(router)
  registerAuthRoutes(router)
  registerCheckoutRoutes(router)
  registerWebhookRoutes(router)
  registerAdminRoutes(router)

  return router
}

export { resolveAuth }
