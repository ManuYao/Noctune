// Accounts meet the rooms: who comes in as whom, who may take which pseudo, and what happens when the database is slow.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import type { JoinPayload, JoinResult, RoomSummary } from '../../../shared/protocol'
import { Room } from '../Room'
import { api, startServer, type Started, type StartOptions, type TestSocket } from '../testing/startServer'
import { MemoryAccountStore } from './MemoryAccountStore'

const nina = { email: 'nina@example.com', password: 'a long enough password', pseudo: 'Nina_B', avatarId: 'pulse' }
const room = 'lofi-du-soir'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
// A connection may not join twice within 300 ms: a test that joins again on the same connection waits this long.
const pause = () => sleep(350)

let server: Started

/** Opens an account over HTTP, and returns the cookie a browser would then send. */
async function member(overrides: Partial<typeof nina> = {}): Promise<string> {
  const reply = await api(server.url, '/api/auth/register', { body: { ...nina, ...overrides } })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))
  assert.ok(reply.cookie)
  return reply.cookie
}

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

const join = (socket: TestSocket, payload: JoinPayload) =>
  answer<JoinResult>((callback) => socket.emit('room:join', payload, callback))

const visitor = (pseudo: string, roomId = room): JoinPayload => ({ roomId, pseudo, avatarId: 'moss' })

async function start(options: StartOptions = {}) {
  server = await startServer(options)
}

beforeEach(async () => {
  await start()
})

afterEach(async () => {
  mock.restoreAll()
  await server.close()
})

describe('members in a room', () => {
  it('come in as themselves: the pseudo and the avatar the page sends are ignored', async () => {
    const socket = await server.connect({ cookie: await member() })
    const result = await join(socket, { roomId: room, pseudo: 'Hacker', avatarId: 'mist' })
    assert.equal(result.ok, true)
    if (!result.ok) return
    const self = result.snapshot.participants.find((participant) => participant.id === result.snapshot.selfId)
    assert.deepEqual({ ...self, id: undefined }, { id: undefined, pseudo: 'Nina_B', avatarId: 'pulse', member: true })
    assert.equal(result.snapshot.participants.some((participant) => participant.pseudo === 'Hacker'), false)
  })

  it('come in even when the page sends nothing usable', async () => {
    const socket = await server.connect({ cookie: await member() })
    const result = await join(socket, { roomId: room, pseudo: '', avatarId: 'robot' })
    assert.equal(result.ok, true)
  })

  it('are marked as members to everybody, and visitors are not', async () => {
    const watcher = await server.connect()
    await join(watcher, visitor('Watcher'))
    const arrivals: { pseudo: string; member: boolean }[] = []
    watcher.on('room:participant-joined', (participant) => arrivals.push({ pseudo: participant.pseudo, member: participant.member }))

    const inside = await server.connect({ cookie: await member() })
    await join(inside, visitor('ignored'))
    const guest = await server.connect()
    const result = await join(guest, visitor('Guest'))
    await sleep(50)

    assert.deepEqual(arrivals, [
      { pseudo: 'Nina_B', member: true },
      { pseudo: 'Guest', member: false },
    ])
    assert.ok(result.ok)
    if (result.ok) {
      const flags = Object.fromEntries(result.snapshot.participants.map((participant) => [participant.pseudo, participant.member]))
      assert.deepEqual(flags, { Watcher: false, Nina_B: true, Guest: false })
    }
  })

  it('are in a room once: a second connection is told so, and gets in once the first has left', async () => {
    const cookie = await member()
    const first = await server.connect({ cookie })
    const second = await server.connect({ cookie })
    assert.equal((await join(first, visitor('x'))).ok, true)
    assert.deepEqual(await join(second, visitor('x')), { ok: false, error: 'already-in-room' })
    await pause()
    assert.equal((await join(second, visitor('x', 'jazz-cafe'))).ok, true, 'another room is fine')

    first.emit('room:leave')
    // Events of one connection are handled in order: once this answer is back, the leave has been processed.
    await join(first, visitor('x', 'nowhere'))
    await pause()
    assert.equal((await join(second, visitor('x'))).ok, true)
  })

  it('can leave and come back on the same connection', async () => {
    const socket = await server.connect({ cookie: await member() })
    assert.equal((await join(socket, visitor('x'))).ok, true)
    await pause()
    assert.equal((await join(socket, visitor('x'))).ok, true, 'joining again is leaving and joining')
  })

  it('are not marked as members for a connection opened before they signed in: the page has to reconnect', async () => {
    const early = await server.connect()
    const cookie = await member()
    const stale = await join(early, { roomId: room, pseudo: 'Nina_B', avatarId: 'moss' })
    assert.deepEqual(stale, { ok: false, error: 'pseudo-reserved' }, 'still a visitor, and the pseudo is theirs now')
    const fresh = await server.connect({ cookie })
    const result = await join(fresh, visitor('ignored'))
    assert.equal(result.ok, true)
  })

  it('are visitors again once signed out, even on a connection that carries the old cookie', async () => {
    const cookie = await member()
    await api(server.url, '/api/auth/logout', { method: 'POST', body: {}, cookie })
    const socket = await server.connect({ cookie })
    const result = await join(socket, visitor('Somebody'))
    assert.equal(result.ok, true)
    if (!result.ok) return
    const self = result.snapshot.participants.find((participant) => participant.id === result.snapshot.selfId)
    assert.deepEqual({ pseudo: self?.pseudo, member: self?.member }, { pseudo: 'Somebody', member: false })
  })

  it('stay in the rooms when the session cannot be read: they come in as visitors', async () => {
    mock.method(console, 'error', () => undefined)
    const store = new MemoryAccountStore()
    store.findBySession = async () => {
      throw new Error('database down')
    }
    await server.close()
    await start({ store })
    const socket = await server.connect({ cookie: `noctune_session=${'a'.repeat(43)}` })
    const result = await join(socket, visitor('Somebody'))
    assert.equal(result.ok, true)
  })
})

describe('the pseudo of a member', () => {
  it('cannot be taken by a visitor, whatever the case or the look-alike characters', async () => {
    await member()
    for (const pseudo of ['Nina_B', 'nina_b', 'NINA_B', 'ＮＩＮＡ_Ｂ', '  Nina_B  ']) {
      // One connection for each: a connection may not join twice within 300 ms.
      assert.deepEqual(await join(await server.connect(), visitor(pseudo)), { ok: false, error: 'pseudo-reserved' }, pseudo)
    }
  })

  it('cannot be a name that would pass for the team, member or not', async () => {
    for (const pseudo of ['Admin', 'admin_', 'MODÉRATEUR', 'Noctune']) {
      assert.deepEqual(await join(await server.connect(), visitor(pseudo)), { ok: false, error: 'pseudo-reserved' }, pseudo)
    }
  })

  it('does not stop the same visitor from trying another one', async () => {
    await member()
    const socket = await server.connect()
    assert.equal((await join(socket, visitor('Nina_B'))).ok, false)
    await pause()
    assert.equal((await join(socket, visitor('Nina_C'))).ok, true)
  })

  it('is not checked for a server without accounts: every pseudo is free', async () => {
    await server.close()
    await start({ withoutAccounts: true })
    const socket = await server.connect()
    assert.equal((await join(socket, visitor('Nina_B'))).ok, true)
  })

  it('does not close the rooms when the database does not answer', async () => {
    const logged = mock.method(console, 'error', () => undefined)
    const store = new MemoryAccountStore()
    store.isPseudoTaken = async () => {
      throw new Error('database down')
    }
    await server.close()
    await start({ store })
    const socket = await server.connect()
    assert.equal((await join(socket, visitor('Somebody'))).ok, true)
    assert.ok(logged.mock.calls.length > 0, 'the trouble is in the log')
  })
})

describe('joining while the database is slow', () => {
  class SlowStore extends MemoryAccountStore {
    constructor(private readonly delayMs = 80) {
      super()
    }

    async isPseudoTaken(pseudo: string) {
      await sleep(this.delayMs)
      return super.isPseudoTaken(pseudo)
    }
  }

  /** What the rooms hold right now, as the list of rooms shows it. */
  async function onlineIn(roomId: string): Promise<number> {
    const watcher = await server.connect()
    const rooms = await answer<RoomSummary[]>((callback) => watcher.emit('lobby:join', callback))
    watcher.disconnect()
    return rooms.find((summary) => summary.id === roomId)?.online ?? -1
  }

  beforeEach(async () => {
    await server.close()
    await start({ store: new SlowStore() })
  })

  it('never lets in somebody who left in the meantime, and the room never hears of them', async () => {
    const watcher = await server.connect()
    await join(watcher, visitor('Watcher'))
    const heard: string[] = []
    watcher.on('room:participant-joined', (participant) => heard.push(participant.pseudo))

    const socket = await server.connect()
    socket.emit('room:join', visitor('Ghost'), () => undefined)
    // Long enough for the server to have started the join (and be waiting for the database), short of its answer.
    // (A disconnection that arrives together with the event is simpler: Socket.IO drops the event.)
    await sleep(30)
    socket.disconnect()
    await sleep(250)
    assert.deepEqual(heard, [], 'nobody was told that a ghost arrived')
    assert.equal(await onlineIn(room), 1, 'only the watcher is in the room')
  })

  it('takes the leave that comes right after the join as the last word', async () => {
    const socket = await server.connect()
    const joined = join(socket, visitor('Quick'))
    socket.emit('room:leave')
    assert.equal((await joined).ok, true, 'the join was answered')
    await sleep(250)
    assert.equal(await onlineIn(room), 0, 'and the leave that followed it took effect')
  })

  it('keeps only the last of two joins in a row from one connection', async () => {
    await server.close()
    await start({ store: new SlowStore(450) })
    const watcher = await server.connect()
    await join(watcher, visitor('Watcher', 'jazz-cafe'))
    const socket = await server.connect()
    const first = join(socket, visitor('First', 'jazz-cafe'))
    // Past the 300 ms a connection must keep between two joins, while the first one is still waiting for the database.
    await sleep(330)
    const second = join(socket, visitor('Second', 'jazz-cafe'))
    const [a, b] = await Promise.all([first, second])
    assert.ok(a.ok && b.ok)
    await sleep(100)
    const result = await join(await server.connect(), visitor('Check', 'jazz-cafe'))
    assert.ok(result.ok)
    if (result.ok) {
      assert.deepEqual(result.snapshot.participants.map((participant) => participant.pseudo).sort(), ['Check', 'Second', 'Watcher'])
    }
  })

  it('does not slow down the people who are already in a room: a join waiting for the database holds up nobody else', async () => {
    const inside = await server.connect({ cookie: await member() })
    await join(inside, visitor('ignored'))
    // Somebody else's join is waiting for the (slow) database right now.
    const slow = await server.connect()
    const waiting = join(slow, visitor('Slowpoke'))
    await sleep(20)

    const started = Date.now()
    const reply = await answer((callback) => inside.emit('chat:send', { text: 'bonjour' }, callback))
    assert.deepEqual(reply, { ok: true })
    assert.ok(Date.now() - started < 50, 'a chat message does not wait for another visitor’s join')
    assert.equal((await waiting).ok, true)
  })
})

describe('when joining fails for a reason nobody planned for', () => {
  it('answers with an error instead of staying silent, and the connection can try again', async () => {
    const logged = mock.method(console, 'error', () => undefined)
    mock.method(Room.prototype, 'add', () => {
      throw new Error('boom')
    })
    const socket = await server.connect()
    assert.deepEqual(await join(socket, visitor('Somebody')), { ok: false, error: 'server-error' })
    assert.ok(logged.mock.calls.some((call) => String(call.arguments[0]).includes('boom')), 'what happened is in the log')

    mock.restoreAll()
    await pause()
    assert.equal((await join(socket, visitor('Somebody'))).ok, true, 'the next try is not blocked by the failed one')
  })
})

describe('when a session ends', () => {
  const login = (cookie?: string) =>
    api(server.url, '/api/auth/login', { body: { email: nina.email, password: nina.password }, cookie })
  // A connection that should have been closed and was not must fail the test, not hang it.
  const closedBy = (socket: TestSocket) =>
    new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the connection was not closed within 3 s')), 3000)
      socket.once('disconnect', (reason) => {
        clearTimeout(timer)
        resolve(reason)
      })
    })
  const onlineIn = async (roomId: string) => {
    const watcher = await server.connect()
    const rooms = await answer<RoomSummary[]>((callback) => watcher.emit('lobby:join', callback))
    watcher.disconnect()
    return rooms.find((summary) => summary.id === roomId)?.online
  }

  it('closes the connections it opened, takes the member out of the room, and leaves the other sessions alone', async () => {
    const first = await member()
    const second = (await login()).cookie
    assert.ok(second)
    const a = await server.connect({ cookie: first })
    const b = await server.connect({ cookie: second })
    assert.equal((await join(a, visitor('x'))).ok, true)
    assert.equal((await join(b, visitor('x', 'jazz-cafe'))).ok, true)

    const closed = closedBy(a)
    assert.equal((await api(server.url, '/api/auth/logout', { method: 'POST', body: {}, cookie: first })).status, 200)
    assert.equal(await closed, 'io server disconnect')
    await sleep(50)
    assert.equal(b.connected, true, 'the other session of the same account is untouched')
    assert.equal(await onlineIn(room), 0, 'the member is out of the room')
    assert.equal(await onlineIn('jazz-cafe'), 1)
  })

  it('closes them when a new sign-in replaces the session, and the replaced cookie opens nothing any more', async () => {
    const cookie = await member()
    const socket = await server.connect({ cookie })
    const closed = closedBy(socket)
    const again = await login(cookie)
    assert.equal(again.status, 200)
    assert.equal(await closed, 'io server disconnect')
    assert.deepEqual((await api(server.url, '/api/auth/me', { cookie })).body, { ok: true, account: null })
    assert.equal((await api(server.url, '/api/auth/me', { cookie: again.cookie })).body.account.pseudo, 'Nina_B')
  })

  it('closes nothing else: visitors and other members stay', async () => {
    const cookie = await member()
    const other = await member({ email: 'other@example.com', pseudo: 'Other' })
    const visitorSocket = await server.connect()
    const otherSocket = await server.connect({ cookie: other })
    await api(server.url, '/api/auth/logout', { method: 'POST', body: {}, cookie })
    await sleep(100)
    assert.equal(visitorSocket.connected, true)
    assert.equal(otherSocket.connected, true)
  })
})

describe('the connection itself', () => {
  it('is refused when it comes from another site, even with a valid session cookie', async () => {
    const cookie = await member()
    await assert.rejects(server.connect({ cookie, origin: 'http://evil.example' }))
    await assert.rejects(server.connect({ origin: 'http://localhost:5173.evil.example' }))
  })

  it('is refused when the browser says it is cross-site but sends no origin, and accepted when it says same-origin', async () => {
    await assert.rejects(server.connect({ headers: { 'sec-fetch-site': 'cross-site' } }))
    await assert.rejects(server.connect({ headers: { 'sec-fetch-site': 'same-site' } }))
    assert.ok((await server.connect({ headers: { 'sec-fetch-site': 'same-origin' } })).connected)
  })

  it('does not wait for ever to know who it is: past the time allowed it comes in as a visitor', async () => {
    mock.method(console, 'error', () => undefined)
    const store = new MemoryAccountStore()
    store.findBySession = () => new Promise(() => undefined) // a database that never answers
    await server.close()
    await start({ store, sessionLookupTimeoutMs: 100 })
    const started = Date.now()
    const socket = await server.connect({ cookie: `noctune_session=${'a'.repeat(43)}` })
    assert.ok(Date.now() - started >= 90, 'it waited for the database first')
    assert.ok(Date.now() - started < 1500, 'and then it came in')
    const result = await join(socket, visitor('Somebody'))
    assert.equal(result.ok, true)
  })

  it('is accepted from the site itself, and from a client that says nothing about where it comes from', async () => {
    const own = await server.connect({ origin: 'http://localhost:5173' })
    assert.ok(own.connected)
    const script = await server.connect()
    assert.ok(script.connected)
  })
})
