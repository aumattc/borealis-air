import type { Server } from 'node:http'
import { buildRouter, resolveAuth } from '../app.ts'
import { closeDb } from '../db/index.ts'
import { migrate } from '../db/migrate.ts'
import { seedCatalog } from '../db/seed.ts'
import { createAppServer, startServer, stopServer } from '../http/server.ts'
import { TEST_ADMIN } from './env.ts'

/**
 * Test harness: boots the real app on an ephemeral port against an in-memory
 * database, so tests exercise the same code paths as production.
 *
 * DATABASE_PATH must be set to ':memory:' *before* this module is imported.
 */

export interface TestContext {
  baseUrl: string
  server: Server
  close: () => Promise<void>
}

let context: TestContext | null = null

export async function startTestServer(): Promise<TestContext> {
  if (context) return context

  migrate()
  seedCatalog()

  const server = createAppServer({ router: buildRouter(), before: resolveAuth })
  const port = await startServer(server, 0, '127.0.0.1')

  context = {
    baseUrl: `http://127.0.0.1:${port}`,
    server,
    close: async () => {
      await stopServer(server)
      closeDb()
      context = null
    },
  }
  return context
}

export interface ApiResponse<T = unknown> {
  status: number
  body: T
  headers: Headers
  cookies: Record<string, string>
}

/** Minimal cookie-aware fetch client, so tests can hold sessions and carts. */
export class Client {
  private cookies = new Map<string, string>()
  private readonly baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  private absorb(response: Response): void {
    const raw = response.headers.getSetCookie?.() ?? []
    for (const cookie of raw) {
      const [pair] = cookie.split(';')
      const index = pair!.indexOf('=')
      if (index === -1) continue
      const name = pair!.slice(0, index).trim()
      const value = pair!.slice(index + 1).trim()
      if (value === '') this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  get token(): string | null {
    return this.cookies.get('borealis_session') ?? null
  }

  async request<T = unknown>(
    method: string,
    path: string,
    options: { body?: unknown; headers?: Record<string, string>; raw?: string } = {},
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...options.headers }
    const cookie = this.cookieHeader()
    if (cookie) headers.Cookie = cookie

    let payload: string | undefined
    if (options.raw !== undefined) {
      payload = options.raw
      headers['Content-Type'] ??= 'application/json'
    } else if (options.body !== undefined) {
      payload = JSON.stringify(options.body)
      headers['Content-Type'] ??= 'application/json'
    }

    const response = await fetch(`${this.baseUrl}${path}`, { method, headers, body: payload })
    this.absorb(response)

    const text = await response.text()
    let body: unknown
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = text
    }

    const cookies: Record<string, string> = {}
    for (const [k, v] of this.cookies) cookies[k] = v

    return { status: response.status, body: body as T, headers: response.headers, cookies }
  }

  get<T = unknown>(path: string) {
    return this.request<T>('GET', path)
  }
  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('POST', path, { body })
  }
  patch<T = unknown>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, { body })
  }
  delete<T = unknown>(path: string) {
    return this.request<T>('DELETE', path)
  }
}

export function newClient(ctx: TestContext): Client {
  return new Client(ctx.baseUrl)
}

/**
 * Creates an admin account and returns a signed-in client, mirroring what the
 * bootstrap script does.
 */
export async function createAdminClient(ctx: TestContext, email = TEST_ADMIN.email): Promise<Client> {
  const { hashPassword, uuid } = await import('../lib/crypto.ts')
  const { run } = await import('../db/index.ts')

  const now = new Date().toISOString()
  run(
    `INSERT INTO customers (id, email, password_hash, first_name, last_name, role, created_at, updated_at)
     VALUES (?, ?, ?, 'Admin', 'User', 'admin', ?, ?)`,
    [uuid(), email, hashPassword(TEST_ADMIN.password), now, now],
  )

  const client = new Client(ctx.baseUrl)
  const login = await client.post('/api/auth/login', { email, password: TEST_ADMIN.password })
  if (login.status !== 200) throw new Error(`admin login failed: ${login.status}`)
  return client
}
