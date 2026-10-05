import { badRequest } from './errors.ts'

/**
 * Small, dependency-free validators. They return normalised values and throw
 * a 400 with field-level details, so route handlers stay readable.
 */

export type FieldErrors = Record<string, string>

export class Validator {
  private readonly errors: FieldErrors = {}
  private readonly out: Record<string, unknown> = {}
  private readonly body: unknown

  constructor(body: unknown) {
    // An absent body is treated as empty, so endpoints whose fields are all
    // optional can be called without a payload.
    if (body === undefined || body === null) {
      this.body = {}
      return
    }
    if (typeof body !== 'object' || Array.isArray(body)) {
      throw badRequest('Request body must be a JSON object.')
    }
    this.body = body
  }

  private raw(field: string): unknown {
    return (this.body as Record<string, unknown>)[field]
  }

  string(field: string, opts: { min?: number; max?: number; required?: boolean; trim?: boolean } = {}): this {
    const { min = 0, max = 5000, required = true, trim = true } = opts
    const value = this.raw(field)

    if (value === undefined || value === null || value === '') {
      if (required) this.errors[field] = 'This field is required.'
      return this
    }
    if (typeof value !== 'string') {
      this.errors[field] = 'Must be text.'
      return this
    }
    const v = trim ? value.trim() : value
    if (v.length < min) this.errors[field] = `Must be at least ${min} characters.`
    else if (v.length > max) this.errors[field] = `Must be at most ${max} characters.`
    else this.out[field] = v
    return this
  }

  email(field = 'email'): this {
    const value = this.raw(field)
    if (typeof value !== 'string' || !value.trim()) {
      this.errors[field] = 'Email is required.'
      return this
    }
    const v = value.trim().toLowerCase()
    // Deliberately permissive: reject obvious junk, let the mail system decide.
    if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) {
      this.errors[field] = 'Enter a valid email address.'
      return this
    }
    this.out[field] = v
    return this
  }

  int(field: string, opts: { min?: number; max?: number; required?: boolean } = {}): this {
    const { min = 0, max = Number.MAX_SAFE_INTEGER, required = true } = opts
    const value = this.raw(field)

    if (value === undefined || value === null || value === '') {
      if (required) this.errors[field] = 'This field is required.'
      return this
    }
    const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
    if (!Number.isInteger(n)) this.errors[field] = 'Must be a whole number.'
    else if (n < min) this.errors[field] = `Must be at least ${min}.`
    else if (n > max) this.errors[field] = `Must be at most ${max}.`
    else this.out[field] = n
    return this
  }

  oneOf<T extends string>(field: string, allowed: readonly T[], opts: { required?: boolean } = {}): this {
    const { required = true } = opts
    const value = this.raw(field)
    if (value === undefined || value === null || value === '') {
      if (required) this.errors[field] = 'This field is required.'
      return this
    }
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
      this.errors[field] = `Must be one of: ${allowed.join(', ')}.`
      return this
    }
    this.out[field] = value
    return this
  }

  /** ISO-8601-ish date, kept as a string. */
  dateString(field: string, opts: { required?: boolean } = {}): this {
    const { required = true } = opts
    const value = this.raw(field)
    if (value === undefined || value === null || value === '') {
      if (required) this.errors[field] = 'This field is required.'
      return this
    }
    const d = new Date(String(value))
    if (Number.isNaN(d.getTime())) {
      this.errors[field] = 'Enter a valid date.'
      return this
    }
    this.out[field] = d.toISOString()
    return this
  }

  /** Optional free-form field, only accepted when explicitly passed through. */
  passthrough(field: string, normalise?: (v: unknown) => unknown): this {
    const value = this.raw(field)
    if (value === undefined) return this
    this.out[field] = normalise ? normalise(value) : value
    return this
  }

  /** Injects a value that was not read from the body (e.g. the session id). */
  set(field: string, value: unknown): this {
    this.out[field] = value
    return this
  }

  done(): Record<string, unknown> {
    if (Object.keys(this.errors).length > 0) {
      throw badRequest('Some fields need attention.', this.errors)
    }
    return this.out
  }
}

/** Coerces a validated value to the expected type for callers. */
export function asString(v: unknown): string {
  return typeof v === 'string' ? v : String(v)
}

export function asInt(v: unknown): number {
  return typeof v === 'number' ? v : Number.parseInt(String(v), 10)
}
