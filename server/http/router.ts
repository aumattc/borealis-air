import type { RequestContext } from './context.ts'

export interface RouteResult {
  status?: number
  body?: unknown
  headers?: Record<string, string>
  /** Non-JSON payloads, e.g. text responses. */
  text?: string
  contentType?: string
}

export type Handler = (ctx: RequestContext) => Promise<RouteResult | void> | RouteResult | void

interface Route {
  method: string
  segments: string[]
  handler: Handler
}

export interface MatchResult {
  handler: Handler
  params: Record<string, string>
}

/**
 * A tiny path router. Patterns use `:name` for params, e.g. `/api/products/:slug`.
 * Kept deliberately small: no regex, no wildcards beyond a trailing `*`.
 */
export class Router {
  private readonly routes: Route[] = []

  add(method: string, path: string, handler: Handler): this {
    this.routes.push({
      method: method.toUpperCase(),
      segments: splitPath(path),
      handler,
    })
    return this
  }

  get(path: string, handler: Handler) {
    return this.add('GET', path, handler)
  }
  post(path: string, handler: Handler) {
    return this.add('POST', path, handler)
  }
  patch(path: string, handler: Handler) {
    return this.add('PATCH', path, handler)
  }
  put(path: string, handler: Handler) {
    return this.add('PUT', path, handler)
  }
  delete(path: string, handler: Handler) {
    return this.add('DELETE', path, handler)
  }

  /**
   * Returns the handler for a path, or `{ allowed }` listing methods that do
   * match, so the caller can answer 405 instead of 404.
   */
  match(method: string, pathname: string): MatchResult | { allowed: string[] } | null {
    const segments = splitPath(pathname)
    const allowed = new Set<string>()

    for (const route of this.routes) {
      const params = matchSegments(route.segments, segments)
      if (params === null) continue
      if (route.method === method.toUpperCase()) return { handler: route.handler, params }
      allowed.add(route.method)
    }

    return allowed.size > 0 ? { allowed: [...allowed] } : null
  }
}

function splitPath(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0)
}

function matchSegments(pattern: string[], actual: string[]): Record<string, string> | null {
  const params: Record<string, string> = {}

  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i]!
    const a = actual[i]

    if (p === '*') return params // trailing wildcard
    if (a === undefined) return null

    if (p.startsWith(':')) {
      const name = p.slice(1)
      if (!a) return null
      try {
        params[name] = decodeURIComponent(a)
      } catch {
        params[name] = a
      }
    } else if (p !== a) {
      return null
    }
  }

  return pattern.length === actual.length ? params : null
}
