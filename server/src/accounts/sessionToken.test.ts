import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'
import { clearedSessionCookie, hashToken, newSessionToken, readSessionToken, sessionCookie, SESSION_COOKIE } from './sessionToken'

describe('session token', () => {
  it('is 43 random characters, and different every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newSessionToken().token))
    assert.equal(tokens.size, 50)
    for (const token of tokens) assert.match(token, /^[A-Za-z0-9_-]{43}$/)
  })

  it('is stored as its SHA-256 only', () => {
    const { token, hash } = newSessionToken()
    assert.deepEqual(hash, createHash('sha256').update(token).digest())
    assert.deepEqual(hashToken(token), hash)
    assert.equal(hash.toString('base64url').includes(token), false)
  })
})

describe('reading the cookie', () => {
  const { token } = newSessionToken()

  it('finds the token among other cookies', () => {
    assert.equal(readSessionToken(`${SESSION_COOKIE}=${token}`), token)
    assert.equal(readSessionToken(`theme=dark; ${SESSION_COOKIE}=${token}; other=1`), token)
    assert.equal(readSessionToken(`  a=b ;   ${SESSION_COOKIE} = ${token}  `), token)
  })

  it('finds nothing where there is nothing, or something that cannot be ours', () => {
    assert.equal(readSessionToken(undefined), undefined)
    assert.equal(readSessionToken(''), undefined)
    assert.equal(readSessionToken('theme=dark'), undefined)
    assert.equal(readSessionToken(`${SESSION_COOKIE}=`), undefined)
    assert.equal(readSessionToken(`${SESSION_COOKIE}=short`), undefined)
    assert.equal(readSessionToken(`${SESSION_COOKIE}=${token}extra`), undefined)
    assert.equal(readSessionToken(`${SESSION_COOKIE}=${token.slice(0, 42)}!`), undefined)
    assert.equal(readSessionToken(`not_${SESSION_COOKIE}=${token}`), undefined)
  })
})

describe('writing the cookie', () => {
  const { token } = newSessionToken()

  it('keeps scripts and other sites away from it', () => {
    const cookie = sessionCookie(token, 3600, { secure: false })
    assert.ok(cookie.startsWith(`${SESSION_COOKIE}=${token};`))
    for (const attribute of ['HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=3600']) assert.ok(cookie.includes(attribute), attribute)
    assert.equal(cookie.includes('Secure'), false)
  })

  it('adds Secure when the site is served over HTTPS', () => {
    assert.ok(sessionCookie(token, 3600, { secure: true }).endsWith('; Secure'))
    assert.ok(clearedSessionCookie({ secure: true }).endsWith('; Secure'))
  })

  it('can be taken back: empty, and already expired', () => {
    const cookie = clearedSessionCookie({ secure: false })
    assert.ok(cookie.startsWith(`${SESSION_COOKIE}=;`))
    assert.ok(cookie.includes('Max-Age=0'))
    assert.ok(cookie.includes('HttpOnly'))
  })
})
