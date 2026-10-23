import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_COST, hashPassword, verifyPassword } from './passwords'

// Cheap enough to run many times: the real cost takes a few tenths of a second.
const CHEAP = { N: 1024, r: 8, p: 1 }

describe('passwords', () => {
  it('accepts the right password and refuses a wrong one', async () => {
    const stored = await hashPassword('correct horse battery', CHEAP)
    assert.equal(await verifyPassword('correct horse battery', stored), true)
    assert.equal(await verifyPassword('correct horse batterz', stored), false)
    assert.equal(await verifyPassword('', stored), false)
  })

  it('never stores the password, and gives a different hash each time (random salt)', async () => {
    const first = await hashPassword('correct horse battery', CHEAP)
    const second = await hashPassword('correct horse battery', CHEAP)
    assert.notEqual(first, second)
    assert.match(first, /^scrypt\$1024\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/)
    assert.equal(first.includes('correct horse battery'), false)
  })

  it('works with the real cost, which asks for more memory than Node allows by default', async () => {
    const stored = await hashPassword('correct horse battery')
    assert.ok(stored.startsWith(`scrypt$${DEFAULT_COST.N}$${DEFAULT_COST.r}$${DEFAULT_COST.p}$`))
    assert.equal(await verifyPassword('correct horse battery', stored), true)
    assert.equal(await verifyPassword('another password!!', stored), false)
  })

  it('checks a hash with the cost it was made with, so that the cost can be raised later', async () => {
    const old = await hashPassword('correct horse battery', { N: 512, r: 8, p: 1 })
    assert.equal(await verifyPassword('correct horse battery', old), true)
  })

  it('gives the same hash input for the same password typed another way (Unicode normalisation)', async () => {
    const stored = await hashPassword('mot de passe n°1 ！！！', CHEAP)
    assert.equal(await verifyPassword('mot de passe n°1 !!!', stored), true)
  })

  it('answers false, without throwing, to anything that is not a hash of ours', async () => {
    const good = await hashPassword('correct horse battery', CHEAP)
    const [scheme, n, r, p, salt, key] = good.split('$')
    const broken = [
      '',
      'x',
      'plaintext password',
      'bcrypt$1024$8$1$c2FsdA==$a2V5',
      [scheme, n, r, p, salt].join('$'),
      [scheme, n, r, p, salt, key, 'extra'].join('$'),
      [scheme, '1000', r, p, salt, key].join('$'), // not a power of two
      [scheme, '0', r, p, salt, key].join('$'),
      [scheme, 'abc', r, p, salt, key].join('$'),
      [scheme, n, '0', p, salt, key].join('$'),
      [scheme, n, r, '0', salt, key].join('$'),
      [scheme, n, r, p, '', key].join('$'),
      [scheme, n, r, p, salt, 'c2hvcnQ='].join('$'), // key of the wrong length
    ]
    for (const stored of broken) assert.equal(await verifyPassword('correct horse battery', stored), false, stored)
  })

  it('refuses a hash that asks for a cost no honest hash has, instead of allocating gigabytes', async () => {
    const good = await hashPassword('correct horse battery', CHEAP)
    const [scheme, , r, p, salt, key] = good.split('$')
    const started = Date.now()
    for (const n of [String(2 ** 30), String(2 ** 20), String(2 ** 18)]) {
      assert.equal(await verifyPassword('correct horse battery', [scheme, n, r, p, salt, key].join('$')), false)
    }
    assert.equal(await verifyPassword('correct horse battery', [scheme, '1024', '64', p, salt, key].join('$')), false)
    assert.ok(Date.now() - started < 1000, 'refused at once')
  })

  it('refuses a key that was changed by one bit', async () => {
    const good = await hashPassword('correct horse battery', CHEAP)
    const parts = good.split('$')
    const key = Buffer.from(parts[5], 'base64')
    key[0] ^= 1
    parts[5] = key.toString('base64')
    assert.equal(await verifyPassword('correct horse battery', parts.join('$')), false)
  })
})
