import { config, validateConfig } from './config.ts'
import { migrate } from './db/migrate.ts'
import { seedCatalog } from './db/seed.ts'
import { purgeExpiredSessions } from './services/customers.ts'
import { releaseExpiredReservations } from './services/inventory.ts'
import { pruneWebhookEvents } from './services/webhooks.ts'
import { buildRouter, resolveAuth } from './app.ts'
import { createAppServer, startServer, stopServer } from './http/server.ts'
import { logger } from './lib/log.ts'

/**
 * API entry point.
 *
 * Start with:  npm run api:dev
 * Requires Node 22.5+ (node:sqlite) — this repo targets Node 24.
 */

const problems = validateConfig()
if (problems.length > 0) {
  for (const problem of problems) logger.error('configuration problem', { problem })
  if (config.isProd) process.exit(1)
}

const { applied } = migrate()
if (applied.length > 0) logger.info('migrations applied', { applied })

const seeded = seedCatalog()
if (seeded.products > 0) {
  logger.info('catalog seeded', { products: seeded.products, inventory: seeded.inventory })
}

const server = createAppServer({
  router: buildRouter(),
  before: resolveAuth,
})

await startServer(server, config.port, config.host)

logger.info('borealis api listening', {
  url: `http://${config.host}:${config.port}`,
  env: config.env,
  provider: config.payments.provider,
  database: config.databasePath,
})

/* Housekeeping: free abandoned stock holds and expired sessions. */
const housekeeping = setInterval(() => {
  try {
    const released = releaseExpiredReservations(config.reservationTtlMinutes)
    if (released > 0) logger.info('released expired stock reservations', { orders: released })
    purgeExpiredSessions()
    pruneWebhookEvents(30)
  } catch (err) {
    logger.error('housekeeping failed', { message: String(err) })
  }
}, 5 * 60_000)
housekeeping.unref()

/* Graceful shutdown so in-flight requests finish. */
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info('shutting down', { signal })
    clearInterval(housekeeping)
    stopServer(server).then(() => process.exit(0))
    // Do not hang forever if a connection is stuck.
    setTimeout(() => process.exit(1), 5000).unref()
  })
}
