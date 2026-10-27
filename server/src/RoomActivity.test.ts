// What a room tells the activity counters (profile and badges): members only, once per person and track, and nothing that
// changes the room itself. Fake clock, no sockets (the same things through real connections: activity.realtime.test.ts).
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import type { Participant, QueuedTrack } from '../../shared/protocol'
import type { RoomActivity } from './activity/ActivityRecorder'
import { TEST_TRACKS } from './catalog'
import { Room } from './Room'

const START = 1_000_000
const SECOND = 1000

const ann: Participant = { id: 'p-ann', pseudo: 'Ann', avatarId: 'pulse', member: true }
const ben: Participant = { id: 'p-ben', pseudo: 'Ben', avatarId: 'mango', member: true }
const vic: Participant = { id: 'p-vic', pseudo: 'Vic', avatarId: 'cloud', member: false }
const ACCOUNT: Record<string, string> = { 'p-ann': 'acc-ann', 'p-ben': 'acc-ben', 'p-ann-2': 'acc-ann' }

type Call = { name: string; args: unknown[] }
let room: Room
let calls: Call[]
let activity: RoomActivity

const named = (name: string) => calls.filter((call) => call.name === name).map((call) => call.args)

function newRoom() {
  calls = []
  const record =
    (name: string) =>
    (...args: unknown[]) =>
      void calls.push({ name, args })
  activity = {
    entered: record('entered'),
    left: record('left'),
    trackPlayed: record('trackPlayed'),
    likeChanged: record('likeChanged'),
    messageSent: record('messageSent'),
  } as RoomActivity
  room = new Room(
    'test',
    'Test',
    { onTrackChange: () => {}, onReactionsChange: () => {}, onQueueChange: () => {}, onLineupChange: () => {}, onNotice: () => {} },
    { skipProtectedSec: 0, ownSkipMinSec: 0, rules: { maxTrackSec: 300, repeatDelaySec: 3600, maxDjs: 3 }, activity },
  )
}

const enter = (...people: Participant[]) => {
  for (const person of people) room.add(person, ACCOUNT[person.id])
}

function lineUp(person: Participant, name: string, durationSec = 200): QueuedTrack {
  const result = room.addTrack(person.id, { videoId: name.padEnd(11, '_').slice(0, 11), title: name, artist: 'Artist', durationSec })
  assert.ok(result.ok, JSON.stringify(result))
  return result.track
}

/** A like after the pause the room asks between two reactions of one person. */
function like(participantId: string, value: boolean) {
  mock.timers.tick(400)
  return room.like(participantId, value)
}

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START })
  newRoom()
})

afterEach(() => {
  room.close()
  mock.timers.reset()
})

describe('presence', () => {
  it('tells of a member who comes in and goes, never of a visitor', () => {
    enter(ann, vic)
    assert.deepEqual(named('entered'), [['acc-ann', 'p-ann']])
    room.remove('p-vic')
    assert.deepEqual(named('left'), [])
    room.remove('p-ann')
    assert.deepEqual(named('left'), [['acc-ann', 'p-ann']])
  })

  it('tells of the departure of every member when the room is deleted', () => {
    enter(ann, ben, vic)
    room.close()
    assert.deepEqual(named('left').sort(), [['acc-ann', 'p-ann'], ['acc-ben', 'p-ben']])
  })

  it('does not tell twice of a departure', () => {
    enter(ann)
    room.remove('p-ann')
    room.remove('p-ann')
    assert.equal(named('left').length, 1)
  })
})

describe('played tracks', () => {
  it('counts a DJ’s track once it has been heard 10 s, at the moment the room settles it', () => {
    enter(ann, ben)
    lineUp(ann, 'one')
    assert.equal(room.nowPlaying?.title, 'one')
    mock.timers.tick(11 * SECOND)
    assert.deepEqual(named('trackPlayed'), [], 'not yet: the room settles a play when it ends or is cut')
    mock.timers.tick(200 * SECOND)
    assert.deepEqual(named('trackPlayed'), [['acc-ann']])
  })

  it('does not count a track that was cut before 10 s', () => {
    enter(ann, ben)
    lineUp(ann, 'one')
    mock.timers.tick(5 * SECOND)
    room.leaveQueue('p-ann') // on the decks: the track is cut
    assert.deepEqual(named('trackPlayed'), [])
  })

  it('counts a track cut after 10 s', () => {
    enter(ann, ben)
    lineUp(ann, 'one')
    mock.timers.tick(12 * SECOND)
    room.leaveQueue('p-ann')
    assert.deepEqual(named('trackPlayed'), [['acc-ann']])
  })

  it('counts nothing for the room’s own selection', () => {
    enter(ann)
    mock.timers.tick((TEST_TRACKS[0].durationSec + 1) * SECOND)
    assert.equal(room.nowPlaying?.videoId, TEST_TRACKS[1].videoId)
    assert.deepEqual(named('trackPlayed'), [])
  })

  it('counts a track played when the room empties after 10 s, not before', () => {
    enter(ann)
    lineUp(ann, 'one')
    mock.timers.tick(15 * SECOND)
    room.remove('p-ann')
    assert.deepEqual(named('trackPlayed'), [['acc-ann']])
  })
})

describe('likes', () => {
  it('a member’s like on the room’s selection counts as given; taking it back and liking twice do not add', () => {
    enter(ann, ben)
    assert.deepEqual(like('p-ben', true), { ok: true })
    assert.deepEqual(like('p-ben', true), { ok: true })
    assert.deepEqual(named('likeChanged'), [[{ djAccountId: undefined, likerAccountId: 'acc-ben', delta: 1, trackLikes: 1 }]])
    like('p-ben', false)
    like('p-ben', false)
    assert.equal(named('likeChanged').length, 2)
    assert.deepEqual(named('likeChanged')[1], [{ djAccountId: undefined, likerAccountId: 'acc-ben', delta: -1, trackLikes: 0 }])
  })

  it('a like on a DJ’s track goes to that DJ, a visitor’s included, and the best of the track is what it reached', () => {
    enter(ann, ben, vic)
    lineUp(ann, 'one')
    like('p-ben', true)
    like('p-vic', true)
    like('p-ben', false)
    assert.deepEqual(
      named('likeChanged').map(([change]) => change),
      [
        { djAccountId: 'acc-ann', likerAccountId: 'acc-ben', delta: 1, trackLikes: 1 },
        { djAccountId: 'acc-ann', likerAccountId: undefined, delta: 1, trackLikes: 2 },
        { djAccountId: 'acc-ann', likerAccountId: 'acc-ben', delta: -1, trackLikes: 1 },
      ],
    )
  })

  it('a DJ cannot like their own track: nothing is counted', () => {
    enter(ann, ben)
    lineUp(ann, 'one')
    assert.deepEqual(like('p-ann', true), { ok: false, error: 'own-track' })
    assert.deepEqual(named('likeChanged'), [])
  })

  it('a member who leaves and comes back cannot like the same track twice', () => {
    const again: Participant = { ...ann, id: 'p-ann-2' }
    enter(ann, ben)
    lineUp(ben, 'one')
    like('p-ann', true)
    room.remove('p-ann')
    room.add(again, 'acc-ann')
    like('p-ann-2', true)
    assert.equal(named('likeChanged').length, 1, 'the second like is not counted')
    // Taking it back from the new connection takes the one counted back.
    like('p-ann-2', false)
    assert.deepEqual(named('likeChanged')[1], [{ djAccountId: 'acc-ben', likerAccountId: 'acc-ann', delta: -1, trackLikes: 0 }])
  })

  it('starts again at the next track: the same member may like it, and the best is per track', () => {
    enter(ann, ben)
    lineUp(ann, 'one')
    lineUp(ann, 'two')
    like('p-ben', true)
    mock.timers.tick(200 * SECOND) // Ann’s second track
    assert.equal(room.nowPlaying?.title, 'two')
    like('p-ben', true)
    assert.deepEqual(
      named('likeChanged').map(([change]) => (change as { trackLikes: number }).trackLikes),
      [1, 1],
    )
  })

  it('does not change what the room shows: the same likes with and without counting', () => {
    enter(ann, ben, vic)
    like('p-ben', true)
    like('p-vic', true)
    assert.equal(room.reactions().likes, 2)
  })
})

describe('messages', () => {
  it('counts a message of a member, not of a visitor', () => {
    enter(ann, vic)
    room.recordMessage('p-ann')
    room.recordMessage('p-vic')
    room.recordMessage('nobody')
    assert.deepEqual(named('messageSent'), [['acc-ann']])
  })
})
