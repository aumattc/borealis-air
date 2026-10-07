type Level = 'debug' | 'info' | 'warn' | 'error'

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const configured = (process.env.LOG_LEVEL ?? 'info') as Level
const threshold = order[configured] ?? order.info

/** Structured single-line logs. Never pass secrets or card data here. */
function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (order[level] < threshold) return
  const line = {
    t: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ?? {}),
  }
  const text = JSON.stringify(line)
  if (level === 'error' || level === 'warn') process.stderr.write(`${text}\n`)
  else process.stdout.write(`${text}\n`)
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
}

/** Removes anything that looks like a card number or secret before logging. */
export function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/\b\d{12,19}\b/g, '••••').replace(/(sk_|whsec_)[A-Za-z0-9_]+/g, '$1••••')
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/card|cvc|cvv|number|secret|password|token/i.test(k)) out[k] = '••••'
      else out[k] = redact(v)
    }
    return out
  }
  return value
}
