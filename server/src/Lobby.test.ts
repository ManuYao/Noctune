import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import type { RoomSummary } from '../../shared/protocol'
import { ROOM_DEFS, TEST_TRACKS } from './catalog'
import { Lobby, LOBBY_BROADCAST_MS, summarize } from './Lobby'
import { Room } from './Room'

describe('what the list shows about a room', () => {
  const def = ROOM_DEFS[0]
  let room: Room

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 })
    room = new Room(def.id, def.name, { onTrackChange: () => {}, onReactionsChange: () => {} })
  })

  afterEach(() => {
    room.remove('a')
    room.remove('b')
    mock.timers.reset()
  })

  it('shows an empty room with nothing playing', () => {
    assert.deepEqual(summarize(def, room), {
      id: def.id,
      name: def.name,
      genre: def.genre,
      online: 0,
      nowPlaying: null,
    })
  })

  it('counts the people and shows the track that plays, without its video or timing', () => {
    room.add({ id: 'a', pseudo: 'Alice', avatarId: 'pulse', member: false })
    room.add({ id: 'b', pseudo: 'Bob', avatarId: 'mango', member: false })
    const first = TEST_TRACKS[0]
    assert.deepEqual(summarize(def, room), {
      id: def.id,
      name: def.name,
      genre: def.genre,
      online: 2,
      nowPlaying: { title: first.title, artist: first.artist },
    })
  })

  it('goes back to nothing playing when the room empties', () => {
    room.add({ id: 'a', pseudo: 'Alice', avatarId: 'pulse', member: false })
    room.remove('a')
    const summary = summarize(def, room)
    assert.equal(summary.online, 0)
    assert.equal(summary.nowPlaying, null)
  })
})

describe('announcing changes to the list', () => {
  let online: number
  let sent: RoomSummary[][]
  let lobby: Lobby

  const list = (): RoomSummary[] => [{ id: 'r', name: 'R', genre: 'G', online, nowPlaying: null }]

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout'] })
    online = 0
    sent = []
    lobby = new Lobby(list, (rooms) => sent.push(rooms))
  })

  afterEach(() => mock.timers.reset())

  it('says nothing while nothing changes', () => {
    mock.timers.tick(LOBBY_BROADCAST_MS * 10)
    assert.equal(sent.length, 0)
  })

  it('sends one list for a burst of changes, with the state at the moment it is sent', () => {
    for (let people = 1; people <= 20; people += 1) {
      online = people
      lobby.changed()
    }
    assert.equal(sent.length, 0, 'not at once')
    mock.timers.tick(LOBBY_BROADCAST_MS - 1)
    assert.equal(sent.length, 0, 'not before the delay')
    mock.timers.tick(1)
    assert.equal(sent.length, 1)
    assert.equal(sent[0][0].online, 20)
  })

  it('sends again for a change that comes after', () => {
    online = 1
    lobby.changed()
    mock.timers.tick(LOBBY_BROADCAST_MS)
    online = 2
    lobby.changed()
    mock.timers.tick(LOBBY_BROADCAST_MS)
    assert.deepEqual(
      sent.map((rooms) => rooms[0].online),
      [1, 2],
    )
  })

  it('gives the current list on demand, without waiting', () => {
    online = 7
    assert.equal(lobby.snapshot()[0].online, 7)
    assert.equal(sent.length, 0)
  })
})
