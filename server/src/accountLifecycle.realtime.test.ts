// What the live rooms must forget when an account changes under them: the end of the account (its connections, its places
// in the rooms, its DJ places, the rooms it hosted) and the end of its sessions (password changed, signed out everywhere).
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import type { DjQueue, JoinResult, RoomSummary } from '../../shared/protocol'
import { MemoryRoomStore } from './rooms/MemoryRoomStore'
import { FakeResolver } from './testing/FakeResolver'
import { api, startServer, type Started, type TestSocket } from './testing/startServer'

const PASSWORD = 'a long enough password'
const NEXT_PASSWORD = 'another long enough password'
const LOFI = 'lofi-du-soir'
const ROOM = {
  name: 'Rock nocturne',
  description: 'Des guitares la nuit.',
  styles: ['rock'],
  theme: 'sunset',
  rules: { maxTrackSec: 900, repeatDelaySec: 7200, maxDjs: 10 },
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let server: Started

async function start() {
  const fake = new FakeResolver({ aaaaaaaaaa1: { videoId: 'aaaaaaaaaa1', title: 'Alpha', artist: 'Artist', durationSec: 200 } })
  server = await startServer({ resolver: fake })
}

afterEach(async () => {
  await server.close()
})

async function until(condition: () => boolean, what: string, timeoutMs = 2000) {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > timeoutMs) assert.fail(`timed out waiting for: ${what}`)
    await sleep(10)
  }
}

function answer<T>(send: (callback: (value: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no answer from the server in 2 s')), 2000)
    send((value) => {
      clearTimeout(timer)
      resolve(value)
    })
  })
}

async function signUp(email: string, pseudo: string) {
  const reply = await api(server.url, '/api/auth/register', { body: { email, password: PASSWORD, pseudo, avatarId: 'pulse' } })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))
  return { cookie: reply.cookie as string, email }
}

async function signInAgain(email: string) {
  const reply = await api(server.url, '/api/auth/login', { body: { email, password: PASSWORD } })
  assert.equal(reply.status, 200)
  return reply.cookie as string
}

interface Seen {
  socket: TestSocket
  closed: number
  left: string[]
  queues: DjQueue[]
}

/** A connection that joins a room, and keeps what it is told about the room. */
async function inRoom(roomId: string, cookie?: string, pseudo = 'Guest'): Promise<Seen> {
  const socket = await server.connect(cookie ? { cookie } : {})
  const seen: Seen = { socket, closed: 0, left: [], queues: [] }
  socket.on('room:closed', () => (seen.closed += 1))
  socket.on('room:participant-left', (id) => seen.left.push(id))
  socket.on('dj:queue', (queue) => seen.queues.push(queue))
  socket.on('room:track', (_track, _reactions, queue) => seen.queues.push(queue))
  const joined = await answer<JoinResult>((callback) => socket.emit('room:join', { roomId, pseudo, avatarId: 'moss' }, callback))
  assert.ok(joined.ok, JSON.stringify(joined))
  return seen
}

const lobby = (socket: TestSocket) => answer<RoomSummary[]>((callback) => socket.emit('lobby:join', callback))
const queueNames = (queue: DjQueue | undefined) => [queue?.current?.pseudo, ...(queue?.waiting.map((entry) => entry.pseudo) ?? [])].filter(Boolean)

describe('an account that is deleted while it is in the rooms', () => {
  it('is cut off, leaves every room and every DJ queue, and its room closes on the people inside it', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const ben = await signUp('ben@example.com', 'Ben')
    const hosted = await api(server.url, '/api/rooms', { cookie: ann.cookie, body: ROOM })
    assert.equal(hosted.status, 201)
    const hostedId = hosted.body.room.id as string

    const watcher = await inRoom(LOFI, undefined, 'Watcher')
    const annDj = await inRoom(LOFI, ann.cookie)
    const added = await answer<{ ok: boolean }>((callback) => annDj.socket.emit('dj:add', { input: 'aaaaaaaaaa1' }, callback as never))
    assert.ok(added.ok, 'Ann is a DJ and on the decks')
    await until(() => queueNames(watcher.queues.at(-1)).includes('Ann'), 'Ann on the decks')
    const annHost = await inRoom(hostedId, ann.cookie)
    const benInside = await inRoom(hostedId, ben.cookie)
    const seeker = await server.connect()
    assert.ok((await lobby(seeker)).some((summary) => summary.id === hostedId))

    const deleted = await api(server.url, '/api/auth/me', { method: 'DELETE', cookie: ann.cookie, body: { password: PASSWORD } })
    assert.equal(deleted.status, 200)

    await until(() => annDj.socket.disconnected && annHost.socket.disconnected, 'Ann\'s connections to close')
    await until(() => benInside.closed === 1, 'the room of Ann to close on Ben')
    assert.equal(benInside.closed, 1, 'once')
    assert.ok(watcher.left.length >= 1, 'the others of the room Ann DJed in see her leave')
    await until(() => !queueNames(watcher.queues.at(-1)).includes('Ann'), 'Ann\'s place to leave the queue')
    assert.equal(watcher.queues.at(-1)?.current, null, 'her track was cut: the room\'s own selection plays')

    assert.equal((await lobby(seeker)).some((summary) => summary.id === hostedId), false, 'the room is gone from the list')
    const again = await server.connect()
    const refused = await answer<JoinResult>((callback) => again.emit('room:join', { roomId: hostedId, pseudo: 'Late', avatarId: 'moss' }, callback))
    assert.deepEqual(refused, { ok: false, error: 'unknown-room' })
    assert.ok(benInside.socket.connected, 'Ben is out of the room, not off the site')
  })

  it('leaves a DJ place that was away (no connection) out of the queue too', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const watcher = await inRoom(LOFI, undefined, 'Watcher')
    const annDj = await inRoom(LOFI, ann.cookie)
    await answer<unknown>((callback) => annDj.socket.emit('dj:add', { input: 'aaaaaaaaaa1' }, callback as never))
    await until(() => queueNames(watcher.queues.at(-1)).includes('Ann'), 'Ann on the decks')
    annDj.socket.disconnect()
    await until(() => queueNames(watcher.queues.at(-1)).includes('Ann') && watcher.left.length >= 1, 'Ann away, her place kept')

    const deleted = await api(server.url, '/api/auth/me', { method: 'DELETE', cookie: ann.cookie, body: { password: PASSWORD } })
    assert.equal(deleted.status, 200)
    await until(() => !queueNames(watcher.queues.at(-1)).includes('Ann'), 'the place of an absent Ann to go')
  })
})

describe('sessions that end', () => {
  it('a new password cuts the connections of the other sessions and keeps the one that asked', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const elsewhere = await signInAgain(ann.email)
    const here = await inRoom(LOFI, ann.cookie)
    const there = await inRoom('jazz-cafe', elsewhere)
    const reply = await api(server.url, '/api/auth/password', { cookie: ann.cookie, body: { currentPassword: PASSWORD, newPassword: NEXT_PASSWORD } })
    assert.equal(reply.status, 200)
    await until(() => there.socket.disconnected, 'the other session\'s connection to close')
    await sleep(100)
    assert.equal(here.socket.connected, true, 'the session that changed the password stays connected')
  })

  it('a wrong password cuts nothing', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const elsewhere = await signInAgain(ann.email)
    const there = await inRoom('jazz-cafe', elsewhere)
    const reply = await api(server.url, '/api/auth/password', { cookie: ann.cookie, body: { currentPassword: 'wrong', newPassword: NEXT_PASSWORD } })
    assert.equal(reply.status, 403)
    await sleep(100)
    assert.equal(there.socket.connected, true)
  })

  it('signing out everywhere cuts every connection of the account and nobody else\'s', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const ben = await signUp('ben@example.com', 'Ben')
    const elsewhere = await signInAgain(ann.email)
    const first = await inRoom(LOFI, ann.cookie)
    const second = await inRoom('jazz-cafe', elsewhere)
    const bens = await inRoom(LOFI, ben.cookie)
    const reply = await api(server.url, '/api/auth/logout-all', { cookie: ann.cookie, body: {} })
    assert.equal(reply.status, 200)
    await until(() => first.socket.disconnected && second.socket.disconnected, 'both connections of Ann to close')
    await sleep(100)
    assert.equal(bens.socket.connected, true)
  })
})

describe('a pseudo that changes', () => {
  it('shows as the new host name in the list, for the rooms the member hosts', async () => {
    await start()
    const ann = await signUp('ann@example.com', 'Ann')
    const hosted = await api(server.url, '/api/rooms', { cookie: ann.cookie, body: ROOM })
    const hostedId = hosted.body.room.id as string
    const seeker = await server.connect()
    assert.equal((await lobby(seeker)).find((summary) => summary.id === hostedId)?.host, 'Ann')
    const changed = await api(server.url, '/api/auth/me', { method: 'PATCH', cookie: ann.cookie, body: { pseudo: 'Anna' } })
    assert.equal(changed.status, 200)
    assert.equal((await api(server.url, `/api/rooms/${hostedId}`)).body.room.host, 'Anna', 'the API says it')
    await until(() => true, 'nothing')
    const after = await server.connect()
    assert.equal((await lobby(after)).find((summary) => summary.id === hostedId)?.host, 'Anna', 'and so does the list')
  })
})

describe('an account whose deletion fails half-way in the stores', () => {
  it('is still cut off and its rooms still close: nothing of it stays alive in memory', async () => {
    const quiet = mock.method(console, 'error', () => {})
    try {
      const store = new MemoryRoomStore()
      server = await startServer({ resolver: new FakeResolver({}), roomStore: store })
      const ann = await signUp('ann@example.com', 'Ann')
      const ben = await signUp('ben@example.com', 'Ben')
      const hosted = await api(server.url, '/api/rooms', { cookie: ann.cookie, body: ROOM })
      assert.equal(hosted.status, 201)
      const hostedId = hosted.body.room.id as string
      const annInside = await inRoom(hostedId, ann.cookie)
      const benInside = await inRoom(hostedId, ben.cookie)
      store.deleteByHost = async () => {
        throw new Error('the store is down')
      }

      const deleted = await api(server.url, '/api/auth/me', { method: 'DELETE', cookie: ann.cookie, body: { password: PASSWORD } })
      assert.equal(deleted.status, 200)

      await until(() => annInside.socket.disconnected, 'Ann\'s connection to close')
      await until(() => benInside.closed === 1, 'the room of Ann to close on Ben')
      assert.ok(quiet.mock.calls.some((call) => String(call.arguments[0]).includes('the store is down')), 'the failure is in the log')
    } finally {
      quiet.mock.restore()
    }
  })
})
