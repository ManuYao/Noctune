// Integration test: a real Socket.IO server and real clients over a local port.
// socket.io-client is a dependency of the web app, resolved here through the workspace root.
import assert from 'node:assert/strict'
import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'
import { Server } from 'socket.io'
import { io as connect, type Socket } from 'socket.io-client'
import type {
  ChatMessage,
  ChatResult,
  ClientToServerEvents,
  JoinPayload,
  JoinResult,
  Participant,
  ServerToClientEvents,
} from '../../shared/protocol'
import { registerRoomHandlers, type IoServer } from './registerRoomHandlers'

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let httpServer: HttpServer
let io: IoServer
let url: string
const clients: TestSocket[] = []

before(async () => {
  httpServer = createServer()
  io = new Server(httpServer)
  registerRoomHandlers(io)
  await new Promise<void>((resolve) => httpServer.listen(0, resolve))
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`
})

after(async () => {
  for (const client of clients) client.disconnect()
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
