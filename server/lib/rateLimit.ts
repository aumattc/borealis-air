import { tooManyRequests } from './errors.ts'

/**
 * Fixed-window rate limiter held in memory. Good enough for a single-node
 * deployment; swap the store for Redis if the API is ever scaled out.
 */
interface Window {
  count: number
  resetAt: number
}

const buckets = new Map<string, Window>()

export interface RateLimitRule {
  /** Window length in milliseconds. */
  windowMs: number
  /** Allowed requests per window per key. */
  max: number
}

export function rateLimit(key: string, rule: RateLimitRule): void {
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs })
    return
  }

  existing.count++
  if (existing.count > rule.max) {
    const retryAfter = Math.ceil((existing.resetAt - now) / 1000)
    throw tooManyRequests(`Too many attempts. Try again in ${retryAfter} seconds.`)
  }
}

/** Drops expired windows so the map cannot grow without bound. */
export function sweepRateLimits(): void {
  const now = Date.now()
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key)
  }
}

export function resetRateLimits(): void {
  buckets.clear()
}
