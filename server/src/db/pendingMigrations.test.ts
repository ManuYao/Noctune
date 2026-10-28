// Which migrations a database has not applied: read only, with a fake pool (no database needed).
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, it } from 'node:test'
import { pendingMigrations } from './migrate'

async function withMigrations(names: string[], run: (directory: URL) => Promise<void>) {
  const folder = await mkdtemp(join(tmpdir(), 'noctune-migrations-'))
  try {
    for (const name of names) await writeFile(join(folder, name), 'SELECT 1;')
    await writeFile(join(folder, 'README.txt'), 'not a migration')
    await run(pathToFileURL(folder + '/'))
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

const poolWith = (applied: string[] | 'no-table') => ({
  query: async () => {
    if (applied === 'no-table') throw new Error('relation "schema_migrations" does not exist')
    return { rows: applied.map((name) => ({ name })) }
  },
})

describe('the migrations a database is behind on', () => {
  it('lists the ones that were not applied, in order', async () => {
    await withMigrations(['001_a.sql', '002_b.sql', '003_c.sql'], async (directory) => {
      assert.deepEqual(await pendingMigrations(poolWith(['001_a.sql']) as never, directory), ['002_b.sql', '003_c.sql'])
    })
  })

  it('lists none when everything was applied, and only .sql files count', async () => {
    await withMigrations(['001_a.sql', '002_b.sql'], async (directory) => {
      assert.deepEqual(await pendingMigrations(poolWith(['001_a.sql', '002_b.sql']) as never, directory), [])
    })
  })

  it('lists all of them for a database that has no table of migrations', async () => {
    await withMigrations(['001_a.sql', '002_b.sql'], async (directory) => {
      assert.deepEqual(await pendingMigrations(poolWith('no-table') as never, directory), ['001_a.sql', '002_b.sql'])
    })
  })
})
