// A DJ lining up a track of their own playlist, and the verdict of the room on a playlist, through real connections.
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import type {
  AddTrackResult,
  DjNotice,
  DjQueue,
  JoinPayload,
  JoinResult,
  PlaylistStatusResult,
  QueuedTrack,
  RoomSnapshot,
  Track,
  VideoInfo,
} from '../../shared/protocol'
import { LINEUP_MAX } from '../../shared/protocol'
import { ROOM_DEFS } from './catalog'
import { FakeResolver } from './testing/FakeResolver'
import { api, startServer, type Started, type StartOptions, type TestSocket } from './testing/startServer'
import type { ResolveError } from './youtube/TrackResolver'

const ROOM = 'lofi-du-soir'
const RULES = ROOM_DEFS[0].rules
const DAY = 24 * 3600 * 1000
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const video = (name: string, durationSec = 200): VideoInfo => ({
  videoId: name.padEnd(11, '_').slice(0, 11),
  title: `Title ${name}`,
  artist: `Artist ${name}`,
  durationSec,
})
const idOf = (name: string) => video(name).videoId

let server: Started
let fake: FakeResolver
let known: Record<string, VideoInfo | ResolveError>
let clock: number

async function start(options: StartOptions = {}) {
  clock = Date.now()
  known = {}
  for (const name of ['p1', 'p2', 'p3', 'p4', 'p5', 'q1', 'q2']) known[idOf(name)] = video(name)
  known[idOf('long')] = video('long', RULES.maxTrackSec! + 1)
  fake = new FakeResolver(known)
  server = await startServer({ resolver: fake, playlistOptions: { now: () => clock }, ...options })
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

async function until(condition: () => boolean, what: string, timeoutMs = 2000) {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > timeoutMs) assert.fail(`timed out waiting for: ${what}`)
    await sleep(10)
  }
}

interface Pushes {
  queues: DjQueue[]
  lineups: QueuedTrack[][]
  notices: DjNotice[]
  tracks: { track: Track | null; queue: DjQueue }[]
}

function listen(socket: TestSocket): Pushes {
  const pushes: Pushes = { queues: [], lineups: [], notices: [], tracks: [] }
  socket.on('dj:queue', (queue) => pushes.queues.push(queue))
  socket.on('dj:lineup', (lineup) => pushes.lineups.push(lineup))
  socket.on('dj:notice', (notice) => pushes.notices.push(notice))
  socket.on('room:track', (track, _reactions, queue) => pushes.tracks.push({ track, queue }))
  return pushes
}

interface Person {
  socket: TestSocket
  snapshot: RoomSnapshot
  pushes: Pushes
  cookie?: string
  accountId?: string
}

let accountCount = 0
async function register(pseudo: string): Promise<string> {
  accountCount += 1
  const reply = await api(server.url, '/api/auth/register', {
    body: { email: `dp${accountCount}@example.com`, password: 'a long enough password', pseudo, avatarId: 'mango' },
  })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))
  return reply.cookie as string
}

async function enter(socket: TestSocket, roomId = ROOM, pseudo = 'ignored'): Promise<RoomSnapshot> {
  const payload: JoinPayload = { roomId, pseudo, avatarId: 'moss' }
  const result = await answer<JoinResult>((callback) => socket.emit('room:join', payload, callback))
  assert.ok(result.ok, JSON.stringify(result))
  return result.snapshot
}

async function memberIn(pseudo: string, roomId = ROOM): Promise<Person> {
  const cookie = await register(pseudo)
  const token = /noctune_session=([^;]+)/.exec(cookie)?.[1] as string
  const account = await server.service?.accountForToken(token)
  assert.ok(account, 'an account')
  const socket = await server.connect({ cookie })
  const pushes = listen(socket)
  return { socket, pushes, cookie, accountId: account.id, snapshot: await enter(socket, roomId) }
}

async function visitorIn(pseudo: string): Promise<Person> {
  const socket = await server.connect()
  return { socket, pushes: listen(socket), snapshot: await enter(socket, ROOM, pseudo) }
}

/** A playlist of the member, with these videos (read through the fake YouTube, like a real add), and the ids of its tracks. */
async function playlistOf(person: Person, name: string, ...names: string[]) {
  assert.ok(person.accountId && server.playlists, 'a member and playlists')
  const service = server.playlists
  const made = await service.createPlaylist(person.accountId, { name })
  assert.ok(made.ok, JSON.stringify(made))
  if (!made.ok) throw new Error('not made')
  const tracks: Record<string, string> = {}
  for (const videoName of names) {
    const added = await service.addTrack(person.accountId, made.playlist.id, { input: idOf(videoName) })
    assert.ok(added.ok, JSON.stringify(added))
    if (added.ok) tracks[videoName] = added.track.id
  }
  return { id: made.playlist.id, tracks }
}

const fromPlaylist = (socket: TestSocket, playlistTrackId: unknown) =>
  answer<AddTrackResult>((callback) => socket.emit('dj:add', { playlistTrackId } as never, callback))
const byLink = (socket: TestSocket, input: unknown) => answer<AddTrackResult>((callback) => socket.emit('dj:add', { input } as never, callback))
const statuses = (socket: TestSocket, playlistId: unknown) =>
  answer<PlaylistStatusResult>((callback) => socket.emit('dj:playlist-status', { playlistId } as never, callback))
const titleOnDecks = (person: Person) => person.pushes.tracks.at(-1)?.track?.title

const quiet = () => {
  fake.calls.length = 0
  fake.manyCalls.length = 0
}

describe('lining up a track of one’s own playlist', () => {
  it('lines it up, takes the decks from the room’s own selection, and asks YouTube nothing', async () => {
    await start()
    const ann = await memberIn('Ann')
    const { tracks } = await playlistOf(ann, 'Chill', 'p1')
    quiet()

    const result = await fromPlaylist(ann.socket, tracks.p1)
    assert.ok(result.ok, JSON.stringify(result))
    if (!result.ok) return
    assert.deepEqual({ ...result.track, id: undefined }, { id: undefined, ...video('p1') })
    await until(() => titleOnDecks(ann) === 'Title p1', 'the track to take the decks')
    assert.deepEqual([fake.calls, fake.manyCalls], [[], []])
    assert.equal(ann.pushes.queues.at(-1)?.current?.pseudo ?? ann.pushes.tracks.at(-1)?.queue.current?.pseudo, 'Ann')
  })

  it('lines a second one up behind the first, in the order asked', async () => {
    await start()
    const ann = await memberIn('Ann')
    const { tracks } = await playlistOf(ann, 'Chill', 'p1', 'p2', 'p3')
    assert.ok((await fromPlaylist(ann.socket, tracks.p1)).ok)
    const second = await fromPlaylist(ann.socket, tracks.p3)
    assert.ok(second.ok, JSON.stringify(second))
    await until(() => ann.pushes.lineups.at(-1)?.[0]?.title === 'Title p3', 'the line-up')
  })

  it('does not know a track that is somebody else’s, that does not exist, or that is not an id: it says the same', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    const { tracks } = await playlistOf(ben, 'Ben’s', 'p1')
    for (const id of [tracks.p1, 'a0000000-0000-4000-8000-0000000000ff', 'nope', 'x'.repeat(99)]) {
      assert.deepEqual(await fromPlaylist(ann.socket, id), { ok: false, error: 'no-such-track' }, id)
    }
    assert.equal(ann.pushes.lineups.length, 0, 'nothing was lined up')
    assert.equal(ann.pushes.queues.length, 0)
  })

  it('refuses a visitor, and somebody who is not in a room, before looking at anything', async () => {
    await start()
    const guest = await visitorIn('Guest')
    assert.deepEqual(await fromPlaylist(guest.socket, 'a0000000-0000-4000-8000-0000000000ff'), { ok: false, error: 'members-only' })
    const stranger = await server.connect()
    assert.deepEqual(await fromPlaylist(stranger, 'x'), { ok: false, error: 'not-in-room' })
    assert.deepEqual([fake.calls, fake.manyCalls], [[], []])
  })

  it('wants exactly one of a link and a playlist track, and each of them a string of the right size', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ask = (payload: unknown) => answer<AddTrackResult>((callback) => ann.socket.emit('dj:add', payload as never, callback))
    const bad = [
      {},
      null,
      'p1',
      { input: idOf('p1'), playlistTrackId: 'a0000000-0000-4000-8000-0000000000ff' },
      { playlistTrackId: 5 },
      { playlistTrackId: '' },
      { playlistTrackId: 'x'.repeat(101) },
      { playlistTrackId: ['a'] },
      { playlistTrackId: { $ne: 1 } },
      { input: 5 },
    ]
    for (const payload of bad) assert.deepEqual(await ask(payload), { ok: false, error: 'invalid' }, JSON.stringify(payload))
    assert.deepEqual([fake.calls, fake.manyCalls], [[], []])
  })

  it('refuses a track that could no longer be played at the last look', async () => {
    await start()
    const ann = await memberIn('Ann')
    const { tracks } = await playlistOf(ann, 'Chill', 'p1')
    await server.playlistStore?.applyRefresh([{ videoId: idOf('p1'), video: null, at: new Date(clock) }])
    assert.deepEqual(await fromPlaylist(ann.socket, tracks.p1), { ok: false, error: 'unavailable' })
    assert.equal(ann.pushes.lineups.length, 0)
  })

  it('reads a track that is getting old again first: what it says now is what the room judges', async () => {
    await start()
    const ann = await memberIn('Ann')
    const { tracks } = await playlistOf(ann, 'Chill', 'p1', 'p2')
    clock += 8 * DAY
    // Since it was added, p1 became too long for the room, and p2 was removed from YouTube.
    known[idOf('p1')] = video('p1', RULES.maxTrackSec! + 60)
    known[idOf('p2')] = 'not-found'
    quiet()

    const tooLong = await fromPlaylist(ann.socket, tracks.p1)
    assert.deepEqual(tooLong, { ok: false, error: 'too-long', maxSec: RULES.maxTrackSec })
    assert.equal(fake.manyCalls.length, 1, 'one call to read it again')
    assert.deepEqual(await fromPlaylist(ann.socket, tracks.p2), { ok: false, error: 'unavailable' })
  })

  it('refuses a track that is a month old when YouTube cannot be asked: its length cannot be trusted', async () => {
    await start()
    const ann = await memberIn('Ann')
    const { tracks } = await playlistOf(ann, 'Chill', 'p1')
    clock += 31 * DAY
    known[idOf('p1')] = 'service-unavailable'
    assert.deepEqual(await fromPlaylist(ann.socket, tracks.p1), { ok: false, error: 'service-unavailable' })
  })

  it('uses what is kept for a track under a month old when YouTube cannot be asked', async () => {
    await start()
    const ann = await memberIn('Ann')
    const { tracks } = await playlistOf(ann, 'Chill', 'p1')
    clock += 20 * DAY
    known[idOf('p1')] = 'service-unavailable'
    assert.ok((await fromPlaylist(ann.socket, tracks.p1)).ok)
  })

  it('applies the rules of the room as it does to a link: too long, played recently, already lined up, line-up full', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    const long = await playlistOf(ann, 'Long', 'long')
    assert.deepEqual(await fromPlaylist(ann.socket, long.tracks.long), { ok: false, error: 'too-long', maxSec: RULES.maxTrackSec })

    // Ann plays p1; Ben, with p1 in his own playlist, finds it lined up, then played.
    const mine = await playlistOf(ann, 'Mine', 'p1')
    const his = await playlistOf(ben, 'His', 'p1', 'p2')
    assert.ok((await fromPlaylist(ann.socket, mine.tracks.p1)).ok)
    await until(() => titleOnDecks(ben) === 'Title p1', 'p1 to play')
    const played = await fromPlaylist(ben.socket, his.tracks.p1)
    assert.equal(played.ok, false)
    if (played.ok || played.error !== 'recently-played') return assert.fail(JSON.stringify(played))
    assert.ok(played.retryAfterSec !== null && played.retryAfterSec > RULES.repeatDelaySec! - 5 && played.retryAfterSec <= RULES.repeatDelaySec!)

    const queued = await fromPlaylist(ben.socket, his.tracks.p2)
    assert.ok(queued.ok, JSON.stringify(queued))
    const again = await fromPlaylist(ann.socket, (await playlistOf(ann, 'Other', 'p2')).tracks.p2)
    assert.deepEqual(again, { ok: false, error: 'already-queued' })
  })

  it(`stops at ${LINEUP_MAX} tracks in the line-up`, async () => {
    await start({ lookupIntervalMs: 0 })
    const ann = await memberIn('Ann')
    const names = Array.from({ length: LINEUP_MAX + 1 }, (_, index) => `fill${index}`)
    for (const name of names) known[idOf(name)] = video(name, 100)
    const { tracks } = await playlistOf(ann, 'Big', ...names)
    for (const name of names.slice(0, LINEUP_MAX)) assert.ok((await fromPlaylist(ann.socket, tracks[name])).ok, name)
    // The first of them is on the decks and left the line-up: it holds LINEUP_MAX - 1 now.
    assert.ok((await fromPlaylist(ann.socket, tracks[names[LINEUP_MAX]])).ok)
    const last = await fromPlaylist(ann.socket, tracks.fill0)
    assert.equal(last.ok, false)
  })

  it('costs nothing against the lookups of the account while what is kept is recent', async () => {
    await start({ accountLookupBudget: { burst: 1, refillMs: 3_600_000 } })
    const ann = await memberIn('Ann')
    // The tracks go straight into the store: filling a playlist through the service would spend the budget itself.
    const made = await server.playlists!.createPlaylist(ann.accountId!, { name: 'Chill' })
    assert.ok(made.ok)
    if (!made.ok) return
    const tracks: Record<string, string> = {}
    for (const name of ['p1', 'p2', 'p3']) {
      const added = await server.playlistStore!.addTrack(ann.accountId!, made.playlist.id, video(name), new Date(clock), 200)
      assert.ok(added.ok)
      if (added.ok) tracks[name] = added.track.id
    }
    for (const name of ['p1', 'p2', 'p3']) assert.ok((await fromPlaylist(ann.socket, tracks[name])).ok, name)
    assert.deepEqual(fake.calls, [], 'not a word to YouTube')
    // The single lookup of the budget is whole: a link goes through, and only then is the budget spent.
    assert.ok((await byLink(ann.socket, idOf('q1'))).ok)
    const second = await byLink(ann.socket, idOf('q2'))
    assert.equal(second.ok || second.error, 'rate-limited')
  })

  it('shares the lookups of the account with the playlist API and with links', async () => {
    await start({ accountLookupBudget: { burst: 2, refillMs: 3_600_000 } })
    const ann = await memberIn('Ann')
    const id = (await playlistOf(ann, 'Chill')).id
    // Two lookups spent on the playlist API...
    assert.ok((await server.playlists!.addTrack(ann.accountId!, id, { input: idOf('p1') })).ok)
    assert.ok((await server.playlists!.addTrack(ann.accountId!, id, { input: idOf('p2') })).ok)
    // ...none left for a link pasted in the room.
    const link = await byLink(ann.socket, idOf('q1'))
    assert.equal(link.ok || link.error, 'rate-limited')
    assert.equal(fake.calls.filter((input) => input === idOf('q1')).length, 0, 'it never reached YouTube')
  })

  /** A playlist whose tracks went straight into the store: filling it through the service would spend the budget itself. */
  async function storedPlaylist(person: Person, ...names: string[]) {
    const made = await server.playlists!.createPlaylist(person.accountId!, { name: 'Chill' })
    assert.ok(made.ok)
    if (!made.ok) throw new Error('not made')
    const tracks: Record<string, string> = {}
    for (const name of names) {
      const added = await server.playlistStore!.addTrack(person.accountId!, made.playlist.id, video(name), new Date(clock), 200)
      assert.ok(added.ok)
      if (added.ok) tracks[name] = added.track.id
    }
    return { id: made.playlist.id, tracks }
  }

  it('is held to the light allowance of an edit, not to the one lookup a second of a link', async () => {
    await start({ lookupIntervalMs: 1000, editIntervalMs: 300 })
    const ann = await memberIn('Ann')
    const mine = await storedPlaylist(ann, 'p1', 'p2', 'p3')
    assert.ok((await fromPlaylist(ann.socket, mine.tracks.p1)).ok)
    const fast = await fromPlaylist(ann.socket, mine.tracks.p2)
    assert.equal(fast.ok, false)
    if (fast.ok || fast.error !== 'rate-limited') return assert.fail(JSON.stringify(fast))
    assert.ok(fast.retryAfterMs > 0 && fast.retryAfterMs <= 300, `retry in ${fast.retryAfterMs} ms`)

    // Well under a second later: a link would still be made to wait, a track of the playlist is not.
    await sleep(330)
    assert.ok((await fromPlaylist(ann.socket, mine.tracks.p2)).ok, 'less than a second after the first')
    assert.ok((await fromPlaylist(ann.socket, mine.tracks.p3)).ok === false, 'but not twice within the same 300 ms')
  })

  it('lines up two tracks of the playlist one after the other when nothing holds them back', async () => {
    await start({ lookupIntervalMs: 1000, editIntervalMs: 0 })
    const ann = await memberIn('Ann')
    const mine = await storedPlaylist(ann, 'p1', 'p2', 'p3')
    for (const name of ['p1', 'p2', 'p3']) assert.ok((await fromPlaylist(ann.socket, mine.tracks[name])).ok, name)
    assert.deepEqual(fake.calls, [])
  })

  it('does not make a link wait for a track of the playlist, nor a playlist track for a link that is being read', async () => {
    await start({ lookupIntervalMs: 0, editIntervalMs: 0 })
    const ann = await memberIn('Ann')
    const mine = await storedPlaylist(ann, 'p1', 'p2')
    let open!: () => void
    fake.gate = new Promise<void>((resolve) => (open = resolve))
    const slowLink = byLink(ann.socket, idOf('q1'))
    await until(() => fake.calls.length === 1, 'the link lookup to start')
    // The link is still being read at YouTube: a track of the playlist (read from what is kept) goes through.
    assert.ok((await fromPlaylist(ann.socket, mine.tracks.p1)).ok)
    // A second link is held back, as before: one at a time.
    const second = await byLink(ann.socket, idOf('q2'))
    assert.equal(second.ok || second.error, 'rate-limited')
    open()
    assert.ok((await slowLink).ok)
    fake.gate = null
    assert.ok((await fromPlaylist(ann.socket, mine.tracks.p2)).ok)
  })

  it('charges the account only when a refresh really asks YouTube', async () => {
    await start({ lookupIntervalMs: 0, editIntervalMs: 0, accountLookupBudget: { burst: 1, refillMs: 3_600_000 } })
    const ann = await memberIn('Ann')
    const mine = await storedPlaylist(ann, 'p1', 'p2')

    // A recent track: nothing asked, nothing charged.
    assert.ok((await fromPlaylist(ann.socket, mine.tracks.p1)).ok)
    assert.deepEqual([fake.calls, fake.manyCalls], [[], []])

    // A track a week old: YouTube is asked once, and that one lookup is the account's whole budget.
    clock += 8 * DAY
    assert.ok((await fromPlaylist(ann.socket, mine.tracks.p2)).ok)
    assert.equal(fake.manyCalls.length, 1, 'one call to read it again')
    const link = await byLink(ann.socket, idOf('q1'))
    assert.equal(link.ok || link.error, 'rate-limited', 'the budget went to the refresh')
  })

  it('does nothing when the playlist is gone by the time it is asked for', async () => {
    await start()
    const ann = await memberIn('Ann')
    const mine = await playlistOf(ann, 'Chill', 'p1')
    await server.playlists!.deletePlaylist(ann.accountId!, mine.id)
    assert.deepEqual(await fromPlaylist(ann.socket, mine.tracks.p1), { ok: false, error: 'no-such-track' })
  })

  it('says the service is out when the server has no playlists', async () => {
    await start({ playlistStore: null })
    const ann = await memberIn('Ann')
    assert.deepEqual(await fromPlaylist(ann.socket, 'a0000000-0000-4000-8000-0000000000ff'), { ok: false, error: 'service-unavailable' })
    assert.ok((await byLink(ann.socket, idOf('p1'))).ok, 'links still work')
  })

  it('answers “server error”, not silence, when the store fails', async () => {
    mock.method(console, 'error', () => undefined)
    await start()
    const ann = await memberIn('Ann')
    const mine = await playlistOf(ann, 'Chill', 'p1')
    mock.method(server.playlistStore!, 'findTrack', async () => {
      throw new Error('database down')
    })
    assert.deepEqual(await fromPlaylist(ann.socket, mine.tracks.p1), { ok: false, error: 'service-unavailable' })
    mock.restoreAll()
    mock.method(console, 'error', () => undefined)
    assert.ok((await fromPlaylist(ann.socket, mine.tracks.p1)).ok, 'and the connection is fine afterwards')
  })
})

describe('the verdict of the room on a playlist', () => {
  it('says for each track whether the room would take it now', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    const cat = await memberIn('Cat')
    // Ann plays p1; Cat has p2 lined up; Ben has all of them in his playlist, with a long one, and one that is gone.
    const annPlaylist = await playlistOf(ann, 'Ann', 'p1')
    const catPlaylist = await playlistOf(cat, 'Cat', 'p2')
    const his = await playlistOf(ben, 'His', 'p1', 'p2', 'p3', 'long', 'p4')
    await server.playlistStore?.applyRefresh([{ videoId: idOf('p4'), video: null, at: new Date(clock) }])
    assert.ok((await fromPlaylist(ann.socket, annPlaylist.tracks.p1)).ok)
    await until(() => titleOnDecks(ben) === 'Title p1', 'p1 to play')
    assert.ok((await fromPlaylist(cat.socket, catPlaylist.tracks.p2)).ok)
    quiet()

    const result = await statuses(ben.socket, his.id)
    assert.ok(result.ok, JSON.stringify(result))
    if (!result.ok) return
    assert.deepEqual(Object.keys(result.statuses).sort(), Object.values(his.tracks).sort(), 'every track, by its id')
    const of = (name: string) => result.statuses[his.tracks[name]]
    const recent = of('p1')
    assert.equal(recent.state, 'recently-played')
    assert.ok(recent.state === 'recently-played' && recent.retryAfterSec !== null && recent.retryAfterSec <= RULES.repeatDelaySec!)
    assert.deepEqual(of('p2'), { state: 'queued' })
    assert.deepEqual(of('p3'), { state: 'ok' })
    assert.deepEqual(of('long'), { state: 'too-long', maxSec: RULES.maxTrackSec })
    assert.deepEqual(of('p4'), { state: 'unavailable' })
    assert.deepEqual([fake.calls, fake.manyCalls], [[], []], 'not a word to YouTube')
  })

  it('does not judge a length that is a month old: the room looks again when the track is lined up', async () => {
    await start()
    const ann = await memberIn('Ann')
    const mine = await playlistOf(ann, 'Chill', 'long', 'p1')
    clock += 31 * DAY
    quiet()
    const result = await statuses(ann.socket, mine.id)
    assert.ok(result.ok)
    if (!result.ok) return
    assert.deepEqual(result.statuses[mine.tracks.long], { state: 'ok' })
    assert.deepEqual([fake.calls, fake.manyCalls], [[], []])
  })

  it('gives nothing about a playlist that is not the member’s, that is not there, or is not an id: it says the same', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    const his = await playlistOf(ben, 'His', 'p1')
    for (const id of [his.id, 'a0000000-0000-4000-8000-0000000000ff', 'nope', '']) {
      assert.deepEqual(await statuses(ann.socket, id), { ok: false, error: 'invalid' }, JSON.stringify(id))
    }
    for (const id of [5, null, undefined, {}, ['a'], 'x'.repeat(101)]) {
      assert.deepEqual(await statuses(ann.socket, id), { ok: false, error: 'invalid' }, JSON.stringify(id))
    }
  })

  it('is for members in a room only', async () => {
    await start()
    const guest = await visitorIn('Guest')
    assert.deepEqual(await statuses(guest.socket, 'a0000000-0000-4000-8000-0000000000ff'), { ok: false, error: 'members-only' })
    const stranger = await server.connect()
    assert.deepEqual(await statuses(stranger, 'x'), { ok: false, error: 'not-in-room' })
  })

  it('does not take more than a few a second from one connection', async () => {
    await start({ editIntervalMs: 300 })
    const ann = await memberIn('Ann')
    const mine = await playlistOf(ann, 'Chill', 'p1')
    assert.ok((await statuses(ann.socket, mine.id)).ok)
    const fast = await statuses(ann.socket, mine.id)
    assert.equal(fast.ok, false)
    if (fast.ok || fast.error !== 'rate-limited') return assert.fail(JSON.stringify(fast))
    assert.ok(fast.retryAfterMs > 0 && fast.retryAfterMs <= 300)
    await sleep(320)
    assert.ok((await statuses(ann.socket, mine.id)).ok)
  })

  it('says the service is out when the server has no playlists', async () => {
    await start({ playlistStore: null })
    const ann = await memberIn('Ann')
    assert.deepEqual(await statuses(ann.socket, 'a0000000-0000-4000-8000-0000000000ff'), { ok: false, error: 'service-unavailable' })
  })

  it('answers “server error” when the store fails, and goes on', async () => {
    mock.method(console, 'error', () => undefined)
    await start()
    const ann = await memberIn('Ann')
    const mine = await playlistOf(ann, 'Chill', 'p1')
    mock.method(server.playlistStore!, 'get', async () => {
      throw new Error('database down')
    })
    assert.deepEqual(await statuses(ann.socket, mine.id), { ok: false, error: 'server-error' })
    mock.restoreAll()
    assert.ok((await statuses(ann.socket, mine.id)).ok)
  })
})
