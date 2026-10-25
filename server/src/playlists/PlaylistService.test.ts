import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { PLAYLISTS_MAX, PLAYLIST_NAME_MAX, PLAYLIST_TRACKS_MAX, type PlaylistReply, type VideoInfo } from '../../../shared/protocol'
import { FakeResolver } from '../testing/FakeResolver'
import { LookupBudget } from '../youtube/LookupBudget'
import type { ResolveError, ResolveResult, TrackResolver } from '../youtube/TrackResolver'
import { MemoryPlaylistStore } from './MemoryPlaylistStore'
import { MAX_AGE_MS, PlaylistService, REFRESH_AFTER_MS, type PlaylistServiceOptions } from './PlaylistService'

const START = Date.parse('2026-10-24T20:00:00Z')
const SECOND = 1000
const DAY = 24 * 3600 * SECOND

const ann = 'account-ann'
const ben = 'account-ben'

const video = (name: string, durationSec = 200): VideoInfo => ({
  videoId: name.padEnd(11, '_').slice(0, 11),
  title: `Title ${name}`,
  artist: `Artist ${name}`,
  durationSec,
})
const idOf = (name: string) => video(name).videoId

let clock: number
let store: MemoryPlaylistStore
let fake: FakeResolver
let budget: LookupBudget
let service: PlaylistService

interface Setup {
  /** What the fake YouTube knows. Names are turned into video ids. */
  knows?: string[]
  resolver?: TrackResolver | null
  budget?: LookupBudget
  service?: PlaylistServiceOptions
}

function setup(options: Setup = {}) {
  clock = START
  store = new MemoryPlaylistStore()
  fake = new FakeResolver(Object.fromEntries((options.knows ?? ['a1', 'a2', 'a3', 'b1']).map((name) => [idOf(name), video(name)])))
  budget = options.budget ?? new LookupBudget({ burst: 100, refillMs: 1 })
  service = new PlaylistService(store, options.resolver === undefined ? fake : options.resolver, budget, { now: () => clock, ...options.service })
}

beforeEach(() => setup())
afterEach(() => mock.restoreAll())

/** The reply of a call that must have worked. */
function worked<T extends object>(reply: PlaylistReply<T>): T {
  assert.ok(reply.ok, JSON.stringify(reply))
  if (!reply.ok) throw new Error('refused')
  return reply
}

async function playlist(account = ann, name = 'Chill') {
  return worked(await service.createPlaylist(account, { name })).playlist.id
}

async function add(playlistId: string, name: string, account = ann) {
  return service.addTrack(account, playlistId, { input: idOf(name) })
}

const refused = (reply: PlaylistReply<object>) => (reply.ok ? 'ok' : reply.error)

describe('naming and counting playlists', () => {
  it('keeps the name in its normalised form and lists the playlists in the order they were made', async () => {
    worked(await service.createPlaylist(ann, { name: '  Chill   du  soir ' }))
    worked(await service.createPlaylist(ann, { name: 'Jazz' }))
    const listed = worked(await service.listPlaylists(ann))
    assert.deepEqual(listed.playlists.map((entry) => [entry.name, entry.trackCount]), [['Chill du soir', 0], ['Jazz', 0]])
  })

  it('refuses a name that is not a name', async () => {
    const invisible = String.fromCodePoint(0x200b)
    const refusals = [
      ['', 'invalid-name'],
      ['   ', 'invalid-name'],
      ['a'.repeat(PLAYLIST_NAME_MAX + 1), 'invalid-name'],
      [`Chi${invisible}ll`, 'invalid-name'],
      [5, 'invalid-name'],
      [undefined, 'invalid-name'],
    ] as const
    for (const [name, error] of refusals) assert.equal(refused(await service.createPlaylist(ann, { name })), error, JSON.stringify(name))
    for (const body of [null, 'Chill', [], 5, undefined]) assert.equal(refused(await service.createPlaylist(ann, body)), 'bad-request', JSON.stringify(body))
    assert.deepEqual(worked(await service.listPlaylists(ann)).playlists, [], 'nothing was made')
  })

  it('refuses a name the member already uses, whatever the case, but not to somebody else', async () => {
    await playlist(ann, 'Chill')
    assert.equal(refused(await service.createPlaylist(ann, { name: 'CHILL' })), 'name-taken')
    worked(await service.createPlaylist(ben, { name: 'Chill' }))
  })

  it(`refuses a playlist beyond ${PLAYLISTS_MAX}, for that member only`, async () => {
    for (let index = 0; index < PLAYLISTS_MAX; index += 1) worked(await service.createPlaylist(ann, { name: `List ${index}` }))
    assert.equal(refused(await service.createPlaylist(ann, { name: 'One more' })), 'playlists-full')
    worked(await service.createPlaylist(ben, { name: 'Mine' }))
  })

  it('renames, also in another case, and refuses a taken name, a bad one, a stranger’s playlist', async () => {
    const id = await playlist(ann, 'Chill')
    await playlist(ann, 'Jazz')
    assert.equal(worked(await service.renamePlaylist(ann, id, { name: ' Soir ' })).playlist.name, 'Soir')
    assert.equal(worked(await service.renamePlaylist(ann, id, { name: 'SOIR' })).playlist.name, 'SOIR')
    assert.equal(refused(await service.renamePlaylist(ann, id, { name: 'jazz' })), 'name-taken')
    assert.equal(refused(await service.renamePlaylist(ann, id, { name: '' })), 'invalid-name')
    assert.equal(refused(await service.renamePlaylist(ann, id, null)), 'bad-request')
    assert.equal(refused(await service.renamePlaylist(ben, id, { name: 'Mine' })), 'playlist-not-found')
    assert.equal(refused(await service.renamePlaylist(ann, 'not-an-id', { name: 'x' })), 'playlist-not-found')
    assert.equal(worked(await service.listPlaylists(ann)).playlists[0].name, 'SOIR')
  })

  it('deletes a playlist with its tracks, and only for its owner', async () => {
    const id = await playlist()
    worked(await add(id, 'a1'))
    assert.equal(refused(await service.deletePlaylist(ben, id)), 'playlist-not-found')
    worked(await service.deletePlaylist(ann, id))
    assert.equal(refused(await service.getPlaylist(ann, id)), 'playlist-not-found')
    assert.equal(refused(await service.deletePlaylist(ann, id)), 'playlist-not-found')
    assert.equal(refused(await service.deletePlaylist(ann, 'x')), 'playlist-not-found')
  })
})

describe('adding a track', () => {
  it('reads the link, keeps what YouTube says, and puts the track at the end', async () => {
    const id = await playlist()
    const first = worked(await service.addTrack(ann, id, { input: `https://www.youtube.com/watch?v=${idOf('a1')}&t=5s` }))
    worked(await add(id, 'a2'))
    assert.deepEqual(first.track, { id: first.track.id, videoId: idOf('a1'), title: 'Title a1', artist: 'Artist a1', durationSec: 200, unavailable: false })
    const read = worked(await service.getPlaylist(ann, id)).playlist
    assert.deepEqual(read.tracks.map((track) => track.videoId), [idOf('a1'), idOf('a2')])
    assert.equal(read.trackCount, 2)
  })

  it('refuses what is not a YouTube link without asking YouTube, and without using the budget', async () => {
    setup({ budget: new LookupBudget({ burst: 1, refillMs: 3600 * SECOND }) })
    const id = await playlist()
    assert.equal(refused(await service.addTrack(ann, id, { input: 'https://example.com/watch?v=abcdefghijk' })), 'invalid-link')
    assert.equal(refused(await service.addTrack(ann, id, { input: 'hello' })), 'invalid-link')
    assert.deepEqual(fake.calls, [])
    worked(await add(id, 'a1')) // the single lookup of the budget is still there
  })

  it('refuses a request that is not shaped like one', async () => {
    const id = await playlist()
    for (const body of [null, {}, { input: 5 }, { input: '' }, { input: 'x'.repeat(301) }, [], 'a1']) {
      assert.equal(refused(await service.addTrack(ann, id, body)), 'bad-request', JSON.stringify(body))
    }
    assert.deepEqual(fake.calls, [])
  })

  it('says a video is already there without asking YouTube', async () => {
    const id = await playlist()
    worked(await add(id, 'a1'))
    assert.equal(refused(await add(id, 'a1')), 'already-in-playlist')
    assert.equal(fake.calls.length, 1)
  })

  it('says the playlist is full without asking YouTube', async () => {
    const id = await playlist()
    for (let index = 0; index < PLAYLIST_TRACKS_MAX; index += 1) {
      const added = await store.addTrack(ann, id, video(`fill${index}`), new Date(START), PLAYLIST_TRACKS_MAX)
      assert.ok(added.ok, `track ${index}`)
    }
    assert.equal(refused(await add(id, 'a1')), 'playlist-full')
    assert.deepEqual(fake.calls, [])
  })

  it('adds only to the member’s own playlist, and asks nothing for anybody else', async () => {
    const id = await playlist()
    assert.equal(refused(await add(id, 'a1', ben)), 'playlist-not-found')
    assert.equal(refused(await service.addTrack(ann, 'nope', { input: idOf('a1') })), 'playlist-not-found')
    assert.deepEqual(fake.calls, [])
  })

  it('says YouTube cannot be asked when there is no resolver, and spends nothing', async () => {
    setup({ resolver: null, budget: new LookupBudget({ burst: 1, refillMs: 3600 * SECOND }) })
    const id = await playlist()
    assert.equal(refused(await add(id, 'a1')), 'service-unavailable')
    assert.equal(budget.take(ann, clock), 0, 'the budget is whole')
  })

  it('passes on why a video cannot be kept', async () => {
    const reasons: ResolveError[] = ['not-found', 'not-embeddable', 'unavailable', 'service-unavailable']
    const resolver = new FakeResolver(Object.fromEntries(reasons.map((reason) => [idOf(reason), reason])))
    setup({ resolver })
    const id = await playlist()
    for (const reason of reasons) assert.equal(refused(await service.addTrack(ann, id, { input: idOf(reason) })), reason)
    assert.equal(worked(await service.getPlaylist(ann, id)).playlist.tracks.length, 0)
  })

  it('does not wait for ever for a resolver that never answers', async () => {
    mock.method(console, 'error', () => undefined)
    const slow: TrackResolver = { resolve: () => new Promise<ResolveResult>(() => undefined), resolveMany: async () => new Map() }
    setup({ resolver: slow, service: { resolverTimeoutMs: 50 } })
    const id = await playlist()
    assert.equal(refused(await add(id, 'a1')), 'service-unavailable')
  })

  it('says the same when the resolver breaks its promise and throws, and logs it', async () => {
    const logged = mock.method(console, 'error', () => undefined)
    const broken: TrackResolver = {
      resolve: async () => {
        throw new Error('boom')
      },
      resolveMany: async () => new Map(),
    }
    setup({ resolver: broken })
    const id = await playlist()
    assert.equal(refused(await add(id, 'a1')), 'service-unavailable')
    assert.ok(logged.mock.calls.some((call) => String(call.arguments[0]).includes('boom')), 'logged')
  })

  it('makes an account wait when its budget of lookups is spent, saying for how long, and not anybody else', async () => {
    setup({ budget: new LookupBudget({ burst: 2, refillMs: 10 * SECOND }) })
    const mine = await playlist(ann)
    const his = await playlist(ben)
    worked(await add(mine, 'a1'))
    worked(await add(mine, 'a2'))
    const waiting = await add(mine, 'a3')
    assert.equal(waiting.ok, false)
    assert.deepEqual(waiting.ok ? null : waiting, { ok: false, error: 'rate-limited', retryAfterSec: 10 })
    assert.equal(fake.calls.length, 2, 'the third never reached YouTube')
    worked(await add(his, 'a3', ben))

    clock += 10 * SECOND
    worked(await add(mine, 'a3'))
  })

  it('draws on the same budget as everything else that reads a link', async () => {
    setup({ budget: new LookupBudget({ burst: 1, refillMs: 3600 * SECOND }) })
    const id = await playlist()
    assert.equal(budget.take(ann, clock), 0, 'spent elsewhere (a DJ pasting a link)')
    assert.equal(refused(await add(id, 'a1')), 'rate-limited')
  })

  it('lets the store have the last word when two requests add the same video at the same moment', async () => {
    let open!: () => void
    fake.gate = new Promise<void>((resolve) => (open = resolve))
    const id = await playlist()
    const first = add(id, 'a1')
    const second = add(id, 'a1')
    await new Promise((resolve) => setImmediate(resolve))
    open()
    const outcomes = [refused(await first), refused(await second)].sort()
    assert.deepEqual(outcomes, ['already-in-playlist', 'ok'])
    assert.equal(worked(await service.getPlaylist(ann, id)).playlist.tracks.length, 1)
  })
})

describe('moving and removing tracks', () => {
  async function three() {
    const id = await playlist()
    const tracks = []
    for (const name of ['a1', 'a2', 'a3']) tracks.push(worked(await add(id, name)).track)
    return { id, tracks }
  }
  const order = async (id: string) => worked(await service.getPlaylist(ann, id)).playlist.tracks.map((track) => track.title?.slice(-2))

  it('moves a track to a place, from 0', async () => {
    const { id, tracks } = await three()
    worked(await service.moveTrack(ann, id, tracks[0].id, { position: 2 }))
    assert.deepEqual(await order(id), ['a2', 'a3', 'a1'])
    worked(await service.moveTrack(ann, id, tracks[0].id, { position: 0 }))
    assert.deepEqual(await order(id), ['a1', 'a2', 'a3'])
  })

  it('refuses a place that is not a whole number from 0, and a request that is not shaped like one', async () => {
    const { id, tracks } = await three()
    for (const position of [-1, 1.5, '1', null, undefined, Number.NaN, Number.POSITIVE_INFINITY, PLAYLIST_TRACKS_MAX]) {
      assert.equal(refused(await service.moveTrack(ann, id, tracks[0].id, { position })), 'bad-request', String(position))
    }
    for (const body of [null, 5, 'x', []]) assert.equal(refused(await service.moveTrack(ann, id, tracks[0].id, body)), 'bad-request')
    assert.deepEqual(await order(id), ['a1', 'a2', 'a3'])
  })

  it('removes a track and closes up the others', async () => {
    const { id, tracks } = await three()
    worked(await service.removeTrack(ann, id, tracks[1].id))
    assert.deepEqual(await order(id), ['a1', 'a3'])
    assert.equal(refused(await service.removeTrack(ann, id, tracks[1].id)), 'track-not-found')
  })

  it('touches only the member’s own, and answers the same whether the playlist or the track is somebody else’s', async () => {
    const { id, tracks } = await three()
    assert.equal(refused(await service.removeTrack(ben, id, tracks[0].id)), 'track-not-found', 'never said which of the two is not Ben’s')
    const his = await playlist(ben, 'His')
    assert.equal(refused(await service.removeTrack(ben, his, tracks[0].id)), 'track-not-found')
    assert.equal(refused(await service.moveTrack(ben, his, tracks[0].id, { position: 0 })), 'track-not-found')
    assert.equal(refused(await service.removeTrack(ann, id, 'not-an-id')), 'track-not-found')
    assert.equal(refused(await service.removeTrack(ann, 'nope', tracks[0].id)), 'playlist-not-found')
    assert.deepEqual(await order(id), ['a1', 'a2', 'a3'])
  })
})

describe('what YouTube said, and how long it is kept', () => {
  /** A playlist with these videos, added now; then time passes. */
  async function aged(days: number, ...names: string[]) {
    const id = await playlist()
    for (const name of names) worked(await add(id, name))
    clock += days * DAY
    return id
  }
  const titles = async (id: string) => worked(await service.getPlaylist(ann, id)).playlist.tracks.map((track) => track.title)

  it('reads a recent playlist from what is kept, without a call to YouTube', async () => {
    const id = await aged(6, 'a1', 'a2')
    fake.manyCalls.length = 0
    assert.deepEqual(await titles(id), ['Title a1', 'Title a2'])
    assert.deepEqual(fake.manyCalls, [])
  })

  it('reads again, in one call, what was last looked at a week ago, and keeps the new answer', async () => {
    const known: Record<string, VideoInfo | ResolveError> = { [idOf('a1')]: video('a1'), [idOf('a2')]: video('a2') }
    fake = new FakeResolver(known)
    service = new PlaylistService(store, fake, budget, { now: () => clock })
    const id = await aged(8, 'a1', 'a2')
    // YouTube changed the title meanwhile.
    known[idOf('a1')] = { ...video('a1'), title: 'Renamed' }

    assert.deepEqual(await titles(id), ['Renamed', 'Title a2'])
    assert.deepEqual(fake.manyCalls, [[idOf('a1'), idOf('a2')]], 'one call for both')
    assert.deepEqual(await titles(id), ['Renamed', 'Title a2'])
    assert.equal(fake.manyCalls.length, 1, 'and not again until another week has passed')
  })

  it('refreshes at exactly a week, not a moment before', async () => {
    const id = await aged(0, 'a1')
    clock = START + REFRESH_AFTER_MS - 1
    await titles(id)
    assert.equal(fake.manyCalls.length, 0)
    clock = START + REFRESH_AFTER_MS
    await titles(id)
    assert.equal(fake.manyCalls.length, 1)
  })

  it('asks for each video once, even when it is in the playlist of somebody else too, and 50 at a time', async () => {
    const names = Array.from({ length: 120 }, (_, index) => `t${index}`)
    setup({ knows: names })
    const id = await playlist()
    for (const name of names) {
      const added = await store.addTrack(ann, id, video(name), new Date(START), PLAYLIST_TRACKS_MAX)
      assert.ok(added.ok)
    }
    clock += 8 * DAY
    await titles(id)
    assert.deepEqual(fake.manyCalls.map((call) => call.length), [50, 50, 20])
  })

  it('charges every call to the account’s budget, and leaves what it could not afford for next time', async () => {
    const names = Array.from({ length: 120 }, (_, index) => `t${index}`)
    setup({ knows: names, budget: new LookupBudget({ burst: 1, refillMs: 3600 * SECOND }) })
    const id = await playlist()
    for (const name of names) await store.addTrack(ann, id, video(name), new Date(START), PLAYLIST_TRACKS_MAX)
    clock += 8 * DAY
    const read = worked(await service.getPlaylist(ann, id)).playlist
    assert.deepEqual(fake.manyCalls.map((call) => call.length), [50], 'one call was in the budget')
    assert.equal(read.tracks.length, 120, 'and all of it is still served')
    assert.ok(read.tracks.every((track) => track.title !== null))
  })

  it('flags a video that can no longer be played, keeps what was known, and does not ask again before a week', async () => {
    const id = await aged(8, 'a1', 'a2')
    fake = new FakeResolver({ [idOf('a1')]: video('a1'), [idOf('a2')]: 'not-found' })
    service = new PlaylistService(store, fake, budget, { now: () => clock })
    const read = worked(await service.getPlaylist(ann, id)).playlist
    assert.deepEqual(read.tracks.map((track) => [track.title, track.unavailable]), [['Title a1', false], ['Title a2', true]])
    await service.getPlaylist(ann, id)
    assert.equal(fake.manyCalls.length, 1, 'looked at today: not asked again')
  })

  it('does not flag three or more videos as gone when YouTube knows none of them: more likely a hiccup', async () => {
    const id = await aged(8, 'a1', 'a2', 'a3')
    fake = new FakeResolver({})
    service = new PlaylistService(store, fake, budget, { now: () => clock })
    const read = worked(await service.getPlaylist(ann, id)).playlist
    assert.equal(fake.manyCalls.length, 1, 'YouTube was asked')
    assert.deepEqual(read.tracks.map((track) => [track.title, track.unavailable]), [['Title a1', false], ['Title a2', false], ['Title a3', false]])
  })

  it('still flags two videos that YouTube does not know, and one gone among known ones', async () => {
    const id = await aged(8, 'a1', 'a2')
    fake = new FakeResolver({})
    service = new PlaylistService(store, fake, budget, { now: () => clock })
    const read = worked(await service.getPlaylist(ann, id)).playlist
    assert.deepEqual(read.tracks.map((track) => track.unavailable), [true, true])
  })

  it('does not take YouTube being out of reach for the video being gone', async () => {
    const id = await aged(8, 'a1')
    fake = new FakeResolver({ [idOf('a1')]: 'service-unavailable' })
    service = new PlaylistService(store, fake, budget, { now: () => clock })
    const first = worked(await service.getPlaylist(ann, id)).playlist.tracks[0]
    assert.deepEqual([first.title, first.unavailable], ['Title a1', false])
    await service.getPlaylist(ann, id)
    assert.equal(fake.manyCalls.length, 2, 'asked again at the next look')
  })

  it('does not take the answer of a resolver that throws for a reason to fail', async () => {
    mock.method(console, 'error', () => undefined)
    const id = await aged(8, 'a1')
    service = new PlaylistService(store, { resolve: fake.resolve.bind(fake), resolveMany: async () => { throw new Error('boom') } }, budget, { now: () => clock })
    assert.deepEqual(await titles(id), ['Title a1'])
  })

  it('stops showing what is thirty days old, and shows the playlist all the same', async () => {
    const id = await aged(0, 'a1', 'a2')
    fake = new FakeResolver({ [idOf('a1')]: 'service-unavailable', [idOf('a2')]: 'service-unavailable' })
    service = new PlaylistService(store, fake, budget, { now: () => clock })
    clock = START + MAX_AGE_MS - 1
    assert.deepEqual(await titles(id), ['Title a1', 'Title a2'], 'a moment before: still shown')
    clock = START + MAX_AGE_MS
    const read = worked(await service.getPlaylist(ann, id)).playlist
    assert.deepEqual(
      read.tracks.map((track) => [track.videoId, track.title, track.artist, track.durationSec, track.unavailable]),
      [
        [idOf('a1'), null, null, null, false],
        [idOf('a2'), null, null, null, false],
      ],
    )
  })

  it('shows it again once it could be read again', async () => {
    const id = await aged(31, 'a1')
    fake = new FakeResolver({ [idOf('a1')]: 'service-unavailable' })
    service = new PlaylistService(store, fake, budget, { now: () => clock })
    assert.deepEqual(await titles(id), [null])
    fake = new FakeResolver({ [idOf('a1')]: video('a1') })
    service = new PlaylistService(store, fake, budget, { now: () => clock })
    assert.deepEqual(await titles(id), ['Title a1'])
  })

  it('hides what is too old for a video that is flagged as well, and still says it is unavailable', async () => {
    const id = await aged(31, 'a1')
    fake = new FakeResolver({ [idOf('a1')]: 'not-found' })
    service = new PlaylistService(store, fake, budget, { now: () => clock })
    const track = worked(await service.getPlaylist(ann, id)).playlist.tracks[0]
    assert.deepEqual([track.title, track.unavailable], [null, true])
  })

  it('refreshes a video in every playlist that holds it', async () => {
    const mine = await aged(0, 'a1')
    const his = worked(await service.createPlaylist(ben, { name: 'His' })).playlist.id
    worked(await add(his, 'a1', ben))
    clock += 8 * DAY
    fake = new FakeResolver({ [idOf('a1')]: { ...video('a1'), title: 'Renamed' } })
    service = new PlaylistService(store, fake, budget, { now: () => clock })
    await service.getPlaylist(ann, mine)
    const theirs = worked(await service.getPlaylist(ben, his)).playlist.tracks[0]
    assert.equal(theirs.title, 'Renamed')
    assert.equal(fake.manyCalls.length, 1, 'already fresh for Ben: nothing more to ask')
  })

  it('goes on without a resolver: nothing is refreshed, nothing breaks', async () => {
    const id = await aged(8, 'a1')
    service = new PlaylistService(store, null, budget, { now: () => clock })
    assert.deepEqual(await titles(id), ['Title a1'])
  })
})

describe('lining up a track of a playlist', () => {
  async function kept(...names: string[]) {
    const id = await playlist()
    const tracks = []
    for (const name of names) tracks.push(worked(await add(id, name)).track)
    fake.calls.length = 0
    fake.manyCalls.length = 0
    return { id, tracks }
  }

  it('gives the video from what is kept, at no cost to YouTube, while it is recent', async () => {
    const { tracks } = await kept('a1')
    assert.deepEqual(await service.videoForDj(ann, tracks[0].id), { ok: true, video: video('a1') })
    assert.deepEqual([fake.calls, fake.manyCalls], [[], []])
  })

  it('says there is no such track for one that is not the member’s, that does not exist, or is not an id', async () => {
    const { tracks } = await kept('a1')
    for (const [account, id] of [[ben, tracks[0].id], [ann, 'a0000000-0000-4000-8000-0000000000ff'], [ann, 'x'], [ann, '']] as const) {
      assert.deepEqual(await service.videoForDj(account, id), { ok: false, error: 'no-such-track' }, id)
    }
  })

  it('refuses a video that could no longer be played at the last look', async () => {
    const { tracks } = await kept('a1')
    await store.applyRefresh([{ videoId: idOf('a1'), video: null, at: new Date(clock) }])
    assert.deepEqual(await service.videoForDj(ann, tracks[0].id), { ok: false, error: 'unavailable' })
  })

  it('reads a video that is getting old again first, and gives what it says now', async () => {
    const { tracks } = await kept('a1')
    clock += 8 * DAY
    fake = new FakeResolver({ [idOf('a1')]: { ...video('a1'), durationSec: 250 } })
    service = new PlaylistService(store, fake, budget, { now: () => clock })
    assert.deepEqual(await service.videoForDj(ann, tracks[0].id), { ok: true, video: { ...video('a1'), durationSec: 250 } })
    assert.equal(fake.manyCalls.length, 1)
  })

  it('refuses a video that turned out to be gone when it was read again', async () => {
    const { tracks } = await kept('a1')
    clock += 8 * DAY
    fake = new FakeResolver({ [idOf('a1')]: 'not-embeddable' })
    service = new PlaylistService(store, fake, budget, { now: () => clock })
    assert.deepEqual(await service.videoForDj(ann, tracks[0].id), { ok: false, error: 'unavailable' })
  })

  it('uses what is kept while it is under thirty days old, even when YouTube cannot be asked or the budget is spent', async () => {
    const { tracks } = await kept('a1')
    clock += 20 * DAY
    fake = new FakeResolver({ [idOf('a1')]: 'service-unavailable' })
    service = new PlaylistService(store, fake, new LookupBudget({ burst: 1, refillMs: 3600 * SECOND }), { now: () => clock })
    assert.deepEqual(await service.videoForDj(ann, tracks[0].id), { ok: true, video: video('a1') })
    service = new PlaylistService(store, fake, new LookupBudget({ burst: 0, refillMs: 3600 * SECOND }), { now: () => clock })
    assert.deepEqual(await service.videoForDj(ann, tracks[0].id), { ok: true, video: video('a1') })
  })

  it('refuses what is thirty days old when it cannot be read again: the room could not check its rules', async () => {
    const { tracks } = await kept('a1')
    clock += 31 * DAY
    fake = new FakeResolver({ [idOf('a1')]: 'service-unavailable' })
    service = new PlaylistService(store, fake, budget, { now: () => clock })
    assert.deepEqual(await service.videoForDj(ann, tracks[0].id), { ok: false, error: 'service-unavailable' })
    service = new PlaylistService(store, null, budget, { now: () => clock })
    assert.deepEqual(await service.videoForDj(ann, tracks[0].id), { ok: false, error: 'service-unavailable' })
  })
})

describe('judging a playlist against a room', () => {
  it('gives each track with its length and its flag, and nobody else’s playlist', async () => {
    const id = await playlist()
    const first = worked(await service.addTrack(ann, id, { input: idOf('a1') })).track
    assert.deepEqual(await service.tracksOf(ann, id), [{ id: first.id, videoId: idOf('a1'), durationSec: 200, unavailable: false }])
    assert.equal(await service.tracksOf(ben, id), null)
    assert.equal(await service.tracksOf(ann, 'nope'), null)
    assert.equal(await service.tracksOf(ann, 'a0000000-0000-4000-8000-0000000000ff'), null)
  })

  it('does not give a length that is thirty days old, and asks nothing of YouTube', async () => {
    const id = await playlist()
    worked(await add(id, 'a1'))
    fake.calls.length = 0
    clock += 31 * DAY
    const [track] = (await service.tracksOf(ann, id)) ?? []
    assert.equal(track.durationSec, null)
    assert.deepEqual([fake.calls, fake.manyCalls], [[], []])
  })
})

describe('how often a member may ask', () => {
  it('counts the changes, says when to come back, and gives the turn back with time', async () => {
    setup({ service: { limits: { changes: { max: 3, windowMs: 60 * SECOND } } } })
    for (let index = 0; index < 3; index += 1) worked(await service.createPlaylist(ann, { name: `List ${index}` }))
    const waiting = await service.createPlaylist(ann, { name: 'Too many' })
    assert.deepEqual(waiting, { ok: false, error: 'rate-limited', retryAfterSec: 60 })
    worked(await service.createPlaylist(ben, { name: 'Ben is not slowed down' }))
    clock += 60 * SECOND
    worked(await service.createPlaylist(ann, { name: 'Again' }))
  })

  it('counts every kind of change together', async () => {
    setup({ service: { limits: { changes: { max: 3, windowMs: 60 * SECOND } } } })
    const id = worked(await service.createPlaylist(ann, { name: 'One' })).playlist.id
    worked(await service.renamePlaylist(ann, id, { name: 'Two' }))
    worked(await add(id, 'a1'))
    assert.equal(refused(await service.deletePlaylist(ann, id)), 'rate-limited')
    assert.equal(refused(await service.removeTrack(ann, id, 'a0000000-0000-4000-8000-0000000000ff')), 'rate-limited')
  })

  it('counts a request that is refused for another reason too: it cost something', async () => {
    setup({ service: { limits: { changes: { max: 2, windowMs: 60 * SECOND } } } })
    assert.equal(refused(await service.createPlaylist(ann, { name: '' })), 'invalid-name')
    assert.equal(refused(await service.createPlaylist(ann, { name: '' })), 'invalid-name')
    assert.equal(refused(await service.createPlaylist(ann, { name: 'Fine' })), 'rate-limited')
  })

  it('counts looking apart from changing', async () => {
    setup({ service: { limits: { reads: { max: 2, windowMs: 60 * SECOND } } } })
    const id = await playlist()
    worked(await service.listPlaylists(ann))
    worked(await service.getPlaylist(ann, id))
    assert.equal(refused(await service.listPlaylists(ann)), 'rate-limited')
    assert.equal(refused(await service.getPlaylist(ann, id)), 'rate-limited')
    worked(await service.createPlaylist(ann, { name: 'Changing is another allowance' }))
  })

  it('forgets old counters on request', async () => {
    setup({ service: { limits: { changes: { max: 1, windowMs: SECOND } } } })
    worked(await service.createPlaylist(ann, { name: 'One' }))
    clock += 2 * SECOND
    service.sweep()
    worked(await service.createPlaylist(ann, { name: 'Two' }))
  })
})
