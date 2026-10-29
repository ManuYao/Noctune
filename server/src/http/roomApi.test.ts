// The rooms API through real HTTP, the way a browser calls it: with the session cookie, from the site's own origin.
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import { ROOMS_PER_MEMBER_MAX } from '../../../shared/protocol'
import { ROOM_DEFS } from '../catalog'
import { MemoryRoomStore } from '../rooms/MemoryRoomStore'
import { ROOM_ID_SHAPE } from '../rooms/RoomService'
import { api, startServer, type ApiReply, type Started, type StartOptions } from '../testing/startServer'

const SETTINGS = {
  name: 'Rock nocturne',
  description: 'Des guitares la nuit.',
  styles: ['rock'],
  theme: 'sunset',
  rules: { maxTrackSec: 900, repeatDelaySec: 7200, maxDjs: 10 },
}

let server: Started

async function start(options: StartOptions = {}) {
  server = await startServer(options)
}

afterEach(async () => {
  mock.restoreAll()
  await server.close()
})

let accountCount = 0
/** A member, and the cookie their browser would send. */
async function member(pseudo = 'Ann'): Promise<string> {
  accountCount += 1
  const reply = await api(server.url, '/api/auth/register', {
    body: { email: `rm${accountCount}@example.com`, password: 'a long enough password', pseudo, avatarId: 'mango' },
  })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))
  assert.ok(reply.cookie, 'a cookie was given')
  return reply.cookie as string
}

const call = (cookie: string | undefined, path: string, init: Parameters<typeof api>[2] = {}) => api(server.url, `/api/rooms${path}`, { cookie, ...init })
const post = (cookie: string | undefined, body: unknown, init: Parameters<typeof api>[2] = {}) => call(cookie, '', { method: 'POST', body, ...init })
const patch = (cookie: string | undefined, id: string, body: unknown, init: Parameters<typeof api>[2] = {}) => call(cookie, `/${id}`, { method: 'PATCH', body, ...init })
const del = (cookie: string | undefined, id: string, init: Parameters<typeof api>[2] = {}) => call(cookie, `/${id}`, { method: 'DELETE', ...init })

async function make(cookie: string, name = 'Rock nocturne'): Promise<string> {
  const reply = await post(cookie, { ...SETTINGS, name })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))
  return reply.body.room.id
}

const failure = (reply: ApiReply) => reply.body?.error

describe('reading a room', () => {
  it('gives a room of the team to a visitor, with no host and nothing that is theirs', async () => {
    await start()
    const reply = await call(undefined, '/lofi-du-soir')
    assert.equal(reply.status, 200)
    assert.deepEqual(reply.body.room, {
      id: 'lofi-du-soir',
      name: ROOM_DEFS[0].name,
      description: ROOM_DEFS[0].description,
      styles: ROOM_DEFS[0].styles,
      theme: ROOM_DEFS[0].theme,
      rules: ROOM_DEFS[0].rules,
      host: null,
      mine: false,
    })
    assert.equal(reply.headers['cache-control'], 'no-store')
  })

  it('says a room is not there, for an id nobody has and for ids that cannot be one', async () => {
    await start()
    for (const id of ['no-such-room', '%23lobby', '..%2F..%2Fetc', 'x'.repeat(80), '%E0%A4%A', 'UPPER']) {
      const reply = await call(undefined, `/${id}`)
      assert.deepEqual([reply.status, failure(reply)], [404, 'room-not-found'], id)
    }
  })

  it('shows whose a room is: mine for the host, not for another member or a visitor', async () => {
    await start()
    const ann = await member('Ann')
    const ben = await member('Ben')
    const id = await make(ann)
    assert.equal((await call(ann, `/${id}`)).body.room.mine, true)
    assert.equal((await call(ben, `/${id}`)).body.room.mine, false)
    const visitor = await call(undefined, `/${id}`)
    assert.deepEqual([visitor.body.room.mine, visitor.body.room.host], [false, 'Ann'])
  })

  it('lists the rooms a member hosts, for them alone', async () => {
    await start()
    const ann = await member('Ann')
    const ben = await member('Ben')
    const one = await make(ann, 'Ann room one')
    await make(ben, 'Ben room')
    const reply = await call(ann, '/mine')
    assert.equal(reply.status, 200)
    assert.deepEqual(reply.body.rooms.map((room: { id: string }) => room.id), [one])
    assert.deepEqual([(await call(undefined, '/mine')).status, failure(await call(undefined, '/mine'))], [401, 'not-signed-in'])
  })
})

describe('making a room', () => {
  it('needs a member, and makes them the host', async () => {
    await start()
    const refused = await post(undefined, SETTINGS)
    assert.deepEqual([refused.status, failure(refused)], [401, 'not-signed-in'])

    const ann = await member('Ann')
    const reply = await post(ann, SETTINGS)
    assert.equal(reply.status, 201)
    assert.match(reply.body.room.id, ROOM_ID_SHAPE)
    assert.deepEqual([reply.body.room.host, reply.body.room.mine], ['Ann', true])
    assert.equal((await call(undefined, `/${reply.body.room.id}`)).status, 200, 'and it can be read at once')
  })

  it('makes the room appear in the list and be joined, for everybody, at once', async () => {
    await start()
    const ann = await member('Ann')
    const id = await make(ann)
    const socket = await server.connect()
    const rooms = await new Promise<{ id: string; host: string | null }[]>((resolve) => socket.emit('lobby:join', resolve))
    assert.deepEqual(rooms.map((room) => room.id), [...ROOM_DEFS.map((def) => def.id), id])
    assert.equal(rooms.at(-1)?.host, 'Ann')
  })

  it('answers the reason for every refusal, and makes nothing', async () => {
    await start()
    const ann = await member('Ann')
    const cases: [string, unknown, number, string][] = [
      ['a name that is too short', { ...SETTINGS, name: 'ab' }, 400, 'invalid-name'],
      ['the name of the team', { ...SETTINGS, name: 'Noctune' }, 400, 'invalid-name'],
      ['a link in the description', { ...SETTINGS, description: 'viens sur www.spam.com' }, 400, 'invalid-description'],
      ['no style', { ...SETTINGS, styles: [] }, 400, 'invalid-styles'],
      ['an ambiance nobody knows', { ...SETTINGS, theme: 'pink' }, 400, 'invalid-theme'],
      ['a rule that is not a choice', { ...SETTINGS, rules: { ...SETTINGS.rules, maxDjs: 8 } }, 400, 'invalid-rules'],
      ['the name of a room of the team', { ...SETTINGS, name: 'jazz CAFÉ' }, 409, 'name-taken'],
      ['not settings at all', 'room', 400, 'bad-request'],
    ]
    for (const [title, body, status, error] of cases) {
      const reply = await post(ann, body)
      assert.deepEqual([reply.status, failure(reply)], [status, error], title)
    }
    assert.deepEqual((await call(ann, '/mine')).body.rooms, [])
  })

  it('stops a member at their limit of rooms', async () => {
    await start()
    const ann = await member('Ann')
    for (let index = 0; index < ROOMS_PER_MEMBER_MAX; index += 1) await make(ann, `Ann room ${index}`)
    const reply = await post(ann, { ...SETTINGS, name: 'One too many' })
    assert.deepEqual([reply.status, failure(reply)], [409, 'too-many-rooms'])
    const ben = await member('Ben')
    assert.equal((await post(ben, { ...SETTINGS, name: 'Ben room' })).status, 201)
  })

  it('does not take the host, the id or the key from the page', async () => {
    await start()
    const ann = await member('Ann')
    const reply = await post(ann, { ...SETTINGS, id: 'lofi-du-soir', hostAccountId: 'someone-else', host: 'Ben', nameKey: 'x' })
    assert.equal(reply.status, 201)
    assert.notEqual(reply.body.room.id, 'lofi-du-soir')
    assert.equal(reply.body.room.host, 'Ann')
    assert.equal((await call(undefined, '/lofi-du-soir')).body.room.name, ROOM_DEFS[0].name)
  })
})

describe('changing and deleting a room', () => {
  it('lets the host change it and delete it', async () => {
    await start()
    const ann = await member('Ann')
    const id = await make(ann)
    const changed = await patch(ann, id, { ...SETTINGS, name: 'Jazz du matin', styles: ['jazz'], theme: 'vinyl' })
    assert.equal(changed.status, 200)
    assert.deepEqual([changed.body.room.name, changed.body.room.theme, changed.body.room.id], ['Jazz du matin', 'vinyl', id])
    assert.equal((await call(undefined, `/${id}`)).body.room.name, 'Jazz du matin')

    const deleted = await del(ann, id)
    assert.deepEqual([deleted.status, deleted.body], [200, { ok: true }])
    assert.equal((await call(undefined, `/${id}`)).status, 404)
  })

  it('refuses another member, a visitor and everybody on the rooms of the team, and changes nothing', async () => {
    await start()
    const ann = await member('Ann')
    const ben = await member('Ben')
    const id = await make(ann)

    for (const [title, run] of [
      ['change by another member', () => patch(ben, id, { ...SETTINGS, name: 'Stolen room' })],
      ['delete by another member', () => del(ben, id)],
      ['change of a room of the team', () => patch(ann, 'lofi-du-soir', { ...SETTINGS, name: 'Mine now' })],
      ['delete of a room of the team', () => del(ann, 'lofi-du-soir')],
    ] as const) {
      const reply = await run()
      assert.deepEqual([reply.status, failure(reply)], [403, 'not-host'], title)
    }
    for (const reply of [await patch(undefined, id, SETTINGS), await del(undefined, id)]) {
      assert.deepEqual([reply.status, failure(reply)], [401, 'not-signed-in'])
    }
    assert.equal((await call(undefined, `/${id}`)).body.room.name, 'Rock nocturne')
    assert.equal((await call(undefined, '/lofi-du-soir')).body.room.name, ROOM_DEFS[0].name)
  })

  it('says a room is not there', async () => {
    await start()
    const ann = await member('Ann')
    for (const reply of [await patch(ann, 'no-such-room', SETTINGS), await del(ann, 'no-such-room'), await del(ann, '%23lobby')]) {
      assert.deepEqual([reply.status, failure(reply)], [404, 'room-not-found'])
    }
  })

  it('refuses a name that is another room’s', async () => {
    await start()
    const ann = await member('Ann')
    const id = await make(ann)
    const reply = await patch(ann, id, { ...SETTINGS, name: 'Hip-Hop Classique' })
    assert.deepEqual([reply.status, failure(reply)], [409, 'name-taken'])
  })
})

describe('where a request comes from', () => {
  it('refuses a page of another site on every method, and changes nothing', async () => {
    await start()
    const ann = await member('Ann')
    const id = await make(ann)
    const foreign: Record<string, string>[] = [{ origin: 'http://evil.example' }, { origin: '', 'sec-fetch-site': 'cross-site' }, { origin: '', 'sec-fetch-site': 'same-site' }]
    for (const headers of foreign) {
      for (const [title, reply] of [
        ['post', await post(ann, { ...SETTINGS, name: 'Evil room' }, { headers })],
        ['patch', await patch(ann, id, { ...SETTINGS, name: 'Evil rename' }, { headers })],
        ['delete', await del(ann, id, { headers })],
        ['get', await call(ann, `/${id}`, { headers })],
        ['mine', await call(ann, '/mine', { headers })],
      ] as const) {
        assert.deepEqual([reply.status, failure(reply)], [403, 'forbidden'], `${title} ${JSON.stringify(headers)}`)
      }
    }
    const read = await call(ann, `/${id}`)
    assert.equal(read.body.room.name, 'Rock nocturne')
    assert.deepEqual((await call(ann, '/mine')).body.rooms.length, 1)
  })
})

describe('what a request must look like', () => {
  it('refuses a body that is not JSON, is broken, or is too big', async () => {
    await start()
    const ann = await member('Ann')
    const notJson = await call(ann, '', { method: 'POST', rawBody: 'name=Evil', headers: { 'content-type': 'text/plain' } })
    assert.equal(notJson.status, 415)
    const broken = await call(ann, '', { method: 'POST', rawBody: '{"name":', headers: { 'content-type': 'application/json' } })
    assert.deepEqual([broken.status, failure(broken)], [400, 'bad-request'])
    const huge = await call(ann, '', { method: 'POST', rawBody: JSON.stringify({ ...SETTINGS, description: 'x'.repeat(10_000) }), headers: { 'content-type': 'application/json' } })
    assert.equal(huge.status, 413)
    assert.deepEqual((await call(ann, '/mine')).body.rooms, [])
  })

  it('answers a method the route does not have, and a path it does not know', async () => {
    await start()
    const ann = await member('Ann')
    const put = await call(ann, '/lofi-du-soir', { method: 'PUT', body: SETTINGS })
    assert.equal(put.status, 405)
    assert.match(String(put.headers.allow), /GET/)
    assert.equal((await call(ann, '', { method: 'GET' })).status, 405, 'there is no list of all rooms here: it is on the realtime connection')
    assert.equal((await call(ann, '/lofi-du-soir/extra')).status, 404)
  })
})

describe('slowing a script down', () => {
  it('answers “too many” with the time to wait, once a member asked too often', async () => {
    await start({ roomOptions: { limits: { changes: { max: 3, windowMs: 3_600_000 }, creations: { max: 100, windowMs: 3_600_000 } } } })
    const ann = await member('Ann')
    for (let index = 0; index < 3; index += 1) assert.equal((await post(ann, 'garbage')).status, 400)
    const reply = await post(ann, SETTINGS)
    assert.deepEqual([reply.status, failure(reply)], [429, 'rate-limited'])
    assert.ok(Number(reply.headers['retry-after']) > 0)
    assert.ok(reply.body.retryAfterSec > 0)
    const ben = await member('Ben')
    assert.equal((await post(ben, SETTINGS)).status, 201, 'somebody else is not slowed down')
  })
})

describe('a server with nothing to keep rooms in', () => {
  it('still gives the rooms of the team, and says so for everything that would change something', async () => {
    await start({ roomStore: null })
    const ann = await member('Ann')
    assert.equal((await call(undefined, '/lofi-du-soir')).status, 200)
    for (const reply of [await post(ann, SETTINGS), await patch(ann, 'lofi-du-soir', SETTINGS), await del(ann, 'lofi-du-soir')]) {
      assert.deepEqual([reply.status, failure(reply)], [503, 'no-database'])
    }
  })

  it('is the same without accounts: nobody can be signed in', async () => {
    await start({ withoutAccounts: true })
    assert.equal((await call(undefined, '/lofi-du-soir')).status, 200)
    assert.deepEqual([(await post(undefined, SETTINGS)).status, failure(await post(undefined, SETTINGS))], [503, 'no-database'])
    assert.deepEqual([(await call(undefined, '/mine')).status, failure(await call(undefined, '/mine'))], [503, 'no-database'])
  })
})

describe('when the store fails', () => {
  it('tells the member it was not their doing, and nothing of what went wrong', async () => {
    const broken = new MemoryRoomStore()
    broken.create = async () => {
      throw new Error('relation "rooms" is on fire, password=hunter2')
    }
    const logged = mock.method(console, 'error', () => undefined)
    await start({ roomStore: broken })
    const ann = await member('Ann')
    const reply = await post(ann, SETTINGS)
    assert.equal(reply.status, 500)
    assert.deepEqual(reply.body, { ok: false, error: 'server-error' })
    assert.equal(JSON.stringify(reply).includes('hunter2'), false)
    assert.ok(logged.mock.calls.some((entry) => String(entry.arguments[0]).includes('[rooms]')), 'but it is in the log')
  })
})
