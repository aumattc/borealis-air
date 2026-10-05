import { queryOne, run } from '../db/index.ts'
import { uuid } from '../lib/crypto.ts'

/**
 * Webhook delivery is at-least-once, so every event id is recorded and any
 * repeat is dropped. This is what keeps a retried `payment_intent.succeeded`
 * from double-processing an order.
 */

export function wasWebhookHandled(provider: string, eventId: string): boolean {
  const row = queryOne<{ id: string }>(
    'SELECT id FROM webhook_events WHERE provider = ? AND id = ?',
    [provider, eventId],
  )
  return Boolean(row)
}

export function recordWebhookEvent(provider: string, eventId: string): void {
  run(
    `INSERT INTO webhook_events (id, provider, received_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    [eventId, provider, new Date().toISOString()],
  )
}

/** Housekeeping: drop webhook ids older than the provider's retry horizon. */
export function pruneWebhookEvents(olderThanDays = 30): number {
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString()
  return run('DELETE FROM webhook_events WHERE received_at < ?', [cutoff]).changes
}

export function newEventId(): string {
  return uuid()
}
