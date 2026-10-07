import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'

/* ------------------------------------------------------------------ */
/*  Passwords — scrypt with a per-password salt                        */
/* ------------------------------------------------------------------ */

const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 64

/**
 * Returns `scrypt$N$r$p$salt$hash`. The parameters travel with the hash so
 * they can be raised later without invalidating existing passwords.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password.normalize('NFKC'), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 256 * SCRYPT_N * SCRYPT_R,
  })
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$')
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false

  const N = Number.parseInt(parts[1]!, 10)
  const r = Number.parseInt(parts[2]!, 10)
  const p = Number.parseInt(parts[3]!, 10)
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false

  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[4]!, 'base64')
    expected = Buffer.from(parts[5]!, 'base64')
  } catch {
    return false
  }

  let derived: Buffer
  try {
    derived = scryptSync(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 256 * N * r,
    })
  } catch {
    return false
  }

  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

/* ------------------------------------------------------------------ */
/*  Tokens                                                             */
/* ------------------------------------------------------------------ */

/** Opaque bearer/cookie token handed to the client. Never stored as-is. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

/** What we persist: a fast digest of the token, so a DB leak is not a login. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/* ------------------------------------------------------------------ */
/*  Webhook signatures (Stripe scheme: HMAC-SHA256 over "t.payload")   */
/* ------------------------------------------------------------------ */

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
}

/* ------------------------------------------------------------------ */
/*  Identifiers                                                        */
/* ------------------------------------------------------------------ */

/** Crockford-ish alphabet: no I, L, O, U — avoids transcription mistakes. */
const REF_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function orderReference(): string {
  const bytes = randomBytes(8)
  let out = ''
  for (const b of bytes) out += REF_ALPHABET[b % REF_ALPHABET.length]
  return `BA-${out}`
}

export function uuid(): string {
  return randomUUID()
}
