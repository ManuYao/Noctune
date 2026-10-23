// What every AccountStore must do, whatever it keeps its data in. MemoryAccountStore.test.ts runs it on the memory
// version, PgAccountStore.test.ts on the real database: the two cannot drift apart without a test noticing.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it, type TestContext } from 'node:test'
import type { AccountStore, NewAccount, StoredAccount } from './AccountStore'

export interface StoreUnderTest {
  store: AccountStore
  /** Back to an empty store. */
  reset: () => Promise<void>
}

const nina: NewAccount = { email: 'nina@example.com', passwordHash: 'scrypt$hash-of-nina', pseudo: 'Nina_B', avatarId: 'pulse' }
const karim: NewAccount = { email: 'karim@example.com', passwordHash: 'scrypt$hash-of-karim', pseudo: 'Karim', avatarId: 'moss' }
const tokenHash = (text: string) => createHash('sha256').update(text).digest()
/** What a session lookup gives back: the account without its password hash. */
const summary = ({ passwordHash: _hash, ...rest }: StoredAccount) => rest
const NOW = new Date('2026-10-23T20:00:00Z')
const hours = (count: number) => new Date(NOW.getTime() + count * 3_600_000)

export function describeAccountStoreContract(name: string, open: () => Promise<StoreUnderTest | null>) {
  describe(name, () => {
    /** Runs a test on an empty store, or skips it when there is no store to test (no database on this machine). */
    function test(title: string, body: (store: AccountStore) => Promise<void>) {
      it(title, async (t: TestContext) => {
        const under = await open()
        if (!under) return t.skip('pas de base de test : npm run db:setup')
        await under.reset()
        await body(under.store)
      })
    }

    test('creates an account and finds it by e-mail, with what was given', async (store) => {
      const created = await store.create(nina)
      assert.equal(created.ok, true)
      if (!created.ok) return
      assert.match(created.account.id, /^[0-9a-f-]{36}$/)
      assert.deepEqual({ ...created.account, id: undefined }, { ...nina, id: undefined })
      assert.deepEqual(await store.findByEmail('nina@example.com'), created.account)
    })

    test('finds nobody for an e-mail that has no account', async (store) => {
      await store.create(nina)
      assert.equal(await store.findByEmail('nobody@example.com'), null)
    })

    test('gives each account its own id', async (store) => {
      const first = await store.create(nina)
      const second = await store.create(karim)
      assert.ok(first.ok && second.ok)
      if (first.ok && second.ok) assert.notEqual(first.account.id, second.account.id)
    })

    test('refuses an e-mail that is taken, and creates nothing', async (store) => {
      await store.create(nina)
      assert.deepEqual(await store.create({ ...karim, email: nina.email }), { ok: false, error: 'email-taken' })
      assert.equal(await store.isPseudoTaken('Karim'), false, 'the refused account left no trace')
    })

    test('refuses a pseudo that is taken, whatever the case, and creates nothing', async (store) => {
      await store.create(nina)
      assert.deepEqual(await store.create({ ...karim, pseudo: 'nina_b' }), { ok: false, error: 'pseudo-taken' })
      assert.deepEqual(await store.create({ ...karim, pseudo: 'NINA_B' }), { ok: false, error: 'pseudo-taken' })
      assert.equal(await store.findByEmail(karim.email), null)
    })

    test('calls it the e-mail when both the e-mail and the pseudo are taken', async (store) => {
      await store.create(nina)
      assert.deepEqual(await store.create(nina), { ok: false, error: 'email-taken' })
    })

    test('tells whether a pseudo is taken, without looking at the case', async (store) => {
      await store.create(nina)
      assert.equal(await store.isPseudoTaken('Nina_B'), true)
      assert.equal(await store.isPseudoTaken('NINA_b'), true)
      assert.equal(await store.isPseudoTaken('Nina_C'), false)
    })

    test('keeps pseudos with accents and emoji apart from the plain ones', async (store) => {
      await store.create({ ...nina, pseudo: 'Zoé 🎧' })
      assert.equal(await store.isPseudoTaken('ZOÉ 🎧'), true)
      assert.equal(await store.isPseudoTaken('Zoe 🎧'), false)
    })

    test('lets two people register at the same moment with the same e-mail: one wins, the other is told', async (store) => {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) => store.create({ ...karim, pseudo: `Karim${i}` })),
      )
      assert.equal(results.filter((result) => result.ok).length, 1)
      assert.ok(results.filter((result) => !result.ok).every((result) => !result.ok && result.error === 'email-taken'))
    })

    test('lets two people register at the same moment with the same pseudo: one wins, the other is told', async (store) => {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) => store.create({ ...karim, email: `k${i}@example.com`, pseudo: i % 2 ? 'KARIM' : 'karim' })),
      )
      assert.equal(results.filter((result) => result.ok).length, 1)
      assert.ok(results.filter((result) => !result.ok).every((result) => !result.ok && result.error === 'pseudo-taken'))
    })

    test('finds the account behind a session, until the session expires', async (store) => {
      const created = await store.create(nina)
      assert.ok(created.ok)
      if (!created.ok) return
      await store.createSession(created.account.id, tokenHash('one'), hours(1))
      assert.deepEqual(await store.findBySession(tokenHash('one'), NOW), summary(created.account))
      assert.deepEqual(await store.findBySession(tokenHash('one'), hours(0.99)), summary(created.account))
      assert.equal(await store.findBySession(tokenHash('one'), hours(1)), null, 'expired at the very moment it ends')
      assert.equal(await store.findBySession(tokenHash('one'), hours(2)), null)
    })

    test('never gives the password hash back with a session lookup', async (store) => {
      const created = await store.create(nina)
      assert.ok(created.ok)
      if (!created.ok) return
      await store.createSession(created.account.id, tokenHash('one'), hours(1))
      const found = await store.findBySession(tokenHash('one'), NOW)
      assert.ok(found)
      assert.equal('passwordHash' in found, false)
      assert.equal(JSON.stringify(found).includes('hash-of-nina'), false)
    })

    test('knows nothing of a session that was never opened', async (store) => {
      await store.create(nina)
      assert.equal(await store.findBySession(tokenHash('never'), NOW), null)
    })

    test('keeps sessions apart: each opens its own account', async (store) => {
      const a = await store.create(nina)
      const b = await store.create(karim)
      assert.ok(a.ok && b.ok)
      if (!a.ok || !b.ok) return
      await store.createSession(a.account.id, tokenHash('a'), hours(1))
      await store.createSession(b.account.id, tokenHash('b'), hours(1))
      await store.createSession(a.account.id, tokenHash('a2'), hours(1))
      assert.equal((await store.findBySession(tokenHash('a'), NOW))?.pseudo, 'Nina_B')
      assert.equal((await store.findBySession(tokenHash('b'), NOW))?.pseudo, 'Karim')
      assert.equal((await store.findBySession(tokenHash('a2'), NOW))?.pseudo, 'Nina_B')
    })

    test('ends a session on demand, and only that one', async (store) => {
      const a = await store.create(nina)
      assert.ok(a.ok)
      if (!a.ok) return
      await store.createSession(a.account.id, tokenHash('one'), hours(1))
      await store.createSession(a.account.id, tokenHash('two'), hours(1))
      await store.deleteSession(tokenHash('one'))
      assert.equal(await store.findBySession(tokenHash('one'), NOW), null)
      assert.ok(await store.findBySession(tokenHash('two'), NOW))
      await store.deleteSession(tokenHash('one')) // again: nothing to do, no error
    })

    test('removes the expired sessions and says how many, leaving the others', async (store) => {
      const a = await store.create(nina)
      assert.ok(a.ok)
      if (!a.ok) return
      await store.createSession(a.account.id, tokenHash('old1'), hours(-2))
      await store.createSession(a.account.id, tokenHash('old2'), hours(-1))
      await store.createSession(a.account.id, tokenHash('edge'), NOW)
      await store.createSession(a.account.id, tokenHash('live'), hours(1))
      assert.equal(await store.deleteExpiredSessions(NOW), 3)
      assert.equal(await store.deleteExpiredSessions(NOW), 0)
      assert.ok(await store.findBySession(tokenHash('live'), NOW))
    })

    test('refuses to open a session for an account that does not exist', async (store) => {
      await assert.rejects(store.createSession('00000000-0000-4000-8000-000000000000', tokenHash('x'), hours(1)))
    })
  })
}
