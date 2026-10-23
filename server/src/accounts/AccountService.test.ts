import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { AccountService, type AccountServiceOptions, type Granted, type Refusal } from './AccountService'
import { MemoryAccountStore } from './MemoryAccountStore'

// Cheap hashes, and a clock the tests move by hand.
const CHEAP = { N: 1024, r: 8, p: 1 }
const START = 1_700_000_000_000
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

const nina = { email: 'nina@example.com', password: 'a long enough password', pseudo: 'Nina_B', avatarId: 'pulse' }

let clock: number
let store: MemoryAccountStore

function newService(options: AccountServiceOptions = {}) {
  return new AccountService(store, { cost: CHEAP, now: () => clock, ...options })
}

function granted(result: Granted | Refusal): Granted {
  assert.equal(result.ok, true, JSON.stringify(result))
  return result as Granted
}

function refused(result: Granted | Refusal): Refusal {
  assert.equal(result.ok, false)
  return result as Refusal
}

beforeEach(() => {
  clock = START
  store = new MemoryAccountStore()
})

describe('registering', () => {
  it('creates the account and signs it in', async () => {
    const service = newService()
    const result = granted(await service.register(nina, '1.1.1.1'))
    assert.deepEqual(result.account, { email: 'nina@example.com', pseudo: 'Nina_B', avatarId: 'pulse' })
    assert.equal(result.maxAgeSec, 30 * 24 * 3600)
    const behind = await service.accountForToken(result.token)
    assert.equal(behind?.pseudo, 'Nina_B')
  })

  it('keeps the e-mail in lower case and the password only as a hash', async () => {
    const service = newService()
    granted(await service.register({ ...nina, email: '  Nina@Example.COM ' }, '1.1.1.1'))
    const stored = await store.findByEmail('nina@example.com')
    assert.ok(stored)
    assert.match(stored.passwordHash, /^scrypt\$/)
    assert.equal(stored.passwordHash.includes(nina.password), false)
  })

  it('says what is wrong, field by field', async () => {
    const service = newService()
    const cases: [unknown, string][] = [
      [null, 'bad-request'],
      ['nina', 'bad-request'],
      [['x'], 'bad-request'],
      [{ ...nina, email: 'nina' }, 'invalid-email'],
      [{ ...nina, email: 42 }, 'invalid-email'],
      [{ ...nina, pseudo: 'x' }, 'invalid-pseudo'],
      [{ ...nina, pseudo: 'Ni​na' }, 'invalid-pseudo'],
      [{ ...nina, avatarId: 'robot' }, 'invalid-avatar'],
      [{ ...nina, avatarId: undefined }, 'invalid-avatar'],
      [{ ...nina, password: 'short' }, 'weak-password'],
      [{ ...nina, password: 123456789012 }, 'weak-password'],
    ]
    for (const [input, error] of cases) assert.equal(refused(await service.register(input, '1.1.1.1')).error, error, JSON.stringify(input))
    assert.equal(await store.findByEmail('nina@example.com'), null, 'nothing was created')
  })

  it('does not count against the limit what it refuses before any hashing', async () => {
    const service = newService({ limits: { registerPerIp: { max: 2, windowMs: 60 * MINUTE } } })
    for (let i = 0; i < 20; i += 1) await service.register({ ...nina, password: 'short' }, '1.1.1.1')
    granted(await service.register(nina, '1.1.1.1'))
  })

  it('refuses an e-mail or a pseudo that is taken, whatever the case, and creates nothing', async () => {
    const service = newService()
    granted(await service.register(nina, '1.1.1.1'))
    assert.equal(refused(await service.register({ ...nina, pseudo: 'Autre' }, '1.1.1.1')).error, 'email-taken')
    assert.equal(refused(await service.register({ ...nina, email: 'NINA@EXAMPLE.COM', pseudo: 'Autre' }, '1.1.1.1')).error, 'email-taken')
    assert.equal(refused(await service.register({ ...nina, email: 'other@example.com', pseudo: 'nina_b' }, '1.1.1.1')).error, 'pseudo-taken')
    assert.equal(refused(await service.register({ ...nina, email: 'other@example.com', pseudo: 'ＮＩＮＡ_Ｂ' }, '1.1.1.1')).error, 'pseudo-taken', 'full-width look-alike')
    assert.equal(await store.findByEmail('other@example.com'), null)
  })

  it('limits how many accounts one address can open', async () => {
    const service = newService({ limits: { registerPerIp: { max: 2, windowMs: 60 * MINUTE } } })
    granted(await service.register({ ...nina, email: 'a@example.com', pseudo: 'Aa' }, '1.1.1.1'))
    granted(await service.register({ ...nina, email: 'b@example.com', pseudo: 'Bb' }, '1.1.1.1'))
    const third = refused(await service.register({ ...nina, email: 'c@example.com', pseudo: 'Cc' }, '1.1.1.1'))
    assert.equal(third.error, 'rate-limited')
    assert.ok(third.error === 'rate-limited' && third.retryAfterSec > 0 && third.retryAfterSec <= 3600)
    granted(await service.register({ ...nina, email: 'c@example.com', pseudo: 'Cc' }, '2.2.2.2'))
    clock += 61 * MINUTE
    granted(await service.register({ ...nina, email: 'd@example.com', pseudo: 'Dd' }, '1.1.1.1'))
  })

  it('refuses a pseudo that would pass for the team, as a pseudo that is taken', async () => {
    const service = newService()
    for (const pseudo of ['Admin', 'modérateur', 'Noctune_', 'support2']) {
      assert.equal(refused(await service.register({ ...nina, pseudo }, '1.1.1.1')).error, 'pseudo-taken', pseudo)
    }
    assert.equal(await store.findByEmail(nina.email), null, 'nothing was created')
  })

  it('has a gate: too many passwords at once and it says it is busy, before touching the database', async () => {
    const service = newService({ registerSlots: { running: 1, waiting: 0 } })
    const [first, second] = await Promise.all([
      service.register(nina, '1.1.1.1'),
      service.register({ ...nina, email: 'b@example.com', pseudo: 'Bb' }, '2.2.2.2'),
    ])
    const results = [first, second]
    assert.equal(results.filter((result) => result.ok).length, 1)
    assert.equal(refused(results.find((result) => !result.ok)!).error, 'busy')
  })
})

describe('signing in', () => {
  it('opens a session with the right password', async () => {
    const service = newService()
    granted(await service.register(nina, '1.1.1.1'))
    const result = granted(await service.login({ email: 'NINA@example.com', password: nina.password }, '1.1.1.1'))
    assert.equal(result.account.pseudo, 'Nina_B')
    assert.equal((await service.accountForToken(result.token))?.email, 'nina@example.com')
  })

  it('gives each sign-in its own session', async () => {
    const service = newService()
    granted(await service.register(nina, '1.1.1.1'))
    const first = granted(await service.login({ email: nina.email, password: nina.password }, '1.1.1.1'))
    const second = granted(await service.login({ email: nina.email, password: nina.password }, '1.1.1.1'))
    assert.notEqual(first.token, second.token)
    await service.logout(first.token)
    assert.equal(await service.accountForToken(first.token), null)
    assert.ok(await service.accountForToken(second.token), 'the other session is untouched')
  })

  it('says the same thing for a wrong password, an unknown e-mail and something that is not an e-mail', async () => {
    const service = newService()
    granted(await service.register(nina, '1.1.1.1'))
    const wrong = refused(await service.login({ email: nina.email, password: 'not the password!' }, '1.1.1.1'))
    const unknown = refused(await service.login({ email: 'nobody@example.com', password: 'not the password!' }, '1.1.1.1'))
    const shapeless = refused(await service.login({ email: 'nobody', password: 'not the password!' }, '1.1.1.1'))
    assert.deepEqual([wrong, unknown, shapeless], Array(3).fill({ ok: false, error: 'bad-credentials' }))
  })

  it('refuses what is not a sign-in request', async () => {
    const service = newService()
    for (const input of [null, 'x', { email: nina.email }, { email: nina.email, password: 12 }]) {
      assert.equal(refused(await service.login(input, '1.1.1.1')).error, 'bad-request', JSON.stringify(input))
    }
  })

  it('stops guessing from one address: after enough wrong passwords for one e-mail, even the right one waits', async () => {
    const service = newService({ limits: { loginFailuresPerAddress: { max: 3, windowMs: 15 * MINUTE } } })
    granted(await service.register(nina, '1.1.1.1'))
    for (let i = 0; i < 3; i += 1) {
      assert.equal(refused(await service.login({ email: nina.email, password: `wrong password ${i}` }, '9.9.9.9')).error, 'bad-credentials')
    }
    const blocked = refused(await service.login({ email: nina.email, password: nina.password }, '9.9.9.9'))
    assert.equal(blocked.error, 'rate-limited')
    assert.ok(blocked.error === 'rate-limited' && blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 15 * 60)

    clock += 16 * MINUTE
    granted(await service.login({ email: nina.email, password: nina.password }, '9.9.9.9'))
  })

  it('does not let somebody who types an e-mail they do not own lock its owner out from another address', async () => {
    const service = newService({ limits: { loginFailuresPerAddress: { max: 3, windowMs: 15 * MINUTE } } })
    granted(await service.register(nina, '1.1.1.1'))
    for (let i = 0; i < 10; i += 1) await service.login({ email: nina.email, password: `guess ${i} of somebody else` }, '6.6.6.6')
    assert.equal(refused(await service.login({ email: nina.email, password: 'one more guess!!' }, '6.6.6.6')).error, 'rate-limited', 'the one who guesses is held')
    granted(await service.login({ email: nina.email, password: nina.password }, '7.7.7.7'))
  })

  it('caps guessing that is spread over many addresses, with a ceiling for the e-mail', async () => {
    const service = newService({ limits: { loginFailuresPerEmail: { max: 4, windowMs: 15 * MINUTE } } })
    granted(await service.register(nina, '1.1.1.1'))
    for (let i = 0; i < 4; i += 1) await service.login({ email: nina.email, password: `wrong password ${i}` }, `10.0.0.${i}`)
    assert.equal(refused(await service.login({ email: nina.email, password: nina.password }, '10.0.0.99')).error, 'rate-limited')
    clock += 16 * MINUTE
    granted(await service.login({ email: nina.email, password: nina.password }, '10.0.0.99'))
  })

  it('does not let one e-mail’s failures block another', async () => {
    const service = newService({ limits: { loginFailuresPerAddress: { max: 2, windowMs: 15 * MINUTE } } })
    granted(await service.register(nina, '1.1.1.1'))
    granted(await service.register({ ...nina, email: 'other@example.com', pseudo: 'Other' }, '1.1.1.1'))
    for (let i = 0; i < 2; i += 1) await service.login({ email: nina.email, password: 'wrong password!!' }, '1.1.1.1')
    assert.equal(refused(await service.login({ email: nina.email, password: nina.password }, '1.1.1.1')).error, 'rate-limited')
    granted(await service.login({ email: 'other@example.com', password: nina.password }, '1.1.1.1'))
  })

  it('forgets the failures once the right password is given', async () => {
    const service = newService({ limits: { loginFailuresPerAddress: { max: 3, windowMs: 15 * MINUTE } } })
    granted(await service.register(nina, '1.1.1.1'))
    for (let round = 0; round < 3; round += 1) {
      await service.login({ email: nina.email, password: 'wrong password 1' }, '1.1.1.1')
      await service.login({ email: nina.email, password: 'wrong password 2' }, '1.1.1.1')
      granted(await service.login({ email: nina.email, password: nina.password }, '1.1.1.1'))
    }
  })

  it('counts a wrong password before it is checked, so that a burst of them cannot all be tried', async () => {
    const service = newService({ limits: { loginFailuresPerAddress: { max: 3, windowMs: 15 * MINUTE } } })
    granted(await service.register(nina, '1.1.1.1'))
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => service.login({ email: nina.email, password: `wrong password ${i}` }, '5.5.5.5')),
    )
    const errors = results.map((result) => refused(result).error)
    assert.equal(errors.filter((error) => error === 'bad-credentials').length, 3, 'only three were tried')
    assert.equal(errors.filter((error) => error === 'rate-limited').length, 9)
  })

  it('does not hold against the owner a sign-in that was never tried because the server was busy', async () => {
    const service = newService({
      hashSlots: { running: 1, waiting: 0 },
      limits: { loginFailuresPerAddress: { max: 2, windowMs: 15 * MINUTE } },
    })
    granted(await service.register(nina, '1.1.1.1'))
    const results = await Promise.all([
      service.login({ email: nina.email, password: 'wrong password a' }, '5.5.5.5'),
      service.login({ email: nina.email, password: 'wrong password b' }, '5.5.5.5'),
    ])
    assert.deepEqual(results.map((result) => refused(result).error).sort(), ['bad-credentials', 'busy'])
    // One real failure so far: a second one is still tried, the third is not.
    assert.equal(refused(await service.login({ email: nina.email, password: 'wrong password c' }, '5.5.5.5')).error, 'bad-credentials')
    assert.equal(refused(await service.login({ email: nina.email, password: 'wrong password d' }, '5.5.5.5')).error, 'rate-limited')
  })

  it('limits the attempts of one address, whatever the e-mail', async () => {
    const service = newService({ limits: { loginPerIp: { max: 3, windowMs: 15 * MINUTE } } })
    for (let i = 0; i < 3; i += 1) await service.login({ email: `nobody${i}@example.com`, password: 'wrong password!!' }, '1.1.1.1')
    assert.equal(refused(await service.login({ email: 'nobody9@example.com', password: 'wrong password!!' }, '1.1.1.1')).error, 'rate-limited')
    assert.equal(refused(await service.login({ email: 'nobody9@example.com', password: 'wrong password!!' }, '2.2.2.2')).error, 'bad-credentials')
  })

  it('has a gate here too', async () => {
    const service = newService({ hashSlots: { running: 1, waiting: 0 } })
    granted(await service.register(nina, '1.1.1.1'))
    const results = await Promise.all([
      service.login({ email: nina.email, password: nina.password }, '1.1.1.1'),
      service.login({ email: nina.email, password: nina.password }, '2.2.2.2'),
    ])
    assert.equal(results.filter((result) => result.ok).length, 1)
    assert.equal(refused(results.find((result) => !result.ok)!).error, 'busy')
  })
})

describe('sessions', () => {
  it('end by themselves after 30 days', async () => {
    const service = newService()
    const { token } = granted(await service.register(nina, '1.1.1.1'))
    clock += 30 * DAY - 1
    assert.ok(await service.accountForToken(token))
    clock += 1
    assert.equal(await service.accountForToken(token), null)
  })

  it('end on sign-out, and signing out twice is harmless', async () => {
    const service = newService()
    const { token } = granted(await service.register(nina, '1.1.1.1'))
    await service.logout(token)
    assert.equal(await service.accountForToken(token), null)
    await service.logout(token)
    await service.logout(undefined)
  })

  it('open nothing for an unknown, missing or made-up token', async () => {
    const service = newService()
    granted(await service.register(nina, '1.1.1.1'))
    for (const token of [undefined, '', 'x'.repeat(43), 'not a token']) assert.equal(await service.accountForToken(token), null)
  })

  it('are removed when expired by the housekeeping, and only then', async () => {
    const service = newService()
    const old = granted(await service.register(nina, '1.1.1.1'))
    clock += 20 * DAY
    const recent = granted(await service.login({ email: nina.email, password: nina.password }, '1.1.1.1'))
    clock += 11 * DAY
    await service.sweep()
    assert.equal(await service.accountForToken(old.token), null)
    assert.ok(await service.accountForToken(recent.token))
  })
})

describe('housekeeping', () => {
  it('forgets the counters of attempts that are over, without touching the sessions', async () => {
    const service = newService({ limits: { loginPerIp: { max: 1, windowMs: MINUTE } } })
    const { token } = granted(await service.register(nina, '1.1.1.1'))
    await service.login({ email: 'nobody@example.com', password: 'wrong password!!' }, '2.2.2.2')
    assert.equal(refused(await service.login({ email: 'nobody@example.com', password: 'wrong password!!' }, '2.2.2.2')).error, 'rate-limited')
    clock += 2 * MINUTE
    service.sweepLimits()
    assert.equal(refused(await service.login({ email: 'nobody@example.com', password: 'wrong password!!' }, '2.2.2.2')).error, 'bad-credentials')
    assert.ok(await service.accountForToken(token), 'the session is still there')
  })
})

describe('reserved pseudos', () => {
  it('are the pseudos of the members, whatever the case', async () => {
    const service = newService()
    granted(await service.register(nina, '1.1.1.1'))
    assert.equal(await service.isPseudoReserved('Nina_B'), true)
    assert.equal(await service.isPseudoReserved('NINA_b'), true)
    assert.equal(await service.isPseudoReserved('Nina_C'), false)
  })
})
