// The database the tests that need a real PostgreSQL run on. Not a test itself.
import type pg from 'pg'
import { loadLocalEnv } from '../env'
import { migrate } from './migrate'
import { createPool } from './pool'

/**
 * DATABASE_URL_TEST, if it is safe to empty: its database must be named `..._test`, and it must not be the one
 * DATABASE_URL points to. The tests truncate tables, so a URL copied from the real one would wipe the accounts.
 * Without CI set, an unsafe or missing URL means "no test database": the tests that need one are skipped. With CI set,
 * that is a failure, so that a pipeline never goes green by skipping them.
 */
export function testDatabaseUrl(): string | undefined {
  loadLocalEnv()
  const url = process.env.DATABASE_URL_TEST
  const problem = !url
    ? "DATABASE_URL_TEST n'est pas défini"
    : !/\/[^/?]*_test(\?.*)?$/.test(url)
      ? 'le nom de la base de DATABASE_URL_TEST doit finir par _test'
      : url === process.env.DATABASE_URL
        ? 'DATABASE_URL_TEST est la même que DATABASE_URL'
        : null
  if (problem) {
    if (process.env.CI) throw new Error(`Base de test inutilisable : ${problem}.`)
    if (url) console.warn(`[tests] base de test ignorée : ${problem}.`)
    return undefined
  }
  return url
}

let shared: Promise<pg.Pool | null> | undefined

/**
 * A pool on the test database (DATABASE_URL_TEST, made by `npm run db:setup`), with the schema up to date.
 * Null when there is none or it does not answer: the tests that need it are then skipped, and say why.
 * Never the real database: the tests empty the tables.
 */
export function openTestPool(): Promise<pg.Pool | null> {
  shared ??= (async () => {
    const url = testDatabaseUrl()
    if (!url) return null
    const pool = createPool(url)
    try {
      await pool.query('SELECT 1')
      await migrate(pool)
      return pool
    } catch {
      await pool.end().catch(() => undefined)
      return null
    }
  })()
  return shared
}

export async function closeTestPool(): Promise<void> {
  const pool = await shared
  shared = undefined
  await pool?.end()
}
