import { queryOne, run, type Row } from '../db/index.ts'
import { hashPassword, hashToken, verifyPassword, generateToken, uuid } from '../lib/crypto.ts'
import { badRequest, conflict, unauthorized } from '../lib/errors.ts'
import { config } from '../config.ts'

export interface CustomerDTO {
  id: string
  email: string
  firstName: string
  lastName: string
  role: 'customer' | 'admin'
  createdAt: string
}

export interface AuthResult {
  customer: CustomerDTO
  token: string
  expiresAt: string
}

function toCustomer(row: Row): CustomerDTO {
  return {
    id: String(row.id),
    email: String(row.email),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    role: row.role === 'admin' ? 'admin' : 'customer',
    createdAt: String(row.created_at),
  }
}

/* ------------------------------------------------------------------ */
/*  Registration and login                                             */
/* ------------------------------------------------------------------ */

export function register(input: {
  email: string
  password: string
  firstName: string
  lastName: string
  ip: string
  userAgent: string
}): AuthResult {
  const existing = queryOne<Row>('SELECT id FROM customers WHERE email = ?', [input.email])
  if (existing) throw conflict('An account with that email already exists.')

  const now = new Date().toISOString()
  const id = uuid()

  run(
    `INSERT INTO customers (id, email, password_hash, first_name, last_name, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'customer', ?, ?)`,
    [id, input.email, hashPassword(input.password), input.firstName, input.lastName, now, now],
  )

  const customer = queryOne<Row>('SELECT * FROM customers WHERE id = ?', [id])!
  return issueSession(toCustomer(customer), input.ip, input.userAgent)
}

export function login(input: {
  email: string
  password: string
  ip: string
  userAgent: string
}): AuthResult {
  const row = queryOne<Row>('SELECT * FROM customers WHERE email = ?', [input.email])

  // Always run a hash comparison, even for unknown emails, so response time
  // does not reveal whether an account exists.
  const stored = row ? String(row.password_hash) : hashPassword('placeholder-for-timing')
  const ok = verifyPassword(input.password, stored)

  if (!row || !ok) throw unauthorized('Email or password is incorrect.')

  return issueSession(toCustomer(row), input.ip, input.userAgent)
}

function issueSession(customer: CustomerDTO, ip: string, userAgent: string): AuthResult {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 86_400_000).toISOString()

  run(
    `INSERT INTO sessions (id, customer_id, created_at, expires_at, user_agent, ip)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [hashToken(token), customer.id, new Date().toISOString(), expiresAt, userAgent.slice(0, 300), ip],
  )

  return { customer, token, expiresAt }
}

/* ------------------------------------------------------------------ */
/*  Session resolution                                                 */
/* ------------------------------------------------------------------ */

export interface SessionLookup {
  customer: CustomerDTO
  sessionId: string
  expiresAt: string
}

export function resolveSession(token: string): SessionLookup | null {
  const sessionId = hashToken(token)
  const row = queryOne<Row>(
    `SELECT s.id AS session_id, s.expires_at, c.*
     FROM sessions s
     JOIN customers c ON c.id = s.customer_id
     WHERE s.id = ?`,
    [sessionId],
  )
  if (!row) return null

  const expiresAt = String(row.expires_at)
  if (new Date(expiresAt).getTime() <= Date.now()) {
    run('DELETE FROM sessions WHERE id = ?', [sessionId])
    return null
  }

  return { customer: toCustomer(row), sessionId, expiresAt }
}

export function logout(token: string): void {
  run('DELETE FROM sessions WHERE id = ?', [hashToken(token)])
}

export function logoutAll(customerId: string): void {
  run('DELETE FROM sessions WHERE customer_id = ?', [customerId])
}

export function purgeExpiredSessions(): number {
  return run('DELETE FROM sessions WHERE expires_at <= ?', [new Date().toISOString()]).changes
}

/* ------------------------------------------------------------------ */
/*  Profile                                                            */
/* ------------------------------------------------------------------ */

export function getCustomer(id: string): CustomerDTO | null {
  const row = queryOne<Row>('SELECT * FROM customers WHERE id = ?', [id])
  return row ? toCustomer(row) : null
}

export function updateProfile(
  id: string,
  input: { firstName?: string; lastName?: string },
): CustomerDTO {
  const row = queryOne<Row>('SELECT * FROM customers WHERE id = ?', [id])
  if (!row) throw unauthorized()

  run('UPDATE customers SET first_name = ?, last_name = ?, updated_at = ? WHERE id = ?', [
    input.firstName ?? row.first_name,
    input.lastName ?? row.last_name,
    new Date().toISOString(),
    id,
  ])

  return toCustomer(queryOne<Row>('SELECT * FROM customers WHERE id = ?', [id])!)
}

export function changePassword(id: string, currentPassword: string, nextPassword: string): void {
  const row = queryOne<Row>('SELECT * FROM customers WHERE id = ?', [id])
  if (!row) throw unauthorized()

  if (!verifyPassword(currentPassword, String(row.password_hash))) {
    throw unauthorized('Current password is incorrect.')
  }
  if (nextPassword.length < 10) {
    throw badRequest('New password must be at least 10 characters.')
  }

  run('UPDATE customers SET password_hash = ?, updated_at = ? WHERE id = ?', [
    hashPassword(nextPassword),
    new Date().toISOString(),
    id,
  ])

  // Changing a password invalidates every other session.
  logoutAll(id)
}

export function countCustomers(): number {
  return Number(queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM customers')?.n ?? 0)
}
