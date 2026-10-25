// The member's own account over HTTP: profile, password, signing out everywhere, the copy of their data, and the end of
// the account. Memory stores, real HTTP.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { api, ORIGIN, startServer, type Started, type StartOptions } from '../testing/startServer'

const PASSWORD = 'a long enough password'
const NEXT_PASSWORD = 'another long enough password'
const MINUTE = 60_000
const ROOM = {
  name: 'Rock nocturne',
  description: 'Des guitares la nuit.',
  styles: ['rock'],
  theme: 'sunset',
  rules: { maxTrackSec: 900, repeatDelaySec: 7200, maxDjs: 10 },
}

let server: Started

async function start(options: StartOptions = {}) {
  server = await startServer(options)
  return server
}

afterEach(async () => {
  await server.close()
})

async function signUp(email: string, pseudo: string, avatarId = 'pulse') {
  const reply = await api(server.url, '/api/auth/register', { body: { email, password: PASSWORD, pseudo, avatarId } })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))
  const account = await server.store.findByEmail(email)
  assert.ok(account, 'the account exists')
  return { cookie: reply.cookie as string, id: account.id, email, pseudo }
}

/** A second session of the same account, the way another browser would get one. */
async function signInAgain(email: string, password = PASSWORD) {
  const reply = await api(server.url, '/api/auth/login', { body: { email, password } })
  assert.equal(reply.status, 200, JSON.stringify(reply.body))
  return reply.cookie as string
}

const me = async (cookie: string) => (await api(server.url, '/api/auth/me', { cookie })).body.account
const errorOf = (reply: { body: { error?: string } }) => reply.body.error

describe('changing the profile', () => {
  it('changes the avatar and the pseudo, answers with the account as it is now, and keeps the session', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const avatar = await api(server.url, '/api/auth/me', { method: 'PATCH', cookie: ann.cookie, body: { avatarId: 'mango' } })
    assert.equal(avatar.status, 200)
    assert.deepEqual(avatar.body, { ok: true, account: { email: 'ann@example.com', pseudo: 'Ann', avatarId: 'mango' } })

    const both = await api(server.url, '/api/auth/me', { method: 'PATCH', cookie: ann.cookie, body: { pseudo: 'Anna', avatarId: 'moss' } })
    assert.deepEqual(both.body, { ok: true, account: { email: 'ann@example.com', pseudo: 'Anna', avatarId: 'moss' } })
    assert.deepEqual(await me(ann.cookie), { email: 'ann@example.com', pseudo: 'Anna', avatarId: 'moss' })
    assert.equal(avatar.headers['cache-control'], 'no-store')
  })

  it('refuses what registration refuses: taken (in any case), the team, invisible characters, a bad avatar; and changes nothing', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    await signUp('ben@example.com', 'Ben')
    const attempts: [unknown, number, string][] = [
      [{ pseudo: 'BEN' }, 409, 'pseudo-taken'],
      [{ pseudo: 'Admin' }, 409, 'pseudo-taken'],
      [{ pseudo: 'Noctune2' }, 409, 'pseudo-taken'],
      [{ pseudo: 'A' }, 400, 'invalid-pseudo'],
      [{ pseudo: `Ann${String.fromCodePoint(0x200b)}` }, 400, 'invalid-pseudo'],
      [{ pseudo: 5 }, 400, 'invalid-pseudo'],
      [{ avatarId: 'nobody' }, 400, 'invalid-avatar'],
      [{ pseudo: 'Anna', avatarId: 'nobody' }, 400, 'invalid-avatar'],
      [{}, 400, 'bad-request'],
      [[], 400, 'bad-request'],
    ]
    for (const [body, status, error] of attempts) {
      const reply = await api(server.url, '/api/auth/me', { method: 'PATCH', cookie: ann.cookie, body })
      assert.deepEqual([reply.status, errorOf(reply)], [status, error], JSON.stringify(body))
    }
    assert.deepEqual(await me(ann.cookie), { email: 'ann@example.com', pseudo: 'Ann', avatarId: 'pulse' })
  })

  it('takes nothing but the pseudo and the avatar: not the e-mail, not an id, not a password', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const ben = await signUp('ben@example.com', 'Ben')
    const reply = await api(server.url, '/api/auth/me', {
      method: 'PATCH',
      cookie: ann.cookie,
      body: { avatarId: 'mango', email: 'evil@example.com', id: ben.id, accountId: ben.id, passwordHash: 'x', password: 'x' },
    })
    assert.equal(reply.status, 200)
    assert.equal((await server.store.findById(ann.id))?.email, 'ann@example.com')
    assert.equal((await server.store.findById(ben.id))?.avatarId, 'pulse', 'nobody else was touched')
  })

  it('needs a session: nobody, a made-up cookie and a session that ended are all "not signed in"', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const none = await api(server.url, '/api/auth/me', { method: 'PATCH', body: { avatarId: 'mango' } })
    assert.deepEqual([none.status, errorOf(none)], [401, 'not-signed-in'])
    const forged = await api(server.url, '/api/auth/me', { method: 'PATCH', body: { avatarId: 'mango' }, cookie: `noctune_session=${'a'.repeat(43)}` })
    assert.deepEqual([forged.status, errorOf(forged)], [401, 'not-signed-in'])
    await api(server.url, '/api/auth/logout', { method: 'POST', body: {}, cookie: ann.cookie })
    const ended = await api(server.url, '/api/auth/me', { method: 'PATCH', body: { avatarId: 'mango' }, cookie: ann.cookie })
    assert.deepEqual([ended.status, errorOf(ended)], [401, 'not-signed-in'])
    assert.ok(ended.setCookies[0]?.includes('Max-Age=0'), 'a cookie that opens nothing is removed')
  })

  it('lets the pseudo change three times a day, not four, and a refused pseudo does not use one up', async () => {
    await start({ service: { limits: { pseudoChanges: { max: 3, windowMs: 24 * 60 * MINUTE } } } })
    const ann = await signUp('ann@example.com', 'Ann')
    await signUp('ben@example.com', 'Ben')
    const change = (pseudo: string) => api(server.url, '/api/auth/me', { method: 'PATCH', cookie: ann.cookie, body: { pseudo } })
    assert.equal((await change('Ben')).status, 409, 'refused: costs nothing')
    for (const pseudo of ['Anna', 'Annie', 'Anne']) assert.equal((await change(pseudo)).status, 200, pseudo)
    const fourth = await change('Annabel')
    assert.equal(fourth.status, 429)
    assert.equal(errorOf(fourth), 'rate-limited')
    assert.ok(Number(fourth.headers['retry-after']) > 0)
    assert.equal((await api(server.url, '/api/auth/me', { method: 'PATCH', cookie: ann.cookie, body: { avatarId: 'cloud' } })).status, 200, 'the avatar is free')
  })

  it('refuses a request that does not come from the site, on every new method', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const foreign = { origin: 'http://evil.example' }
    const calls: [string, string, unknown][] = [
      ['PATCH', '/api/auth/me', { avatarId: 'mango' }],
      ['DELETE', '/api/auth/me', { password: PASSWORD }],
      ['POST', '/api/auth/password', { currentPassword: PASSWORD, newPassword: NEXT_PASSWORD }],
      ['POST', '/api/auth/logout-all', {}],
      ['GET', '/api/auth/export', undefined],
    ]
    for (const [method, path, body] of calls) {
      const reply = await api(server.url, path, { method, body, cookie: ann.cookie, headers: foreign })
      assert.deepEqual([reply.status, errorOf(reply)], [403, 'forbidden'], `${method} ${path}`)
      const crossSite = await api(server.url, path, { method, body, cookie: ann.cookie, headers: { 'sec-fetch-site': 'cross-site', origin: '' } })
      assert.equal(crossSite.status, 403, `${method} ${path} cross-site`)
    }
    assert.deepEqual(await me(ann.cookie), { email: 'ann@example.com', pseudo: 'Ann', avatarId: 'pulse' }, 'nothing happened')
  })
})

describe('changing the password', () => {
  it('needs the current password: a wrong one changes nothing, and neither does a missing one', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const wrong = await api(server.url, '/api/auth/password', { cookie: ann.cookie, body: { currentPassword: 'not the password', newPassword: NEXT_PASSWORD } })
    assert.deepEqual([wrong.status, errorOf(wrong)], [403, 'wrong-password'])
    for (const body of [{ newPassword: NEXT_PASSWORD }, { currentPassword: PASSWORD }, { currentPassword: 5, newPassword: NEXT_PASSWORD }, [], 'text']) {
      const reply = await api(server.url, '/api/auth/password', { cookie: ann.cookie, body })
      assert.equal(reply.status, 400, JSON.stringify(body))
    }
    const empty = await api(server.url, '/api/auth/password', { cookie: ann.cookie, body: { currentPassword: '', newPassword: NEXT_PASSWORD } })
    assert.equal(errorOf(empty), 'wrong-password')
    assert.equal((await api(server.url, '/api/auth/login', { body: { email: ann.email, password: PASSWORD } })).status, 200, 'the old password still works')
    assert.equal((await api(server.url, '/api/auth/login', { body: { email: ann.email, password: NEXT_PASSWORD } })).status, 401)
  })

  it('refuses a weak new password without using an attempt, then changes it: the new one signs in, the old one no longer does', async () => {
    await start({ service: { limits: { reauthFailuresPerAccount: { max: 1, windowMs: 15 * MINUTE } } } })
    const ann = await signUp('ann@example.com', 'Ann')
    const weak = await api(server.url, '/api/auth/password', { cookie: ann.cookie, body: { currentPassword: 'wrong', newPassword: 'short' } })
    assert.deepEqual([weak.status, errorOf(weak)], [400, 'weak-password'])
    const done = await api(server.url, '/api/auth/password', { cookie: ann.cookie, body: { currentPassword: PASSWORD, newPassword: NEXT_PASSWORD } })
    assert.deepEqual([done.status, done.body], [200, { ok: true, account: { email: 'ann@example.com', pseudo: 'Ann', avatarId: 'pulse' } }])
    assert.equal((await api(server.url, '/api/auth/login', { body: { email: ann.email, password: NEXT_PASSWORD } })).status, 200)
    assert.equal((await api(server.url, '/api/auth/login', { body: { email: ann.email, password: PASSWORD } })).status, 401)
    assert.ok(!JSON.stringify(done.body).includes('scrypt'), 'no hash in the answer')
  })

  it('keeps the session that asked, ends every other session of the account, and leaves other accounts alone', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const ben = await signUp('ben@example.com', 'Ben')
    const annElsewhere = await signInAgain(ann.email)
    const annAgain = await signInAgain(ann.email)
    const reply = await api(server.url, '/api/auth/password', { cookie: ann.cookie, body: { currentPassword: PASSWORD, newPassword: NEXT_PASSWORD } })
    assert.equal(reply.status, 200)
    assert.equal(reply.setCookies.length, 0, 'the cookie of this session is not touched')
    assert.ok(await me(ann.cookie), 'this session stays')
    assert.equal(await me(annElsewhere), null, 'another browser is signed out')
    assert.equal(await me(annAgain), null)
    assert.ok(await me(ben.cookie), 'another account is left alone')
  })

  it('counts the wrong current passwords per account, then refuses even the right one for a while', async () => {
    await start({ service: { limits: { reauthFailuresPerAccount: { max: 3, windowMs: 15 * MINUTE } } } })
    const ann = await signUp('ann@example.com', 'Ann')
    const ask = (currentPassword: string) => api(server.url, '/api/auth/password', { cookie: ann.cookie, body: { currentPassword, newPassword: NEXT_PASSWORD } })
    for (let attempt = 0; attempt < 3; attempt += 1) assert.equal(errorOf(await ask(`wrong ${attempt}`)), 'wrong-password')
    const blocked = await ask(PASSWORD)
    assert.deepEqual([blocked.status, errorOf(blocked)], [429, 'rate-limited'])
    assert.ok(Number(blocked.headers['retry-after']) > 0)
    assert.equal((await api(server.url, '/api/auth/login', { body: { email: ann.email, password: PASSWORD } })).status, 200, 'nothing changed')
  })

  it('counts the wrong current passwords per address too: one address cannot try them on the accounts it holds sessions for', async () => {
    await start({ service: { limits: { reauthFailuresPerAddress: { max: 2, windowMs: 15 * MINUTE } } } })
    const ann = await signUp('ann@example.com', 'Ann')
    const ben = await signUp('ben@example.com', 'Ben')
    const ask = (cookie: string) => api(server.url, '/api/auth/password', { cookie, body: { currentPassword: 'wrong', newPassword: NEXT_PASSWORD } })
    assert.equal(errorOf(await ask(ann.cookie)), 'wrong-password')
    assert.equal(errorOf(await ask(ben.cookie)), 'wrong-password')
    assert.equal(errorOf(await ask(ann.cookie)), 'rate-limited')
  })
})

describe('signing out everywhere', () => {
  it('ends every session of the account, this one included, clears the cookie, and leaves other accounts alone', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const ben = await signUp('ben@example.com', 'Ben')
    const annElsewhere = await signInAgain(ann.email)
    const reply = await api(server.url, '/api/auth/logout-all', { cookie: ann.cookie, body: {} })
    assert.deepEqual([reply.status, reply.body], [200, { ok: true }])
    assert.ok(reply.setCookies[0]?.includes('Max-Age=0'))
    assert.equal(await me(ann.cookie), null)
    assert.equal(await me(annElsewhere), null)
    assert.ok(await me(ben.cookie))
    const again = await api(server.url, '/api/auth/logout-all', { cookie: ann.cookie, body: {} })
    assert.equal(again.status, 401, 'with no session there is nothing to end')
  })
})

describe('the copy of the member\'s data', () => {
  it('gives the account, the playlists and the rooms hosted as a file, without any hash or token and nobody else\'s data', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const ben = await signUp('ben@example.com', 'Ben')
    assert.equal((await api(server.url, '/api/rooms', { cookie: ann.cookie, body: ROOM })).status, 201)
    assert.equal((await api(server.url, '/api/rooms', { cookie: ben.cookie, body: { ...ROOM, name: 'Salon de Ben' } })).status, 201)
    const playlist = await server.playlistStore!.create(ann.id, 'Chill', 'chill', 20)
    assert.ok(playlist.ok)
    if (!playlist.ok) return
    await server.playlistStore!.addTrack(ann.id, playlist.playlist.id, { videoId: 'aaaaaaaaaa1', title: 'Alpha', artist: 'Artist', durationSec: 200 }, new Date(), 200)
    await server.playlistStore!.create(ben.id, 'Playlist de Ben', 'playlist de ben', 20)

    const reply = await api(server.url, '/api/auth/export', { cookie: ann.cookie })
    assert.equal(reply.status, 200)
    assert.match(String(reply.headers['content-disposition']), /^attachment; filename="[\w.-]+\.json"$/)
    assert.equal(reply.headers['cache-control'], 'no-store')
    const data = reply.body
    assert.equal(data.account.email, 'ann@example.com')
    assert.equal(data.account.pseudo, 'Ann')
    assert.ok(Number.isFinite(Date.parse(data.account.createdAt)) && Number.isFinite(Date.parse(data.exportedAt)))
    assert.deepEqual(data.playlists.map((entry: { name: string }) => entry.name), ['Chill'])
    assert.equal(data.playlists[0].tracks[0].videoId, 'aaaaaaaaaa1')
    assert.deepEqual(data.rooms.map((room: { name: string }) => room.name), ['Rock nocturne'])

    const text = JSON.stringify(data)
    for (const secret of ['scrypt', 'passwordHash', 'password_hash', ann.cookie.split('=')[1], ben.id, ann.id, 'ben@example.com', 'Salon de Ben', 'Playlist de Ben']) {
      assert.equal(text.includes(secret), false, `the copy must not contain ${secret.slice(0, 12)}`)
    }
  })

  it('needs a session, and is limited', async () => {
    await start({ service: { limits: { exports: { max: 2, windowMs: 60 * MINUTE } } } })
    const ann = await signUp('ann@example.com', 'Ann')
    assert.equal((await api(server.url, '/api/auth/export')).status, 401)
    assert.equal((await api(server.url, '/api/auth/export', { cookie: ann.cookie })).status, 200)
    assert.equal((await api(server.url, '/api/auth/export', { cookie: ann.cookie })).status, 200)
    assert.equal((await api(server.url, '/api/auth/export', { cookie: ann.cookie })).status, 429)
  })
})

describe('deleting the account', () => {
  it('needs the current password: a wrong or missing one deletes nothing', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const wrong = await api(server.url, '/api/auth/me', { method: 'DELETE', cookie: ann.cookie, body: { password: 'not the password' } })
    assert.deepEqual([wrong.status, errorOf(wrong)], [403, 'wrong-password'])
    for (const body of [{}, { password: 5 }, [], 'text']) {
      assert.equal((await api(server.url, '/api/auth/me', { method: 'DELETE', cookie: ann.cookie, body })).status, 400, JSON.stringify(body))
    }
    assert.ok(await me(ann.cookie), 'still there')
    assert.ok(await server.store.findById(ann.id))
  })

  it('deletes the account, its sessions, its playlists and the rooms it hosted, frees its e-mail and pseudo, and touches nobody else', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const ben = await signUp('ben@example.com', 'Ben')
    const annElsewhere = await signInAgain(ann.email)
    const hosted = await api(server.url, '/api/rooms', { cookie: ann.cookie, body: ROOM })
    assert.equal(hosted.status, 201)
    const benRoom = await api(server.url, '/api/rooms', { cookie: ben.cookie, body: { ...ROOM, name: 'Salon de Ben' } })
    assert.equal(benRoom.status, 201)
    await server.playlistStore!.create(ann.id, 'Chill', 'chill', 20)
    await server.playlistStore!.create(ben.id, 'Jazz', 'jazz', 20)

    const reply = await api(server.url, '/api/auth/me', { method: 'DELETE', cookie: ann.cookie, body: { password: PASSWORD } })
    assert.deepEqual([reply.status, reply.body], [200, { ok: true }])
    assert.ok(reply.setCookies[0]?.includes('Max-Age=0'))

    assert.equal(await server.store.findById(ann.id), null)
    assert.equal(await me(ann.cookie), null)
    assert.equal(await me(annElsewhere), null, 'every session went')
    assert.equal((await api(server.url, '/api/auth/login', { body: { email: ann.email, password: PASSWORD } })).status, 401)
    assert.deepEqual(await server.playlistStore!.list(ann.id), [], 'the playlists went')
    assert.deepEqual(await server.roomStore!.listByHost(ann.id), [], 'the rooms it hosted went')
    assert.equal((await api(server.url, `/api/rooms/${hosted.body.room.id}`)).status, 404)

    assert.equal((await server.playlistStore!.list(ben.id)).length, 1, 'another member keeps their playlists')
    assert.equal((await api(server.url, `/api/rooms/${benRoom.body.room.id}`)).status, 200, 'and their rooms')
    assert.ok(await me(ben.cookie))

    const again = await api(server.url, '/api/auth/register', { body: { email: 'ann@example.com', password: PASSWORD, pseudo: 'Ann', avatarId: 'pulse' } })
    assert.equal(again.status, 201, 'the e-mail and the pseudo are free again')
  })

  it('counts the wrong passwords, and a deleted session cannot delete anything', async () => {
    await start({ service: { limits: { reauthFailuresPerAccount: { max: 2, windowMs: 15 * MINUTE } } } })
    const ann = await signUp('ann@example.com', 'Ann')
    const ask = (password: string) => api(server.url, '/api/auth/me', { method: 'DELETE', cookie: ann.cookie, body: { password } })
    assert.equal(errorOf(await ask('wrong 1')), 'wrong-password')
    assert.equal(errorOf(await ask('wrong 2')), 'wrong-password')
    assert.equal(errorOf(await ask(PASSWORD)), 'rate-limited')
    assert.ok(await server.store.findById(ann.id), 'the right password did not get through the limit')

    const none = await api(server.url, '/api/auth/me', { method: 'DELETE', body: { password: PASSWORD } })
    assert.deepEqual([none.status, errorOf(none)], [401, 'not-signed-in'])
  })

  it('does not let a member delete somebody else: the account comes from the session, never from the body', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const ben = await signUp('ben@example.com', 'Ben')
    const reply = await api(server.url, '/api/auth/me', { method: 'DELETE', cookie: ann.cookie, body: { password: PASSWORD, id: ben.id, accountId: ben.id, email: 'ben@example.com' } })
    assert.equal(reply.status, 200)
    assert.equal(await server.store.findById(ann.id), null, 'Ann deleted herself')
    assert.ok(await server.store.findById(ben.id), 'and nobody else')
  })
})

describe('without a database', () => {
  it('answers that accounts are unavailable on every new route, and breaks nothing', async () => {
    await start({ withoutAccounts: true })
    const calls: [string, string, unknown][] = [
      ['PATCH', '/api/auth/me', { avatarId: 'mango' }],
      ['DELETE', '/api/auth/me', { password: PASSWORD }],
      ['POST', '/api/auth/password', { currentPassword: PASSWORD, newPassword: NEXT_PASSWORD }],
      ['POST', '/api/auth/logout-all', {}],
      ['GET', '/api/auth/export', undefined],
    ]
    for (const [method, path, body] of calls) {
      const reply = await api(server.url, path, { method, body, headers: { origin: ORIGIN } })
      assert.deepEqual([reply.status, errorOf(reply)], [503, 'unavailable'], `${method} ${path}`)
    }
  })
})
