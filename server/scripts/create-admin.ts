import { randomBytes } from 'node:crypto'
import { migrate } from '../db/migrate.ts'
import { seedCatalog } from '../db/seed.ts'
import { queryOne, run } from '../db/index.ts'
import { hashPassword, uuid } from '../lib/crypto.ts'
import { logger } from '../lib/log.ts'

/**
 * Creates the initial admin account.
 *
 *   npm run api:admin -- --email you@example.com [--password '...']
 *
 * If no password is given a strong one is generated and printed once. An
 * existing account with the same email is promoted rather than duplicated.
 */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function generatePassword(): string {
  // 24 bytes of base64url: long, high-entropy, easy to paste.
  return randomBytes(24).toString('base64url')
}

migrate()
seedCatalog()

const email = (arg('email') ?? process.env.ADMIN_EMAIL ?? '').trim().toLowerCase()
if (!email) {
  logger.error('usage: npm run api:admin -- --email you@example.com [--password "..."]')
  process.exit(1)
}

const password = arg('password') ?? process.env.ADMIN_PASSWORD ?? generatePassword()
if (password.length < 10) {
  logger.error('admin password must be at least 10 characters')
  process.exit(1)
}

const existing = queryOne<{ id: string }>('SELECT id FROM customers WHERE email = ?', [email])
const now = new Date().toISOString()

if (existing) {
  run('UPDATE customers SET role = ?, password_hash = ?, updated_at = ? WHERE id = ?', [
    'admin',
    hashPassword(password),
    now,
    existing.id,
  ])
  logger.info('existing account promoted to admin', { email })
} else {
  run(
    `INSERT INTO customers (id, email, password_hash, first_name, last_name, role, created_at, updated_at)
     VALUES (?, ?, ?, 'Borealis', 'Admin', 'admin', ?, ?)`,
    [uuid(), email, hashPassword(password), now, now],
  )
  logger.info('admin account created', { email })
}

// Printed once so it can be captured; not written to the database in plaintext.
process.stdout.write(`\n  email:    ${email}\n  password: ${password}\n\n  Store this now — it will not be shown again.\n\n`)
