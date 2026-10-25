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
const summary = ({ passwordHash: _hash, createdAt: _created, ...rest }: StoredAccount) => rest
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
      assert.deepEqual({ ...created.account, id: undefined, createdAt: undefined }, { ...nina, id: undefined, createdAt: undefined })
      assert.ok(created.account.createdAt instanceof Date && Math.abs(created.account.createdAt.getTime() - Date.now()) < 60_000, 'made just now')
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

    const NOBODY = '00000000-0000-4000-8000-000000000000'

    test('finds an account by id, with its password hash, and nobody for an id that is not one', async (store) => {
      const created = await store.create(nina)
      assert.ok(created.ok)
      if (!created.ok) return
      assert.deepEqual(await store.findById(created.account.id), created.account)
      assert.equal(await store.findById(NOBODY), null)
      assert.equal(await store.findById('not an id'), null)
    })

    test('changes the avatar, the pseudo or both, and gives the account back as it is now', async (store) => {
      const created = await store.create(nina)
      assert.ok(created.ok)
      if (!created.ok) return
      const id = created.account.id
      assert.deepEqual(await store.updateProfile(id, { avatarId: 'mango' }), { ok: true, account: { id, email: nina.email, pseudo: 'Nina_B', avatarId: 'mango' } })
      assert.deepEqual(await store.updateProfile(id, { pseudo: 'Nina2' }), { ok: true, account: { id, email: nina.email, pseudo: 'Nina2', avatarId: 'mango' } })
      assert.deepEqual(await store.updateProfile(id, { pseudo: 'Nina3', avatarId: 'moss' }), { ok: true, account: { id, email: nina.email, pseudo: 'Nina3', avatarId: 'moss' } })
      assert.equal((await store.findById(id))?.pseudo, 'Nina3')
      assert.equal(await store.isPseudoTaken('nina3'), true, 'the new pseudo is the one that counts')
      assert.equal(await store.isPseudoTaken('Nina_B'), false, 'and the old one is free')
    })

    test('refuses a pseudo that another account has (in any case), changes nothing, but lets an account change its own case', async (store) => {
      const a = await store.create(nina)
      const b = await store.create(karim)
      assert.ok(a.ok && b.ok)
      if (!a.ok || !b.ok) return
      assert.deepEqual(await store.updateProfile(a.account.id, { pseudo: 'KARIM', avatarId: 'cloud' }), { ok: false, error: 'pseudo-taken' })
      const unchanged = await store.findById(a.account.id)
      assert.deepEqual([unchanged?.pseudo, unchanged?.avatarId], ['Nina_B', 'pulse'], 'neither the pseudo nor the avatar moved')
      assert.deepEqual(await store.updateProfile(a.account.id, { pseudo: 'NINA_B' }), { ok: true, account: { id: a.account.id, email: nina.email, pseudo: 'NINA_B', avatarId: 'pulse' } })
    })

    test('says so when the account to change does not exist', async (store) => {
      assert.deepEqual(await store.updateProfile(NOBODY, { avatarId: 'mango' }), { ok: false, error: 'not-found' })
      assert.deepEqual(await store.updateProfile('not an id', { avatarId: 'mango' }), { ok: false, error: 'not-found' })
      assert.equal(await store.updatePassword(NOBODY, 'scrypt$x'), false)
    })

    test('changes the password hash of that account only', async (store) => {
      const a = await store.create(nina)
      const b = await store.create(karim)
      assert.ok(a.ok && b.ok)
      if (!a.ok || !b.ok) return
      assert.equal(await store.updatePassword(a.account.id, 'scrypt$new'), true)
      assert.equal((await store.findById(a.account.id))?.passwordHash, 'scrypt$new')
      assert.equal((await store.findById(b.account.id))?.passwordHash, karim.passwordHash)
    })

    test('ends every session of one account, or every one but the one kept, and touches no other account', async (store) => {
      const a = await store.create(nina)
      const b = await store.create(karim)
      assert.ok(a.ok && b.ok)
      if (!a.ok || !b.ok) return
      for (const name of ['a1', 'a2', 'a3']) await store.createSession(a.account.id, tokenHash(name), hours(1))
      await store.createSession(b.account.id, tokenHash('b1'), hours(1))

      assert.equal(await store.deleteSessionsForAccount(a.account.id, tokenHash('a2')), 2)
      assert.equal(await store.findBySession(tokenHash('a1'), NOW), null)
      assert.ok(await store.findBySession(tokenHash('a2'), NOW), 'the one kept')
      assert.equal(await store.findBySession(tokenHash('a3'), NOW), null)
      assert.ok(await store.findBySession(tokenHash('b1'), NOW), 'another account is left alone')

      assert.equal(await store.deleteSessionsForAccount(a.account.id), 1)
      assert.equal(await store.findBySession(tokenHash('a2'), NOW), null)
      assert.equal(await store.deleteSessionsForAccount(a.account.id), 0)
      assert.equal(await store.deleteSessionsForAccount(NOBODY), 0)
    })

    test('deletes an account with its sessions, frees its e-mail and its pseudo, and leaves the others', async (store) => {
      const a = await store.create(nina)
      const b = await store.create(karim)
      assert.ok(a.ok && b.ok)
      if (!a.ok || !b.ok) return
      await store.createSession(a.account.id, tokenHash('a1'), hours(1))
      await store.createSession(b.account.id, tokenHash('b1'), hours(1))

      assert.equal(await store.deleteAccount(a.account.id), true)
      assert.equal(await store.findById(a.account.id), null)
      assert.equal(await store.findByEmail(nina.email), null)
      assert.equal(await store.findBySession(tokenHash('a1'), NOW), null)
      assert.equal(await store.isPseudoTaken('Nina_B'), false)
      assert.ok(await store.findBySession(tokenHash('b1'), NOW), 'the other account keeps its session')
      assert.equal(await store.deleteAccount(a.account.id), false, 'again: nothing to delete')
      assert.equal(await store.deleteAccount('not an id'), false)
      assert.equal((await store.create(nina)).ok, true, 'the e-mail and the pseudo can be used again')
    })
  })
}
