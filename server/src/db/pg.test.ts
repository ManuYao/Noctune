// Everything that needs a real PostgreSQL, in one file: the test files run in parallel, and these tests empty tables
// and rebuild schemas, so two of them at once on the same database would trip over each other.
// Without a test database (see testDatabase.ts) they are skipped, and say how to get one.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { after, describe, it, type TestContext } from 'node:test'
import pg from 'pg'
import { describeAccountStoreContract } from '../accounts/accountStoreContract'
import { PgAccountStore } from '../accounts/PgAccountStore'
import { migrate } from './migrate'
import { createPool } from './pool'
import { closeTestPool, openTestPool, testDatabaseUrl } from './testDatabase'

after(closeTestPool)

describeAccountStoreContract('postgres account store', async () => {
  const pool = await openTestPool()
  if (!pool) return null
  return { store: new PgAccountStore(pool), reset: async () => void (await pool.query('TRUNCATE sessions, users')) }
})

/** A test that needs the database, or a note that it was skipped. */
function withPool(title: string, body: (pool: pg.Pool) => Promise<void>) {
  it(title, async (t: TestContext) => {
    const pool = await openTestPool()
    if (!pool) return t.skip('pas de base de test : npm run db:setup')
    await body(pool)
  })
}

describe('the schema', () => {
  withPool('refuses a second e-mail or a second pseudo itself, whatever the code does', async (pool) => {
    await pool.query('TRUNCATE sessions, users')
    const insert = (email: string, key: string) =>
      pool.query("INSERT INTO users (email, password_hash, pseudo, pseudo_key, avatar_id) VALUES ($1, 'h', 'P', $2, 'pulse')", [email, key])
    await insert('a@example.com', 'a')
    await assert.rejects(insert('a@example.com', 'b'), (error: { code?: string }) => error.code === '23505')
    await assert.rejects(insert('b@example.com', 'a'), (error: { code?: string }) => error.code === '23505')
    await insert('b@example.com', 'b')
  })

  withPool('removes the sessions of an account with the account', async (pool) => {
    await pool.query('TRUNCATE sessions, users')
    const store = new PgAccountStore(pool)
    const created = await store.create({ email: 'a@example.com', passwordHash: 'h', pseudo: 'A1', avatarId: 'pulse' })
    assert.ok(created.ok)
    if (!created.ok) return
    await store.createSession(created.account.id, createHash('sha256').update('x').digest(), new Date(Date.now() + 3_600_000))
    assert.equal((await pool.query('SELECT 1 FROM sessions')).rowCount, 1)
    await pool.query('DELETE FROM users WHERE id = $1', [created.account.id])
    assert.equal((await pool.query('SELECT 1 FROM sessions')).rowCount, 0)
  })

  withPool('keeps the hash of the token, as bytes, and never the token', async (pool) => {
    await pool.query('TRUNCATE sessions, users')
    const store = new PgAccountStore(pool)
    const created = await store.create({ email: 'a@example.com', passwordHash: 'h', pseudo: 'A1', avatarId: 'pulse' })
    assert.ok(created.ok)
    if (!created.ok) return
    const token = 'a-session-token-that-must-not-be-stored-anywhere'
    const hash = createHash('sha256').update(token).digest()
    await store.createSession(created.account.id, hash, new Date(Date.now() + 3_600_000))
    const { rows } = await pool.query<{ token_hash: Buffer }>('SELECT token_hash FROM sessions')
    assert.equal(rows[0].token_hash.length, 32)
    assert.deepEqual(rows[0].token_hash, hash)
    const dump = JSON.stringify((await pool.query('SELECT * FROM sessions')).rows)
    assert.equal(dump.includes(token), false)
  })
})

describe('a database that stops answering', () => {
  it('makes an error after the time allowed, not a hang, and the pool works afterwards', async (t: TestContext) => {
    const url = testDatabaseUrl()
    if (!url || !(await openTestPool())) return t.skip('pas de base de test : npm run db:setup')
    const pool = createPool(url, { queryTimeoutMs: 300 })
    try {
      const started = Date.now()
      await assert.rejects(pool.query('SELECT pg_sleep(3)'), /timeout|cancel/i)
      assert.ok(Date.now() - started < 2000, 'it stopped waiting at the limit')
      assert.equal((await pool.query<{ one: number }>('SELECT 1 AS one')).rows[0].one, 1)
    } finally {
      await pool.end()
    }
  })
})

describe('migrations', () => {
  withPool('are all applied, and applying them again does nothing', async (pool) => {
    assert.deepEqual(await migrate(pool), [])
    const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name')
    assert.deepEqual(rows.map((row) => row.name), ['001_accounts.sql'])
  })

  it('apply in order, once each, and a failing one leaves no trace and stops the rest', async (t: TestContext) => {
    const url = testDatabaseUrl()
    const admin = await openTestPool()
    if (!url || !admin) return t.skip('pas de base de test : npm run db:setup')

    // A schema of its own: the real tables are not touched.
    await admin.query('DROP SCHEMA IF EXISTS migration_test CASCADE')
    await admin.query('CREATE SCHEMA migration_test')
    const scratch = new pg.Pool({ connectionString: url, options: '-c search_path=migration_test' })
    const directory = new URL('../../.tmp/migration-test/', import.meta.url)
    try {
      await rm(directory, { recursive: true, force: true })
      await mkdir(directory, { recursive: true })
      await writeFile(new URL('002_second.sql', directory), 'CREATE TABLE second (id int);')
      await writeFile(new URL('001_first.sql', directory), 'CREATE TABLE first (id int);')
      await writeFile(new URL('003_broken.sql', directory), 'CREATE TABLE third (id int); SELECT * FROM nothing_here;')
      await writeFile(new URL('004_never.sql', directory), 'CREATE TABLE fourth (id int);')
      await writeFile(new URL('notes.txt', directory), 'not a migration')

      await assert.rejects(migrate(scratch, directory), /003_broken\.sql/)
      const tables = async () =>
        (await scratch.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'migration_test' ORDER BY 1")).rows.map((row) => row.table_name)
      assert.deepEqual(await tables(), ['first', 'schema_migrations', 'second'], 'the two before it stay, the broken one and the next one are not there')
      const applied = async () => (await scratch.query<{ name: string }>('SELECT name FROM schema_migrations ORDER BY name')).rows.map((row) => row.name)
      assert.deepEqual(await applied(), ['001_first.sql', '002_second.sql'])

      // Once the broken one is fixed, the run goes on from where it stopped.
      await writeFile(new URL('003_broken.sql', directory), 'CREATE TABLE third (id int);')
      assert.deepEqual(await migrate(scratch, directory), ['003_broken.sql', '004_never.sql'])
      assert.deepEqual(await migrate(scratch, directory), [])
    } finally {
      await scratch.end()
      await admin.query('DROP SCHEMA IF EXISTS migration_test CASCADE')
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('two servers starting at the same moment apply each migration once', async (t: TestContext) => {
    const url = testDatabaseUrl()
    const admin = await openTestPool()
    if (!url || !admin) return t.skip('pas de base de test : npm run db:setup')
    await admin.query('DROP SCHEMA IF EXISTS migration_race CASCADE')
    await admin.query('CREATE SCHEMA migration_race')
    const pools = [1, 2, 3].map(() => new pg.Pool({ connectionString: url, options: '-c search_path=migration_race' }))
    const directory = new URL('../../.tmp/migration-race/', import.meta.url)
    try {
      await rm(directory, { recursive: true, force: true })
      await mkdir(directory, { recursive: true })
      await writeFile(new URL('001_once.sql', directory), 'CREATE TABLE once (id int);')
      const runs = await Promise.all(pools.map((pool) => migrate(pool, directory)))
      assert.deepEqual(runs.flat(), ['001_once.sql'], 'applied by exactly one of them')
    } finally {
      await Promise.all(pools.map((pool) => pool.end()))
      await admin.query('DROP SCHEMA IF EXISTS migration_race CASCADE')
      await rm(directory, { recursive: true, force: true })
    }
  })
})
