// A room that its host deletes: nothing of it is left running, nobody can come in, and what changes (name, rules) is felt.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import type { Participant, RoomRules } from '../../shared/protocol'
import { Room } from './Room'

const ann: Participant = { id: 'p-ann', pseudo: 'Ann', avatarId: 'pulse', member: true }
const ben: Participant = { id: 'p-ben', pseudo: 'Ben', avatarId: 'mango', member: false }

let room: Room
let heard: string[]

function newRoom(rules?: RoomRules) {
  heard = []
  room = new Room(
    'test-room',
    'Test room',
    {
      onTrackChange: () => heard.push('track'),
      onReactionsChange: () => heard.push('reactions'),
      onQueueChange: () => heard.push('queue'),
      onLineupChange: () => heard.push('lineup'),
      onNotice: () => heard.push('notice'),
    },
    { skipProtectedSec: 0, ownSkipMinSec: 0, rules },
  )
}

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 })
  newRoom()
})
afterEach(() => {
  room.close()
  mock.timers.reset()
})

describe('closing a room', () => {
  it('stops the music and every pending message: nothing is heard from it afterwards', () => {
    room.add(ann, 'acc-ann')
    room.add(ben)
    room.like(ben.id, true) // a batch of reactions is waiting to go out
    heard = []
    room.close()
    mock.timers.tick(3 * 60 * 60 * 1000)
    assert.deepEqual(heard, [], 'no new track, no late update')
    assert.equal(room.nowPlaying, null)
    assert.equal(room.size, 0)
    assert.equal(room.isClosed, true)
  })

  it('cannot be joined any more: a join that was still on its way does not bring it back', () => {
    room.close()
    assert.throws(() => room.add(ann, 'acc-ann'), /closed/)
    assert.equal(room.size, 0)
    mock.timers.tick(60 * 60 * 1000)
    assert.deepEqual(heard, [])
  })

  it('forgets the chat and the queue, and refuses what is asked of it afterwards', () => {
    room.add(ann, 'acc-ann')
    room.chat.post(ann, 'hello')
    room.close()
    assert.deepEqual(room.chat.recent(), [])
    assert.equal(room.like(ann.id, true).ok, false)
    assert.deepEqual(room.memberError(ann.id), { ok: false, error: 'not-in-room' })
  })

  it('may be closed twice, and removing somebody from a closed room is harmless', () => {
    room.add(ann, 'acc-ann')
    room.close()
    room.close()
    assert.equal(room.remove(ann.id), false)
  })
})

describe('changing the rules of a live room', () => {
  it('counts from the next check: the room reads the rules it has now', () => {
    newRoom({ maxTrackSec: null, repeatDelaySec: null, maxDjs: 10 })
    room.add(ann, 'acc-ann')
    assert.equal(room.addTrack(ann.id, { videoId: 'aaaaaaaaaa1', title: 'Long', artist: 'A', durationSec: 400 }).ok, true)
    room.setRules({ maxTrackSec: 300, repeatDelaySec: null, maxDjs: 10 })
    assert.deepEqual(room.addTrack(ann.id, { videoId: 'bbbbbbbbbb1', title: 'Long too', artist: 'A', durationSec: 400 }), { ok: false, error: 'too-long', maxSec: 300 })
  })

  it('does not put anybody out of a queue that is now longer than the limit, but takes nobody new', () => {
    newRoom({ maxTrackSec: null, repeatDelaySec: null, maxDjs: 10 })
    room.add(ann, 'acc-ann')
    room.add({ ...ben, member: true, id: 'p-ben2' }, 'acc-ben')
    assert.equal(room.addTrack(ann.id, { videoId: 'aaaaaaaaaa1', title: 'One', artist: 'A', durationSec: 200 }).ok, true)
    assert.equal(room.addTrack('p-ben2', { videoId: 'bbbbbbbbbb1', title: 'Two', artist: 'A', durationSec: 200 }).ok, true)
    room.setRules({ maxTrackSec: null, repeatDelaySec: null, maxDjs: 5 })
    assert.equal(room.djCount, 2)
    room.setRules({ maxTrackSec: null, repeatDelaySec: null, maxDjs: 1 })
    room.add({ ...ben, member: true, id: 'p-cat', pseudo: 'Cat' }, 'acc-cat')
    assert.deepEqual(room.addTrack('p-cat', { videoId: 'cccccccccc1', title: 'Three', artist: 'A', durationSec: 200 }), { ok: false, error: 'queue-full' })
    assert.equal(room.djCount, 2, 'the two who were there stay')
  })

  it('lets the room be renamed', () => {
    room.name = 'New name'
    assert.equal(room.name, 'New name')
  })
})
