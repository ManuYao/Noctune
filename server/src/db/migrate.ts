import { readdir, readFile } from 'node:fs/promises'
import type pg from 'pg'

const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url)
// Any number, as long as every copy of the server uses the same: two servers starting together take turns.
const LOCK_ID = 727_274

/**
 * Applies, in file name order, the .sql files that were not applied yet, each one in a transaction.
 * Returns the names it applied. A migration that was applied is never run again: to change the schema, add a file.
 */
export async function migrate(pool: pg.Pool, directory: URL = MIGRATIONS_DIR): Promise<string[]> {
  const client = await pool.connect()
  const applied: string[] = []
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID])
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    )
    const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((row) => row.name))
    const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()
    for (const file of files) {
      if (done.has(file)) continue
      const sql = await readFile(new URL(file, directory), 'utf8')
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${file} refusée : ${(error as Error).message}`)
      }
      applied.push(file)
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => undefined)
    client.release()
  }
  return applied
}
