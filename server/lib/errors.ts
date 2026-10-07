/**
 * Typed errors that map cleanly onto HTTP responses. Anything thrown that is
 * not an AppError is treated as a bug and reported as a generic 500, so
 * internal details never reach the client.
 */
export class AppError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details)

export const unauthorized = (message = 'Authentication required.') =>
  new AppError(401, 'unauthorized', message)

export const forbidden = (message = 'You do not have access to that.') =>
  new AppError(403, 'forbidden', message)

export const notFound = (message = 'Not found.') => new AppError(404, 'not_found', message)

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, details)

export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, 'unprocessable', message, details)

export const tooManyRequests = (message = 'Too many requests. Try again shortly.') =>
  new AppError(429, 'rate_limited', message)

export const badGateway = (message: string) => new AppError(502, 'upstream_error', message)

export const serviceUnavailable = (message: string) => new AppError(503, 'unavailable', message)

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError
}
