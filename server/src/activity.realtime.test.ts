// What members do in real rooms is counted for their profile: through real connections and the real HTTP route, on the
// memory store. Visitors have nothing; one member never sees another's numbers; the counting never gets in a room's way.
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import type { ChatResult, JoinResult, ProfileReply, ReactResult } from '../../shared/protocol'
import { emptyActivity, type Activity } from './activity/activity'
import { MemoryActivityStore } from './activity/MemoryActivityStore'
import { FakeResolver } from './testing/FakeResolver'
import { api, startServer, type Started, type StartOptions, type TestSocket } from './testing/startServer'

const ROOM = 'lofi-du-soir'
const PASSWORD = 'a long enough password'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let server: Started
let accountCount = 0

/** A store that remembers whose accounts it was asked to write: a visitor must never be one of them. */
class SpyStore extends MemoryActivityStore {
  written: string[] = []
  override async add(accountId: string, delta: Activity) {
    this.written.push(accountId)
    return super.add(accountId, delta)
  }
}

async function start(options: StartOptions = {}) {
  // A track of one second: it ends by itself within the test, and the room then counts it as played.
  const fake = new FakeResolver({ shortttttt1: { videoId: 'shortttttt1', title: 'Short', artist: 'Artist', durationSec: 1 } })
  server = await startServer({ resolver: fake, ...options })
}

afterEach(async () => {
  mock.restoreAll()
  await server.close()
})

function answer<T>(send: (callback: (value: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no answer from the server in 2 s')), 2000)
    send((value) => {
      clearTimeout(timer)
      resolve(value)
    })
  })
}

async function until(condition: () => boolean | Promise<boolean>, what: string, timeoutMs = 3000) {
  const started = Date.now()
  while (!(await condition())) {
    if (Date.now() - started > timeoutMs) assert.fail(`timed out waiting for: ${what}`)
    await sleep(20)
  }
}

async function register(pseudo: string): Promise<{ cookie: string; email: string }> {
  accountCount += 1
  const email = `act${accountCount}@example.com`
  const reply = await api(server.url, '/api/auth/register', { body: { email, password: PASSWORD, pseudo, avatarId: 'mango' } })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))
  return { cookie: reply.cookie as string, email }
}

async function enter(socket: TestSocket, roomId = ROOM, pseudo = 'Visitor') {
  const joined = await answer<JoinResult>((callback) => socket.emit('room:join', { roomId, pseudo, avatarId: 'moss' }, callback))
  assert.ok(joined.ok, JSON.stringify(joined))
}

async function member(pseudo: string, roomId = ROOM) {
  const account = await register(pseudo)
  const socket = await server.connect({ cookie: account.cookie })
  await enter(socket, roomId)
  return { ...account, socket }
}

async function visitor(pseudo: string, roomId = ROOM) {
  const socket = await server.connect()
  await enter(socket, roomId, pseudo)
  return socket
}

const profile = (cookie?: string, path = '/api/auth/profile', extra: { headers?: Record<string, string> } = {}) =>
  api(server.url, path, { cookie, ...extra })
const stats = async (cookie: string) => {
  const reply = await profile(cookie)
  assert.equal(reply.status, 200, JSON.stringify(reply.body))
  return (reply.body as Extract<ProfileReply, { ok: true }>).profile.stats
}
/** What is counted for the member right now, read from the recorder: the route has an allowance, a poll must not use it. */
const counted = async (email: string) => server.activity!.read((await server.store.findByEmail(email))!.id)
const chat = (socket: TestSocket, text: string) => answer<ChatResult>((callback) => socket.emit('chat:send', { text }, callback))
const like = (socket: TestSocket, value = true) => answer<ReactResult>((callback) => socket.emit('track:like', { value }, callback))

describe('counting what members do', () => {
  it('counts a visit, a message, a played track and the likes, for members only', async () => {
    const spy = new SpyStore()
    await start({ activityStore: spy })
    const ann = await member('Ann')
    const ben = await member('Ben')
    const vic = await visitor('Vic')

    assert.deepEqual(await chat(ann.socket, 'salut'), { ok: true })
    assert.deepEqual(await chat(vic, 'coucou'), { ok: true }, 'a visitor chats all the same')

    const added = await answer<{ ok: boolean }>((callback) => ann.socket.emit('dj:add', { input: 'shortttttt1' }, callback as never))
    assert.ok(added.ok, JSON.stringify(added))
    assert.deepEqual(await like(ben.socket), { ok: true })
    assert.deepEqual(await like(vic), { ok: true })

    // The track lasts a second: once it is over, it counts as played.
    await until(async () => (await counted(ann.email)).tracksPlayed === 1, 'the track to count as played')
    const annStats = await stats(ann.cookie)
    assert.equal(annStats.messagesSent, 1)
    assert.equal(annStats.likesReceived, 2, 'a member’s like and a visitor’s')
    assert.equal(annStats.bestTrackLikes, 2)
    assert.equal(annStats.roomsVisited, 1)
    assert.equal(annStats.daysActive, 1)
    assert.equal(annStats.stylesVisited, 1)
    assert.equal(annStats.stylesPlayed, 1)
    assert.equal(annStats.likesGiven, 0)

    const benStats = await stats(ben.cookie)
    assert.equal(benStats.likesGiven, 1)
    assert.equal(benStats.tracksPlayed, 0)
    assert.equal(benStats.messagesSent, 0)

    await server.activity!.flush()
    assert.deepEqual([...new Set(spy.written)].length, 2, 'two members were written, the visitor is not an account')
  })

  it('counts the time spent, and writes it when the member leaves and at the next batch', async () => {
    await start()
    const ann = await member('Ann')
    await sleep(1100)
    ann.socket.emit('room:leave')
    await until(async () => (await counted(ann.email)).listenSeconds >= 1, 'a second of listening')
    const reply = await profile(ann.cookie)
    const { topRooms, topStyles } = (reply.body as Extract<ProfileReply, { ok: true }>).profile
    assert.deepEqual(topRooms.map((room) => room.id), [ROOM])
    assert.deepEqual(topStyles, ['lofi'])
  })

  it('counts a member entering a room of a host, once per member, for the host', async () => {
    await start()
    const host = await register('Hosty')
    const created = await api(server.url, '/api/rooms', {
      cookie: host.cookie,
      body: { name: 'Rock nocturne', description: 'Des guitares.', styles: ['rock'], theme: 'sunset', rules: { maxTrackSec: 900, repeatDelaySec: 7200, maxDjs: 10 } },
    })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    const roomId = created.body.room.id as string
    const ann = await member('Ann', roomId)
    const ben = await member('Ben', roomId)
    ann.socket.emit('room:leave')
    await sleep(350) // a connection may join once every 300 ms
    await enter(ann.socket, roomId)
    await visitor('Vic', roomId)
    ben.socket.emit('room:leave')

    await server.activity!.flush()
    const hostStats = await stats(host.cookie)
    assert.equal(hostStats.membersInBestRoom, 2, 'Ann and Ben; Ann’s second visit and the visitor do not add')
    assert.equal(hostStats.roomsHosted, 1)
  })

  it('does not count the same like twice when a member comes back on another connection', async () => {
    await start()
    const dj = await member('Dee')
    const added = await answer<{ ok: boolean }>((callback) => dj.socket.emit('dj:add', { input: 'shortttttt1' }, callback as never))
    assert.ok(added.ok)
    const ann = await member('Ann')
    assert.deepEqual(await like(ann.socket), { ok: true })
    ann.socket.disconnect()
    const again = await server.connect({ cookie: ann.cookie })
    await enter(again)
    // The first connection may take a moment to leave: the like of the same account is the same like.
    const result = await like(again)
    if (result.ok) await sleep(50)
    assert.equal((await stats(ann.cookie)).likesGiven, 1)
    assert.equal((await stats(dj.cookie)).likesReceived, 1)
  })
})

describe('GET /api/auth/profile', () => {
  it('needs a session: nobody, a cookie that opens nothing', async () => {
    await start()
    const none = await profile()
    assert.equal(none.status, 401)
    assert.deepEqual(none.body, { ok: false, error: 'not-signed-in' })
    const fake = await profile('noctune_session=not-a-real-token')
    assert.equal(fake.status, 401)
  })

  it('refuses a request that says it comes from another site, before anything else', async () => {
    await start()
    const ann = await register('Ann')
    const foreign = await profile(ann.cookie, '/api/auth/profile', { headers: { origin: 'https://evil.example' } })
    assert.equal(foreign.status, 403)
    const crossSite = await profile(ann.cookie, '/api/auth/profile', { headers: { 'sec-fetch-site': 'cross-site' } })
    assert.equal(crossSite.status, 403)
  })

  it('is never cached, and only answers GET', async () => {
    await start()
    const ann = await register('Ann')
    const reply = await profile(ann.cookie)
    assert.equal(reply.headers['cache-control'], 'no-store')
    const post = await api(server.url, '/api/auth/profile', { method: 'POST', cookie: ann.cookie, body: {} })
    assert.equal(post.status, 405)
  })

  it('is the asker’s own numbers, whatever the query says, and never a hash or an e-mail', async () => {
    await start()
    const ann = await member('Ann')
    const ben = await member('Ben')
    await chat(ann.socket, 'bonjour')
    const own = await profile(ann.cookie)
    assert.equal(own.body.profile.stats.messagesSent, 1)
    const aimed = await profile(ann.cookie, `/api/auth/profile?account=${encodeURIComponent(ben.email)}&id=x&pseudo=Ben`)
    assert.equal(aimed.body.profile.stats.messagesSent, 1, 'the query is ignored')
    const others = await profile(ben.cookie)
    assert.equal(others.body.profile.stats.messagesSent, 0)
    const text = JSON.stringify([own.body, others.body])
    assert.equal(/scrypt|password|@example\.com/i.test(text), false, 'no hash, no e-mail')
    assert.equal(Object.keys(own.body.profile.stats).includes('email'), false)
  })

  it('gives a brand new member zeros and the date their account was made', async () => {
    await start()
    const ann = await register('Ann')
    const reply = await profile(ann.cookie)
    assert.equal(reply.status, 200)
    const { stats: s, topRooms, topStyles } = reply.body.profile
    assert.equal(s.tracksPlayed + s.likesReceived + s.likesGiven + s.listenSeconds + s.roomsVisited + s.messagesSent, 0)
    assert.equal(s.nightOwl, false)
    assert.ok(Math.abs(Date.parse(s.memberSince) - Date.now()) < 60_000, 'memberSince is the creation of the account')
    assert.deepEqual([topRooms, topStyles], [[], []])
  })

  it('counts the playlists’ tracks and the rooms the member hosts', async () => {
    await start()
    const ann = await register('Ann')
    const list = await api(server.url, '/api/playlists', { cookie: ann.cookie, body: { name: 'Soir' } })
    assert.equal(list.status, 201)
    const added = await api(server.url, `/api/playlists/${list.body.playlist.id}/tracks`, { cookie: ann.cookie, body: { input: 'shortttttt1' } })
    assert.equal(added.status, 201, JSON.stringify(added.body))
    assert.equal((await stats(ann.cookie)).playlistTracks, 1)
  })

  it('says it is unavailable without a database, or without a store', async () => {
    await start({ withoutAccounts: true })
    assert.equal((await profile()).status, 503)
    await server.close()
    await start({ activityStore: null })
    const ann = await register('Ann')
    const reply = await profile(ann.cookie)
    assert.equal(reply.status, 503)
    assert.deepEqual(reply.body, { ok: false, error: 'unavailable' })
  })

  it('limits how often it can be read', async () => {
    await start()
    const ann = await register('Ann')
    let last = await profile(ann.cookie)
    for (let i = 0; i < 30; i++) last = await profile(ann.cookie)
    assert.equal(last.status, 429)
    assert.equal(last.body.error, 'rate-limited')
    assert.ok(Number(last.headers['retry-after']) >= 1)
    // Another member has their own allowance.
    const ben = await register('Ben')
    assert.equal((await profile(ben.cookie)).status, 200)
  })
})

describe('the account’s data', () => {
  it('is in the export, as the member’s own', async () => {
    await start()
    const ann = await member('Ann')
    const ben = await member('Ben')
    await chat(ann.socket, 'bonjour')
    await chat(ben.socket, 'salut')
    const exported = await api(server.url, '/api/auth/export', { cookie: ann.cookie })
    assert.equal(exported.status, 200)
    assert.equal(exported.body.activity.stats.messagesSent, 1)
    assert.equal(exported.body.activity.stats.roomsVisited, 1)
    assert.equal(JSON.stringify(exported.body).includes(ben.email), false)
  })

  it('goes with the account: stored counters, the ones waiting and the stay in progress', async () => {
    const spy = new SpyStore()
    await start({ activityStore: spy })
    const ann = await member('Ann')
    await chat(ann.socket, 'bonjour')
    await server.activity!.flush()
    await chat(ann.socket, 'encore')
    const id = (await server.store.findByEmail(ann.email))!.id
    assert.equal((await spy.read(id)).messagesSent, 1)

    const deleted = await api(server.url, '/api/auth/me', { method: 'DELETE', cookie: ann.cookie, body: { password: PASSWORD } })
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body))
    await until(() => ann.socket.disconnected, 'the connection to close')
    await sleep(50)
    spy.written.length = 0
    await server.activity!.flush()
    assert.deepEqual(await spy.read(id), emptyActivity())
    assert.deepEqual(spy.written, [], 'nothing waiting is written for the account that went')
  })
})

describe('a store that fails', () => {
  it('never gets in the way of a room: join, chat, likes and DJ turns work, the profile says it could not read', async () => {
    mock.method(console, 'error', () => undefined)
    class Broken extends MemoryActivityStore {
      override async add(): Promise<void> {
        throw new Error('database down')
      }
      override async read(): Promise<Activity> {
        throw new Error('database down')
      }
    }
    await start({ activityStore: new Broken() })
    const ann = await member('Ann')
    const ben = await member('Ben')
    assert.deepEqual(await chat(ann.socket, 'bonjour'), { ok: true })
    const added = await answer<{ ok: boolean }>((callback) => ann.socket.emit('dj:add', { input: 'shortttttt1' }, callback as never))
    assert.ok(added.ok)
    assert.deepEqual(await like(ben.socket), { ok: true })
    await server.activity!.flush() // must not throw
    const reply = await profile(ann.cookie)
    assert.equal(reply.status, 500)
    assert.deepEqual(reply.body, { ok: false, error: 'server-error' })
    // And the room goes on.
    await sleep(350) // a person may react once every 300 ms
    assert.deepEqual(await like(ben.socket, false), { ok: true })
  })
})
