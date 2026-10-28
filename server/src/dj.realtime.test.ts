// DJs through real connections: members come in with their session cookie, the resolver is a fake that knows a few
// videos. What each person is told (and not told) is checked on the clients' side.
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import type {
  AddTrackResult,
  DjNotice,
  DjQueue,
  DjResult,
  JoinPayload,
  JoinResult,
  QueuedTrack,
  ReactResult,
  RoomRules,
  RoomSnapshot,
  RoomSummary,
  Track,
  VideoInfo,
} from '../../shared/protocol'
import { ROOM_DEFS } from './catalog'
import { FakeResolver } from './testing/FakeResolver'
import { api, startServer, type Started, type StartOptions, type TestSocket } from './testing/startServer'
import type { ResolveResult, TrackResolver } from './youtube/TrackResolver'

const ROOM = 'lofi-du-soir'
const ROOM_RULES = ROOM_DEFS[0].rules
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const video = (id: string, title: string, durationSec = 200): VideoInfo => ({ videoId: id, title, artist: 'Artist', durationSec })
const VIDEOS: Record<string, VideoInfo> = {
  // One second long, so that a turn changes by itself within a test.
  shortttttt1: video('shortttttt1', 'Short one', 1),
  shortttttt2: video('shortttttt2', 'Short two', 1),
  aaaaaaaaaa1: video('aaaaaaaaaa1', 'Alpha'),
  aaaaaaaaaa2: video('aaaaaaaaaa2', 'Alpha 2'),
  bbbbbbbbbb1: video('bbbbbbbbbb1', 'Bravo'),
  bbbbbbbbbb2: video('bbbbbbbbbb2', 'Bravo 2'),
  cccccccccc1: video('cccccccccc1', 'Charlie'),
  looooooong1: video('looooooong1', 'Too long for the room', ROOM_RULES.maxTrackSec! + 1),
}

let server: Started
let fake: FakeResolver

async function start(options: StartOptions = {}) {
  fake = new FakeResolver({ ...VIDEOS, nfnfnfnfnf1: 'not-found', nenenenene1: 'not-embeddable', ununununun1: 'unavailable', nmnmnmnmnm1: 'not-music' })
  server = await startServer({ resolver: fake, ...options })
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

/** Waits for something that happens on its own (a push, a change in the list), and fails after 2 s. */
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

/** Everything the server pushes about DJs to this connection, from the moment it is opened. */
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
}

let accountCount = 0
/** Opens an account over HTTP and returns the cookie a browser would then send. */
async function register(pseudo: string): Promise<string> {
  accountCount += 1
  const reply = await api(server.url, '/api/auth/register', {
    body: { email: `dj${accountCount}@example.com`, password: 'a long enough password', pseudo, avatarId: 'mango' },
  })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))
  assert.ok(reply.cookie)
  return reply.cookie
}

async function enter(socket: TestSocket, roomId = ROOM, pseudo = 'ignored'): Promise<RoomSnapshot> {
  const payload: JoinPayload = { roomId, pseudo, avatarId: 'moss' }
  const result = await answer<JoinResult>((callback) => socket.emit('room:join', payload, callback))
  assert.ok(result.ok, JSON.stringify(result))
  return result.snapshot
}

/** A member who comes into the room with their session. */
async function memberIn(pseudo: string, roomId = ROOM, cookie?: string): Promise<Person> {
  cookie ??= await register(pseudo)
  const socket = await server.connect({ cookie })
  const pushes = listen(socket)
  return { socket, pushes, cookie, snapshot: await enter(socket, roomId) }
}

async function visitorIn(pseudo: string, roomId = ROOM): Promise<Person> {
  const socket = await server.connect()
  const pushes = listen(socket)
  return { socket, pushes, snapshot: await enter(socket, roomId, pseudo) }
}

const add = (socket: TestSocket, input: unknown) =>
  answer<AddTrackResult>((callback) => socket.emit('dj:add', { input } as never, callback))
const remove = (socket: TestSocket, trackId: unknown) =>
  answer<DjResult>((callback) => socket.emit('dj:remove', { trackId } as never, callback))
const leaveQueue = (socket: TestSocket) => answer<DjResult>((callback) => socket.emit('dj:leave', callback))
const like = (socket: TestSocket, value: boolean) =>
  answer<ReactResult>((callback) => socket.emit('track:like', { value }, callback))
const skip = (socket: TestSocket, value: boolean) =>
  answer<ReactResult>((callback) => socket.emit('track:skip', { value }, callback))

async function lineUp(person: Person, input: string): Promise<QueuedTrack> {
  const result = await add(person.socket, input)
  assert.ok(result.ok, JSON.stringify(result))
  return result.track
}

const titleOnDecks = (person: Person) => person.pushes.tracks.at(-1)?.track?.title
const waiting = (queue: DjQueue | undefined) => queue?.waiting.map((entry) => entry.pseudo)

describe('who may be a DJ', () => {
  it('refuses a request made before joining a room', async () => {
    await start()
    const stranger = await server.connect()
    assert.deepEqual(await add(stranger, 'aaaaaaaaaa1'), { ok: false, error: 'not-in-room' })
    assert.deepEqual(await remove(stranger, 'x'), { ok: false, error: 'not-in-room' })
    assert.deepEqual(await leaveQueue(stranger), { ok: false, error: 'not-in-room' })
    assert.deepEqual(fake.calls, [])
  })

  it('refuses a visitor, without asking YouTube anything', async () => {
    await start()
    const guest = await visitorIn('Guest')
    assert.deepEqual(await add(guest.socket, 'aaaaaaaaaa1'), { ok: false, error: 'members-only' })
    assert.deepEqual(await remove(guest.socket, 'x'), { ok: false, error: 'members-only' })
    assert.deepEqual(await leaveQueue(guest.socket), { ok: false, error: 'members-only' })
    assert.deepEqual(fake.calls, [])
    const rooms = await answer<RoomSummary[]>((callback) => guest.socket.emit('lobby:join', callback))
    assert.equal(rooms.find((summary) => summary.id === ROOM)?.djs, 0)
  })

  it('answers a visitor “members only” before looking at what they sent', async () => {
    await start()
    const guest = await visitorIn('Guest')
    assert.deepEqual(await add(guest.socket, 5), { ok: false, error: 'members-only' })
    assert.deepEqual(await remove(guest.socket, 5), { ok: false, error: 'members-only' })
    assert.deepEqual(fake.calls, [])
  })

  it('goes by the session cookie, not by what the page says', async () => {
    await start()
    // A visitor whose page claims to be a member: the pseudo and avatar it sends are ignored, and so is anything else.
    const impostor = await visitorIn('Nina_B')
    assert.deepEqual(await add(impostor.socket, 'aaaaaaaaaa1'), { ok: false, error: 'members-only' })
  })

  it('refuses a member who signed out: their connection is closed and a new one is a visitor', async () => {
    await start()
    const ann = await memberIn('Ann')
    assert.ok((await add(ann.socket, 'aaaaaaaaaa1')).ok)
    await api(server.url, '/api/auth/logout', { method: 'POST', body: {}, cookie: ann.cookie })
    await until(() => !ann.socket.connected, 'the connection to close')
    const again = await server.connect({ cookie: ann.cookie })
    await enter(again, ROOM, 'Back')
    assert.deepEqual(await add(again, 'aaaaaaaaaa2'), { ok: false, error: 'members-only' })
  })
})

describe('what a request must look like', () => {
  it('refuses what is not a short string, without asking YouTube anything', async () => {
    await start()
    const ann = await memberIn('Ann')
    for (const input of [undefined, null, 5, '', ['aaaaaaaaaa1'], { id: 'aaaaaaaaaa1' }, 'x'.repeat(301)]) {
      assert.deepEqual(await add(ann.socket, input), { ok: false, error: 'invalid' }, JSON.stringify(input)?.slice(0, 40))
    }
    assert.deepEqual(await answer<AddTrackResult>((callback) => ann.socket.emit('dj:add', null as never, callback)), {
      ok: false,
      error: 'invalid',
    })
    for (const trackId of [undefined, null, 5, '', 'x'.repeat(101), { id: 1 }]) {
      assert.deepEqual(await remove(ann.socket, trackId), { ok: false, error: 'invalid' }, JSON.stringify(trackId)?.slice(0, 40))
    }
    assert.deepEqual(fake.calls, [])
  })

  it('accepts a link of the longest length allowed', async () => {
    await start()
    const ann = await memberIn('Ann')
    const input = `https://youtu.be/aaaaaaaaaa1?${'t=1&'.repeat(70)}`.slice(0, 300)
    assert.equal(input.length, 300)
    assert.ok((await add(ann.socket, input)).ok)
  })

  it('ignores a request that cannot be answered, and keeps working', async () => {
    await start()
    const ann = await memberIn('Ann')
    const bare = ann.socket as unknown as { emit: (event: string, ...args: unknown[]) => void }
    bare.emit('dj:add', { input: 'aaaaaaaaaa1' })
    bare.emit('dj:remove', { trackId: 'x' })
    bare.emit('dj:leave')
    bare.emit('dj:add')
    assert.ok((await add(ann.socket, 'aaaaaaaaaa2')).ok)
  })
})

describe('lining a video up', () => {
  it('answers with the track, tells the DJ their line-up, and puts the track on the decks when nothing else plays', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await visitorIn('Ben')
    const result = await add(ann.socket, 'https://youtu.be/aaaaaaaaaa1')

    assert.ok(result.ok)
    assert.deepEqual({ ...result.track, id: undefined }, { ...VIDEOS.aaaaaaaaaa1, id: undefined })
    assert.match(result.track.id, /^[\w-]{20,}$/)
    assert.deepEqual(fake.calls, ['https://youtu.be/aaaaaaaaaa1'], 'the resolver read what the page sent')

    await until(() => ben.pushes.tracks.some((change) => change.track?.title === 'Alpha'), 'the room to hear of the track')
    const change = ben.pushes.tracks.at(-1)
    assert.equal(change?.track?.id, result.track.id)
    assert.equal(change?.queue.current?.pseudo, 'Ann')
    assert.equal(change?.queue.current?.participantId, ann.snapshot.selfId)
    assert.deepEqual(ann.pushes.lineups, [[result.track], []], 'her line-up: the track, then nothing once it started')
  })

  it('sends the visitor nothing of what is private to a DJ', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    const guest = await visitorIn('Guest')
    await lineUp(ann, 'aaaaaaaaaa1')
    await lineUp(ann, 'aaaaaaaaaa2')
    await lineUp(ben, 'bbbbbbbbbb1')
    await sleep(100)

    assert.deepEqual(guest.pushes.lineups, [])
    assert.deepEqual(guest.pushes.notices, [])
    assert.ok(ben.pushes.lineups.every((lineup) => lineup.every((track) => track.videoId.startsWith('b'))), 'Ben never hears of Ann’s tracks')
    assert.ok(ann.pushes.lineups.every((lineup) => lineup.every((track) => track.videoId.startsWith('a'))))
  })

  it('shows the others a waiting DJ and their next track, and the room’s rules to whoever comes in', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    await lineUp(ann, 'aaaaaaaaaa1')
    await lineUp(ben, 'bbbbbbbbbb1')
    await until(() => ann.pushes.queues.some((queue) => waiting(queue)?.[0] === 'Ben'), 'the queue update')

    const late = await visitorIn('Late')
    assert.deepEqual(late.snapshot.rules, ROOM_RULES)
    assert.equal(late.snapshot.queue.current?.pseudo, 'Ann')
    assert.deepEqual(waiting(late.snapshot.queue), ['Ben'])
    assert.equal(late.snapshot.queue.waiting[0].next?.title, 'Bravo')
    assert.equal(late.snapshot.queue.waiting[0].participantId, ben.snapshot.selfId)
    assert.deepEqual(late.snapshot.lineup, [])
    assert.ok(!JSON.stringify(late.snapshot).includes('"accountId"'))
  })

  it('gives a member back their own line-up when they come in', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    await lineUp(ann, 'aaaaaaaaaa1')
    const queued = await lineUp(ben, 'bbbbbbbbbb1')
    ben.socket.disconnect()
    await until(() => ann.pushes.queues.some((queue) => queue.waiting[0]?.participantId === null), 'Ben to be seen away')

    const back = await memberIn('Ben', ROOM, ben.cookie)
    assert.deepEqual(back.snapshot.lineup, [queued])
    assert.equal(back.snapshot.queue.waiting[0].participantId, back.snapshot.selfId)
    assert.equal(back.snapshot.queue.waiting[0].id, ann.pushes.queues.find((queue) => queue.waiting[0]?.participantId === null)?.waiting[0].id, 'the same place')
    await until(
      () => ann.pushes.queues.at(-1)?.waiting[0]?.participantId === back.snapshot.selfId,
      'the others to see Ben back',
    )
  })

  it('answers with the reason when YouTube says no', async () => {
    await start()
    const ann = await memberIn('Ann')
    const errors: Array<[string, string]> = [
      ['nfnfnfnfnf1', 'not-found'],
      ['nenenenene1', 'not-embeddable'],
      ['ununununun1', 'unavailable'],
      ['nmnmnmnmnm1', 'not-music'],
      ['this is not a link', 'invalid-link'],
      ['zzzzzzzzzz1', 'not-found'],
    ]
    for (const [input, error] of errors) assert.deepEqual(await add(ann.socket, input), { ok: false, error }, input)
    assert.deepEqual(ann.pushes.lineups, [], 'nothing was lined up')
    const rooms = await answer<RoomSummary[]>((callback) => ann.socket.emit('lobby:join', callback))
    assert.equal(rooms.find((summary) => summary.id === ROOM)?.djs, 0, 'and nobody joined the queue')
  })

  it('says the service is out when the server has no way to read YouTube, and that is not an error in the log', async () => {
    const logged = mock.method(console, 'error', () => undefined)
    await start({ resolver: null })
    const ann = await memberIn('Ann')
    assert.deepEqual(await add(ann.socket, 'aaaaaaaaaa1'), { ok: false, error: 'service-unavailable' })
    assert.equal(logged.mock.calls.length, 0, 'a server set up without YouTube is not a fault')
  })

  it('says the same when the resolver breaks its promise and throws, and logs it', async () => {
    const logged = mock.method(console, 'error', () => undefined)
    const broken: TrackResolver = {
      resolve: async () => {
        throw new Error('boom')
      },
      resolveMany: async () => {
        throw new Error('boom')
      },
    }
    await start({ resolver: broken })
    const ann = await memberIn('Ann')
    assert.deepEqual(await add(ann.socket, 'aaaaaaaaaa1'), { ok: false, error: 'service-unavailable' })
    assert.ok(logged.mock.calls.some((call) => String(call.arguments[0]).includes('boom')))
    assert.equal(room(ann).lineup.length, 0)
  })

  it('does not wait for ever for a resolver that never answers, and can be asked again afterwards', async () => {
    mock.method(console, 'error', () => undefined)
    let hang = true
    const slow: TrackResolver = {
      resolve: async (input): Promise<ResolveResult> =>
        hang ? new Promise(() => undefined) : { ok: true, video: VIDEOS[input] },
      resolveMany: async () => new Map(),
    }
    await start({ resolver: slow, resolverTimeoutMs: 100 })
    const ann = await memberIn('Ann')
    assert.deepEqual(await add(ann.socket, 'aaaaaaaaaa1'), { ok: false, error: 'service-unavailable' })
    hang = false
    assert.ok((await add(ann.socket, 'aaaaaaaaaa1')).ok, 'the member is not left waiting forever')
  })
})

/** What a person was last told about their own line-up (the snapshot, then the pushes). */
function room(person: Person) {
  return { lineup: person.pushes.lineups.at(-1) ?? person.snapshot.lineup }
}

describe('the rules of the room, through a connection', () => {
  it('says how long a track may be', async () => {
    await start()
    const ann = await memberIn('Ann')
    assert.deepEqual(await add(ann.socket, 'looooooong1'), { ok: false, error: 'too-long', maxSec: ROOM_RULES.maxTrackSec })
  })

  it('says when a track that played can play again', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    await lineUp(ann, 'aaaaaaaaaa1')
    const refused = await add(ben.socket, 'aaaaaaaaaa1')
    assert.equal(refused.ok, false)
    if (refused.ok || refused.error !== 'recently-played') return assert.fail(JSON.stringify(refused))
    assert.ok(refused.retryAfterSec !== null && refused.retryAfterSec > ROOM_RULES.repeatDelaySec! - 5)
    assert.ok(refused.retryAfterSec <= ROOM_RULES.repeatDelaySec!)
  })

  it('refuses a video another DJ lined up', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    const cat = await memberIn('Cat')
    await lineUp(ann, 'aaaaaaaaaa1')
    await lineUp(ben, 'bbbbbbbbbb1')
    assert.deepEqual(await add(cat.socket, 'bbbbbbbbbb1'), { ok: false, error: 'already-queued' })
  })

  it('does not ask YouTube when the queue is full, and lets a DJ already in it add more', async () => {
    const rules: RoomRules = { ...ROOM_RULES, maxDjs: 2 }
    await start({ rules })
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    const cat = await memberIn('Cat')
    await lineUp(ann, 'aaaaaaaaaa1')
    await lineUp(ben, 'bbbbbbbbbb1')
    const calls = fake.calls.length

    assert.deepEqual(await add(cat.socket, 'cccccccccc1'), { ok: false, error: 'queue-full' })
    assert.equal(fake.calls.length, calls, 'a request that cannot succeed costs no quota')
    assert.ok((await add(ben.socket, 'bbbbbbbbbb2')).ok)

    assert.deepEqual(await leaveQueue(ben.socket), { ok: true })
    assert.ok((await add(cat.socket, 'cccccccccc1')).ok, 'a place is free')
  })
})

describe('taking turns', () => {
  it('lets a DJ skip their own track: the decks go to the next DJ, and the DJ is last in line', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    const guest = await visitorIn('Guest')
    await lineUp(ann, 'aaaaaaaaaa1')
    await lineUp(ann, 'aaaaaaaaaa2')
    await lineUp(ben, 'bbbbbbbbbb1')
    await until(() => titleOnDecks(guest) === 'Alpha', 'Ann on the decks')

    assert.deepEqual(await like(ann.socket, true), { ok: false, error: 'own-track' })
    assert.deepEqual(await like(guest.socket, true), { ok: true })
    assert.deepEqual(await skip(ann.socket, true), { ok: true })

    await until(() => titleOnDecks(guest) === 'Bravo', 'Ben’s track')
    const change = guest.pushes.tracks.at(-1)
    assert.equal(change?.queue.current?.pseudo, 'Ben')
    assert.deepEqual(waiting(change?.queue), ['Ann'])
    assert.equal(change?.queue.waiting[0].next?.title, 'Alpha 2')
    assert.deepEqual(room(ann).lineup.map((track) => track.title), ['Alpha 2'])
  })

  it('lets the others vote the DJ off: the DJ does not count as a voter', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    const guest = await visitorIn('Guest')
    await lineUp(ann, 'aaaaaaaaaa1')
    await lineUp(ben, 'bbbbbbbbbb1')
    await until(() => titleOnDecks(guest) === 'Alpha', 'Ann on the decks')

    // Three people here, one of them the DJ: two voters, both needed.
    assert.deepEqual(await skip(ben.socket, true), { ok: true })
    assert.equal(titleOnDecks(guest), 'Alpha')
    assert.deepEqual(await skip(guest.socket, true), { ok: true })
    await until(() => titleOnDecks(guest) === 'Bravo', 'the track to change')
  })

  it('cuts the DJ’s track when they leave the queue, and the next DJ starts', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    await lineUp(ann, 'aaaaaaaaaa1')
    await lineUp(ben, 'bbbbbbbbbb1')
    await until(() => titleOnDecks(ben) === 'Alpha', 'Ann on the decks')

    assert.deepEqual(await leaveQueue(ann.socket), { ok: true })
    await until(() => titleOnDecks(ben) === 'Bravo', 'Ben’s track')
    assert.deepEqual(waiting(ben.pushes.tracks.at(-1)?.queue), [])
    assert.deepEqual(await leaveQueue(ann.socket), { ok: false, error: 'not-in-queue' })
    assert.deepEqual(room(ann).lineup, [])
  })

  it('keeps a DJ’s place while they are away, and the others see them away', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    await lineUp(ann, 'aaaaaaaaaa1')
    await lineUp(ben, 'bbbbbbbbbb1')
    // Let the updates about the two of them lining up go out first: what follows can only be about Ann leaving.
    await until(() => ben.pushes.queues.some((queue) => waiting(queue)?.[0] === 'Ben'), 'the queue to show Ben in line')
    await sleep(100)
    const heard = ben.pushes.queues.length

    ann.socket.disconnect()
    await until(() => ben.pushes.queues.length > heard, 'the room to hear that Ann is away')
    assert.equal(ben.pushes.queues.at(-1)?.current?.participantId, null)
    assert.equal(titleOnDecks(ben), 'Alpha', 'her track plays on')
    assert.equal(ben.pushes.queues.at(-1)?.current?.pseudo, 'Ann')
  })

  it('moves on to the next DJ when a track ends by itself, and a DJ whose last track has played is out of the queue without a word', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    const guest = await visitorIn('Guest')
    await lineUp(ann, 'shortttttt1') // a second: takes the decks at once
    await lineUp(ben, 'shortttttt2')

    await until(() => titleOnDecks(guest) === 'Short two', 'Ben’s track to start by itself', 3000)
    const change = guest.pushes.tracks.at(-1)
    assert.equal(change?.queue.current?.pseudo, 'Ben')
    assert.deepEqual(waiting(change?.queue), [], 'Ann played her only track: she is not in the queue any more')

    // A second later nobody has anything left: the room's own selection plays. Each DJ saw their last track play, so
    // nobody is told anything.
    await until(() => titleOnDecks(guest) !== 'Short two', 'the room’s own selection to take over', 3000)
    await sleep(100)
    assert.deepEqual(ann.pushes.notices, [])
    assert.deepEqual(ben.pushes.notices, [])
    assert.deepEqual(guest.pushes.notices, [])
    assert.equal(guest.pushes.tracks.at(-1)?.queue.current, null, 'nobody is on the decks')
  })

  it('takes a track out of a line-up, and refuses another DJ’s track id', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    await lineUp(ann, 'aaaaaaaaaa1')
    const first = await lineUp(ben, 'bbbbbbbbbb1')
    const second = await lineUp(ben, 'bbbbbbbbbb2')
    assert.deepEqual(await remove(ann.socket, first.id), { ok: false, error: 'no-such-track' }, 'Ann is in the queue, the track is Ben’s')

    assert.deepEqual(await remove(ben.socket, first.id), { ok: true })
    assert.deepEqual(ben.pushes.lineups.at(-1), [second])
    assert.deepEqual(await remove(ben.socket, first.id), { ok: false, error: 'no-such-track' })
    await until(() => ann.pushes.queues.at(-1)?.waiting[0]?.next?.id === second.id, 'the queue to show the next track')
  })

  it('plays the next member’s tracks in order across rooms independently', async () => {
    await start()
    const ann = await memberIn('Ann', ROOM)
    const other = await memberIn('Ben', 'jazz-cafe')
    await lineUp(ann, 'aaaaaaaaaa1')
    assert.equal(other.snapshot.queue.current, null)
    assert.deepEqual(other.pushes.queues, [])
    assert.ok(!other.pushes.tracks.some((change) => change.track?.title === 'Alpha'), 'another room hears nothing')
  })
})

describe('the allowances between two requests', () => {
  it('lets a member look up one video a second, and says when to come back', async () => {
    await start({ lookupIntervalMs: 1000 })
    const ann = await memberIn('Ann')
    assert.ok((await add(ann.socket, 'aaaaaaaaaa1')).ok)
    const tooFast = await add(ann.socket, 'aaaaaaaaaa2')
    assert.equal(tooFast.ok, false)
    if (tooFast.ok || tooFast.error !== 'rate-limited') return assert.fail(JSON.stringify(tooFast))
    assert.ok(tooFast.retryAfterMs > 0 && tooFast.retryAfterMs <= 1000)
    assert.equal(fake.calls.length, 1, 'the second request never reached YouTube')

    await sleep(1050)
    assert.ok((await add(ann.socket, 'aaaaaaaaaa2')).ok)
  })

  it('does not let a refused request be retried at once for free: it counts as a request', async () => {
    await start({ lookupIntervalMs: 1000 })
    const ann = await memberIn('Ann')
    assert.equal((await add(ann.socket, 'nfnfnfnfnf1')).ok, false)
    const again = await add(ann.socket, 'aaaaaaaaaa1')
    assert.deepEqual({ ok: again.ok, error: again.ok ? undefined : again.error }, { ok: false, error: 'rate-limited' })
  })

  it('does not stack requests behind a slow answer: only one lookup at a time', async () => {
    await start()
    let open!: () => void
    fake.gate = new Promise<void>((resolve) => (open = resolve))
    const ann = await memberIn('Ann')

    const first = add(ann.socket, 'aaaaaaaaaa1')
    await until(() => fake.calls.length === 1, 'the first lookup to start')
    const second = await add(ann.socket, 'aaaaaaaaaa2')
    assert.equal(second.ok, false)
    if (second.ok || second.error !== 'rate-limited') return assert.fail(JSON.stringify(second))
    assert.ok(second.retryAfterMs > 0)
    assert.equal(fake.calls.length, 1)

    open()
    assert.ok((await first).ok)
    fake.gate = null
    assert.ok((await add(ann.socket, 'aaaaaaaaaa2')).ok, 'free again')
  })

  it('does not hold up the edits of a line-up more than a moment', async () => {
    await start({ editIntervalMs: 300 })
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    await lineUp(ann, 'aaaaaaaaaa1')
    const queued = await lineUp(ben, 'bbbbbbbbbb1')
    await lineUp(ben, 'bbbbbbbbbb2') // a second track: taking the first back leaves Ben in the queue
    assert.deepEqual(await remove(ben.socket, queued.id), { ok: true })
    const fast = await leaveQueue(ben.socket)
    assert.equal(fast.ok, false)
    if (fast.ok || fast.error !== 'rate-limited') return assert.fail(JSON.stringify(fast))
    assert.ok(fast.retryAfterMs > 0 && fast.retryAfterMs <= 300)
    await sleep(320)
    assert.deepEqual(await leaveQueue(ben.socket), { ok: true })
  })
})

describe('the lookups of an account', () => {
  it('are counted for the account, not for the connection: another connection is no fresh budget', async () => {
    await start({ accountLookupBudget: { burst: 2, refillMs: 60_000 } })
    const cookie = await register('Ann')
    const inLofi = await memberIn('Ann', ROOM, cookie)
    const inJazz = await memberIn('Ann', 'jazz-cafe', cookie) // the same account, another room, another connection
    assert.ok((await add(inLofi.socket, 'aaaaaaaaaa1')).ok)
    assert.ok((await add(inJazz.socket, 'bbbbbbbbbb1')).ok)

    const third = await add(inLofi.socket, 'aaaaaaaaaa2')
    assert.equal(third.ok, false)
    if (third.ok || third.error !== 'rate-limited') return assert.fail(JSON.stringify(third))
    assert.ok(third.retryAfterMs > 0 && third.retryAfterMs <= 60_000, `retry in ${third.retryAfterMs} ms`)
    const fourth = await add(inJazz.socket, 'bbbbbbbbbb2')
    assert.equal(fourth.ok === false && fourth.error, 'rate-limited', 'whichever connection asks')
    assert.equal(fake.calls.length, 2, 'the refused requests never reached YouTube')

    const ben = await memberIn('Ben')
    assert.ok((await add(ben.socket, 'cccccccccc1')).ok, 'another account has its own budget')
  })

  it('are not charged for what is refused before YouTube is asked', async () => {
    await start({ accountLookupBudget: { burst: 1, refillMs: 60_000 } })
    const guest = await visitorIn('Guest')
    assert.equal((await add(guest.socket, 'aaaaaaaaaa1')).ok, false)
    const ann = await memberIn('Ann')
    assert.equal((await add(ann.socket, 12345)).ok, false, 'not even a string')
    assert.ok((await add(ann.socket, 'aaaaaaaaaa1')).ok, 'the single lookup of the budget is still there')
  })

  it('are earned back over time', async () => {
    await start({ accountLookupBudget: { burst: 1, refillMs: 150 } })
    const ann = await memberIn('Ann')
    assert.ok((await add(ann.socket, 'aaaaaaaaaa1')).ok)
    assert.equal((await add(ann.socket, 'aaaaaaaaaa2')).ok, false)
    await sleep(200)
    assert.ok((await add(ann.socket, 'aaaaaaaaaa2')).ok)
  })
})

describe('a DJ skipping their own track, through the connection', () => {
  it('has to wait for the first seconds of the track, and is told how long', async () => {
    await start({ ownSkipMinSec: 10 })
    const ann = await memberIn('Ann')
    await lineUp(ann, 'aaaaaaaaaa1')
    await lineUp(ann, 'aaaaaaaaaa2')
    await until(() => titleOnDecks(ann) === 'Alpha', 'Ann’s track to start')
    const early = await skip(ann.socket, true)
    assert.equal(early.ok, false)
    if (early.ok || early.error !== 'too-early') return assert.fail(JSON.stringify(early))
    assert.ok(early.retryAfterMs > 0 && early.retryAfterMs <= 10_000, `opens in ${early.retryAfterMs} ms`)
    assert.equal(titleOnDecks(ann), 'Alpha', 'the track went on')
  })
})

describe('a request that is answered after the member is gone', () => {
  it('does nothing when the member left the room meanwhile', async () => {
    await start()
    let open!: () => void
    fake.gate = new Promise<void>((resolve) => (open = resolve))
    const ann = await memberIn('Ann')
    const watcher = await visitorIn('Watcher')

    const pending = add(ann.socket, 'aaaaaaaaaa1')
    await until(() => fake.calls.length === 1, 'the lookup to start')
    ann.socket.emit('room:leave')
    await sleep(50)
    open()

    assert.deepEqual(await pending, { ok: false, error: 'not-in-room' })
    await sleep(100)
    assert.deepEqual(watcher.pushes.tracks.filter((change) => change.track?.title === 'Alpha'), [])
    const rooms = await answer<RoomSummary[]>((callback) => watcher.socket.emit('lobby:join', callback))
    assert.equal(rooms.find((summary) => summary.id === ROOM)?.djs, 0)
    const check = await visitorIn('Check')
    assert.equal(check.snapshot.queue.current, null)
    assert.deepEqual(check.snapshot.queue.waiting, [])
  })

  it('does nothing in another room when the member moved on meanwhile', async () => {
    await start()
    let open!: () => void
    fake.gate = new Promise<void>((resolve) => (open = resolve))
    const ann = await memberIn('Ann')

    const pending = add(ann.socket, 'aaaaaaaaaa1')
    await until(() => fake.calls.length === 1, 'the lookup to start')
    await sleep(350) // a connection may not join twice within 300 ms
    await enter(ann.socket, 'jazz-cafe')
    open()

    assert.deepEqual(await pending, { ok: false, error: 'not-in-room' })
    const check = await visitorIn('Check', 'jazz-cafe')
    assert.equal(check.snapshot.queue.current, null)
    assert.deepEqual(check.snapshot.queue.waiting, [])
    const checkHere = await visitorIn('Check2', ROOM)
    assert.deepEqual(checkHere.snapshot.queue.waiting, [])
  })

  it('does nothing when the connection closed meanwhile', async () => {
    await start()
    let open!: () => void
    fake.gate = new Promise<void>((resolve) => (open = resolve))
    const ann = await memberIn('Ann')
    const watcher = await visitorIn('Watcher')

    void add(ann.socket, 'aaaaaaaaaa1').catch(() => undefined)
    await until(() => fake.calls.length === 1, 'the lookup to start')
    ann.socket.disconnect()
    await sleep(50)
    open()
    await sleep(100)
    assert.deepEqual(watcher.pushes.tracks.filter((change) => change.track?.title === 'Alpha'), [])
    const check = await visitorIn('Check')
    assert.deepEqual(check.snapshot.queue.waiting, [])
    assert.equal(check.snapshot.queue.current, null)
  })
})

describe('what changed while YouTube was being asked', () => {
  /** Two members ask at the same time and both are let through the first checks: the answers come back together. */
  async function bothAskThenAnswer(first: Person, second: Person, inputs: [string, string]) {
    let open!: () => void
    fake.gate = new Promise<void>((resolve) => (open = resolve))
    const asked = fake.calls.length
    const a = add(first.socket, inputs[0])
    const b = add(second.socket, inputs[1])
    await until(() => fake.calls.length === asked + 2, 'both lookups to start')
    open()
    return Promise.all([a, b])
  }

  it('gives the last free place to one of two members who asked at once, and tells the other the queue is full', async () => {
    await start({ rules: { ...ROOM_RULES, maxDjs: 2 } })
    const ann = await memberIn('Ann')
    await lineUp(ann, 'aaaaaaaaaa1') // one place of two
    const ben = await memberIn('Ben')
    const cat = await memberIn('Cat')

    const results = await bothAskThenAnswer(ben, cat, ['bbbbbbbbbb1', 'cccccccccc1'])
    assert.deepEqual(results.map((result) => result.ok).sort(), [false, true])
    const refused = results.find((result) => !result.ok)
    assert.deepEqual(refused, { ok: false, error: 'queue-full' })
    const check = await visitorIn('Check')
    assert.equal(check.snapshot.queue.waiting.length, 1, 'the queue holds two DJs, not three')
  })

  it('lets only one of two members who lined the same video up at once keep it', async () => {
    await start()
    const ann = await memberIn('Ann')
    await lineUp(ann, 'aaaaaaaaaa1')
    const ben = await memberIn('Ben')
    const cat = await memberIn('Cat')

    const results = await bothAskThenAnswer(ben, cat, ['bbbbbbbbbb1', 'https://youtu.be/bbbbbbbbbb1'])
    assert.deepEqual(results.map((result) => result.ok).sort(), [false, true])
    assert.deepEqual(results.find((result) => !result.ok), { ok: false, error: 'already-queued' })
    const check = await visitorIn('Check')
    assert.deepEqual(waiting(check.snapshot.queue), [check.snapshot.queue.waiting[0].pseudo], 'one DJ in line, not two')
    assert.equal(check.snapshot.queue.waiting.length, 1)
  })

  it('refuses a track that became too long for the room while it was being read', async () => {
    const rules: RoomRules = { ...ROOM_RULES }
    await start({ rules })
    const ann = await memberIn('Ann')
    let open!: () => void
    fake.gate = new Promise<void>((resolve) => (open = resolve))
    const pending = add(ann.socket, 'aaaaaaaaaa1') // 200 s: fine for the room as it is now
    await until(() => fake.calls.length === 1, 'the lookup to start')
    rules.maxTrackSec = 100 // the room's rules change before the answer comes back
    open()
    assert.deepEqual(await pending, { ok: false, error: 'too-long', maxSec: 100 })
  })
})

describe('the list of rooms', () => {
  it('shows how many DJs there are and how many the room holds', async () => {
    await start()
    const watcher = await server.connect()
    const first = await answer<RoomSummary[]>((callback) => watcher.emit('lobby:join', callback))
    for (const summary of first) assert.equal(summary.djs, 0)
    assert.deepEqual(
      first.map((summary) => summary.maxDjs),
      ROOM_DEFS.map((def) => def.rules.maxDjs),
      'each room has its own',
    )

    const djs = (rooms: RoomSummary[]) => rooms.find((summary) => summary.id === ROOM)?.djs
    let latest = first
    watcher.on('lobby:rooms', (rooms) => (latest = rooms))
    const ann = await memberIn('Ann')
    await lineUp(ann, 'aaaaaaaaaa1')
    await until(() => djs(latest) === 1, 'the list to show the DJ')

    // A DJ who only waits changes nothing else in the list: no new track, nobody comes or goes.
    const ben = await memberIn('Ben')
    await until(() => latest.find((summary) => summary.id === ROOM)?.online === 2, 'the list to show Ben in the room')
    await lineUp(ben, 'bbbbbbbbbb1')
    await until(() => djs(latest) === 2, 'the list to show the DJ in line')
    await leaveQueue(ben.socket)
    await until(() => djs(latest) === 1, 'the list to show the DJ in line gone')

    await leaveQueue(ann.socket)
    await until(() => djs(latest) === 0, 'the list to show the DJ gone')
  })
})

describe('the order of what plays next, told to everybody', () => {
  const order = (queue: DjQueue | undefined) => queue?.upcoming.map((step) => `${step.pseudo}:${step.track.title}`)

  it('tells a visitor the projected order, in the snapshot and after each change', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    const guest = await visitorIn('Guest')
    await lineUp(ann, 'aaaaaaaaaa1')
    await lineUp(ann, 'aaaaaaaaaa2')
    await lineUp(ben, 'bbbbbbbbbb1')
    const benSecond = await lineUp(ben, 'bbbbbbbbbb2')
    await until(() => titleOnDecks(guest) === 'Alpha', 'Ann on the decks')
    await until(
      () => order(guest.pushes.queues.at(-1))?.join() === 'Ben:Bravo,Ann:Alpha 2,Ben:Bravo 2',
      'the visitor to hear the order',
    )

    // A latecomer gets it in the snapshot, with the positions and nothing private.
    const late = await visitorIn('Late')
    assert.deepEqual(order(late.snapshot.queue), ['Ben:Bravo', 'Ann:Alpha 2', 'Ben:Bravo 2'])
    const first = late.snapshot.queue.upcoming[0]
    assert.deepEqual(Object.keys(first).sort(), ['avatarId', 'entryId', 'position', 'pseudo', 'track'])
    assert.deepEqual(Object.keys(first.track).sort(), ['artist', 'durationSec', 'id', 'title', 'videoId'])
    assert.deepEqual(late.snapshot.queue.upcoming.map((step) => step.position), [1, 2, 3])
    assert.equal(first.entryId, late.snapshot.queue.waiting[0].id)

    assert.deepEqual(await remove(ben.socket, benSecond.id), { ok: true })
    await until(() => order(guest.pushes.queues.at(-1))?.join() === 'Ben:Bravo,Ann:Alpha 2', 'the removed track to leave the list')

    await lineUp(ben, 'cccccccccc1')
    await until(() => order(guest.pushes.queues.at(-1))?.join() === 'Ben:Bravo,Ann:Alpha 2,Ben:Charlie', 'the added track')

    assert.deepEqual(await leaveQueue(ben.socket), { ok: true })
    await until(() => order(guest.pushes.queues.at(-1))?.join() === 'Ann:Alpha 2' || order(guest.pushes.queues.at(-1))?.length === 0, 'Ben to leave the list')
    assert.ok(!order(guest.pushes.queues.at(-1))?.some((step) => step.startsWith('Ben')), 'Ben is gone from the list')
  })

  it('changes the list when the turn changes', async () => {
    await start()
    const ann = await memberIn('Ann')
    const ben = await memberIn('Ben')
    const guest = await visitorIn('Guest')
    await lineUp(ann, 'aaaaaaaaaa1')
    await lineUp(ann, 'aaaaaaaaaa2')
    await lineUp(ben, 'bbbbbbbbbb1')
    await until(() => titleOnDecks(guest) === 'Alpha', 'Ann on the decks')
    assert.deepEqual(await skip(ann.socket, true), { ok: true })
    await until(() => titleOnDecks(guest) === 'Bravo', 'Ben’s track')
    assert.deepEqual(order(guest.pushes.tracks.at(-1)?.queue), ['Ann:Alpha 2'])
  })
})
