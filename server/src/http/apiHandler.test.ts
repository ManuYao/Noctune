import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { MemoryAccountStore } from '../accounts/MemoryAccountStore'
import { api, ORIGIN, startServer, type Started, type StartOptions } from '../testing/startServer'

const nina = { email: 'nina@example.com', password: 'a long enough password', pseudo: 'Nina_B', avatarId: 'pulse' }
const MINUTE = 60_000

let server: Started

async function start(options: StartOptions = {}) {
  server = await startServer(options)
  return server
}

beforeEach(async () => {
  await start()
})

afterEach(async () => {
  mock.restoreAll()
  await server.close()
})

describe('registering and signing in', () => {
  it('registers, answers with the account and nothing more, and signs the visitor in with a cookie', async () => {
    const reply = await api(server.url, '/api/auth/register', { body: nina })
    assert.equal(reply.status, 201)
    assert.deepEqual(reply.body, { ok: true, account: { email: 'nina@example.com', pseudo: 'Nina_B', avatarId: 'pulse' } })
    assert.equal(reply.headers['cache-control'], 'no-store')
    assert.equal(reply.headers['x-content-type-options'], 'nosniff')

    assert.equal(reply.setCookies.length, 1)
    const cookie = reply.setCookies[0]
    assert.match(cookie, /^noctune_session=[A-Za-z0-9_-]{43};/)
    for (const attribute of ['HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${30 * 24 * 3600}`]) assert.ok(cookie.includes(attribute), attribute)
    assert.equal(cookie.includes('Secure'), false, 'plain HTTP in development')

    const me = await api(server.url, '/api/auth/me', { cookie: reply.cookie })
    assert.deepEqual(me.body, { ok: true, account: { email: 'nina@example.com', pseudo: 'Nina_B', avatarId: 'pulse' } })
  })

  it('replaces the session that is still open when somebody signs in over it', async () => {
    const first = await api(server.url, '/api/auth/register', { body: nina })
    const second = await api(server.url, '/api/auth/login', { body: { email: nina.email, password: nina.password }, cookie: first.cookie })
    assert.equal(second.status, 200)
    assert.notEqual(second.cookie, first.cookie)
    assert.deepEqual((await api(server.url, '/api/auth/me', { cookie: first.cookie })).body, { ok: true, account: null })
    assert.equal((await api(server.url, '/api/auth/me', { cookie: second.cookie })).body.account.pseudo, 'Nina_B')
  })

  it('puts Secure on the cookie when the site is served over HTTPS', async () => {
    await server.close()
    await start({ secureCookies: true })
    const reply = await api(server.url, '/api/auth/register', { body: nina })
    assert.ok(reply.setCookies[0].endsWith('; Secure'))
  })

  it('says what is wrong when the registration is refused, and sets no cookie', async () => {
    const cases: [object, number, string][] = [
      [{ ...nina, password: 'short' }, 400, 'weak-password'],
      [{ ...nina, email: 'nina' }, 400, 'invalid-email'],
      [{ ...nina, pseudo: 'x' }, 400, 'invalid-pseudo'],
      [{ ...nina, avatarId: 'robot' }, 400, 'invalid-avatar'],
    ]
    for (const [body, status, error] of cases) {
      const reply = await api(server.url, '/api/auth/register', { body })
      assert.equal(reply.status, status)
      assert.deepEqual(reply.body, { ok: false, error })
      assert.equal(reply.setCookies.length, 0)
    }
  })

  it('answers 409 for an e-mail or a pseudo that is taken', async () => {
    await api(server.url, '/api/auth/register', { body: nina })
    const sameEmail = await api(server.url, '/api/auth/register', { body: { ...nina, pseudo: 'Autre' } })
    assert.equal(sameEmail.status, 409)
    assert.deepEqual(sameEmail.body, { ok: false, error: 'email-taken' })
    const samePseudo = await api(server.url, '/api/auth/register', { body: { ...nina, email: 'other@example.com', pseudo: 'NINA_B' } })
    assert.equal(samePseudo.status, 409)
    assert.deepEqual(samePseudo.body, { ok: false, error: 'pseudo-taken' })
  })

  it('signs in with the right password, and says "bad credentials" the same way whatever is wrong', async () => {
    await api(server.url, '/api/auth/register', { body: nina })
    const wrong = await api(server.url, '/api/auth/login', { body: { email: nina.email, password: 'not the password!' } })
    const unknown = await api(server.url, '/api/auth/login', { body: { email: 'nobody@example.com', password: 'not the password!' } })
    for (const reply of [wrong, unknown]) {
      assert.equal(reply.status, 401)
      assert.deepEqual(reply.body, { ok: false, error: 'bad-credentials' })
      assert.equal(reply.setCookies.length, 0)
    }
    const right = await api(server.url, '/api/auth/login', { body: { email: 'NINA@example.com', password: nina.password } })
    assert.equal(right.status, 200)
    assert.equal(right.body.account.pseudo, 'Nina_B')
    assert.ok(right.cookie?.startsWith('noctune_session='))
  })

  it('tells how long to wait when too many wrong passwords were tried, in the body and in Retry-After', async () => {
    await server.close()
    await start({ service: { limits: { loginFailuresPerEmail: { max: 3, windowMs: 15 * MINUTE } } } })
    await api(server.url, '/api/auth/register', { body: nina })
    for (let i = 0; i < 3; i += 1) await api(server.url, '/api/auth/login', { body: { email: nina.email, password: `wrong password ${i}` } })
    const blocked = await api(server.url, '/api/auth/login', { body: { email: nina.email, password: nina.password } })
    assert.equal(blocked.status, 429)
    assert.equal(blocked.body.error, 'rate-limited')
    assert.ok(blocked.body.retryAfterSec > 0 && blocked.body.retryAfterSec <= 900)
    assert.equal(blocked.headers['retry-after'], String(blocked.body.retryAfterSec))
    assert.equal(blocked.setCookies.length, 0)
  })
})

describe('signing out', () => {
  it('ends the session on the server and takes the cookie back', async () => {
    const { cookie } = await api(server.url, '/api/auth/register', { body: nina })
    const out = await api(server.url, '/api/auth/logout', { method: 'POST', body: {}, cookie })
    assert.equal(out.status, 200)
    assert.deepEqual(out.body, { ok: true })
    assert.ok(out.setCookies[0].includes('Max-Age=0'))

    // The cookie that was sent before is dead for good, even if somebody kept a copy.
    const me = await api(server.url, '/api/auth/me', { cookie })
    assert.deepEqual(me.body, { ok: true, account: null })
  })

  it('is harmless when nobody is signed in', async () => {
    const out = await api(server.url, '/api/auth/logout', { method: 'POST', body: {} })
    assert.equal(out.status, 200)
    assert.deepEqual(out.body, { ok: true })
  })

  it('removes from the browser a cookie that opens nothing any more', async () => {
    const { cookie } = await api(server.url, '/api/auth/register', { body: nina })
    await api(server.url, '/api/auth/logout', { method: 'POST', body: {}, cookie })
    const me = await api(server.url, '/api/auth/me', { cookie })
    assert.ok(me.setCookies[0]?.includes('Max-Age=0'))
    const visitor = await api(server.url, '/api/auth/me')
    assert.equal(visitor.setCookies.length, 0, 'nothing to take back from a visitor')
  })

  it('does not take another person’s session down with it', async () => {
    const first = await api(server.url, '/api/auth/register', { body: nina })
    const second = await api(server.url, '/api/auth/register', { body: { ...nina, email: 'b@example.com', pseudo: 'Bb' } })
    await api(server.url, '/api/auth/logout', { method: 'POST', body: {}, cookie: first.cookie })
    const me = await api(server.url, '/api/auth/me', { cookie: second.cookie })
    assert.equal(me.body.account.pseudo, 'Bb')
  })
})

describe('what the API refuses', () => {
  it('a request that says it comes from another site, on every route, and creates nothing', async () => {
    for (const path of ['/api/auth/register', '/api/auth/login', '/api/auth/logout']) {
      const reply = await api(server.url, path, { body: nina, headers: { origin: 'http://evil.example' } })
      assert.equal(reply.status, 403, path)
      assert.deepEqual(reply.body, { ok: false, error: 'forbidden' })
    }
    const me = await api(server.url, '/api/auth/me', { headers: { origin: 'http://evil.example' } })
    assert.equal(me.status, 403)
    const created = await api(server.url, '/api/auth/login', { body: { email: nina.email, password: nina.password } })
    assert.equal(created.body.error, 'bad-credentials', 'the forbidden registration did not create the account')
  })

  it('a look-alike of the site’s own origin', async () => {
    for (const origin of ['http://localhost:5173.evil.example', 'https://localhost:5173', 'http://localhost:5174', 'null']) {
      const reply = await api(server.url, '/api/auth/register', { body: nina, headers: { origin } })
      assert.equal(reply.status, 403, origin)
    }
  })

  it('a browser that does not send Origin but says the request is cross-site', async () => {
    const crossSite = await api(server.url, '/api/auth/me', { headers: { 'sec-fetch-site': 'cross-site' } })
    assert.equal(crossSite.status, 403)
    const sameSite = await api(server.url, '/api/auth/me', { headers: { 'sec-fetch-site': 'same-site' } })
    assert.equal(sameSite.status, 403, 'a sibling site is not the site')
    for (const site of ['same-origin', 'none']) {
      assert.equal((await api(server.url, '/api/auth/me', { headers: { 'sec-fetch-site': site } })).status, 200, site)
    }
  })

  it('accepts the site’s own origin, and a script that says nothing', async () => {
    const own = await api(server.url, '/api/auth/register', { body: nina, headers: { origin: ORIGIN } })
    assert.equal(own.status, 201)
    const script = await api(server.url, '/api/auth/login', { body: { email: nina.email, password: nina.password }, headers: { origin: '' } })
    assert.equal(script.status, 200)
  })

  it('an e-mail with a NUL or an invisible character: said invalid, not a server error', async () => {
    for (const email of ['a\u0000b@example.com', 'a\u200bb@example.com', '\u202ea@example.com']) {
      const registered = await api(server.url, '/api/auth/register', { body: { ...nina, email } })
      assert.equal(registered.status, 400, JSON.stringify(email))
      assert.deepEqual(registered.body, { ok: false, error: 'invalid-email' })
      const signedIn = await api(server.url, '/api/auth/login', { body: { email, password: nina.password } })
      assert.equal(signedIn.status, 401)
      assert.deepEqual(signedIn.body, { ok: false, error: 'bad-credentials' })
    }
  })

  it('a body that is not JSON by its type (the shape of a form posted from another site)', async () => {
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'application/jsonx']) {
      const reply = await api(server.url, '/api/auth/register', { rawBody: JSON.stringify(nina), headers: { 'content-type': type } })
      assert.equal(reply.status, 415, type)
      assert.deepEqual(reply.body, { ok: false, error: 'bad-request' })
    }
    const none = await api(server.url, '/api/auth/register', { rawBody: JSON.stringify(nina) })
    assert.equal(none.status, 415, 'no type at all')
    const charset = await api(server.url, '/api/auth/register', { rawBody: JSON.stringify(nina), headers: { 'content-type': 'application/json; charset=utf-8' } })
    assert.equal(charset.status, 201, 'a charset is fine')
  })

  it('JSON that is broken, or not an object', async () => {
    const broken = await api(server.url, '/api/auth/register', { rawBody: '{"email": ', headers: { 'content-type': 'application/json' } })
    assert.equal(broken.status, 400)
    for (const body of ['[]', '"nina"', 'null', '42']) {
      const reply = await api(server.url, '/api/auth/register', { rawBody: body, headers: { 'content-type': 'application/json' } })
      assert.equal(reply.status, 400, body)
      assert.deepEqual(reply.body, { ok: false, error: 'bad-request' })
    }
  })

  it('a body that is too big, without reading it to the end', async () => {
    const reply = await api(server.url, '/api/auth/register', { rawBody: JSON.stringify({ ...nina, pseudo: 'x'.repeat(5000) }), headers: { 'content-type': 'application/json' } })
    assert.equal(reply.status, 413)
    assert.equal(reply.headers.connection, 'close')
    // The server is still fine.
    assert.equal((await api(server.url, '/api/auth/register', { body: nina })).status, 201)
  })

  it('the wrong method, with the one that is allowed', async () => {
    const get = await api(server.url, '/api/auth/login', { method: 'GET' })
    assert.equal(get.status, 405)
    assert.equal(get.headers.allow, 'POST')
    const post = await api(server.url, '/api/auth/me', { method: 'POST', body: {} })
    assert.equal(post.status, 405)
    assert.equal(post.headers.allow, 'GET, PATCH, DELETE')
    for (const method of ['PUT', 'DELETE', 'PATCH']) assert.equal((await api(server.url, '/api/auth/login', { method, body: {} })).status, 405, method)
    const put = await api(server.url, '/api/auth/me', { method: 'PUT', body: {} })
    assert.equal(put.status, 405)
  })

  it('a route that does not exist, including the names every object has', async () => {
    for (const path of ['/api/nothing', '/api/auth', '/api/auth/', '/api/auth/me/extra', '/api/constructor', '/api/__proto__', '/api/auth/toString']) {
      const reply = await api(server.url, path)
      assert.equal(reply.status, 404, path)
      assert.deepEqual(reply.body, { ok: false, error: 'bad-request' })
    }
  })

  it('anything that is not under /api', async () => {
    const reply = await api(server.url, '/anything')
    assert.equal(reply.status, 404)
    assert.equal(reply.body, 'Introuvable')
  })

  it('ignores a query string on a route', async () => {
    assert.equal((await api(server.url, '/api/auth/me?x=1')).status, 200)
  })
})

describe('the address of the visitor', () => {
  const attempt = (headers: Record<string, string>) =>
    api(server.url, '/api/auth/login', { body: { email: 'nobody@example.com', password: 'wrong password!!' }, headers })

  it('is the one the connection comes from, so a header cannot be used to dodge the limit', async () => {
    await server.close()
    await start({ service: { limits: { loginPerIp: { max: 2, windowMs: 15 * MINUTE } } } })
    assert.equal((await attempt({ 'x-forwarded-for': '1.1.1.1' })).status, 401)
    assert.equal((await attempt({ 'x-forwarded-for': '2.2.2.2' })).status, 401)
    assert.equal((await attempt({ 'x-forwarded-for': '3.3.3.3' })).status, 429)
  })

  it('is the /64 for an IPv6 visitor: going through the addresses of one connection does not dodge the limit', async () => {
    await server.close()
    await start({ trustedProxies: 1, service: { limits: { loginPerIp: { max: 2, windowMs: 15 * MINUTE } } } })
    assert.equal((await attempt({ 'x-forwarded-for': '2001:db8:1:2::1' })).status, 401)
    assert.equal((await attempt({ 'x-forwarded-for': '2001:db8:1:2:aaaa:bbbb:cccc:dddd' })).status, 401)
    assert.equal((await attempt({ 'x-forwarded-for': '2001:db8:1:2::ffff' })).status, 429, 'the same /64')
    assert.equal((await attempt({ 'x-forwarded-for': '2001:db8:1:3::1' })).status, 401, 'the next /64 is somebody else')
  })

  it('is the second value from the right when two proxies stand in front of the server', async () => {
    await server.close()
    await start({ trustedProxies: 2, service: { limits: { loginPerIp: { max: 1, windowMs: 15 * MINUTE } } } })
    assert.equal((await attempt({ 'x-forwarded-for': '1.1.1.1, 172.16.0.5' })).status, 401)
    assert.equal((await attempt({ 'x-forwarded-for': '9.9.9.9, 1.1.1.1, 172.16.0.5' })).status, 429, 'the visitor is 1.1.1.1 whatever is in front of it')
    assert.equal((await attempt({ 'x-forwarded-for': '2.2.2.2, 172.16.0.5' })).status, 401)
  })

  it('is the last one of X-Forwarded-For behind a proxy, which is the one the proxy wrote', async () => {
    await server.close()
    await start({ trustedProxies: 1, service: { limits: { loginPerIp: { max: 2, windowMs: 15 * MINUTE } } } })
    assert.equal((await attempt({ 'x-forwarded-for': '1.1.1.1' })).status, 401)
    // Whatever the visitor put in front of it does not change who they are.
    assert.equal((await attempt({ 'x-forwarded-for': '9.9.9.9, 1.1.1.1' })).status, 401)
    assert.equal((await attempt({ 'x-forwarded-for': '8.8.8.8, 1.1.1.1' })).status, 429)
    assert.equal((await attempt({ 'x-forwarded-for': '2.2.2.2' })).status, 401, 'somebody else')
  })
})

describe('when something goes wrong on the server', () => {
  it('says only that it was not the visitor’s doing, keeps the details in the log, and keeps serving', async () => {
    const logged = mock.method(console, 'error', () => undefined)
    const store = new MemoryAccountStore()
    store.findByEmail = async () => {
      throw new Error('connection to 10.0.0.5 refused (secret detail)')
    }
    await server.close()
    await start({ store })
    const reply = await api(server.url, '/api/auth/register', { body: nina })
    assert.equal(reply.status, 500)
    assert.deepEqual(reply.body, { ok: false, error: 'server-error' })
    assert.equal(JSON.stringify(reply.body).includes('secret'), false)
    assert.ok(logged.mock.calls.some((call) => String(call.arguments[0]).includes('secret detail')), 'the detail is in the log')
    assert.equal((await api(server.url, '/api/auth/me')).status, 200)
  })
})

describe('a server without a database', () => {
  beforeEach(async () => {
    await server.close()
    await start({ withoutAccounts: true })
  })

  it('cannot register or sign in, and says so', async () => {
    for (const path of ['/api/auth/register', '/api/auth/login']) {
      const reply = await api(server.url, path, { body: nina })
      assert.equal(reply.status, 503, path)
      assert.deepEqual(reply.body, { ok: false, error: 'unavailable' })
    }
  })

  it('does not take the cookie of a returning member away: it knows nothing, and the cookie may be good once the database is back', async () => {
    const reply = await api(server.url, '/api/auth/me', { cookie: `noctune_session=${'a'.repeat(43)}` })
    assert.deepEqual(reply.body, { ok: true, account: null })
    assert.equal(reply.setCookies.length, 0)
  })

  it('still answers "nobody is signed in" and signing out, so that the site works as it does for a visitor', async () => {
    assert.deepEqual((await api(server.url, '/api/auth/me')).body, { ok: true, account: null })
    assert.equal((await api(server.url, '/api/auth/logout', { method: 'POST', body: {} })).status, 200)
  })
})
