import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import type { Participant, Reactions, Track } from '../../shared/protocol'
import { TEST_TRACKS } from './catalog'
import { Room, skipVotesRequired } from './Room'

const START = 1_000_000
const alice: Participant = { id: 'a', pseudo: 'Alice', avatarId: 'pulse', member: false }
const bob: Participant = { id: 'b', pseudo: 'Bob', avatarId: 'mango', member: false }
const carol: Participant = { id: 'c', pseudo: 'Carol', avatarId: 'moss', member: false }
const dave: Participant = { id: 'd', pseudo: 'Dave', avatarId: 'cloud', member: false }

interface TrackChange {
  track: Track | null
  reactions: Reactions
}

let room: Room
let trackChanges: TrackChange[]
let updates: Reactions[]

function newRoom(options = {}) {
  trackChanges = []
  updates = []
  room = new Room(
    'test',
    'Test',
    {
      onTrackChange: (track, reactions) => trackChanges.push({ track, reactions }),
      onReactionsChange: (reactions) => updates.push(reactions),
      // Visitors only here: no DJ, nothing to say about the queue (see RoomDj.test.ts).
      onQueueChange: () => {},
      onLineupChange: () => {},
      onNotice: () => {},
    },
    options,
  )
}

function join(...people: Participant[]) {
  for (const person of people) room.add(person)
}

// Fake clock and timers: a track lasts minutes, the test must not.
beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START })
  newRoom()
})

afterEach(() => {
  for (const person of [alice, bob, carol, dave]) room.remove(person.id)
  mock.timers.reset()
})

describe('house tracks of a room', () => {
  it('plays every track of the list once per round, in a shuffled order, never the same one twice in a row', () => {
    const tracks = [1, 2, 3].map((n) => ({ id: `t${n}`, videoId: `v${n}`, title: `T${n}`, artist: 'A', durationSec: 100 }))
    newRoom({ houseTracks: tracks })
    join(alice)
    const played: string[] = [room.nowPlaying!.id]
    for (let i = 0; i < 8; i += 1) {
      mock.timers.tick(100 * 1000)
      played.push(room.nowPlaying!.id)
    }
    for (let round = 0; round < 3; round += 1) {
      assert.deepEqual([...played.slice(round * 3, round * 3 + 3)].sort(), ['t1', 't2', 't3'], 'a round plays each track once')
    }
    played.slice(1).forEach((id, i) => assert.notEqual(id, played[i], 'no repeat in a row'))
  })
})

describe('TEST_TRACKS', () => {
  it('lists distinct YouTube videos with a positive whole duration', () => {
    for (const track of TEST_TRACKS) {
      assert.match(track.videoId, /^[\w-]{11}$/)
      assert.ok(Number.isInteger(track.durationSec) && track.durationSec > 0)
    }
    assert.equal(new Set(TEST_TRACKS.map((track) => track.id)).size, TEST_TRACKS.length)
    assert.equal(new Set(TEST_TRACKS.map((track) => track.videoId)).size, TEST_TRACKS.length)
  })
})

describe('Room playback', () => {
  it('plays nothing until someone arrives', () => {
    assert.equal(room.nowPlaying, null)
    assert.deepEqual(trackChanges, [])
  })

  it('starts the first track when the first participant arrives', () => {
    join(alice)
    assert.deepEqual(room.nowPlaying, { ...TEST_TRACKS[0], startedAt: START })
    assert.deepEqual(
      trackChanges.map((change) => change.track),
      [room.nowPlaying],
    )
  })

  it('does not restart the track for later arrivals', () => {
    join(alice)
    mock.timers.tick(10_000)
    join(bob)
    assert.equal(trackChanges.length, 1)
    assert.equal(room.nowPlaying?.startedAt, START)
  })

  it('moves on to the next track once the duration is over, stamping the new start', () => {
    join(alice)
    const duration = TEST_TRACKS[0].durationSec * 1000
    mock.timers.tick(duration - 1)
    assert.equal(trackChanges.length, 1)
    mock.timers.tick(1)
    assert.equal(trackChanges.length, 2)
    assert.equal(room.nowPlaying?.videoId, TEST_TRACKS[1].videoId)
    assert.equal(room.nowPlaying?.startedAt, START + duration)
  })

  it('starts over after the last track', () => {
    join(alice)
    for (const track of TEST_TRACKS) mock.timers.tick(track.durationSec * 1000)
    assert.equal(trackChanges.length, TEST_TRACKS.length + 1)
    assert.equal(room.nowPlaying?.videoId, TEST_TRACKS[0].videoId)
  })

  it('stops when the room empties and picks up with the next track on return', () => {
    join(alice)
    room.remove(alice.id)
    assert.equal(room.nowPlaying, null)

    mock.timers.tick(60 * 60 * 1000)
    assert.equal(trackChanges.length, 1)

    join(bob)
    assert.equal(trackChanges.length, 2)
    assert.equal(trackChanges.at(-1)?.track?.videoId, TEST_TRACKS[1].videoId)
  })
})

describe('skipVotesRequired', () => {
  it('is strictly more than half of the voters', () => {
    const expected: Array<[voters: number, required: number]> = [
      [0, 1],
      [1, 1],
      [2, 2],
      [3, 2],
      [4, 3],
      [5, 3],
      [14, 8], // the room of the mock-up: 14 people online, "3/8"
    ]
    for (const [voters, required] of expected) assert.equal(skipVotesRequired(voters), required, `${voters} voters`)
  })
})

describe('Room likes', () => {
  it('counts one like per participant and lets them take it back', () => {
    join(alice)
    assert.deepEqual(room.like(alice.id, true, START), { ok: true })
    assert.deepEqual(room.like(alice.id, true, START + 400), { ok: true })
    assert.equal(room.reactions().likes, 1)
    assert.deepEqual(room.mine(alice.id), { liked: true, votedSkip: false })

    room.like(alice.id, false, START + 800)
    assert.equal(room.reactions().likes, 0)
    assert.deepEqual(room.mine(alice.id), { liked: false, votedSkip: false })
  })

  it('refuses someone who is not in the room', () => {
    assert.deepEqual(room.like('ghost', true), { ok: false, error: 'not-in-room' })
    assert.deepEqual(room.voteSkip('ghost', true), { ok: false, error: 'not-in-room' })
  })

  it('keeps the likes of people who left: they are about the track, not the audience', () => {
    join(alice, bob)
    room.like(alice.id, true)
    room.remove(alice.id)
    assert.equal(room.reactions().likes, 1)
  })

  it('starts every track with no likes and no votes', () => {
    join(alice, bob)
    room.like(alice.id, true)
    mock.timers.tick(TEST_TRACKS[0].durationSec * 1000)

    assert.deepEqual(room.reactions(), { likes: 0, skipVotes: 0, skipRequired: 2 })
    assert.deepEqual(room.mine(alice.id), { liked: false, votedSkip: false })
    assert.deepEqual(trackChanges.at(-1)?.reactions, { likes: 0, skipVotes: 0, skipRequired: 2 })
  })
})

describe('Room rate limit and updates', () => {
  it('limits how fast one participant can react, likes and votes sharing the same turn', () => {
    join(alice, bob)
    assert.deepEqual(room.like(alice.id, true, START), { ok: true })
    assert.deepEqual(room.like(alice.id, false, START + 100), { ok: false, error: 'rate-limited', retryAfterMs: 200 })
    assert.deepEqual(room.voteSkip(alice.id, false, START + 100), {
      ok: false,
      error: 'rate-limited',
      retryAfterMs: 200,
    })
    assert.deepEqual(room.like(bob.id, true, START + 100), { ok: true }) // someone else is not slowed down
    assert.deepEqual(room.like(alice.id, false, START + 300), { ok: true })
  })

  it('sends a burst of reactions to the room as one update', () => {
    join(alice, bob, carol)
    room.like(alice.id, true)
    room.like(bob.id, true)
    room.like(carol.id, true)
    assert.deepEqual(updates, [])

    mock.timers.tick(249)
    assert.equal(updates.length, 0)
    mock.timers.tick(1)
    assert.deepEqual(updates, [{ likes: 3, skipVotes: 0, skipRequired: 2 }])

    mock.timers.tick(5000)
    assert.equal(updates.length, 1)
  })

  it('tells the room when people arriving or leaving change the votes needed', () => {
    join(alice, bob, carol)
    mock.timers.tick(250)
    assert.equal(updates.at(-1)?.skipRequired, 2)

    join(dave)
    mock.timers.tick(250)
    assert.equal(updates.at(-1)?.skipRequired, 3)

    room.remove(dave.id)
    mock.timers.tick(250)
    assert.equal(updates.at(-1)?.skipRequired, 2)
  })

  it('drops a pending update when a new track starts', () => {
    join(alice, bob, carol)
    mock.timers.tick(30_000)
    const before = updates.length

    room.like(alice.id, true)
    room.voteSkip(bob.id, true)
    room.voteSkip(carol.id, true) // 2 of 3: the track changes before the update was sent
    assert.equal(trackChanges.length, 2)

    mock.timers.tick(1000)
    assert.equal(updates.length, before)
  })
})

describe('Room skip votes', () => {
  it('refuses votes during the first 30 seconds and says when they open', () => {
    join(alice, bob)
    assert.deepEqual(room.voteSkip(alice.id, true, START + 29_999), { ok: false, error: 'too-early', retryAfterMs: 1 })
    // The refusal did not use up Alice's turn: she can vote the moment the protection ends.
    assert.deepEqual(room.voteSkip(alice.id, true, START + 30_000), { ok: true })
    assert.equal(room.reactions().skipVotes, 1)
  })

  it('lets someone take a vote back at any time', () => {
    join(alice, bob)
    assert.deepEqual(room.voteSkip(alice.id, false, START + 1000), { ok: true })
  })

  it('can shorten the protection for a room', () => {
    newRoom({ skipProtectedSec: 5 })
    join(alice, bob)
    assert.equal(room.voteSkip(alice.id, true, START + 4999).ok, false)
    assert.equal(room.voteSkip(alice.id, true, START + 5000).ok, true)
  })

  it('skips the track once more than half of the room voted', () => {
    join(alice, bob, carol) // 2 votes needed
    mock.timers.tick(30_000)

    room.voteSkip(alice.id, true)
    assert.equal(trackChanges.length, 1)
    assert.deepEqual(room.reactions(), { likes: 0, skipVotes: 1, skipRequired: 2 })

    room.voteSkip(bob.id, true)
    assert.equal(trackChanges.length, 2)
    assert.equal(room.nowPlaying?.videoId, TEST_TRACKS[1].videoId)
    assert.deepEqual(trackChanges[1].reactions, { likes: 0, skipVotes: 0, skipRequired: 2 })
  })

  it('does not count exactly half as a majority', () => {
    join(alice, bob, carol, dave) // 3 votes needed
    mock.timers.tick(30_000)

    room.voteSkip(alice.id, true)
    room.voteSkip(bob.id, true)
    assert.equal(trackChanges.length, 1)

    room.voteSkip(carol.id, true)
    assert.equal(trackChanges.length, 2)
  })

  it('lets a lone listener skip', () => {
    join(alice)
    mock.timers.tick(30_000)
    room.voteSkip(alice.id, true)
    assert.equal(trackChanges.length, 2)
  })

  it('protects the next track too, and the old timer no longer ends it', () => {
    join(alice)
    mock.timers.tick(30_000)
    room.voteSkip(alice.id, true) // the second track starts now
    const secondStart = room.nowPlaying?.startedAt ?? 0

    mock.timers.tick(10_000)
    assert.equal(room.voteSkip(alice.id, true).ok, false)

    // The first track's timer was replaced: the second one lasts its own full duration.
    mock.timers.tick(TEST_TRACKS[1].durationSec * 1000 - 10_000 - 1)
    assert.equal(trackChanges.length, 2)
    mock.timers.tick(1)
    assert.equal(trackChanges.length, 3)
    assert.equal(room.nowPlaying?.startedAt, secondStart + TEST_TRACKS[1].durationSec * 1000)
  })

  it('takes a vote away with the person who cast it', () => {
    join(alice, bob, carol) // 2 votes needed
    mock.timers.tick(30_000)
    room.voteSkip(alice.id, true)

    room.remove(alice.id)
    assert.deepEqual(room.reactions(), { likes: 0, skipVotes: 0, skipRequired: 2 })
    assert.equal(trackChanges.length, 1)
  })

  it('skips when people who did not vote leave and the votes become a majority', () => {
    join(alice, bob, carol, dave) // 3 votes needed
    mock.timers.tick(30_000)
    room.voteSkip(alice.id, true)
    room.voteSkip(bob.id, true) // 2 of 4

    room.remove(carol.id) // 2 of 3: that is a majority
    assert.equal(trackChanges.length, 2)
  })

  it('asks for more votes when people arrive', () => {
    join(alice, bob, carol)
    assert.equal(room.reactions().skipRequired, 2)
    join(dave)
    assert.equal(room.reactions().skipRequired, 3)
  })
})
