import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * Envelope encryption for secrets held in the database (payment provider keys,
 * webhook signing secrets).
 *
 * AES-256-GCM with a random 96-bit IV per value, so identical plaintexts never
 * produce identical ciphertext. The key is derived from `SETTINGS_ENCRYPTION_KEY`
 * (falling back to `SESSION_SECRET` in development). Production boots without a
 * stable key are rejected by `validateConfig`, because a rotating key would make
 * previously stored credentials undecryptable.
 */

const PREFIX = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16

export function deriveKey(secret: string): Buffer {
  // A fixed context string keeps this key distinct from session signing use.
  return createHash('sha256').update(`borealis.settings.v1:${secret}`).digest()
}

/** Returns `v1:<iv>:<tag>:<ciphertext>`, all base64url. */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':')
}

/**
 * Reverses `encryptSecret`. Returns null when the payload is malformed or the
 * authentication tag fails — a tampered or foreign-key value is never trusted.
 */
export function decryptSecret(payload: string, key: Buffer): string | null {
  const parts = payload.split(':')
  if (parts.length !== 4 || parts[0] !== PREFIX) return null

  let iv: Buffer
  let tag: Buffer
  let ciphertext: Buffer
  try {
    iv = Buffer.from(parts[1]!, 'base64url')
    tag = Buffer.from(parts[2]!, 'base64url')
    ciphertext = Buffer.from(parts[3]!, 'base64url')
  } catch {
    return null
  }
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** Never reveal a stored secret; show only enough to recognise which key it is. */
export function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return '••••'
  return `${value.slice(0, 7)}••••${value.slice(-4)}`
}
