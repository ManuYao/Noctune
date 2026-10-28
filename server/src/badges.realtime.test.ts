// A member who earns a badge is told, through their real connection: what a beta tester would see as the "trophy" toast.
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import type { BadgeEarned, ChatResult, JoinPayload, JoinResult } from '../../shared/protocol'
import { api, startServer, type Started, type TestSocket } from './testing/startServer'

const ROOM = 'lofi-du-soir'
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let server: Started
afterEach(async () => {
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

async function until(condition: () => boolean, what: string, timeoutMs: number) {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > timeoutMs) assert.fail(`timed out waiting for: ${what}`)
    await sleep(25)
  }
}

async function memberSocket(pseudo: string): Promise<{ socket: TestSocket; earned: BadgeEarned[][] }> {
  const reply = await api(server.url, '/api/auth/register', {
    body: { email: `${pseudo.toLowerCase()}@example.com`, password: 'a long enough password', pseudo, avatarId: 'mango' },
  })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))
  const socket = await server.connect({ cookie: reply.cookie as string })
  const earned: BadgeEarned[][] = []
  socket.on('badge:earned', (badges) => earned.push(badges))
  const payload: JoinPayload = { roomId: ROOM, pseudo: 'ignored', avatarId: 'moss' }
  const joined = await answer<JoinResult>((callback) => socket.emit('room:join', payload, callback))
  assert.ok(joined.ok, JSON.stringify(joined))
  return { socket, earned }
}

describe('telling a member they earned a badge', () => {
  it('pushes it to their connection a few seconds after what earned it (a first message)', async () => {
    server = await startServer()
    const ann = await memberSocket('Ann')
    const sent = await answer<ChatResult>((callback) => ann.socket.emit('chat:send', { text: 'Salut' }, callback))
    assert.ok(sent.ok, JSON.stringify(sent))

    await until(() => ann.earned.length > 0, 'badge:earned after a first message', 8000)
    const names = ann.earned.flat().map((badge) => badge.name)
    assert.ok(names.length > 0, `badges announced: ${JSON.stringify(ann.earned)}`)
  })

  it('tells each level once: nothing more for the same message', async () => {
    server = await startServer()
    const ann = await memberSocket('Ben')
    await answer<ChatResult>((callback) => ann.socket.emit('chat:send', { text: 'Salut' }, callback))
    await until(() => ann.earned.length > 0, 'the first announcement', 8000)
    const first = ann.earned.length
    await sleep(500)
    assert.equal(ann.earned.length, first, 'announced once')
  })
})
