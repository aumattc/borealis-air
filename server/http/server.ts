import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { config } from '../config.ts'
import { AppError } from '../lib/errors.ts'
import { logger } from '../lib/log.ts'
import { sweepRateLimits } from '../lib/rateLimit.ts'
import { RequestContext } from './context.ts'
import { Router } from './router.ts'
import { applyCookies, sendEmpty, sendError, sendJson } from './respond.ts'

const MAX_BODY_BYTES = 1_000_000 // 1 MB

export interface ServerOptions {
  router: Router
  /** Runs after routing, before the handler. Used to resolve sessions. */
  before?: (ctx: RequestContext) => Promise<void> | void
}

export function createAppServer({ router, before }: ServerOptions): Server {
  return createServer((req, res) => {
    handle(req, res, router, before).catch((err) => {
      logger.error('request failed catastrophically', { message: String(err) })
      if (!res.headersSent) sendError(res, err)
      else res.end()
    })
  })
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  router: Router,
  before?: (ctx: RequestContext) => Promise<void> | void,
): Promise<void> {
  const started = Date.now()

  // ---- CORS ------------------------------------------------------------
  const origin = req.headers.origin
  const corsHeaders = corsFor(origin)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders)
    res.end()
    return
  }

  // ---- Body ------------------------------------------------------------
  let rawBody = ''
  let body: unknown
  try {
    const read = await readBody(req)
    rawBody = read.text
    body = read.json
  } catch (err) {
    res.writeHead(err instanceof AppError ? err.status : 400, {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders,
    })
    res.end(
      JSON.stringify({
        error: {
          code: err instanceof AppError ? err.code : 'bad_request',
          message: err instanceof Error ? err.message : 'Could not read request body.',
        },
      }),
    )
    return
  }

  const ctx = new RequestContext(req, res, rawBody, body, clientIp(req))

  try {
    const match = router.match(ctx.method, ctx.path)

    if (match === null) {
      throw new AppError(404, 'not_found', `No route for ${ctx.method} ${ctx.path}.`)
    }
    if ('allowed' in match) {
      res.writeHead(405, {
        'Content-Type': 'application/json; charset=utf-8',
        Allow: match.allowed.join(', '),
        ...corsHeaders,
      })
      res.end(JSON.stringify({ error: { code: 'method_not_allowed', message: `Use ${match.allowed.join(' or ')}.` } }))
      return
    }

    ctx.params = match.params
    if (before) await before(ctx)

    const result = await match.handler(ctx)

    if (res.writableEnded) return

    const status = result?.status ?? 200
    const headers = applyCookies(ctx, { ...corsHeaders, ...(result?.headers ?? {}) })

    if (status === 204) {
      res.writeHead(204, headers)
      res.end()
    } else if (result?.text !== undefined) {
      res.writeHead(status, {
        'Content-Type': result.contentType ?? 'text/plain; charset=utf-8',
        ...headers,
      })
      res.end(result.text)
    } else {
      const payload = JSON.stringify(result?.body ?? { ok: true })
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
        ...headers,
      })
      res.end(payload)
    }
  } catch (err) {
    const headers = applyCookies(ctx, corsHeaders)
    for (const [k, v] of Object.entries(headers)) {
      if (!res.headersSent) res.setHeader(k, v)
    }
    sendError(res, err)
  } finally {
    logger.debug('request', {
      method: ctx.method,
      path: ctx.path,
      status: res.statusCode,
      ms: Date.now() - started,
    })
  }
}

/* ------------------------------------------------------------------ */

function corsFor(origin: string | undefined): Record<string, string> {
  const base: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
  }

  if (!origin) return base

  const allowed =
    config.corsOrigins.includes(origin) ||
    (!config.isProd && isLocalhost(origin))

  if (allowed) {
    // Echo the exact origin (never '*') so credentialed requests work.
    base['Access-Control-Allow-Origin'] = origin
    base['Access-Control-Allow-Credentials'] = 'true'
  }
  return base
}

function isLocalhost(origin: string): boolean {
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

function clientIp(req: IncomingMessage): string {
  if (config.trustProxy) {
    const forwarded = req.headers['x-forwarded-for']
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded
    if (value) return value.split(',')[0]!.trim()
  }
  return req.socket.remoteAddress ?? 'unknown'
}

interface BodyRead {
  text: string
  json: unknown
}

function readBody(req: IncomingMessage): Promise<BodyRead> {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      resolve({ text: '', json: undefined })
      return
    }

    const chunks: Buffer[] = []
    let size = 0

    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new AppError(413, 'payload_too_large', 'Request body is too large.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) {
        resolve({ text: '', json: undefined })
        return
      }
      try {
        resolve({ text, json: JSON.parse(text) })
      } catch {
        reject(new AppError(400, 'invalid_json', 'Request body is not valid JSON.'))
      }
    })

    req.on('error', reject)
  })
}

/* ------------------------------------------------------------------ */

let sweeper: NodeJS.Timeout | null = null

export function startServer(server: Server, port: number, host: string): Promise<number> {
  sweeper = setInterval(sweepRateLimits, 60_000)
  sweeper.unref()

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address()
      resolve(typeof address === 'object' && address ? address.port : port)
    })
  })
}

export function stopServer(server: Server): Promise<void> {
  if (sweeper) clearInterval(sweeper)
  return new Promise((resolve) => server.close(() => resolve()))
}

export { sendEmpty, sendJson }
