import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { config } from '../config.ts'

/**
 * Thin wrapper over node:sqlite. Node 24 ships SQLite in core, so the backend
 * needs no native module and no build step.
 */

let db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (db) return db

  if (config.databasePath !== ':memory:') {
    mkdirSync(dirname(config.databasePath), { recursive: true })
  }

  db = new DatabaseSync(config.databasePath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('PRAGMA synchronous = NORMAL')
  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}

export type Row = Record<string, unknown>

export function query<T = Row>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...(params as never[])) as T[]
}

export function queryOne<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().prepare(sql).get(...(params as never[])) as T | undefined
}

export interface RunResult {
  changes: number
  lastInsertRowid: number
}

export function run(sql: string, params: unknown[] = []): RunResult {
  const result = getDb().prepare(sql).run(...(params as never[]))
  return {
    changes: Number(result.changes),
    lastInsertRowid: Number(result.lastInsertRowid),
  }
}

/**
 * Runs `fn` inside a transaction. Nested calls join the outer transaction
 * rather than opening a second one, which SQLite would reject.
 */
let depth = 0

export function transaction<T>(fn: () => T): T {
  const database = getDb()
  if (depth > 0) return fn()

  depth++
  database.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    database.exec('COMMIT')
    return result
  } catch (err) {
    try {
      database.exec('ROLLBACK')
    } catch {
      /* the original error is the useful one */
    }
    throw err
  } finally {
    depth--
  }
}
