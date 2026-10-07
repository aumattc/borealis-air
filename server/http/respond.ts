import type { ServerResponse } from 'node:http'
import { isAppError } from '../lib/errors.ts'
import type { RequestContext } from './context.ts'

/** Header values may be a single string or a list (Set-Cookie). */
export type ResponseHeaders = Record<string, string | string[]>

export function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders: ResponseHeaders = {}): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  })
  res.end(payload)
}

export function sendText(res: ServerResponse, status: number, text: string, contentType = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(text),
  })
  res.end(text)
}

export function sendEmpty(res: ServerResponse, status = 204): void {
  res.writeHead(status)
  res.end()
}

/**
 * Turns any thrown value into a response. AppErrors carry their own status and
 * are safe to show; everything else becomes a generic 500 so internal details
 * and stack traces never leak to the client.
 */
export function sendError(res: ServerResponse, error: unknown): void {
  if (isAppError(error)) {
    sendJson(res, error.status, {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    })
    return
  }

  const err = error instanceof Error ? error : new Error(String(error))
  sendJson(res, 500, {
    error: {
      code: 'internal_error',
      message: 'Something went wrong on our end.',
    },
  })
  // Surface the real cause in the server log only.
  logServerError(err)
}

function logServerError(err: Error): void {
  // Imported lazily to avoid a cycle between respond and log modules.
  void import('../lib/log.ts').then(({ logger }) => {
    logger.error('unhandled request error', { message: err.message, stack: err.stack })
  })
}

export function applyCookies(ctx: RequestContext, headers: ResponseHeaders): ResponseHeaders {
  const cookies = ctx.responseCookieHeaders
  if (cookies.length === 0) return headers
  return { ...headers, 'Set-Cookie': cookies }
}
