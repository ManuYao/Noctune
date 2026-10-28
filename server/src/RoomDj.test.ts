// DJs in a room: lining tracks up, taking turns, the rules, votes with a DJ on the decks. Fake clock, no sockets
// (the same things through real connections are in dj.realtime.test.ts).
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import {
  LINEUP_MAX,
  OWN_SKIP_MIN_SEC,
  type DjNotice,
  type DjQueue,
  type Participant,
  type QueuedTrack,
  type Reactions,
  type RoomRules,
  type Track,
  type VideoInfo,
} from '../../shared/protocol'
import { TEST_TRACKS } from './catalog'
import { Room, type RoomOptions } from './Room'

const START = 1_000_000
const SECOND = 1000

const ann: Participant = { id: 'p-ann', pseudo: 'Ann', avatarId: 'pulse', member: true }
const ben: Participant = { id: 'p-ben', pseudo: 'Ben', avatarId: 'mango', member: true }
const cat: Participant = { id: 'p-cat', pseudo: 'Cat', avatarId: 'moss', member: true }
const vic: Participant = { id: 'p-vic', pseudo: 'Vic', avatarId: 'cloud', member: false } // a visitor
const ACCOUNT: Record<string, string> = { 'p-ann': 'acc-ann', 'p-ben': 'acc-ben', 'p-cat': 'acc-cat' }
const EVERYONE = [ann, ben, cat, vic].map((person) => person.id).concat('p-ben-2', 'p-ann-2')

interface TrackChange {
  track: Track | null
  reactions: Reactions
  queue: DjQueue
}

let room: Room
let rules: RoomRules
let trackChanges: TrackChange[]
let queueChanges: DjQueue[]
let lineups: { participantId: string; lineup: QueuedTrack[] }[]
let notices: { participantId: string; notice: DjNotice }[]

function newRoom(overrides: Partial<RoomRules> = {}, options: RoomOptions = {}) {
  rules = { maxTrackSec: 300, repeatDelaySec: 2 * 3600, maxDjs: 3, ...overrides }
  trackChanges = []
  queueChanges = []
  lineups = []
  notices = []
  room = new Room(
    'test',
    'Test',
    {
      onTrackChange: (track, reactions, queue) => trackChanges.push({ track, reactions, queue }),
      onReactionsChange: () => {},
      onQueueChange: (queue) => queueChanges.push(queue),
      onLineupChange: (participantId, lineup) => lineups.push({ participantId, lineup }),
      onNotice: (participantId, notice) => notices.push({ participantId, notice }),
    },
    // No protected seconds unless a test is about them: a vote can be cast at once.
    { skipProtectedSec: 0, ownSkipMinSec: 0, rules, ...options },
  )
}

const enter = (...people: Participant[]) => {
  for (const person of people) room.add(person, ACCOUNT[person.id])
}

/** A video id is 11 characters of [\w-]: the name, padded. */
function video(name: string, durationSec = 200): VideoInfo {
  return { videoId: name.padEnd(11, '_').slice(0, 11), title: name, artist: 'Artist', durationSec }
}

/** Lines a track up and checks that it was accepted. */
function lineUp(person: Participant, name: string, durationSec = 200): QueuedTrack {
  const result = room.addTrack(person.id, video(name, durationSec))
  assert.ok(result.ok, JSON.stringify(result))
  return result.track
}

const titles = () => trackChanges.map((change) => change.track?.title)
/** The title of what plays, or null. (A function so that an assertion does not narrow `room.nowPlaying` for the rest of the test.) */
const playingNow = () => room.nowPlaying?.title ?? null
const lineupTitles = (person: Participant) => room.lineupOf(person.id).map((track) => track.title)
const waitingNames = () => room.queueView().waiting.map((entry) => entry.pseudo)
const onDecks = () => room.queueView().current?.pseudo ?? null
const noticesFor = (person: Participant) =>
  notices.filter((entry) => entry.participantId === person.id).map((entry) => entry.notice)

/**
 * Ann on the decks with a1 playing and a2 lined up, Ben waiting with b1. (The first track of the room is the room's
 * own selection: Ann's first track takes over from it at once.)
 */
function annOnTheDecksBenWaiting() {
  enter(ann, ben)
  lineUp(ann, 'a1')
  lineUp(ann, 'a2')
  lineUp(ben, 'b1')
}

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START })
  newRoom()
})

afterEach(() => {
  for (const id of EVERYONE) room.remove(id)
  mock.timers.reset()
})

describe('lining a track up', () => {
  it('refuses visitors and people who are not in the room, and creates nothing', () => {
    enter(vic)
    assert.deepEqual(room.addTrack(vic.id, video('v1')), { ok: false, error: 'members-only' })
    assert.deepEqual(room.addTrack('ghost', video('v1')), { ok: false, error: 'not-in-room' })
    assert.deepEqual(room.removeTrack(vic.id, 'x'), { ok: false, error: 'members-only' })
    assert.deepEqual(room.leaveQueue(vic.id), { ok: false, error: 'members-only' })
    assert.deepEqual(room.removeTrack('ghost', 'x'), { ok: false, error: 'not-in-room' })
    assert.deepEqual(room.leaveQueue('ghost'), { ok: false, error: 'not-in-room' })
    assert.deepEqual(room.memberError(vic.id), { ok: false, error: 'members-only' })
    assert.equal(room.memberError(vic.id) === null, false)
    assert.equal(room.djCount, 0)
    assert.deepEqual(room.lineupOf(vic.id), [])
    assert.equal(lineups.length, 0)
  })

  it('puts a member at the end of the queue with their track, and tells them their line-up', () => {
    enter(ann, ben)
    lineUp(ann, 'a1') // takes the decks at once
    lineups.length = 0
    const queued = lineUp(ben, 'b1')

    assert.equal(onDecks(), 'Ann')
    const [entry] = room.queueView().waiting
    assert.equal(entry.pseudo, 'Ben')
    assert.equal(entry.avatarId, 'mango')
    assert.equal(entry.participantId, ben.id)
    assert.deepEqual(entry.next, queued)
    assert.equal(queued.title, 'b1')
    assert.deepEqual(lineups, [{ participantId: ben.id, lineup: [queued] }], 'private: only the DJ is told, and with ids')
    assert.equal(room.djCount, 2)
  })

  it('gives each place a public id that does not show the account', () => {
    enter(ann, ben)
    lineUp(ann, 'a1')
    lineUp(ben, 'b1')
    const view = room.queueView()
    const ids = [view.current?.id, view.waiting[0].id]
    assert.equal(new Set(ids).size, 2)
    assert.ok(!JSON.stringify(view).includes('acc-'), 'no account id in what everybody sees')
  })

  it('takes over from the room’s own selection at once, when it plays', () => {
    enter(ann, vic)
    assert.deepEqual(titles(), [TEST_TRACKS[0].title])
    mock.timers.tick(10 * SECOND)
    const queued = lineUp(ann, 'a1')

    assert.deepEqual(titles(), [TEST_TRACKS[0].title, 'a1'])
    const change = trackChanges.at(-1)
    assert.equal(change?.track?.id, queued.id)
    assert.equal(change?.track?.startedAt, START + 10 * SECOND)
    assert.equal(change?.queue.current?.pseudo, 'Ann')
    assert.deepEqual(change?.queue.waiting, [])
    assert.deepEqual(room.lineupOf(ann.id), [], 'the track left the line-up when it started')
    assert.deepEqual(lineups.at(-1), { participantId: ann.id, lineup: [] })
  })

  it('does not cut a DJ’s track for another DJ’s arrival', () => {
    annOnTheDecksBenWaiting()
    assert.equal(room.nowPlaying?.title, 'a1')
    assert.equal(titles().filter((title) => title === 'b1').length, 0)
  })

  it('goes on with the room’s own selection after the last track of the last DJ', () => {
    enter(ann, vic)
    lineUp(ann, 'a1')
    mock.timers.tick(200 * SECOND)
    assert.equal(room.nowPlaying?.videoId, TEST_TRACKS[1].videoId, 'the selection continues where it was left')
    assert.equal(onDecks(), null)
    assert.deepEqual(noticesFor(ann), [], 'her turn has not come round again: she has just played')
    assert.equal(room.djCount, 1, 'and she keeps her place')

    mock.timers.tick(TEST_TRACKS[1].durationSec * SECOND) // the selection ends: her turn, with nothing to play
    assert.deepEqual(noticesFor(ann), [{ kind: 'skipped' }], 'now Ann is told her turn came with nothing to play')
  })

  it('lets a DJ line up several tracks and play them in order', () => {
    enter(ann, vic)
    lineUp(ann, 'a1')
    lineUp(ann, 'a2')
    lineUp(ann, 'a3')
    mock.timers.tick(200 * SECOND)
    mock.timers.tick(200 * SECOND)
    assert.deepEqual(titles().slice(1), ['a1', 'a2', 'a3'])
    assert.deepEqual(lineupTitles(ann), [])
  })
})

describe('the rules of the room when lining a track up', () => {
  it('refuses a track longer than the room allows, with the limit, and accepts one of exactly that length', () => {
    enter(ann, vic)
    assert.deepEqual(room.addTrack(ann.id, video('long', 301)), { ok: false, error: 'too-long', maxSec: 300 })
    assert.equal(room.addTrack(ann.id, video('exact', 300)).ok, true)
  })

  it('has no limit on the length in a room that sets none (but a day is the most a track can be)', () => {
    newRoom({ maxTrackSec: null })
    enter(ann, vic)
    assert.equal(room.addTrack(ann.id, video('epic', 3 * 3600)).ok, true)
    assert.deepEqual(room.addTrack(ann.id, video('forever', 24 * 3600 + 1)), { ok: false, error: 'unavailable' })
  })

  it('refuses a duration that is not a sensible whole number of seconds: it would make the timer fire at once', () => {
    newRoom({ maxTrackSec: null })
    enter(ann, vic)
    for (const durationSec of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.deepEqual(room.addTrack(ann.id, video('odd', durationSec)), { ok: false, error: 'unavailable' }, String(durationSec))
    }
    assert.equal(room.djCount, 0, 'and nothing was created')
  })

  it('refuses what the resolver should never hand over: a video id that is not one, a title that is not text', () => {
    enter(ann, vic)
    const bad = [
      { ...video('x1'), videoId: 'short' },
      { ...video('x1'), videoId: 'has space!!' },
      { ...video('x1'), videoId: 'x'.repeat(12) },
      { ...video('x1'), title: 5 as unknown as string },
      { ...video('x1'), artist: undefined as unknown as string },
    ]
    for (const candidate of bad) {
      assert.deepEqual(room.addTrack(ann.id, candidate), { ok: false, error: 'unavailable' }, JSON.stringify(candidate))
    }
    assert.equal(room.djCount, 0, 'and nobody was put in the queue')
  })

  it('refuses a track played recently, says when it can play again, and accepts it after that', () => {
    newRoom({ repeatDelaySec: 600 })
    enter(ann, ben)
    lineUp(ann, 'x1') // plays from START
    mock.timers.tick(250 * SECOND)

    assert.deepEqual(room.addTrack(ben.id, video('x1')), { ok: false, error: 'recently-played', retryAfterSec: 350 })
    mock.timers.tick(349 * SECOND)
    assert.deepEqual(room.addTrack(ben.id, video('x1')), { ok: false, error: 'recently-played', retryAfterSec: 1 })
    mock.timers.tick(1 * SECOND)
    assert.equal(room.addTrack(ben.id, video('x1')).ok, true)
  })

  it('rounds the wait up to the next whole second: never promises a moment that is too early', () => {
    newRoom({ repeatDelaySec: 600 })
    enter(ann, ben)
    lineUp(ann, 'x1')
    mock.timers.tick(250 * SECOND + 500)
    assert.deepEqual(room.addTrack(ben.id, video('x1')), { ok: false, error: 'recently-played', retryAfterSec: 350 })
  })

  it('counts the room’s own selection as played: its tracks cannot be lined up right away', () => {
    enter(ann, vic)
    const first = TEST_TRACKS[0]
    assert.deepEqual(room.addTrack(ann.id, { ...video('whatever'), videoId: first.videoId, durationSec: first.durationSec }), {
      ok: false,
      error: 'recently-played',
      retryAfterSec: 2 * 3600,
    })
  })

  it('never lets a track repeat in a room that says so, however long ago it played', () => {
    newRoom({ repeatDelaySec: null })
    enter(ann, ben)
    lineUp(ann, 'x1')
    mock.timers.tick(30 * 24 * 3600 * SECOND)
    assert.deepEqual(room.addTrack(ben.id, video('x1')), { ok: false, error: 'recently-played', retryAfterSec: null })
  })

  it('refuses a video another DJ already lined up, or the same DJ twice', () => {
    annOnTheDecksBenWaiting()
    enter(cat)
    assert.deepEqual(room.addTrack(cat.id, video('b1')), { ok: false, error: 'already-queued' })
    assert.deepEqual(room.addTrack(ben.id, video('b1')), { ok: false, error: 'already-queued' })
    assert.deepEqual(room.addTrack(ann.id, video('a2')), { ok: false, error: 'already-queued' }, 'still waiting in her own line-up')
    assert.equal(room.djCount, 2, 'Cat was not put in the queue by a refused track')
  })

  it('counts a track that plays right now as lined up, even in a room that lets tracks repeat at once', () => {
    newRoom({ repeatDelaySec: 0 })
    enter(ann, ben)
    lineUp(ann, 'a1')
    assert.deepEqual(room.addTrack(ben.id, video('a1')), { ok: false, error: 'already-queued' })
  })

  it('says what is wrong first when several things are: too long, then recently played, then already lined up', () => {
    enter(ann, ben)
    lineUp(ann, 'a1') // plays now: also "recently played"
    lineUp(ben, 'b1') // lined up
    assert.deepEqual(room.addTrack(ben.id, video('a1', 400)), { ok: false, error: 'too-long', maxSec: 300 })
    assert.equal((room.addTrack(ben.id, video('a1')) as { error: string }).error, 'recently-played')
    assert.equal((room.addTrack(ann.id, video('b1')) as { error: string }).error, 'already-queued')
  })

  it('refuses a newcomer when the queue is full, but not a DJ who is in it', () => {
    newRoom({ maxDjs: 2 })
    enter(ann, ben, cat)
    lineUp(ann, 'a1')
    lineUp(ben, 'b1')
    assert.deepEqual(room.placeError(cat.id), { ok: false, error: 'queue-full' })
    assert.deepEqual(room.addTrack(cat.id, video('c1')), { ok: false, error: 'queue-full' })
    assert.equal(room.addTrack(ben.id, video('b2')).ok, true, 'Ben is in the queue already')

    room.leaveQueue(ben.id)
    assert.equal(room.addTrack(cat.id, video('c1')).ok, true, 'a place is free again')
  })

  it('counts the DJ on the decks as one of the places', () => {
    newRoom({ maxDjs: 1 })
    enter(ann, ben)
    lineUp(ann, 'a1')
    assert.deepEqual(room.addTrack(ben.id, video('b1')), { ok: false, error: 'queue-full' })
  })

  it('refuses a track when the DJ already has as many lined up as a line-up holds', () => {
    newRoom({ maxDjs: 5 })
    enter(ann, ben)
    lineUp(ann, 'a0') // on the decks: not in the line-up any more
    for (let index = 1; index <= LINEUP_MAX; index += 1) lineUp(ben, `b${index}`)
    assert.deepEqual(room.placeError(ben.id), { ok: false, error: 'lineup-full' })
    assert.deepEqual(room.addTrack(ben.id, video('one-more')), { ok: false, error: 'lineup-full' })
    assert.equal(room.lineupOf(ben.id).length, LINEUP_MAX)
  })

  it('leaves no trace of a refused track: nobody is put in the queue, nobody is told anything', () => {
    enter(ann, vic)
    lineups.length = 0
    room.addTrack(ann.id, video('long', 999))
    mock.timers.tick(SECOND)
    assert.equal(room.djCount, 0)
    assert.deepEqual(room.queueView(), { current: null, waiting: [], upcoming: [] })
    assert.deepEqual(lineups, [])
    assert.deepEqual(queueChanges, [])
  })
})

describe('taking turns', () => {
  it('plays each DJ in turn and sends the one who played to the back', () => {
    annOnTheDecksBenWaiting()
    assert.deepEqual(titles(), [TEST_TRACKS[0].title, 'a1'])
    assert.deepEqual(waitingNames(), ['Ben'])

    mock.timers.tick(200 * SECOND)
    assert.equal(room.nowPlaying?.title, 'b1')
    assert.equal(room.nowPlaying?.startedAt, START + 200 * SECOND)
    assert.equal(onDecks(), 'Ben')
    assert.deepEqual(waitingNames(), ['Ann'])

    mock.timers.tick(200 * SECOND)
    assert.equal(room.nowPlaying?.title, 'a2')
    assert.deepEqual(waitingNames(), ['Ben'])

    mock.timers.tick(200 * SECOND) // nobody has anything left: the room’s own selection plays
    assert.equal(room.nowPlaying?.videoId, TEST_TRACKS[1].videoId)
    assert.equal(onDecks(), null)
  })

  it('sends the queue along with every new track', () => {
    annOnTheDecksBenWaiting()
    mock.timers.tick(200 * SECOND)
    const change = trackChanges.at(-1)
    assert.equal(change?.track?.title, 'b1')
    assert.equal(change?.queue.current?.pseudo, 'Ben')
    assert.deepEqual(change?.queue.waiting.map((entry) => entry.pseudo), ['Ann'])
    assert.equal(change?.queue.waiting[0].next?.title, 'a2')
  })

  it('tells a DJ whose turn came with nothing to play, and takes them out at the second time', () => {
    enter(ann, ben)
    lineUp(ann, 'a1')
    lineUp(ben, 'b1')
    mock.timers.tick(200 * SECOND) // Ben plays b1; Ann has just played, her turn has not come round again
    assert.deepEqual(noticesFor(ann), [])
    mock.timers.tick(200 * SECOND) // Ann's turn: nothing (miss 1); Ben has just played → the selection
    assert.deepEqual(noticesFor(ann), [{ kind: 'skipped' }])
    assert.deepEqual(noticesFor(ben), [], 'Ben has just played too')
    assert.equal(room.djCount, 2)

    mock.timers.tick(TEST_TRACKS[1].durationSec * SECOND) // the selection ends: Ann misses again, Ben misses his first
    assert.deepEqual(noticesFor(ann), [{ kind: 'skipped' }, { kind: 'removed' }])
    assert.deepEqual(noticesFor(ben), [{ kind: 'skipped' }])
    assert.equal(room.djCount, 1)

    mock.timers.tick(TEST_TRACKS[2].durationSec * SECOND) // and Ben's second
    assert.deepEqual(noticesFor(ben), [{ kind: 'skipped' }, { kind: 'removed' }])
    assert.equal(room.djCount, 0)
    assert.deepEqual(lineups.at(-1)?.lineup, [], 'and their line-up is gone')
  })

  it('skips a DJ who is away, who keeps their place and their line-up', () => {
    annOnTheDecksBenWaiting()
    room.remove(ben.id)
    const [entry] = room.queueView().waiting
    assert.equal(entry.participantId, null)
    assert.equal(entry.pseudo, 'Ben')
    assert.equal(entry.next?.title, 'b1')

    mock.timers.tick(200 * SECOND) // Ben is away: Ann plays a2 instead
    assert.equal(room.nowPlaying?.title, 'a2')
    assert.deepEqual(waitingNames(), ['Ben'])
    assert.equal(room.queueView().waiting[0].next?.title, 'b1', 'the track is still lined up')
    assert.deepEqual(noticesFor(ben), [], 'nobody to tell')
  })

  it('takes an away DJ out after two turns skipped in a row', () => {
    annOnTheDecksBenWaiting()
    room.remove(ben.id)
    mock.timers.tick(200 * SECOND) // Ann plays a2; Ben's first miss
    assert.equal(room.djCount, 2)
    mock.timers.tick(200 * SECOND) // Ben's second miss: out; Ann (nothing left) misses once
    assert.deepEqual(waitingNames(), ['Ann'])
    assert.equal(room.djCount, 1)
  })

  it('gives a DJ who comes back the same place and line-up, under a new participant id', () => {
    annOnTheDecksBenWaiting()
    const before = room.queueView().waiting[0].id
    room.remove(ben.id)
    const back: Participant = { ...ben, id: 'p-ben-2', pseudo: 'Ben2' }
    room.add(back, 'acc-ben')

    const [entry] = room.queueView().waiting
    assert.equal(entry.id, before, 'the same place')
    assert.equal(entry.participantId, 'p-ben-2')
    assert.equal(entry.pseudo, 'Ben2', 'under the name the account has now')
    assert.deepEqual(room.lineupOf('p-ben-2').map((track) => track.title), ['b1'])
    assert.deepEqual(room.lineupOf(ben.id), [], 'the old participant has nothing any more')
    assert.equal(room.hasAccount('acc-ben'), true)
    mock.timers.tick(200 * SECOND)
    assert.equal(room.nowPlaying?.title, 'b1', 'and their turn comes')
  })

  it('tells the room when a DJ goes away and comes back, once', () => {
    annOnTheDecksBenWaiting()
    mock.timers.tick(250)
    queueChanges.length = 0

    room.remove(ben.id)
    room.add({ ...ben, id: 'p-ben-2' }, 'acc-ben')
    assert.equal(queueChanges.length, 0, 'not at once')
    mock.timers.tick(250)
    assert.equal(queueChanges.length, 1)
    assert.equal(queueChanges[0].waiting[0].participantId, 'p-ben-2', 'the state at the moment it is sent')
  })

  it('tells the room when a DJ goes away', () => {
    annOnTheDecksBenWaiting()
    mock.timers.tick(250)
    queueChanges.length = 0

    room.remove(ben.id)
    mock.timers.tick(250)
    assert.equal(queueChanges.length, 1)
    assert.equal(queueChanges[0].waiting[0].participantId, null)
    assert.equal(queueChanges[0].waiting[0].pseudo, 'Ben', 'still in line')
  })

  it('says nothing about the queue when somebody who is not a DJ leaves', () => {
    annOnTheDecksBenWaiting()
    enter(vic)
    mock.timers.tick(250)
    queueChanges.length = 0

    room.remove(vic.id)
    mock.timers.tick(250)
    assert.equal(queueChanges.length, 0)
  })

  it('lets a DJ who comes back while the room’s own selection plays take the decks at once', () => {
    enter(ann, vic)
    lineUp(ann, 'a1')
    lineUp(ann, 'a2')
    room.remove(ann.id) // away; a1 plays on
    assert.equal(room.nowPlaying?.title, 'a1')
    mock.timers.tick(200 * SECOND) // Ann is away: skipped, the selection plays
    assert.equal(room.nowPlaying?.videoId, TEST_TRACKS[1].videoId)

    mock.timers.tick(50 * SECOND)
    room.add({ ...ann, id: 'p-ann-2' }, 'acc-ann')
    assert.equal(room.nowPlaying?.title, 'a2')
    assert.equal(room.nowPlaying?.startedAt, START + 250 * SECOND)
    assert.equal(onDecks(), 'Ann')
    assert.deepEqual(room.lineupOf('p-ann-2'), [])
  })

  it('does not push a DJ who comes back ahead of the one on the decks', () => {
    annOnTheDecksBenWaiting()
    room.remove(ben.id)
    const titlesBefore = titles().length
    room.add({ ...ben, id: 'p-ben-2' }, 'acc-ben')
    assert.equal(titles().length, titlesBefore, 'no new track')
    assert.equal(room.nowPlaying?.title, 'a1')
  })

  it('keeps the queue when the room empties, and starts again from the front when someone comes back', () => {
    annOnTheDecksBenWaiting()
    room.remove(ann.id)
    room.remove(ben.id)
    assert.equal(playingNow(), null)
    assert.equal(room.djCount, 2)
    assert.equal(onDecks(), null)
    assert.deepEqual(waitingNames(), ['Ben', 'Ann'], 'the DJ who was on the decks went to the back')

    mock.timers.tick(3600 * SECOND)
    assert.equal(playingNow(), null, 'nothing plays for nobody')

    room.add({ ...ben, id: 'p-ben-2' }, 'acc-ben')
    assert.equal(room.nowPlaying?.title, 'b1', 'Ben is first in line and here')
    room.add({ ...ann, id: 'p-ann-2' }, 'acc-ann')
    mock.timers.tick(200 * SECOND)
    assert.equal(room.nowPlaying?.title, 'a2')
  })

  it('treats the DJs who never came back as skipped turns when someone else opens the room', () => {
    annOnTheDecksBenWaiting()
    room.remove(ann.id)
    room.remove(ben.id)
    enter(cat)
    assert.equal(room.nowPlaying?.videoId, TEST_TRACKS[1].videoId, 'the selection plays: nobody of the queue is here')
    assert.equal(room.djCount, 2, 'the first miss')
    mock.timers.tick(TEST_TRACKS[1].durationSec * SECOND)
    assert.equal(room.djCount, 0, 'the second miss: both are out')
  })
})

describe('leaving the queue and taking tracks out', () => {
  it('takes a track out of the line-up by its id, and tells the DJ', () => {
    enter(ann, ben)
    lineUp(ann, 'a1')
    const [b1, b2, b3] = ['b1', 'b2', 'b3'].map((name) => lineUp(ben, name))
    mock.timers.tick(250)
    queueChanges.length = 0

    assert.deepEqual(room.removeTrack(ben.id, b2.id), { ok: true })
    assert.deepEqual(lineups.at(-1), { participantId: ben.id, lineup: [b1, b3] })
    mock.timers.tick(250)
    assert.equal(queueChanges.length, 1, 'the upcoming list shows every track: the room is told')
    queueChanges.length = 0

    assert.deepEqual(room.removeTrack(ben.id, b1.id), { ok: true })
    mock.timers.tick(250)
    assert.equal(queueChanges.length, 1)
    assert.equal(queueChanges[0].waiting[0].next?.title, 'b3')
  })

  it('refuses to take out a track that is not in the DJ’s own line-up, someone else’s included', () => {
    enter(ann, ben, cat)
    lineUp(ann, 'a1')
    const b1 = lineUp(ben, 'b1')
    lineUp(cat, 'c1')

    assert.deepEqual(room.removeTrack(cat.id, b1.id), { ok: false, error: 'no-such-track' })
    assert.deepEqual(room.removeTrack(ben.id, 'nope'), { ok: false, error: 'no-such-track' })
    assert.deepEqual(lineupTitles(ben), ['b1'])
  })

  it('answers “not in the queue” to a member who is not', () => {
    enter(ann, ben)
    lineUp(ann, 'a1')
    assert.deepEqual(room.removeTrack(ben.id, 'x'), { ok: false, error: 'not-in-queue' })
    assert.deepEqual(room.leaveQueue(ben.id), { ok: false, error: 'not-in-queue' })
  })

  it('lets a waiting DJ leave: their place and line-up are gone', () => {
    annOnTheDecksBenWaiting()
    assert.deepEqual(room.leaveQueue(ben.id), { ok: true })
    assert.deepEqual(waitingNames(), [])
    assert.deepEqual(lineups.at(-1), { participantId: ben.id, lineup: [] })
    assert.equal(room.djCount, 1)
    assert.equal(room.nowPlaying?.title, 'a1', 'the track on the decks plays on')
    assert.deepEqual(room.leaveQueue(ben.id), { ok: false, error: 'not-in-queue' })
  })

  it('cuts the track when the DJ on the decks leaves, and does not send them to the back', () => {
    annOnTheDecksBenWaiting()
    mock.timers.tick(50 * SECOND)
    assert.deepEqual(room.leaveQueue(ann.id), { ok: true })

    assert.equal(room.nowPlaying?.title, 'b1')
    assert.equal(room.nowPlaying?.startedAt, START + 50 * SECOND)
    assert.equal(onDecks(), 'Ben')
    assert.deepEqual(waitingNames(), [])
    assert.deepEqual(room.lineupOf(ann.id), [], 'a2 went with her')
    mock.timers.tick(200 * SECOND)
    assert.equal(room.nowPlaying?.videoId, TEST_TRACKS[1].videoId, 'Ann never comes round again')
  })

  it('cuts the track for the room’s own selection when nobody else can play', () => {
    enter(ann, vic)
    lineUp(ann, 'a1')
    room.leaveQueue(ann.id)
    assert.equal(room.nowPlaying?.videoId, TEST_TRACKS[1].videoId)
    assert.equal(onDecks(), null)
    assert.equal(room.djCount, 0)
  })

  it('lets a DJ who disconnects keep the decks until the end of their track', () => {
    annOnTheDecksBenWaiting()
    room.remove(ann.id)
    assert.equal(room.nowPlaying?.title, 'a1', 'the track plays on')
    assert.equal(room.queueView().current?.participantId, null)
    mock.timers.tick(200 * SECOND)
    assert.equal(room.nowPlaying?.title, 'b1')
    assert.deepEqual(waitingNames(), ['Ann'], 'and Ann is at the back, away')
  })
})

describe('the rules, checked again when the track is about to play', () => {
  it('drops a track that no longer fits the room, tells the DJ, and skips the turn if nothing else can play', () => {
    enter(ann, ben)
    lineUp(ann, 'a1')
    lineUp(ben, 'b1', 280) // fine for 300 s
    rules.maxTrackSec = 200 // the room's rules changed meanwhile
    mock.timers.tick(200 * SECOND)

    assert.deepEqual(noticesFor(ben), [{ kind: 'track-dropped', title: 'b1', reason: 'too-long' }, { kind: 'skipped' }])
    assert.deepEqual(lineups.filter((entry) => entry.participantId === ben.id).at(-1)?.lineup, [])
    assert.equal(room.nowPlaying?.videoId === video('b1').videoId, false)
  })

  it('plays the next track of the line-up when the first one was dropped', () => {
    enter(ann, ben)
    lineUp(ann, 'a1')
    lineUp(ben, 'b-long', 280)
    lineUp(ben, 'b-short', 100)
    rules.maxTrackSec = 200
    mock.timers.tick(200 * SECOND)

    assert.equal(room.nowPlaying?.title, 'b-short')
    assert.deepEqual(noticesFor(ben), [{ kind: 'track-dropped', title: 'b-long', reason: 'too-long' }])
  })

  it('drops a track that the room’s own selection played while its DJ was away', () => {
    const wanted = TEST_TRACKS[1] // what the selection plays next
    enter(ann, ben)
    lineUp(ann, 'a1')
    assert.equal(room.addTrack(ben.id, { ...video('whatever'), videoId: wanted.videoId, title: wanted.title, durationSec: wanted.durationSec }).ok, true)
    room.remove(ben.id)
    mock.timers.tick(200 * SECOND) // Ben is away, Ann has nothing: the selection plays the video Ben lined up
    assert.equal(room.nowPlaying?.videoId, wanted.videoId)

    room.add({ ...ben, id: 'p-ben-2' }, 'acc-ben')
    assert.equal(room.nowPlaying?.videoId, wanted.videoId, 'still the selection’s track')
    assert.deepEqual(noticesFor({ ...ben, id: 'p-ben-2' }), [
      { kind: 'track-dropped', title: wanted.title, reason: 'recently-played' },
    ])
    assert.deepEqual(room.lineupOf('p-ben-2'), [])
  })
})

describe('reactions with a DJ on the decks', () => {
  it('does not let the DJ like their own track, and a refused like does not use up their turn', () => {
    enter(ann, ben)
    lineUp(ann, 'a1')
    assert.deepEqual(room.like(ann.id, true, START), { ok: false, error: 'own-track' })
    assert.deepEqual(room.like(ann.id, false, START), { ok: false, error: 'own-track' })
    assert.equal(room.reactions().likes, 0)
    assert.deepEqual(room.voteSkip(ann.id, false, START), { ok: true }, 'not held back by the refused like')
    assert.deepEqual(room.like(ben.id, true, START), { ok: true }, 'everybody else can')
    assert.equal(room.reactions().likes, 1)
  })

  it('lets the DJ like again when the track is not theirs', () => {
    annOnTheDecksBenWaiting()
    mock.timers.tick(200 * SECOND) // Ben's track
    assert.deepEqual(room.like(ann.id, true), { ok: true })
  })

  it('does not count the DJ among the voters', () => {
    enter(ann, ben, cat, vic) // four people, three of them can vote
    assert.equal(room.reactions().skipRequired, 3, 'all four can vote while the selection plays')
    lineUp(ann, 'a1')
    assert.equal(room.reactions().skipRequired, 2)
    assert.equal(trackChanges.at(-1)?.reactions.skipRequired, 2)

    room.voteSkip(ben.id, true)
    assert.equal(room.nowPlaying?.title, 'a1', '1 of 2')
    room.voteSkip(cat.id, true)
    assert.notEqual(room.nowPlaying?.title, 'a1', '2 of 2: skipped')
  })

  it('counts everybody again when the DJ is away, as the track plays on', () => {
    enter(ann, ben, cat, vic)
    lineUp(ann, 'a1')
    assert.equal(room.reactions().skipRequired, 2)
    room.remove(ann.id) // three people left, all voters
    assert.equal(room.reactions().skipRequired, 2)
    room.add({ ...ann, id: 'p-ann-2' }, 'acc-ann') // four, one of them the DJ
    assert.equal(room.reactions().skipRequired, 2)
  })

  it('skips the DJ’s track when a majority of the others vote, and the DJ goes to the back', () => {
    enter(ann, ben, cat)
    lineUp(ann, 'a1')
    lineUp(ann, 'a2')
    lineUp(cat, 'c1')
    room.voteSkip(ben.id, true) // 1 of 2
    room.voteSkip(cat.id, true) // 2 of 2
    assert.equal(room.nowPlaying?.title, 'c1', 'Cat is next in line')
    assert.deepEqual(waitingNames(), ['Ann'])
    assert.deepEqual(lineupTitles(ann), ['a2'])
  })

  it('applies the first 30 seconds protection to a DJ’s track like any other', () => {
    newRoom({}, { skipProtectedSec: 30 })
    enter(ann, ben)
    lineUp(ann, 'a1')
    assert.deepEqual(room.voteSkip(ben.id, true, START + 10 * SECOND), { ok: false, error: 'too-early', retryAfterMs: 20 * SECOND })
  })
})

describe('how soon a DJ may skip their own track', () => {
  it('waits for the first seconds, says how long, and lets the DJ take a skip back at any time', () => {
    newRoom({}, { ownSkipMinSec: 10 })
    enter(ann, ben)
    lineUp(ann, 'a1')
    lineUp(ann, 'a2')
    mock.timers.tick(5_000)
    assert.deepEqual(room.voteSkip(ann.id, false), { ok: true }, 'taking back needs no wait')
    mock.timers.tick(4_999)
    assert.deepEqual(room.voteSkip(ann.id, true), { ok: false, error: 'too-early', retryAfterMs: 1 })
    assert.equal(playingNow(), 'a1', 'nothing changed')

    mock.timers.tick(1)
    assert.deepEqual(room.voteSkip(ann.id, true), { ok: true })
    assert.equal(playingNow(), 'a2')
  })

  it('does not use up the DJ’s turn to react when it refuses', () => {
    newRoom({}, { ownSkipMinSec: 10 })
    enter(ann, ben)
    lineUp(ann, 'a1')
    lineUp(ann, 'a2')
    mock.timers.tick(9_900)
    assert.equal(room.voteSkip(ann.id, true).ok, false)
    mock.timers.tick(100)
    assert.deepEqual(room.voteSkip(ann.id, true), { ok: true }, 'the moment it opens, no further wait')
  })

  it('is the protocol’s ten seconds unless the room says otherwise', () => {
    newRoom({}, { ownSkipMinSec: undefined })
    enter(ann, ben)
    lineUp(ann, 'a1')
    mock.timers.tick(4_000)
    assert.deepEqual(room.voteSkip(ann.id, true), {
      ok: false,
      error: 'too-early',
      retryAfterMs: OWN_SKIP_MIN_SEC * 1000 - 4_000,
    })
  })

  it('counts a track that can be skipped as played: skipping cannot replay it at once', () => {
    newRoom({}, { ownSkipMinSec: 10 })
    enter(ann, ben)
    lineUp(ann, 'a1')
    mock.timers.tick(10_000)
    const skipped = room.voteSkip(ann.id, true)
    assert.ok(skipped.ok, JSON.stringify(skipped))
    assert.deepEqual(room.addTrack(ben.id, video('a1')), { ok: false, error: 'recently-played', retryAfterSec: 2 * 3600 - 10 })
  })
})

describe('a DJ skipping their own track', () => {
  // The decks go to the next DJ in line: nobody keeps them by skipping.

  it('passes the decks to the DJ waiting, at once and without any protection, and sends the DJ to the back', () => {
    newRoom({}, { skipProtectedSec: 30 })
    enter(ann, ben)
    lineUp(ann, 'a1')
    lineUp(ann, 'a2')
    lineUp(ann, 'a3')
    lineUp(ann, 'a4')
    lineUp(ben, 'b1')
    mock.timers.tick(5 * SECOND) // well inside the protected seconds

    assert.deepEqual(room.voteSkip(ann.id, true), { ok: true })
    assert.equal(room.nowPlaying?.title, 'b1')
    assert.equal(room.nowPlaying?.startedAt, START + 5 * SECOND)
    assert.equal(onDecks(), 'Ben')
    assert.deepEqual(waitingNames(), ['Ann'], 'Ann is last in the queue')
    assert.deepEqual(lineupTitles(ann), ['a2', 'a3', 'a4'], 'she lost only the track that was playing')
    assert.equal(room.djCount, 2, 'and she is still a DJ')
    assert.equal(trackChanges.at(-1)?.track?.title, 'b1')
  })

  it('starts the DJ’s own next track at once when nobody else is waiting', () => {
    enter(ann, vic)
    lineUp(ann, 'a1')
    lineUp(ann, 'a2')
    mock.timers.tick(5 * SECOND)

    assert.deepEqual(room.voteSkip(ann.id, true), { ok: true })
    assert.equal(room.nowPlaying?.title, 'a2')
    assert.equal(room.nowPlaying?.startedAt, START + 5 * SECOND)
    assert.equal(onDecks(), 'Ann')
    assert.deepEqual(waitingNames(), [])
    assert.deepEqual(lineupTitles(ann), [])
  })

  it('skips the turn of a waiting DJ who is away, and plays again only because nobody else can', () => {
    enter(ann, ben, vic)
    lineUp(ann, 'a1')
    lineUp(ann, 'a2')
    lineUp(ann, 'a3')
    lineUp(ben, 'b1')
    room.remove(ben.id)

    room.voteSkip(ann.id, true) // Ben is away: his turn is skipped (first miss)
    assert.equal(room.nowPlaying?.title, 'a2')
    assert.equal(onDecks(), 'Ann')
    assert.deepEqual(waitingNames(), ['Ben'])
    assert.equal(room.djCount, 2, 'one miss is not the end of his place')

    mock.timers.tick(SECOND) // a vote to skip may come again after a moment
    room.voteSkip(ann.id, true) // second miss in a row: he is out
    assert.equal(room.nowPlaying?.title, 'a3')
    assert.deepEqual(waitingNames(), [])
    assert.equal(room.djCount, 1)
  })

  it('skips the turn of a waiting DJ who has no track, and tells them', () => {
    enter(ann, ben, vic)
    lineUp(ann, 'a1')
    lineUp(ann, 'a2')
    const b1 = lineUp(ben, 'b1')
    room.removeTrack(ben.id, b1.id) // still in the queue, with nothing to play

    room.voteSkip(ann.id, true)
    assert.equal(room.nowPlaying?.title, 'a2', 'Ann plays again: nobody else can')
    assert.deepEqual(noticesFor(ben), [{ kind: 'skipped' }])
    assert.deepEqual(waitingNames(), ['Ben'])
  })

  it('becomes an ordinary vote again once the DJ is no longer on the decks', () => {
    newRoom({}, { skipProtectedSec: 30 })
    enter(ann, ben, cat, vic)
    lineUp(ann, 'a1')
    lineUp(ben, 'b1')
    room.voteSkip(ann.id, true, Date.now()) // Ann skips her own track: Ben's starts
    assert.equal(room.nowPlaying?.title, 'b1')
    const startedAt = room.nowPlaying?.startedAt ?? 0

    // Four people here, Ben is the DJ: three voters, two votes needed. Ann is one of the voters now.
    assert.equal(room.reactions().skipRequired, 2)
    assert.deepEqual(room.voteSkip(ann.id, true, startedAt + 10 * SECOND), {
      ok: false,
      error: 'too-early',
      retryAfterMs: 20 * SECOND,
    })
    assert.equal(room.reactions().skipVotes, 0)

    mock.timers.tick(30 * SECOND)
    assert.deepEqual(room.voteSkip(ann.id, true), { ok: true })
    assert.equal(room.nowPlaying?.title, 'b1', 'one vote of two: the track plays on')
    assert.equal(room.reactions().skipVotes, 1)
    room.voteSkip(cat.id, true)
    assert.notEqual(room.nowPlaying?.title, 'b1', 'two votes: skipped')
  })

  it('does nothing when the DJ takes a skip back: there is no vote to take back', () => {
    enter(ann, vic)
    lineUp(ann, 'a1')
    assert.deepEqual(room.voteSkip(ann.id, false), { ok: true })
    assert.equal(room.nowPlaying?.title, 'a1')
  })

  it('is held to the same rate limit as every reaction', () => {
    enter(ann, vic)
    lineUp(ann, 'a1')
    lineUp(ann, 'a2')
    lineUp(ann, 'a3')
    assert.deepEqual(room.voteSkip(ann.id, true, START), { ok: true })
    assert.deepEqual(room.voteSkip(ann.id, true, START + 100), { ok: false, error: 'rate-limited', retryAfterMs: 200 })
    assert.equal(room.nowPlaying?.title, 'a2')
  })

  it('judges the DJ by account: a DJ who came back under a new id can still skip their own track', () => {
    enter(ann, vic)
    lineUp(ann, 'a1')
    lineUp(ann, 'a2')
    room.remove(ann.id)
    room.add({ ...ann, id: 'p-ann-2' }, 'acc-ann')
    assert.deepEqual(room.like('p-ann-2', true), { ok: false, error: 'own-track' })
    assert.deepEqual(room.voteSkip('p-ann-2', true), { ok: true })
    assert.equal(room.nowPlaying?.title, 'a2')
  })
})

describe('what the room is told', () => {
  it('sends the queue once for a burst of changes, as it is when it goes out', () => {
    enter(ann, ben, cat)
    lineUp(ann, 'a1')
    queueChanges.length = 0
    lineUp(ben, 'b1')
    lineUp(cat, 'c1')
    mock.timers.tick(249)
    assert.equal(queueChanges.length, 0)
    mock.timers.tick(1)
    assert.equal(queueChanges.length, 1)
    assert.deepEqual(queueChanges[0].waiting.map((entry) => entry.pseudo), ['Ben', 'Cat'])
    mock.timers.tick(5000)
    assert.equal(queueChanges.length, 1)
  })

  it('does not send a separate queue update for a change a new track already carried', () => {
    enter(ann, ben)
    lineUp(ann, 'a1')
    lineUp(ann, 'a2')
    queueChanges.length = 0
    lineUp(ben, 'b1') // a change to announce shortly...
    room.voteSkip(ann.id, true) // ...but the track changes first, and carries the queue
    mock.timers.tick(5000)
    assert.deepEqual(queueChanges, [])
    assert.equal(trackChanges.at(-1)?.queue.current?.pseudo, 'Ben')
  })

  it('stops talking about the queue once the room is empty', () => {
    enter(ann, ben)
    lineUp(ann, 'a1')
    lineUp(ben, 'b1')
    room.remove(ann.id)
    room.remove(ben.id)
    queueChanges.length = 0
    mock.timers.tick(5000)
    assert.deepEqual(queueChanges, [])
  })

  it('only ever tells a line-up or a notice to the DJ it is about', () => {
    annOnTheDecksBenWaiting()
    for (const entry of lineups) assert.ok(['p-ann', 'p-ben'].includes(entry.participantId))
    assert.ok(lineups.some((entry) => entry.participantId === 'p-ben'))
    assert.ok(!lineups.some((entry) => entry.participantId === 'p-vic'))
  })
})

describe('the memory of what played', () => {
  const played = () => (room as unknown as { playedAt: Map<string, number> }).playedAt

  it('forgets plays that no longer matter once the repeat delay is over', () => {
    newRoom({ repeatDelaySec: 600 })
    enter(ann, vic)
    lineUp(ann, 'x1', 100)
    assert.ok(played().has(video('x1').videoId))
    mock.timers.tick(700 * SECOND) // x1 ended; the selection played in between
    lineUp(ann, 'x2', 100) // a play after the delay: the old one is dropped
    assert.equal(played().has(video('x1').videoId), false)
    assert.equal(played().has(video('x2').videoId), true)
  })

  it('stays bounded in a room where nothing may repeat, however long it lives', () => {
    newRoom({ repeatDelaySec: null, maxTrackSec: null, maxDjs: 5 })
    enter(ann, vic)
    for (let index = 0; index < 1100; index += 1) {
      lineUp(ann, `t${index}`, 1)
      mock.timers.tick(SECOND)
    }
    assert.equal(played().size, 1000)
  })

  it('moves a track that plays again to the end of the memory', () => {
    newRoom({ repeatDelaySec: 600 })
    enter(ann, vic)
    lineUp(ann, 'x1', 100)
    mock.timers.tick(700 * SECOND)
    lineUp(ann, 'x1', 100) // allowed again
    assert.deepEqual([...played().keys()].at(-1), video('x1').videoId)
  })

  const first = TEST_TRACKS[0]
  const firstAsLinedUp = () => ({ ...video('whatever'), videoId: first.videoId, durationSec: first.durationSec })

  it('does not count a track nobody had time to hear: the room emptied right after it started', () => {
    enter(vic)
    room.remove(vic.id) // somebody who opens the room and leaves again
    assert.equal(played().size, 0, 'the first track of the selection was not heard')

    enter(ann)
    const result = room.addTrack(ann.id, firstAsLinedUp())
    assert.ok(result.ok, JSON.stringify(result))
    // Ann's track took over at once, cutting the selection's second track before anybody heard it.
    assert.equal(played().has(TEST_TRACKS[1].videoId), false, 'a track cut by a DJ taking over, at once, was not heard either')
  })

  for (const [heardMs, counts] of [
    [10_000 - 1, false],
    [10_000, true],
  ] as const) {
    it(`${counts ? 'counts' : 'does not count'} a track that played ${heardMs} ms before the room emptied`, () => {
      enter(vic)
      mock.timers.tick(heardMs)
      room.remove(vic.id)
      assert.equal(played().has(first.videoId), counts)

      enter(ann)
      const result = room.addTrack(ann.id, firstAsLinedUp())
      if (counts) assert.deepEqual(result, { ok: false, error: 'recently-played', retryAfterSec: 2 * 3600 - 10 })
      else assert.ok(result.ok, JSON.stringify(result))
    })
  }

  it('counts a short track that played to its end', () => {
    enter(ann, vic)
    lineUp(ann, 'blip', 3)
    mock.timers.tick(3 * SECOND)
    assert.equal(played().has(video('blip').videoId), true, 'three seconds was the whole track')
  })

  it('does not count a DJ’s track that they cut at once, and lets it be lined up again', () => {
    enter(ann, ben)
    lineUp(ann, 'x1')
    const skipped = room.voteSkip(ann.id, true)
    assert.ok(skipped.ok, JSON.stringify(skipped))
    assert.equal(played().has(video('x1').videoId), false)

    const again = room.addTrack(ben.id, video('x1'))
    assert.ok(again.ok, JSON.stringify(again))
  })

  it('puts back what the memory held when a replay is cut before anybody heard it', () => {
    enter(vic)
    // The four tracks of the selection play in full, then the first one comes round again.
    for (const track of TEST_TRACKS) mock.timers.tick(track.durationSec * SECOND)
    const elapsed = TEST_TRACKS.reduce((sum, track) => sum + track.durationSec, 0)
    assert.equal(room.nowPlaying?.videoId, first.videoId, 'the first track again')
    assert.equal(played().get(first.videoId), START + elapsed * SECOND, 'its second play is in the memory')

    room.remove(vic.id) // cut at once
    assert.equal(played().get(first.videoId), START, 'back to its first play')
    assert.deepEqual(
      [...played().keys()],
      TEST_TRACKS.map((track) => track.videoId),
      'and the memory is still in order of time, the oldest first',
    )

    enter(ann)
    assert.deepEqual(room.addTrack(ann.id, firstAsLinedUp()), {
      ok: false,
      error: 'recently-played',
      retryAfterSec: 2 * 3600 - elapsed,
    })
  })
})
