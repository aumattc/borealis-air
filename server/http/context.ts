import type { IncomingMessage, ServerResponse } from 'node:http'

export interface CookieOptions {
  maxAge?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'Strict' | 'Lax' | 'None'
  path?: string
}

/**
 * Everything a handler needs about one request. Built once per request by the
 * server so handlers never touch the raw streams.
 */
export class RequestContext {
  readonly method: string
  readonly url: URL
  readonly headers: IncomingMessage['headers']
  readonly cookies: Record<string, string>
  readonly ip: string
  params: Record<string, string> = {}
  /** Parsed JSON body (undefined for GET/DELETE and empty bodies). */
  body: unknown
  /** Unparsed body text, kept so webhook signatures can be verified exactly. */
  readonly rawBody: string

  private readonly responseCookies: string[] = []
  /** Set by auth middleware once a session is resolved. */
  customerId: string | null = null
  sessionId: string | null = null
  role: 'customer' | 'admin' | null = null

  private readonly res: ServerResponse

  constructor(
    req: IncomingMessage,
    res: ServerResponse,
    rawBody: string,
    body: unknown,
    ip: string,
  ) {
    this.res = res
    this.method = req.method ?? 'GET'
    this.url = new URL(req.url ?? '/', 'http://localhost')
    this.headers = req.headers
    this.cookies = parseCookies(req.headers.cookie)
    this.rawBody = rawBody
    this.body = body
    this.ip = ip
  }

  get query(): URLSearchParams {
    return this.url.searchParams
  }

  get path(): string {
    return this.url.pathname
  }

  /** Case-insensitive header lookup. */
  header(name: string): string | undefined {
    const value = this.headers[name.toLowerCase()]
    return Array.isArray(value) ? value[0] : value
  }

  setCookie(name: string, value: string, options: CookieOptions = {}): void {
    const parts = [`${name}=${encodeURIComponent(value)}`]
    parts.push(`Path=${options.path ?? '/'}`)
    if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.floor(options.maxAge)}`)
    if (options.httpOnly !== false) parts.push('HttpOnly')
    if (options.secure) parts.push('Secure')
    parts.push(`SameSite=${options.sameSite ?? 'Lax'}`)
    this.responseCookies.push(parts.join('; '))
  }

  clearCookie(name: string): void {
    this.setCookie(name, '', { maxAge: 0 })
  }

  get responseCookieHeaders(): string[] {
    return this.responseCookies
  }

  raw(): ServerResponse {
    return this.res
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (!name) continue
    try {
      out[name] = decodeURIComponent(value)
    } catch {
      out[name] = value
    }
  }
  return out
}
