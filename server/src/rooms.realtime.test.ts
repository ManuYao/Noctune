// Rooms made by members, through real connections: they appear in the list, can be joined, change under the feet of the
// people in them, and disappear when their host deletes them. What each person is told is checked on the clients' side.
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import type { JoinResult, RoomSettings, RoomSnapshot, RoomSummary, AddTrackResult, ChatResult } from '../../shared/protocol'
import { MemoryAccountStore } from './accounts/MemoryAccountStore'
import { ROOM_DEFS } from './catalog'
import { MemoryRoomStore } from './rooms/MemoryRoomStore'
import { FakeResolver } from './testing/FakeResolver'
import { api, startServer, type Started, type StartOptions, type TestSocket } from './testing/startServer'

const SETTINGS = {
  name: 'Rock nocturne',
  description: 'Des guitares la nuit.',
  styles: ['rock'],
  theme: 'sunset',
  rules: { maxTrackSec: 900, repeatDelaySec: 7200, maxDjs: 10 },
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
let server: Started

async function start(options: StartOptions = {}) {
  server = await startServer(options)
}

afterEach(async () => {
  mock.restoreAll()
  await server.close()
})

/** The server's answer, or a failure after 2 s: a call that is never answered must fail a test, not hang it. */
function answer<T>(send: (callback: (value: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no answer from the server in 2 s')), 2000)
    send((value) => {
      clearTimeout(timer)
      resolve(value)
    })
  })
}

async function until(condition: () => boolean, what: string, timeoutMs = 2000) {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > timeoutMs) assert.fail(`timed out waiting for: ${what}`)
    await sleep(10)
  }
}

let accountCount = 0
async function register(pseudo: string): Promise<string> {
  accountCount += 1
  const reply = await api(server.url, '/api/auth/register', {
    body: { email: `rr${accountCount}@example.com`, password: 'a long enough password', pseudo, avatarId: 'mango' },
  })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))
  return reply.cookie as string
}

async function createRoom(cookie: string, name = 'Rock nocturne', extra: Record<string, unknown> = {}): Promise<string> {
  const reply = await api(server.url, '/api/rooms', { method: 'POST', body: { ...SETTINGS, name, ...extra }, cookie })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))
  return reply.body.room.id
}
const change = (cookie: string, id: string, body: unknown) => api(server.url, `/api/rooms/${id}`, { method: 'PATCH', body, cookie })
const remove = (cookie: string, id: string) => api(server.url, `/api/rooms/${id}`, { method: 'DELETE', cookie })

interface Heard {
  settings: RoomSettings[]
  closed: number
  tracks: number
}
interface Person {
  socket: TestSocket
  snapshot: RoomSnapshot
  heard: Heard
}

async function enter(socket: TestSocket, roomId: string, pseudo = 'Visitor'): Promise<JoinResult> {
  return answer<JoinResult>((callback) => socket.emit('room:join', { roomId, pseudo, avatarId: 'moss' }, callback))
}

async function joined(roomId: string, cookie?: string, pseudo = 'Visitor'): Promise<Person> {
  const socket = await server.connect({ cookie })
  const heard: Heard = { settings: [], closed: 0, tracks: 0 }
  socket.on('room:settings', (settings) => heard.settings.push(settings))
  socket.on('room:closed', () => (heard.closed += 1))
  socket.on('room:track', () => (heard.tracks += 1))
  const result = await enter(socket, roomId, pseudo)
  assert.ok(result.ok, JSON.stringify(result))
  if (!result.ok) throw new Error('not in')
  return { socket, heard, snapshot: result.snapshot }
}

/** A connection following the list of rooms: the lists it was sent, the first one being the list as it was. */
async function follow(): Promise<{ lists: RoomSummary[][]; latest: () => RoomSummary[]; socket: TestSocket }> {
  const socket = await server.connect()
  const lists: RoomSummary[][] = []
  socket.on('lobby:rooms', (rooms) => lists.push(rooms))
  lists.push(await answer<RoomSummary[]>((callback) => socket.emit('lobby:join', callback)))
  return { lists, latest: () => lists[lists.length - 1], socket }
}

describe('a room made by a member', () => {
  it('shows up in the list for the people who follow it, with everything the card needs', async () => {
    await start()
    const watcher = await follow()
    assert.equal(watcher.latest().length, ROOM_DEFS.length)
    const ann = await register('Ann')
    const id = await createRoom(ann)
    await until(() => watcher.latest().some((room) => room.id === id), 'the room in the list')
    const summary = watcher.latest().find((room) => room.id === id)
    assert.deepEqual(summary, {
      id,
      name: 'Rock nocturne',
      description: 'Des guitares la nuit.',
      styles: ['rock'],
      theme: 'sunset',
      host: 'Ann',
      rules: SETTINGS.rules,
      online: 0,
      nowPlaying: null,
      djs: 0,
      maxDjs: 10,
    })
    assert.deepEqual(watcher.latest().map((room) => room.id), [...ROOM_DEFS.map((def) => def.id), id], 'after the rooms of the team')
  })

  it('can be joined at once, and says who hosts it, to the host only', async () => {
    await start()
    const ann = await register('Ann')
    const ben = await register('Ben')
    const id = await createRoom(ann)
    const host = await joined(id, ann)
    const other = await joined(id, ben)
    const visitor = await joined(id, undefined, 'Visitor')
    assert.deepEqual(
      [host, other, visitor].map((person) => ({ host: person.snapshot.host, isHost: person.snapshot.isHost })),
      [
        { host: 'Ann', isHost: true },
        { host: 'Ann', isHost: false },
        { host: 'Ann', isHost: false },
      ],
    )
    for (const person of [host, other, visitor]) {
      assert.deepEqual(
        { name: person.snapshot.name, description: person.snapshot.description, styles: person.snapshot.styles, theme: person.snapshot.theme, rules: person.snapshot.rules },
        { name: 'Rock nocturne', description: 'Des guitares la nuit.', styles: ['rock'], theme: 'sunset', rules: SETTINGS.rules },
      )
    }
  })

  it('does not make anybody the host of a room of the team, and shows its texts', async () => {
    await start()
    const ann = await register('Ann')
    const person = await joined('lofi-du-soir', ann)
    assert.deepEqual({ host: person.snapshot.host, isHost: person.snapshot.isHost }, { host: null, isHost: false })
    assert.equal(person.snapshot.description, ROOM_DEFS[0].description)
    assert.deepEqual(person.snapshot.styles, ROOM_DEFS[0].styles)
    assert.equal(person.snapshot.theme, ROOM_DEFS[0].theme)
  })

  it('is not the host’s on another connection of the same account until that connection is in the room', async () => {
    await start()
    const ann = await register('Ann')
    const id = await createRoom(ann)
    const visitorOfAnn = await server.connect() // the same person on a page that has no session
    const result = await enter(visitorOfAnn, id, 'Annie')
    assert.ok(result.ok)
    if (result.ok) assert.equal(result.snapshot.isHost, false)
  })

  it('plays like any room: music starts for the first one in', async () => {
    await start()
    const ann = await register('Ann')
    const id = await createRoom(ann)
    const person = await joined(id, ann)
    assert.ok(person.snapshot.nowPlaying, 'the room’s own selection plays')
  })
})

describe('the host changes a room', () => {
  it('tells everybody in it, and the list, and a newcomer finds the new texts', async () => {
    await start()
    const ann = await register('Ann')
    const ben = await register('Ben')
    const id = await createRoom(ann)
    const watcher = await follow()
    const inside = await joined(id, ben)
    const reply = await change(ann, id, { ...SETTINGS, name: 'Jazz du matin', description: 'Du piano.', styles: ['jazz', 'pop'], theme: 'vinyl', rules: { maxTrackSec: 300, repeatDelaySec: null, maxDjs: 5 } })
    assert.equal(reply.status, 200, JSON.stringify(reply.body))

    await until(() => inside.heard.settings.length === 1, 'room:settings')
    assert.deepEqual(inside.heard.settings[0], {
      name: 'Jazz du matin',
      description: 'Du piano.',
      styles: ['jazz', 'pop'],
      theme: 'vinyl',
      rules: { maxTrackSec: 300, repeatDelaySec: null, maxDjs: 5 },
    })
    await until(() => watcher.latest().find((room) => room.id === id)?.name === 'Jazz du matin', 'the list to follow')
    const summary = watcher.latest().find((room) => room.id === id)
    assert.deepEqual([summary?.styles, summary?.theme, summary?.maxDjs, summary?.rules.maxTrackSec], [['jazz', 'pop'], 'vinyl', 5, 300])
    assert.deepEqual(watcher.latest().map((room) => room.id).slice(-1), [id], 'and the room keeps its place')

    const later = await joined(id, undefined, 'Later')
    assert.deepEqual([later.snapshot.name, later.snapshot.theme, later.snapshot.rules.maxDjs], ['Jazz du matin', 'vinyl', 5])
  })

  it('applies the new rules at once: a track that was fine is now too long', async () => {
    const resolver = new FakeResolver({ longlonglo1: { videoId: 'longlonglo1', title: 'Long one', artist: 'A', durationSec: 400 } })
    await start({ resolver })
    const ann = await register('Ann')
    const id = await createRoom(ann)
    const host = await joined(id, ann)
    const accepted = await answer<AddTrackResult>((callback) => host.socket.emit('dj:add', { input: 'longlonglo1' }, callback))
    assert.ok(accepted.ok, JSON.stringify(accepted))
    await answer<unknown>((callback) => host.socket.emit('dj:leave', callback as never))

    await change(ann, id, { ...SETTINGS, rules: { ...SETTINGS.rules, maxTrackSec: 300 } })
    await until(() => host.heard.settings.length === 1, 'room:settings')
    await sleep(350) // the allowance between two edits of a line-up
    const refused = await answer<AddTrackResult>((callback) => host.socket.emit('dj:add', { input: 'longlonglo1' }, callback))
    assert.deepEqual(refused, { ok: false, error: 'too-long', maxSec: 300 })
  })

  it('says nothing to the room when somebody who is not the host tries', async () => {
    await start()
    const ann = await register('Ann')
    const ben = await register('Ben')
    const id = await createRoom(ann)
    const inside = await joined(id, ann)
    const reply = await change(ben, id, { ...SETTINGS, name: 'Stolen room' })
    assert.equal(reply.status, 403)
    await sleep(100)
    assert.equal(inside.heard.settings.length, 0)
  })
})

describe('the host deletes a room', () => {
  it('puts everybody out, tells them, and takes the room out of the list', async () => {
    await start()
    const ann = await register('Ann')
    const ben = await register('Ben')
    const id = await createRoom(ann)
    const watcher = await follow()
    await until(() => watcher.latest().some((room) => room.id === id), 'the room in the list')
    const host = await joined(id, ann)
    const guest = await joined(id, ben)
    const visitor = await joined(id, undefined, 'Visitor')

    assert.equal((await remove(ann, id)).status, 200)
    await until(() => [host, guest, visitor].every((person) => person.heard.closed === 1), 'room:closed for everybody')
    await until(() => !watcher.latest().some((room) => room.id === id), 'the list to forget it')
    assert.equal(watcher.latest().length, ROOM_DEFS.length)

    // The connections themselves forget the room: out of its channel and of their own, and nothing in them names it.
    assert.equal((await server.io.in(id).fetchSockets()).length, 0, 'nobody is left in the channel of the room')
    const connections = await server.io.fetchSockets()
    assert.ok(connections.length >= 4, 'the connections are still there')
    assert.ok(connections.every((connection) => connection.data.roomId !== id && !connection.rooms.has(id)), 'none still names or sits in the room')
    for (const person of [host, guest, visitor]) {
      const mine = connections.find((connection) => connection.id === person.socket.id)
      assert.equal(mine?.data.participantId, undefined, 'no participant any more')
      assert.equal(mine?.rooms.size, 1, 'only the channel every connection has to itself')
    }

    // Nothing they send is taken for a word said in the room that is gone.
    const chat = await answer<ChatResult>((callback) => visitor.socket.emit('chat:send', { text: 'anybody there?' }, callback))
    assert.deepEqual(chat, { ok: false, error: 'not-in-room' })
    const react = await answer<{ ok: boolean; error?: string }>((callback) => guest.socket.emit('track:like', { value: true }, callback))
    assert.deepEqual(react, { ok: false, error: 'not-in-room' })
  })

  it('cannot be joined any more, not even by its host, and says it is not there', async () => {
    await start()
    const ann = await register('Ann')
    const id = await createRoom(ann)
    await remove(ann, id)
    const socket = await server.connect({ cookie: ann })
    assert.deepEqual(await enter(socket, id), { ok: false, error: 'unknown-room' })
    assert.equal((await api(server.url, `/api/rooms/${id}`, {})).status, 404)
  })

  it('lets the people who were in it go to another room at once', async () => {
    await start()
    const ann = await register('Ann')
    const id = await createRoom(ann)
    const visitor = await joined(id, undefined, 'Visitor')
    await remove(ann, id)
    await until(() => visitor.heard.closed === 1, 'room:closed')
    await sleep(320) // a connection may join once every 300 ms
    const again = await enter(visitor.socket, 'lofi-du-soir', 'Visitor')
    assert.ok(again.ok, JSON.stringify(again))
  })

  it('does not bring a room back when a join was waiting for the database while it was deleted', async () => {
    let open!: () => void
    const slow = new (class extends MemoryAccountStore {
      gate: Promise<void> | null = null
      override async isPseudoTaken(pseudo: string) {
        if (this.gate) await this.gate
        return super.isPseudoTaken(pseudo)
      }
    })()
    await start({ store: slow })
    const ann = await register('Ann')
    const id = await createRoom(ann)
    slow.gate = new Promise<void>((resolve) => (open = resolve))

    const socket = await server.connect()
    const pending = enter(socket, id, 'Visitor') // waits for the pseudo check
    await sleep(50)
    assert.equal((await remove(ann, id)).status, 200)
    open()
    assert.deepEqual(await pending, { ok: false, error: 'unknown-room' })

    const watcher = await follow()
    assert.equal(watcher.latest().some((room) => room.id === id), false, 'no ghost in the list')
    slow.gate = null
    await sleep(320) // a connection may join once every 300 ms
    assert.deepEqual(await enter(socket, id, 'Visitor'), { ok: false, error: 'unknown-room' })
  })

  it('stops everything of the room: no track change is heard after it is deleted', async () => {
    await start()
    const ann = await register('Ann')
    const id = await createRoom(ann)
    const host = await joined(id, ann)
    const tracksBefore = host.heard.tracks
    await remove(ann, id)
    await until(() => host.heard.closed === 1, 'room:closed')
    await sleep(300)
    assert.equal(host.heard.tracks, tracksBefore, 'nothing more from it')
  })
})

describe('starting with rooms that already exist', () => {
  it('opens the rooms the store holds when the server starts (the rooms of members, after a restart)', async () => {
    const store = new MemoryRoomStore()
    await store.create({ accountId: 'host-account', pseudo: 'Hosty' }, 'kept-room-abcd', { name: 'Kept room', nameKey: 'kept room', description: 'Still here.', styles: ['afro'], theme: 'jungle', rules: { maxTrackSec: 420, repeatDelaySec: 3600, maxDjs: 20 } }, 3)
    await start({ roomStore: store, initialRooms: await store.list() })
    const watcher = await follow()
    const kept = watcher.latest().find((room) => room.id === 'kept-room-abcd')
    assert.deepEqual([kept?.host, kept?.theme, kept?.maxDjs], ['Hosty', 'jungle', 20])
    const person = await joined('kept-room-abcd', undefined, 'Visitor')
    assert.equal(person.snapshot.isHost, false)
  })

  it('serves the rooms of the team alone when there is no store for the rest', async () => {
    await start({ roomStore: null })
    const watcher = await follow()
    assert.deepEqual(watcher.latest().map((room) => room.id), ROOM_DEFS.map((def) => def.id))
  })
})
