import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BADGES, FOUNDER_FROM, FOUNDER_UNTIL, computeBadges, topBadges, type BadgeId } from '../../shared/badges'
import type { ProfileStats } from '../../shared/protocol'

const NOW = new Date('2026-10-27T12:00:00Z')
const stats = (over: Partial<ProfileStats> = {}): ProfileStats => ({
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
  roomsHosted: 0,
  membersInBestRoom: 0,
  playlistTracks: 0,
  nightOwl: false,
  memberSince: NOW.toISOString(),
  ...over,
})
const badge = (over: Partial<ProfileStats>, id: BadgeId, now = NOW) => computeBadges(stats(over), now).find((b) => b.id === id)!

describe('badges', () => {
  it('a brand new member has no level anywhere, and the night owl stays a secret', () => {
    const all = computeBadges(stats({ memberSince: '2028-01-01T00:00:00Z' }), NOW)
    assert.equal(all.length, BADGES.length)
    assert.deepEqual(all.filter((b) => b.level > 0).map((b) => b.id), [], 'nothing earned (not even Fondateur, after the window)')
    assert.deepEqual(all.filter((b) => b.secret).map((b) => b.id), ['oiseau-de-nuit'])
    assert.deepEqual(topBadges(all, 3), [])
  })

  it('tiered badges: 9 likes is level 0, 10 level 1, 50 level 2, 100 level 3, with the next threshold', () => {
    const levels = [9, 10, 49, 50, 99, 100, 5000].map((likesReceived) => badge({ likesReceived }, 'crowd-pleaser'))
    assert.deepEqual(levels.map((b) => b.level), [0, 1, 1, 2, 2, 3, 3])
    assert.deepEqual(levels.map((b) => b.next), [10, 50, 50, 100, 100, null, null])
    assert.equal(levels[2].value, 49)
  })

  it('DJ expérimenté and Bon public follow their own counters', () => {
    assert.deepEqual([4, 5, 20, 100].map((tracksPlayed) => badge({ tracksPlayed }, 'dj-experimente').level), [0, 1, 2, 3])
    assert.deepEqual([9, 10, 100].map((likesGiven) => badge({ likesGiven }, 'bon-public').level), [0, 1, 3])
  })

  it('Premier son and Bienvenue come with the first track and the first message', () => {
    assert.equal(badge({ tracksPlayed: 0 }, 'premier-son').level, 0)
    assert.equal(badge({ tracksPlayed: 1 }, 'premier-son').level, 1)
    assert.equal(badge({ messagesSent: 1 }, 'bienvenue').level, 1)
  })

  it('Vétéran counts whole months: 1, 6 and 12', () => {
    const since = (iso: string) => ({ memberSince: iso })
    assert.equal(badge(since('2026-10-01T00:00:00Z'), 'veteran').level, 0)
    assert.equal(badge(since('2026-09-27T12:00:00Z'), 'veteran').level, 1, 'exactly one month')
    assert.equal(badge(since('2026-09-28T12:00:00Z'), 'veteran').level, 0, 'a day short of a month')
    assert.equal(badge(since('2026-04-27T12:00:00Z'), 'veteran').level, 2)
    assert.equal(badge(since('2025-10-27T12:00:00Z'), 'veteran').level, 3)
    assert.equal(badge(since('2025-10-27T12:00:00Z'), 'veteran').next, null)
  })

  it('Fondateur goes to accounts made in the one-year window only, and is rare', () => {
    const level = (memberSince: string) => badge({ memberSince }, 'fondateur').level
    assert.equal(level('2026-11-02T23:59:59Z'), 0, 'a second before the window')
    assert.equal(level(FOUNDER_FROM), 1, 'the window opens')
    assert.equal(level('2027-06-15T10:00:00Z'), 1)
    assert.equal(level('2027-11-02T23:59:59Z'), 1, 'the last second')
    assert.equal(level(FOUNDER_UNTIL), 0, 'the window is closed')
    assert.equal(badge({ memberSince: FOUNDER_FROM }, 'fondateur').kind, 'rare')
  })

  it('Oiseau de nuit is hidden until earned, then shows with its name', () => {
    const locked = badge({}, 'oiseau-de-nuit')
    const earned = badge({ nightOwl: true }, 'oiseau-de-nuit')
    assert.deepEqual([locked.secret, locked.level], [true, 0])
    assert.deepEqual([earned.secret, earned.level, earned.kind], [false, 1, 'hidden'])
  })

  it('the one-shot badges flip at their threshold', () => {
    assert.deepEqual([9, 10].map((bestTrackLikes) => badge({ bestTrackLikes }, 'denicheur').level), [0, 1])
    assert.deepEqual([4, 5].map((stylesPlayed) => badge({ stylesPlayed }, 'melomane').level), [0, 1])
    assert.deepEqual([4, 5].map((stylesVisited) => badge({ stylesVisited }, 'explorateur').level), [0, 1])
    assert.deepEqual([6, 7].map((daysActive) => badge({ daysActive }, 'habitue').level), [0, 1])
    assert.deepEqual([49, 50].map((playlistTracks) => badge({ playlistTracks }, 'curateur').level), [0, 1])
    assert.deepEqual([9, 10].map((membersInBestRoom) => badge({ membersInBestRoom }, 'chef-de-salon').level), [0, 1])
  })

  it('Hôte comes with a room, or with members who came into one that is gone', () => {
    assert.equal(badge({}, 'hote').level, 0)
    assert.equal(badge({ roomsHosted: 1 }, 'hote').level, 1)
    assert.equal(badge({ membersInBestRoom: 2 }, 'hote').level, 1)
  })

  it('is pure: the same numbers and date give the same badges, and a negative number counts as zero', () => {
    const s = stats({ likesReceived: 60, tracksPlayed: -5 })
    assert.deepEqual(computeBadges(s, NOW), computeBadges(s, NOW))
    assert.equal(badge({ tracksPlayed: -5 }, 'dj-experimente').level, 0)
  })

  it('topBadges ranks hidden and rare first, then a top level, then one-shot badges', () => {
    const top = topBadges(computeBadges(stats({ nightOwl: true, memberSince: '2026-11-10T00:00:00Z', likesReceived: 100, tracksPlayed: 5 }), NOW), 3)
    assert.deepEqual(top.map((b) => b.id), ['oiseau-de-nuit', 'fondateur', 'crowd-pleaser'])
  })
})
