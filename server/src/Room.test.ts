import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import type { Participant, Track } from '../../shared/protocol'
import { TEST_TRACKS } from './catalog'
import { Room } from './Room'

const START = 1_000_000
const alice: Participant = { id: 'a', pseudo: 'Alice', avatarId: 'pulse' }
const bob: Participant = { id: 'b', pseudo: 'Bob', avatarId: 'mango' }

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
  let changes: Array<Track | null>
  let room: Room

  beforeEach(() => {
    // Fake clock and timers: a track lasts minutes, the test must not.
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START })
    changes = []
    room = new Room('test', 'Test', (track) => changes.push(track))
  })

  afterEach(() => {
    room.remove(alice.id)
    room.remove(bob.id)
    mock.timers.reset()
  })

  it('plays nothing until someone arrives', () => {
    assert.equal(room.nowPlaying, null)
    assert.deepEqual(changes, [])
  })

  it('starts the first track when the first participant arrives', () => {
    room.add(alice)
    assert.deepEqual(room.nowPlaying, { ...TEST_TRACKS[0], startedAt: START })
    assert.deepEqual(changes, [room.nowPlaying])
  })

  it('does not restart the track for later arrivals', () => {
    room.add(alice)
    mock.timers.tick(10_000)
    room.add(bob)
    assert.equal(changes.length, 1)
    assert.equal(room.nowPlaying?.startedAt, START)
  })

  it('moves on to the next track once the duration is over, stamping the new start', () => {
    room.add(alice)
    const duration = TEST_TRACKS[0].durationSec * 1000
    mock.timers.tick(duration - 1)
    assert.equal(changes.length, 1)
    mock.timers.tick(1)
    assert.equal(changes.length, 2)
    assert.equal(room.nowPlaying?.videoId, TEST_TRACKS[1].videoId)
    assert.equal(room.nowPlaying?.startedAt, START + duration)
  })

  it('starts over after the last track', () => {
    room.add(alice)
    for (const track of TEST_TRACKS) mock.timers.tick(track.durationSec * 1000)
    assert.equal(changes.length, TEST_TRACKS.length + 1)
    assert.equal(room.nowPlaying?.videoId, TEST_TRACKS[0].videoId)
  })

  it('stops when the room empties and picks up with the next track on return', () => {
    room.add(alice)
    room.remove(alice.id)
    assert.equal(room.nowPlaying, null)

    mock.timers.tick(60 * 60 * 1000)
    assert.equal(changes.length, 1)

    room.add(bob)
    assert.equal(changes.length, 2)
    assert.equal(changes.at(-1)?.videoId, TEST_TRACKS[1].videoId)
  })
})
