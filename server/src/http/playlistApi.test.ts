// The playlists API through real HTTP, the way a browser calls it: with the session cookie, from the site's own origin.
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import { PLAYLISTS_MAX, PLAYLIST_TRACKS_MAX, type VideoInfo } from '../../../shared/protocol'
import { MemoryPlaylistStore } from '../playlists/MemoryPlaylistStore'
import { FakeResolver } from '../testing/FakeResolver'
import { api, ORIGIN, startServer, type ApiReply, type Started, type StartOptions } from '../testing/startServer'
import type { ResolveError } from '../youtube/TrackResolver'

const video = (name: string, durationSec = 200): VideoInfo => ({
  videoId: name.padEnd(11, '_').slice(0, 11),
  title: `Title ${name}`,
  artist: `Artist ${name}`,
  durationSec,
})
const idOf = (name: string) => video(name).videoId
const UNKNOWN_ID = 'a0000000-0000-4000-8000-0000000000ff'

let server: Started
let fake: FakeResolver

async function start(options: StartOptions = {}, knows: Record<string, VideoInfo | ResolveError> = {}) {
  fake = new FakeResolver({
    [idOf('a1')]: video('a1'),
    [idOf('a2')]: video('a2'),
    [idOf('a3')]: video('a3'),
    [idOf('gone')]: 'not-found',
    [idOf('locked')]: 'not-embeddable',
    [idOf('live')]: 'unavailable',
    [idOf('noise')]: 'not-music',
    [idOf('down')]: 'service-unavailable',
    ...knows,
  })
  server = await startServer({ resolver: fake, ...options })
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
    body: { email: `pl${accountCount}@example.com`, password: 'a long enough password', pseudo, avatarId: 'mango' },
  })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))
  assert.ok(reply.cookie, 'a cookie was given')
  return reply.cookie as string
}

const call = (cookie: string | undefined, path: string, init: Parameters<typeof api>[2] = {}) =>
  api(server.url, `/api/playlists${path}`, { cookie, ...init })
const post = (cookie: string | undefined, path: string, body: unknown) => call(cookie, path, { method: 'POST', body })
const patch = (cookie: string | undefined, path: string, body: unknown) => call(cookie, path, { method: 'PATCH', body })
const del = (cookie: string | undefined, path: string) => call(cookie, path, { method: 'DELETE' })

async function create(cookie: string, name = 'Chill'): Promise<string> {
  const reply = await post(cookie, '', { name })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))
  return reply.body.playlist.id
}

async function addTrack(cookie: string, playlistId: string, name: string): Promise<ApiReply> {
  return post(cookie, `/${playlistId}/tracks`, { input: idOf(name) })
}

const failure = (reply: ApiReply) => reply.body?.error

/** Every route, as (method, path, body). `id` and `track` stand for ones that exist. */
const routes = (id: string, track: string): [string, string, unknown?][] => [
  ['GET', ''],
  ['POST', '', { name: 'x' }],
  ['GET', `/${id}`],
  ['PATCH', `/${id}`, { name: 'x' }],
  ['DELETE', `/${id}`],
  ['POST', `/${id}/tracks`, { input: idOf('a1') }],
  ['DELETE', `/${id}/tracks/${track}`],
  ['POST', `/${id}/tracks/${track}/move`, { position: 0 }],
]

describe('who may use the playlists API', () => {
  it('says there is no database when the server runs without accounts, to everybody', async () => {
    await start({ withoutAccounts: true })
    for (const [method, path, body] of routes(UNKNOWN_ID, UNKNOWN_ID)) {
      const reply = await call(undefined, path, { method, body })
      assert.equal(reply.status, 503, `${method} ${path}`)
      assert.deepEqual(reply.body, { ok: false, error: 'no-database' })
    }
  })

  it('refuses a request that does not come from the site before saying anything else', async () => {
    await start({ withoutAccounts: true })
    const reply = await call(undefined, '', { headers: { origin: 'http://evil.example' } })
    assert.equal(reply.status, 403)
    assert.equal(failure(reply), 'forbidden')
  })

  it('answers “not signed in” to every route when nobody is', async () => {
    await start()
    for (const [method, path, body] of routes(UNKNOWN_ID, UNKNOWN_ID)) {
      const reply = await call(undefined, path, { method, body })
      assert.equal(reply.status, 401, `${method} ${path}`)
      assert.deepEqual(reply.body, { ok: false, error: 'not-signed-in' })
    }
  })

  it('does not open to a cookie that opens nothing: made up, empty, or from a session that was ended', async () => {
    await start()
    const cookie = await member()
    assert.equal((await call(cookie, '')).status, 200)
    for (const bad of ['noctune_session=nope', 'noctune_session=', 'other=1', `noctune_session=${'a'.repeat(300)}`]) {
      assert.equal((await call(bad, '')).status, 401, bad)
    }
    await api(server.url, '/api/auth/logout', { method: 'POST', body: {}, cookie })
    assert.equal((await call(cookie, '')).status, 401, 'signed out: the same cookie opens nothing')
  })

  it('refuses every method when the request says it comes from another site, cookie or not', async () => {
    await start()
    const cookie = await member()
    const id = await create(cookie)
    const track = (await addTrack(cookie, id, 'a1')).body.track.id
    for (const [method, path, body] of routes(id, track)) {
      const foreign = await call(cookie, path, { method, body, headers: { origin: 'http://evil.example' } })
      assert.equal(foreign.status, 403, `${method} ${path}`)
      assert.equal(failure(foreign), 'forbidden')
      // A browser that sends no Origin (some requests do not) still says where the request comes from.
      const crossSite = await call(cookie, path, { method, body, headers: { 'sec-fetch-site': 'cross-site', origin: '' } })
      assert.equal(crossSite.status, 403, `${method} ${path} (cross-site)`)
    }
    // Nothing happened: the playlist is as it was.
    const read = await call(cookie, `/${id}`)
    assert.equal(read.body.playlist.name, 'Chill')
    assert.equal(read.body.playlist.tracks.length, 1)
  })

  it('lets through the site itself, whichever way the browser says it', async () => {
    await start()
    const cookie = await member()
    assert.equal((await call(cookie, '', { headers: { origin: ORIGIN } })).status, 200)
    assert.equal((await call(cookie, '', { headers: { 'sec-fetch-site': 'same-origin' } })).status, 200)
    assert.equal((await call(cookie, '')).status, 200, 'a script that says nothing')
  })
})

describe('what a request must look like', () => {
  it('answers 404 to a path that is not a route, and 405 to a route called the wrong way', async () => {
    await start()
    const cookie = await member()
    const id = await create(cookie)
    assert.equal((await call(cookie, '/')).status, 404)
    assert.equal((await call(cookie, `/${id}/nothing`)).status, 404)
    assert.equal((await call(cookie, `/${id}/tracks/x/y/z`)).status, 404)
    for (const [method, path] of [['PUT', ''], ['DELETE', ''], ['PATCH', ''], ['POST', `/${id}`], ['GET', `/${id}/tracks`], ['PUT', `/${id}/tracks/${UNKNOWN_ID}`], ['GET', `/${id}/tracks/${UNKNOWN_ID}/move`]] as const) {
      const reply = await call(cookie, path, { method, body: method === 'POST' || method === 'PUT' ? {} : undefined })
      assert.equal(reply.status, 405, `${method} ${path}`)
      assert.ok(reply.headers.allow, 'says what is allowed')
    }
  })

  it('wants JSON for what carries a body', async () => {
    await start()
    const cookie = await member()
    const id = await create(cookie)
    const asText = await call(cookie, '', { method: 'POST', rawBody: '{"name":"x"}', headers: { 'content-type': 'text/plain' } })
    assert.equal(asText.status, 415)
    const broken = await call(cookie, '', { method: 'POST', rawBody: '{"name":', headers: { 'content-type': 'application/json' } })
    assert.equal(broken.status, 400)
    assert.equal(failure(broken), 'bad-request')
    const huge = await call(cookie, `/${id}/tracks`, { method: 'POST', rawBody: JSON.stringify({ input: 'x'.repeat(6000) }), headers: { 'content-type': 'application/json' } })
    assert.equal(huge.status, 413)
    assert.equal((await call(cookie, '')).body.playlists.length, 1, 'nothing was made')
  })

  it('does not ask for a body when there is none to read', async () => {
    await start()
    const cookie = await member()
    const id = await create(cookie)
    assert.equal((await call(cookie, `/${id}`)).status, 200)
    assert.equal((await del(cookie, `/${id}`)).status, 200)
  })

  it('ignores the query string', async () => {
    await start()
    const cookie = await member()
    const id = await create(cookie)
    assert.equal((await call(cookie, '?x=1')).body.playlists.length, 1)
    assert.equal((await call(cookie, `/${id}?x=1&y=2`)).status, 200)
  })

  it('answers “not found”, not an error, to an id that is not one', async () => {
    await start()
    const cookie = await member()
    // (Not '..': a client turns it into another path before it is sent.)
    for (const id of ['nope', '%E0%A4%A', '__proto__', 'constructor', 'toString', 'a'.repeat(500), '%00']) {
      const read = await call(cookie, `/${id}`)
      assert.equal(read.status, 404, id)
      assert.equal(failure(read), 'playlist-not-found', id)
    }
    const real = await create(cookie)
    assert.equal((await del(cookie, `/${real}/tracks/%E0%A4%A`)).status, 404)
  })

  it('never lets a reply be kept, and says what it is', async () => {
    await start()
    const cookie = await member()
    const reply = await call(cookie, '')
    assert.equal(reply.headers['cache-control'], 'no-store')
    assert.equal(reply.headers['x-content-type-options'], 'nosniff')
    assert.match(String(reply.headers['content-type']), /^application\/json/)
  })
})

describe('a member’s playlists', () => {
  it('goes through the whole life of a playlist', async () => {
    await start()
    const cookie = await member()

    const made = await post(cookie, '', { name: '  Chill  du soir ' })
    assert.equal(made.status, 201)
    assert.deepEqual(made.body, { ok: true, playlist: { id: made.body.playlist.id, name: 'Chill du soir', trackCount: 0 } })
    const id = made.body.playlist.id

    const first = await addTrack(cookie, id, 'a1')
    assert.equal(first.status, 201)
    assert.deepEqual(first.body, {
      ok: true,
      track: { id: first.body.track.id, videoId: idOf('a1'), title: 'Title a1', artist: 'Artist a1', durationSec: 200, unavailable: false },
    })
    const second = await addTrack(cookie, id, 'a2')
    await addTrack(cookie, id, 'a3')

    const read = await call(cookie, `/${id}`)
    assert.equal(read.status, 200)
    assert.deepEqual(read.body.playlist.tracks.map((track: { title: string }) => track.title), ['Title a1', 'Title a2', 'Title a3'])
    assert.equal(read.body.playlist.trackCount, 3)

    const moved = await post(cookie, `/${id}/tracks/${second.body.track.id}/move`, { position: 0 })
    assert.deepEqual([moved.status, moved.body], [200, { ok: true }])
    assert.deepEqual((await call(cookie, `/${id}`)).body.playlist.tracks.map((track: { title: string }) => track.title), ['Title a2', 'Title a1', 'Title a3'])

    const renamed = await patch(cookie, `/${id}`, { name: 'Soir' })
    assert.deepEqual([renamed.status, renamed.body.playlist.name, renamed.body.playlist.trackCount], [200, 'Soir', 3])

    const removed = await del(cookie, `/${id}/tracks/${first.body.track.id}`)
    assert.deepEqual([removed.status, removed.body], [200, { ok: true }])
    assert.equal((await call(cookie, '')).body.playlists[0].trackCount, 2)

    assert.deepEqual((await del(cookie, `/${id}`)).body, { ok: true })
    assert.equal((await call(cookie, `/${id}`)).status, 404)
    assert.deepEqual((await call(cookie, '')).body, { ok: true, playlists: [] })
  })

  it('keeps each member’s playlists to themself, and answers a stranger as if there were none', async () => {
    await start()
    const ann = await member('Ann')
    const ben = await member('Ben')
    const id = await create(ann)
    const track = (await addTrack(ann, id, 'a1')).body.track.id

    assert.deepEqual((await call(ben, '')).body, { ok: true, playlists: [] })
    for (const [method, path, body] of routes(id, track)) {
      if (method === 'GET' && path === '') continue
      if (method === 'POST' && path === '') continue
      const reply = await call(ben, path, { method, body })
      assert.equal(reply.status, 404, `${method} ${path}`)
      assert.ok(['playlist-not-found', 'track-not-found'].includes(failure(reply)), `${method} ${path}: ${failure(reply)}`)
    }
    // Nothing of Ann's changed.
    const read = (await call(ann, `/${id}`)).body.playlist
    assert.deepEqual([read.name, read.tracks.length], ['Chill', 1])
    assert.equal(JSON.stringify((await call(ben, '')).body).includes(id), false)
  })

  it('answers the same to a stranger as to somebody who asks about a playlist that does not exist', async () => {
    await start()
    const ann = await member('Ann')
    const ben = await member('Ben')
    const id = await create(ann)
    const stranger = await call(ben, `/${id}`)
    const nothing = await call(ben, `/${UNKNOWN_ID}`)
    assert.deepEqual([stranger.status, stranger.body], [nothing.status, nothing.body])
  })

  it('says why a name is refused', async () => {
    await start()
    const cookie = await member()
    await create(cookie, 'Chill')
    assert.deepEqual([(await post(cookie, '', { name: 'CHILL' })).status, failure(await post(cookie, '', { name: 'CHILL' }))], [409, 'name-taken'])
    for (const name of ['', '   ', 'a'.repeat(41), 5, null, undefined]) {
      const reply = await post(cookie, '', { name })
      assert.deepEqual([reply.status, failure(reply)], [400, 'invalid-name'], JSON.stringify(name))
    }
    for (const body of [null, [], 'x', 5]) {
      const reply = await post(cookie, '', body)
      assert.deepEqual([reply.status, failure(reply)], [400, 'bad-request'], JSON.stringify(body))
    }
    assert.equal((await call(cookie, '')).body.playlists.length, 1)
  })

  it(`stops at ${PLAYLISTS_MAX} playlists`, async () => {
    await start({ playlistOptions: { limits: { changes: { max: 1000, windowMs: 60_000 } } } })
    const cookie = await member()
    for (let index = 0; index < PLAYLISTS_MAX; index += 1) await create(cookie, `List ${index}`)
    const reply = await post(cookie, '', { name: 'One more' })
    assert.deepEqual([reply.status, failure(reply)], [409, 'playlists-full'])
  })

  it('says why a track is refused', async () => {
    await start()
    const cookie = await member()
    const id = await create(cookie)
    await addTrack(cookie, id, 'a1')
    const expect = async (input: unknown, status: number, error: string) => {
      const reply = await post(cookie, `/${id}/tracks`, { input })
      assert.deepEqual([reply.status, failure(reply)], [status, error], JSON.stringify(input))
    }
    await expect(idOf('a1'), 409, 'already-in-playlist')
    await expect('https://example.com/x', 400, 'invalid-link')
    await expect(idOf('gone'), 422, 'not-found')
    await expect(idOf('locked'), 422, 'not-embeddable')
    await expect(idOf('live'), 422, 'unavailable')
    await expect(idOf('noise'), 422, 'not-music')
    await expect(idOf('down'), 503, 'service-unavailable')
    await expect(5, 400, 'bad-request')
    await expect('', 400, 'bad-request')
    await expect('x'.repeat(301), 400, 'bad-request')
    assert.equal((await call(cookie, `/${id}`)).body.playlist.tracks.length, 1)
  })

  it('says it cannot read a link when the server has no YouTube', async () => {
    await start({ resolver: null })
    const cookie = await member()
    const id = await create(cookie)
    const reply = await addTrack(cookie, id, 'a1')
    assert.deepEqual([reply.status, failure(reply)], [503, 'service-unavailable'])
  })

  it(`stops at ${PLAYLIST_TRACKS_MAX} tracks, without asking YouTube`, async () => {
    const store = new MemoryPlaylistStore()
    await start({ playlistStore: store })
    const cookie = await member()
    const id = await create(cookie)
    const account = await store.list(await accountOf(cookie))
    assert.equal(account.length, 1)
    for (let index = 0; index < PLAYLIST_TRACKS_MAX; index += 1) {
      assert.ok((await store.addTrack(await accountOf(cookie), id, video(`fill${index}`), new Date(), PLAYLIST_TRACKS_MAX)).ok)
    }
    fake.calls.length = 0
    const reply = await addTrack(cookie, id, 'a1')
    assert.deepEqual([reply.status, failure(reply)], [409, 'playlist-full'])
    assert.deepEqual(fake.calls, [])
  })

  it('refuses a move to a place that is not one', async () => {
    await start()
    const cookie = await member()
    const id = await create(cookie)
    const track = (await addTrack(cookie, id, 'a1')).body.track.id
    for (const position of [-1, 1.5, '1', null, PLAYLIST_TRACKS_MAX]) {
      const reply = await post(cookie, `/${id}/tracks/${track}/move`, { position })
      assert.deepEqual([reply.status, failure(reply)], [400, 'bad-request'], JSON.stringify(position))
    }
    const missing = await post(cookie, `/${id}/tracks/${UNKNOWN_ID}/move`, { position: 0 })
    assert.deepEqual([missing.status, failure(missing)], [404, 'track-not-found'])
  })

  it('makes a member wait when they ask too often, saying for how long', async () => {
    await start({ playlistOptions: { limits: { changes: { max: 2, windowMs: 60_000 }, reads: { max: 2, windowMs: 60_000 } } } })
    const cookie = await member()
    await create(cookie, 'One')
    await create(cookie, 'Two')
    const waiting = await post(cookie, '', { name: 'Three' })
    assert.equal(waiting.status, 429)
    assert.equal(failure(waiting), 'rate-limited')
    assert.ok(waiting.body.retryAfterSec >= 1 && waiting.body.retryAfterSec <= 60)
    assert.equal(waiting.headers['retry-after'], String(waiting.body.retryAfterSec))

    await call(cookie, '')
    await call(cookie, '')
    assert.equal((await call(cookie, '')).status, 429)

    const other = await member('Ben')
    assert.equal((await call(other, '')).status, 200, 'another member is not slowed down')
  })

  it('shares the lookups of a member with everything else that reads a link', async () => {
    await start({ accountLookupBudget: { burst: 2, refillMs: 3_600_000 } })
    const cookie = await member()
    const id = await create(cookie)
    assert.equal((await addTrack(cookie, id, 'a1')).status, 201)
    assert.equal((await addTrack(cookie, id, 'a2')).status, 201)
    const third = await addTrack(cookie, id, 'a3')
    assert.deepEqual([third.status, failure(third)], [429, 'rate-limited'])
    assert.equal(fake.calls.length, 2, 'the third never reached YouTube')
  })
})

/** The account id behind a cookie: what the server knows, through the store the test gave it. */
async function accountOf(cookie: string): Promise<string> {
  const token = /noctune_session=([^;]+)/.exec(cookie)?.[1]
  assert.ok(token, 'a session cookie')
  const account = await server.service?.accountForToken(token)
  assert.ok(account, 'an account')
  return account.id
}

describe('what goes wrong inside', () => {
  it('answers 500 with no detail, and logs it, when the store fails', async () => {
    const logged = mock.method(console, 'error', () => undefined)
    class Failing extends MemoryPlaylistStore {
      override async list(): Promise<never> {
        throw new Error('secret detail: connection string postgres://user:pw@host/db')
      }
    }
    await start({ playlistStore: new Failing() })
    const cookie = await member()
    const reply = await call(cookie, '')
    assert.equal(reply.status, 500)
    assert.deepEqual(reply.body, { ok: false, error: 'server-error' })
    assert.equal(JSON.stringify(reply).includes('secret'), false, 'nothing of the failure reaches the page')
    assert.ok(logged.mock.calls.some((entry) => String(entry.arguments[0]).includes('secret detail')), 'but it is in the log')
    assert.equal((await call(cookie, '/' + UNKNOWN_ID)).status, 404, 'and the server goes on')
  })
})
