import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyActivity } from './activity'
import { assembleProfile } from './profile'

const SINCE = new Date('2026-09-01T10:00:00Z')
const open: Record<string, string> = { a: 'Room A', b: 'Room B', c: 'Room C' }
const sources = { memberSince: SINCE, roomsHosted: 1, playlistTracks: 7, roomName: (id: string) => open[id] }

describe('assembleProfile', () => {
  it('reads an empty member as zeros and keeps what lives in other tables', () => {
    const { stats, topStyles, topRooms } = assembleProfile(emptyActivity(), sources)
    assert.deepEqual(stats, {
      tracksPlayed: 0,
      likesReceived: 0,
      likesGiven: 0,
      listenSeconds: 0,
      roomsVisited: 0,
      stylesVisited: 0,
      stylesPlayed: 0,
      bestTrackLikes: 0,
      daysActive: 0,
      messagesSent: 0,
      roomsHosted: 1,
      membersInBestRoom: 0,
      playlistTracks: 7,
      nightOwl: false,
      memberSince: SINCE.toISOString(),
    })
    assert.deepEqual([topStyles, topRooms], [[], []])
  })

  it('counts distinct rooms, days and styles visited or played', () => {
    const a = emptyActivity()
    a.rooms.set('a', { visits: 5, seconds: 10 })
    a.rooms.set('b', { visits: 1, seconds: 0 })
    a.days.add('2026-10-01').add('2026-10-02')
    a.styles.set('rock', { visited: true, played: true, seconds: 5 })
    a.styles.set('jazz', { visited: true, played: false, seconds: 0 })
    a.styles.set('pop', { visited: false, played: true, seconds: 0 })
    a.bestRoomMembers = 4
    const { stats } = assembleProfile(a, sources)
    assert.equal(stats.roomsVisited, 2)
    assert.equal(stats.daysActive, 2)
    assert.equal(stats.stylesVisited, 2)
    assert.equal(stats.stylesPlayed, 2)
    assert.equal(stats.membersInBestRoom, 4)
  })

  it('ranks the top 3 styles and the top 2 open rooms by time, longest first', () => {
    const a = emptyActivity()
    for (const [style, seconds] of [['rock', 50], ['jazz', 300], ['pop', 100], ['afro', 20], ['lofi', 0]] as const) {
      a.styles.set(style, { visited: true, played: false, seconds })
    }
    a.rooms.set('a', { visits: 1, seconds: 100 })
    a.rooms.set('gone', { visits: 1, seconds: 900 }) // deleted since: not shown, the next one takes its place
    a.rooms.set('b', { visits: 1, seconds: 500 })
    a.rooms.set('c', { visits: 1, seconds: 40 })
    const { topStyles, topRooms } = assembleProfile(a, sources)
    assert.deepEqual(topStyles, ['jazz', 'pop', 'rock'])
    assert.deepEqual(topRooms, [{ id: 'b', name: 'Room B' }, { id: 'a', name: 'Room A' }])
  })

  it('ignores a style the site does not know', () => {
    const a = emptyActivity()
    a.styles.set('polka', { visited: true, played: true, seconds: 99 })
    const { stats, topStyles } = assembleProfile(a, sources)
    assert.equal(stats.stylesVisited, 0)
    assert.deepEqual(topStyles, [])
  })
})
