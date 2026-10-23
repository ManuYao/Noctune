// Integration test: a real Socket.IO server and real clients over a local port.
// socket.io-client is a dependency of the web app, resolved here through the workspace root.
import assert from 'node:assert/strict'
import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, afterEach, before, describe, it } from 'node:test'
import { Server } from 'socket.io'
import { io as connect, type Socket } from 'socket.io-client'
import type {
  ChatMessage,
  ChatResult,
  ClientToServerEvents,
  JoinPayload,
  JoinResult,
  Participant,
  ReactResult,
  Reactions,
  RoomSummary,
  ServerToClientEvents,
  Track,
} from '../../shared/protocol'
import { ROOM_DEFS } from './catalog'
import { registerRoomHandlers, type IoServer } from './registerRoomHandlers'

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let httpServer: HttpServer
let io: IoServer
let url: string
const clients: TestSocket[] = []

before(async () => {
  httpServer = createServer()
  io = new Server(httpServer)
  // No protected seconds here: a vote to skip can be tested without waiting 30 s (the rule itself is in Room.test.ts).
  // The list of rooms is sent after 20 ms instead of half a second (the batching itself is in Lobby.test.ts).
  registerRoomHandlers(io, { skipProtectedSec: 0, lobbyDelayMs: 20 })
  await new Promise<void>((resolve) => httpServer.listen(0, resolve))
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`
})

// Rooms must be empty at the start of every test: the votes needed depend on how many people are there.
afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect()
  for (let attempt = 0; attempt < 100 && io.of('/').sockets.size > 0; attempt += 1) await sleep(10)
})

after(async () => {
  await io.close()
})

async function connectClient(): Promise<TestSocket> {
  const socket: TestSocket = connect(url, { transports: ['websocket'] })
  clients.push(socket)
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', reject)
  })
  return socket
}

const join = (socket: TestSocket, payload: JoinPayload) =>
  new Promise<JoinResult>((resolve) => socket.emit('room:join', payload, resolve))

const send = (socket: TestSocket, text: string) =>
  new Promise<ChatResult>((resolve) => socket.emit('chat:send', { text }, resolve))

const nextMessage = (socket: TestSocket) => new Promise<ChatMessage>((resolve) => socket.once('chat:message', resolve))

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function joinedClient(roomId: string, pseudo: string, avatarId = 'pulse') {
  const socket = await connectClient()
  const result = await join(socket, { roomId, pseudo, avatarId })
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error('join refused')
  return { socket, snapshot: result.snapshot }
}

describe('joining a room', () => {
  const room = 'lofi-du-soir'

  it('refuses an unknown room, a bad pseudo and a bad avatar', async () => {
    const socket = await connectClient()
    const bad = (payload: unknown) => join(socket, payload as JoinPayload)
    assert.deepEqual(await bad({ roomId: 'nope', pseudo: 'Alice', avatarId: 'pulse' }), { ok: false, error: 'unknown-room' })
    assert.deepEqual(await bad(null), { ok: false, error: 'unknown-room' })
    assert.deepEqual(await bad({ roomId: room, pseudo: 'x', avatarId: 'pulse' }), { ok: false, error: 'invalid-pseudo' })
    assert.deepEqual(await bad({ roomId: room, pseudo: 42, avatarId: 'pulse' }), { ok: false, error: 'invalid-pseudo' })
    assert.deepEqual(await bad({ roomId: room, pseudo: 'Alice', avatarId: 'nope' }), { ok: false, error: 'invalid-avatar' })
  })

  it('refuses a pseudo already taken in the room, whatever its case', async () => {
    await joinedClient(room, 'Zoé')
    const other = await connectClient()
    assert.deepEqual(await join(other, { roomId: room, pseudo: 'zoé', avatarId: 'moss' }), {
      ok: false,
      error: 'pseudo-taken',
    })
  })

  it('tells the others when someone arrives and leaves', async () => {
    const { socket: first } = await joinedClient(room, 'Premier')
    const arrived = new Promise<Participant>((resolve) => first.once('room:participant-joined', resolve))
    const { socket: second, snapshot } = await joinedClient(room, 'Second', 'mango')
    assert.equal((await arrived).pseudo, 'Second')

    const left = new Promise<string>((resolve) => first.once('room:participant-left', resolve))
    second.disconnect()
    assert.equal(await left, snapshot.selfId)
  })
})

describe('playback', () => {
  it('gives everyone the same current track, with its video and start time', async () => {
    const { snapshot: first } = await joinedClient('lofi-du-soir', 'Ecoute1')
    const { snapshot: second } = await joinedClient('lofi-du-soir', 'Ecoute2')

    const track = first.nowPlaying
    assert.ok(track)
    assert.match(track.videoId, /^[\w-]{11}$/)
    assert.ok(track.durationSec > 0)
    assert.ok(track.startedAt <= first.serverTime)
    assert.deepEqual(second.nowPlaying, track)
  })
})

describe('reactions', () => {
  const room = 'lofi-du-soir'

  const like = (socket: TestSocket, value: unknown) =>
    new Promise<ReactResult>((resolve) => socket.emit('track:like', { value } as never, resolve))
  const skip = (socket: TestSocket, value: unknown) =>
    new Promise<ReactResult>((resolve) => socket.emit('track:skip', { value } as never, resolve))

  it('refuses to react before joining a room, or with something that is not a boolean', async () => {
    const stranger = await connectClient()
    assert.deepEqual(await like(stranger, true), { ok: false, error: 'not-in-room' })
    assert.deepEqual(await skip(stranger, true), { ok: false, error: 'not-in-room' })

    const { socket } = await joinedClient(room, 'Alice')
    assert.deepEqual(await like(socket, 'yes'), { ok: false, error: 'invalid' })
    assert.deepEqual(await skip(socket, undefined), { ok: false, error: 'invalid' })
    const garbage = new Promise<ReactResult>((resolve) => socket.emit('track:like', null as never, resolve))
    assert.deepEqual(await garbage, { ok: false, error: 'invalid' })
  })

  it('tells the whole room about a like, and gives late joiners the count', async () => {
    const { socket: alice } = await joinedClient(room, 'Alice')
    const { socket: bob } = await joinedClient(room, 'Bob')
    const seenByBob = new Promise<Reactions>((resolve) =>
      bob.on('track:reactions', (reactions) => reactions.likes === 1 && resolve(reactions)),
    )

    assert.deepEqual(await like(alice, true), { ok: true })
    assert.deepEqual(await seenByBob, { likes: 1, skipVotes: 0, skipRequired: 2 })

    const { snapshot } = await joinedClient(room, 'Carol')
    assert.deepEqual(snapshot.reactions, { likes: 1, skipVotes: 0, skipRequired: 2 })
    assert.deepEqual(snapshot.mine, { liked: false, votedSkip: false })
  })

  it('treats someone who joins again as a new participant: their like stays counted, their own state starts clean', async () => {
    await joinedClient(room, 'Alice')
    const { socket: bob } = await joinedClient(room, 'Bob')
    assert.deepEqual(await like(bob, true), { ok: true })

    const again = await join(bob, { roomId: room, pseudo: 'Bob2', avatarId: 'mango' })
    assert.ok(again.ok)
    assert.deepEqual(again.snapshot.reactions, { likes: 1, skipVotes: 0, skipRequired: 2 })
    assert.deepEqual(again.snapshot.mine, { liked: false, votedSkip: false })
  })

  it('limits how fast one participant can react', async () => {
    const { socket } = await joinedClient(room, 'Alice')
    assert.deepEqual(await like(socket, true), { ok: true })

    const tooFast = await like(socket, false)
    assert.equal(tooFast.ok, false)
    if (tooFast.ok || tooFast.error !== 'rate-limited') throw new Error(`unexpected result ${JSON.stringify(tooFast)}`)
    assert.ok(tooFast.retryAfterMs > 0 && tooFast.retryAfterMs <= 300)
  })

  it('skips the track for everyone once most of the room voted', async () => {
    const alice = await joinedClient(room, 'Alice')
    const bob = await joinedClient(room, 'Bob')
    const carol = await joinedClient(room, 'Carol')
    const before = alice.snapshot.nowPlaying
    assert.ok(before)

    const changes = [alice, bob, carol].map(
      ({ socket }) =>
        new Promise<{ track: Track | null; reactions: Reactions }>((resolve) =>
          socket.once('room:track', (track, reactions) => resolve({ track, reactions })),
        ),
    )

    assert.deepEqual(await skip(alice.socket, true), { ok: true }) // 1 of the 2 needed: nothing yet
    assert.deepEqual(await skip(bob.socket, true), { ok: true }) // 2 of 2: the track changes

    for (const { track, reactions } of await Promise.all(changes)) {
      assert.ok(track)
      assert.notEqual(track.videoId, before.videoId)
      assert.deepEqual(reactions, { likes: 0, skipVotes: 0, skipRequired: 2 })
    }
  })
})

describe('chat', () => {
  it('refuses to send before joining a room', async () => {
    const socket = await connectClient()
    assert.deepEqual(await send(socket, 'salut'), { ok: false, error: 'not-in-room' })
  })

  it('delivers a message to the whole room and to no other room', async () => {
    const { socket: alice, snapshot } = await joinedClient('rock-progressif', 'Alice')
    const { socket: bob } = await joinedClient('rock-progressif', 'Bob')
    const { socket: elsewhere } = await joinedClient('jazz-cafe', 'Claire')
    let leaked = false
    elsewhere.on('chat:message', () => (leaked = true))

    const [forAlice, forBob, result] = await Promise.all([
      nextMessage(alice),
      nextMessage(bob),
      send(alice, '  salut   tout le monde '),
    ])
    assert.deepEqual(result, { ok: true })
    assert.equal(forAlice.id, forBob.id)
    assert.equal(forBob.text, 'salut tout le monde')
    assert.equal(forBob.pseudo, 'Alice')
    assert.equal(forBob.avatarId, 'pulse')
    assert.equal(forBob.authorId, snapshot.selfId)

    await sleep(50)
    assert.equal(leaked, false)
  })

  it('gives a late joiner the recent history', async () => {
    const { socket: alice } = await joinedClient('electro-nuit', 'Alice')
    assert.deepEqual(await send(alice, 'premier'), { ok: true })

    const { snapshot } = await joinedClient('electro-nuit', 'Bob')
    assert.deepEqual(
      snapshot.chat.map((message) => [message.pseudo, message.text]),
      [['Alice', 'premier']],
    )
  })

  it('allows one message every few seconds and says when to retry', async () => {
    const { socket: alice } = await joinedClient('jazz-cafe', 'Alice')
    assert.deepEqual(await send(alice, 'un'), { ok: true })

    const second = await send(alice, 'deux')
    assert.equal(second.ok, false)
    if (second.ok || second.error !== 'rate-limited') throw new Error(`unexpected result ${JSON.stringify(second)}`)
    assert.ok(second.retryAfterMs > 0 && second.retryAfterMs <= 3000)

    const { snapshot } = await joinedClient('jazz-cafe', 'Bob')
    assert.deepEqual(
      snapshot.chat.filter((message) => message.pseudo === 'Alice').map((message) => message.text),
      ['un'],
    )
  })

  it('refuses links, long and empty messages without costing the author their turn', async () => {
    const { socket } = await joinedClient('hip-hop-classics', 'Alice')
    assert.deepEqual(await send(socket, 'écoute https://example.com'), { ok: false, error: 'links-not-allowed' })
    assert.deepEqual(await send(socket, 'a'.repeat(301)), { ok: false, error: 'too-long' })
    assert.deepEqual(await send(socket, '   '), { ok: false, error: 'empty' })
    const garbage = new Promise<ChatResult>((resolve) => socket.emit('chat:send', null as never, resolve))
    assert.deepEqual(await garbage, { ok: false, error: 'empty' })
    assert.deepEqual(await send(socket, 'ok'), { ok: true })
  })

  it('forgets the history once the room is empty', async () => {
    const { socket: alice } = await joinedClient('french-touch', 'Alice')
    assert.deepEqual(await send(alice, 'seule ici'), { ok: true })

    alice.emit('room:leave')
    // Events of one socket are handled in order: this answer proves the leave was processed.
    assert.deepEqual(await send(alice, 'toujours là ?'), { ok: false, error: 'not-in-room' })

    const { snapshot } = await joinedClient('french-touch', 'Bob')
    assert.deepEqual(snapshot.chat, [])
  })
})

describe('the list of rooms', () => {
  const room = 'lofi-du-soir'
  const follow = (socket: TestSocket) => new Promise<RoomSummary[]>((resolve) => socket.emit('lobby:join', resolve))
  const summaryOf = (rooms: RoomSummary[], id = room) => rooms.find((candidate) => candidate.id === id)
  // Lets the announcements already on their way go out (the delay is 20 ms), so that the next update
  // can only come from the change a test is about.
  const settle = () => sleep(80)

  /** Resolves with the first update that satisfies `wanted`; fails when none does in time. Call it before the cause. */
  function updateWhere(socket: TestSocket, wanted: (rooms: RoomSummary[]) => boolean, timeoutMs = 1000) {
    return new Promise<RoomSummary[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off('lobby:rooms', onRooms)
        reject(new Error('no matching update of the list'))
      }, timeoutMs)
      function onRooms(rooms: RoomSummary[]) {
        if (!wanted(rooms)) return
        clearTimeout(timer)
        socket.off('lobby:rooms', onRooms)
        resolve(rooms)
      }
      socket.on('lobby:rooms', onRooms)
    })
  }

  it('lists every room in order, empty at first, without joining any room', async () => {
    const rooms = await follow(await connectClient())
    assert.deepEqual(
      rooms.map((summary) => summary.id),
      ROOM_DEFS.map((def) => def.id),
    )
    for (const summary of rooms) {
      assert.equal(summary.online, 0)
      assert.equal(summary.nowPlaying, null)
    }
    assert.deepEqual(summaryOf(rooms), { id: room, name: 'Lo-fi du soir', genre: 'Lo-fi', online: 0, nowPlaying: null })
  })

  it('tells the followers who comes and goes, and what plays', async () => {
    const watcher = await connectClient()
    await follow(watcher)

    const arrival = updateWhere(watcher, (rooms) => summaryOf(rooms)?.online === 1)
    const { socket: alice, snapshot } = await joinedClient(room, 'Alice')
    const rooms = await arrival
    assert.deepEqual(summaryOf(rooms)?.nowPlaying, {
      title: snapshot.nowPlaying?.title,
      artist: snapshot.nowPlaying?.artist,
    })
    assert.equal(rooms.filter((summary) => summary.online > 0).length, 1, 'the other rooms are untouched')

    const departure = updateWhere(watcher, (list) => summaryOf(list)?.online === 0)
    alice.emit('room:leave')
    const emptied = await departure
    assert.equal(summaryOf(emptied)?.nowPlaying, null)
  })

  it('counts the next person who comes to a room that already plays', async () => {
    // Without a track to start, nothing else announces this arrival: only the arrival itself does.
    await joinedClient(room, 'Alice')
    const watcher = await connectClient()
    assert.equal(summaryOf(await follow(watcher))?.online, 1)
    await settle()

    const arrival = updateWhere(watcher, (rooms) => summaryOf(rooms)?.online === 2)
    await joinedClient(room, 'Bob')
    await arrival
  })

  it('tells the followers when the track changes', async () => {
    const { socket: alice, snapshot } = await joinedClient(room, 'Alice')
    const watcher = await connectClient()
    assert.equal(summaryOf(await follow(watcher))?.nowPlaying?.title, snapshot.nowPlaying?.title)
    await settle()

    const next = updateWhere(watcher, (rooms) => summaryOf(rooms)?.nowPlaying?.title !== snapshot.nowPlaying?.title)
    // Alone in the room, her vote is the majority.
    assert.deepEqual(await new Promise<ReactResult>((resolve) => alice.emit('track:skip', { value: true }, resolve)), {
      ok: true,
    })
    assert.notEqual(summaryOf(await next)?.nowPlaying?.title, snapshot.nowPlaying?.title)
  })

  it('says nothing to someone who stopped following', async () => {
    const quitter = await connectClient()
    const follower = await connectClient()
    await follow(quitter)
    await follow(follower)
    quitter.emit('lobby:leave')
    // Events of one socket are handled in order: this answer proves the leave was processed.
    await join(quitter, { roomId: 'nowhere', pseudo: 'Quitter', avatarId: 'pulse' })

    let heard = 0
    quitter.on('lobby:rooms', () => (heard += 1))
    const arrival = updateWhere(follower, (rooms) => summaryOf(rooms)?.online === 1)
    await joinedClient(room, 'Alice')
    await arrival
    await sleep(100)
    assert.equal(heard, 0)
  })

  it('does not send the list to someone who never asked for it', async () => {
    const bystander = await connectClient()
    const follower = await connectClient()
    await follow(follower)

    let heard = 0
    bystander.on('lobby:rooms', () => (heard += 1))
    const arrival = updateWhere(follower, (rooms) => summaryOf(rooms)?.online === 1)
    await joinedClient(room, 'Alice')
    await arrival
    await sleep(100)
    assert.equal(heard, 0)
  })

  it('ignores a request that cannot be answered and keeps working', async () => {
    const socket = await connectClient()
    ;(socket as unknown as { emit: (event: string) => void }).emit('lobby:join')
    const rooms = await follow(socket)
    assert.equal(rooms.length, ROOM_DEFS.length)
  })
})
