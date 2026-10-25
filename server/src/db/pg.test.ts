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
import { describePlaylistStoreContract } from '../playlists/playlistStoreContract'
import { PgPlaylistStore } from '../playlists/PgPlaylistStore'
import { migrate } from './migrate'
import { createPool } from './pool'
import { closeTestPool, openTestPool, testDatabaseUrl } from './testDatabase'

after(closeTestPool)

describeAccountStoreContract('postgres account store', async () => {
  const pool = await openTestPool()
  if (!pool) return null
  return { store: new PgAccountStore(pool), reset: async () => void (await pool.query('TRUNCATE playlist_tracks, playlists, sessions, users')) }
})

let memberCount = 0
describePlaylistStoreContract('postgres playlist store', async () => {
  const pool = await openTestPool()
  if (!pool) return null
  return {
    store: new PgPlaylistStore(pool),
    reset: async () => void (await pool.query('TRUNCATE playlist_tracks, playlists, sessions, users')),
    newAccount: async () => {
      memberCount += 1
      const { rows } = await pool.query<{ id: string }>(
        "INSERT INTO users (email, password_hash, pseudo, pseudo_key, avatar_id) VALUES ($1, 'h', $2, $2, 'pulse') RETURNING id",
        [`member${memberCount}@example.com`, `m${memberCount}`],
      )
      return rows[0].id
    },
  }
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
    await pool.query('TRUNCATE playlist_tracks, playlists, sessions, users')
    const insert = (email: string, key: string) =>
      pool.query("INSERT INTO users (email, password_hash, pseudo, pseudo_key, avatar_id) VALUES ($1, 'h', 'P', $2, 'pulse')", [email, key])
    await insert('a@example.com', 'a')
    await assert.rejects(insert('a@example.com', 'b'), (error: { code?: string }) => error.code === '23505')
    await assert.rejects(insert('b@example.com', 'a'), (error: { code?: string }) => error.code === '23505')
    await insert('b@example.com', 'b')
  })

  withPool('removes the sessions of an account with the account', async (pool) => {
    await pool.query('TRUNCATE playlist_tracks, playlists, sessions, users')
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
    await pool.query('TRUNCATE playlist_tracks, playlists, sessions, users')
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

describe('the schema of the playlists', () => {
  const ADDED = new Date('2026-10-24T20:00:00Z')

  /** A member with a playlist, ready for tracks. */
  async function member(pool: pg.Pool) {
    await pool.query('TRUNCATE playlist_tracks, playlists, sessions, users')
    const user = await pool.query<{ id: string }>("INSERT INTO users (email, password_hash, pseudo, pseudo_key, avatar_id) VALUES ('a@example.com', 'h', 'A1', 'a1', 'pulse') RETURNING id")
    const playlist = await pool.query<{ id: string }>("INSERT INTO playlists (user_id, name, name_key) VALUES ($1, 'Chill', 'chill') RETURNING id", [user.rows[0].id])
    return { userId: user.rows[0].id, playlistId: playlist.rows[0].id }
  }
  const addTrack = (pool: pg.Pool | pg.PoolClient, playlistId: string, video: string, position: number) =>
    pool.query(
      "INSERT INTO playlist_tracks (playlist_id, position, video_id, title, artist, duration_sec, fetched_at, checked_at) VALUES ($1, $2, $3, 't', 'a', 200, $4, $4)",
      [playlistId, position, video, ADDED],
    )

  withPool('removes the playlists and their tracks with the account', async (pool) => {
    const { userId, playlistId } = await member(pool)
    await addTrack(pool, playlistId, 'aaaaaaaaaa1', 0)
    await pool.query('DELETE FROM users WHERE id = $1', [userId])
    assert.equal((await pool.query('SELECT 1 FROM playlists')).rowCount, 0)
    assert.equal((await pool.query('SELECT 1 FROM playlist_tracks')).rowCount, 0)
  })

  withPool('refuses a playlist of nobody, whatever the code does', async (pool) => {
    await member(pool)
    await assert.rejects(
      pool.query("INSERT INTO playlists (user_id, name, name_key) VALUES (gen_random_uuid(), 'X', 'x')"),
      (error: { code?: string }) => error.code === '23503',
    )
  })

  withPool('refuses a second playlist with the same name key for a member, and a second video or place in a playlist', async (pool) => {
    const { userId, playlistId } = await member(pool)
    await assert.rejects(
      pool.query("INSERT INTO playlists (user_id, name, name_key) VALUES ($1, 'CHILL', 'chill')", [userId]),
      (error: { code?: string }) => error.code === '23505',
    )
    await addTrack(pool, playlistId, 'aaaaaaaaaa1', 0)
    await assert.rejects(addTrack(pool, playlistId, 'aaaaaaaaaa1', 1), (error: { code?: string }) => error.code === '23505', 'a video once')
    await assert.rejects(addTrack(pool, playlistId, 'bbbbbbbbbb1', 0), (error: { code?: string }) => error.code === '23505', 'a place once')
  })

  withPool('checks the places when the transaction ends, so that a move may pass through a duplicate but not end on one', async (pool) => {
    const { playlistId } = await member(pool)
    await addTrack(pool, playlistId, 'aaaaaaaaaa1', 0)
    await addTrack(pool, playlistId, 'bbbbbbbbbb1', 1)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('UPDATE playlist_tracks SET position = 1 WHERE video_id = $1', ['aaaaaaaaaa1']) // two at 1, for now
      await client.query('UPDATE playlist_tracks SET position = 0 WHERE video_id = $1', ['bbbbbbbbbb1'])
      await client.query('COMMIT')
    } finally {
      client.release()
    }
    const { rows } = await pool.query<{ video_id: string }>('SELECT video_id FROM playlist_tracks ORDER BY position')
    assert.deepEqual(rows.map((row) => row.video_id), ['bbbbbbbbbb1', 'aaaaaaaaaa1'])

    const stuck = await pool.connect()
    try {
      await stuck.query('BEGIN')
      await stuck.query('UPDATE playlist_tracks SET position = 1 WHERE video_id = $1', ['bbbbbbbbbb1']) // two at 1 and it stays so
      await assert.rejects(stuck.query('COMMIT'), (error: { code?: string }) => error.code === '23505')
    } finally {
      await stuck.query('ROLLBACK').catch(() => undefined)
      stuck.release()
    }
  })

  withPool('refuses a length of nothing and a place below zero', async (pool) => {
    const { playlistId } = await member(pool)
    await assert.rejects(addTrack(pool, playlistId, 'aaaaaaaaaa1', -1), (error: { code?: string }) => error.code === '23514')
    await assert.rejects(
      pool.query("INSERT INTO playlist_tracks (playlist_id, position, video_id, title, artist, duration_sec, fetched_at, checked_at) VALUES ($1, 0, 'aaaaaaaaaa1', 't', 'a', 0, $2, $2)", [playlistId, ADDED]),
      (error: { code?: string }) => error.code === '23514',
    )
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
    assert.deepEqual(rows.map((row) => row.name), ['001_accounts.sql', '002_playlists.sql'])
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
