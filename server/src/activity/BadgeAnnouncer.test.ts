import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BadgeEarned, ProfileData } from '../../../shared/protocol'
import { emptyActivity } from './activity'
import { BadgeAnnouncer } from './BadgeAnnouncer'
import { MemoryActivityStore } from './MemoryActivityStore'
import { assembleProfile } from './profile'

const SINCE = new Date('2026-09-01T10:00:00Z')

/** A member whose counters a test edits, connected through `connections` sockets. */
function setup(connections = 1) {
  const store = new MemoryActivityStore()
  const counters = emptyActivity()
  const sent: BadgeEarned[][] = []
  let broken = false
  const announcer = new BadgeAnnouncer(
    store,
    {
      profileOf: async (): Promise<ProfileData | null> => {
        if (broken) throw new Error('base coupée')
        return assembleProfile(counters, { memberSince: SINCE, roomsHosted: 0, playlistTracks: 0, roomName: () => undefined })
      },
      send: (_account, badges) => {
        if (connections > 0) sent.push(badges)
        return connections
      },
    },
    { now: () => new Date('2026-09-02T10:00:00Z').getTime(), settleMs: 5, minGapMs: 5 },
  )
  return { store, counters, sent, announcer, setConnections: (n: number) => (connections = n), breakIt: () => (broken = true) }
}

describe('BadgeAnnouncer', () => {
  it('announces a badge once, with its level, and not again', async () => {
    const { counters, announcer, sent } = setup()
    assert.deepEqual(await announcer.check('ann'), [], 'nothing earned yet')
    counters.tracksPlayed = 1
    const first = await announcer.check('ann')
    assert.deepEqual(first.map((b) => b.id), ['premier-son'])
    assert.equal(first[0].level, 1)
    assert.deepEqual(await announcer.check('ann'), [], 'already announced')
    assert.equal(sent.length, 1)
  })

  it('announces a new level of a tiered badge, and says which one', async () => {
    const { counters, announcer } = setup()
    counters.likesGiven = 10
    const first = await announcer.check('ann')
    assert.deepEqual(first.map((b) => [b.id, b.level, b.levels, b.tierLabel]), [['bon-public', 1, 3, '10']])
    counters.likesGiven = 49
    assert.deepEqual(await announcer.check('ann'), [])
    counters.likesGiven = 50
    const second = await announcer.check('ann')
    assert.deepEqual(second.map((b) => [b.id, b.level, b.tierLabel]), [['bon-public', 2, '50']])
  })

  it('tells everything earned before in one go, and a secret badge only once earned', async () => {
    const { counters, announcer, sent } = setup()
    counters.tracksPlayed = 5
    counters.messagesSent = 3
    const all = await announcer.check('ann')
    assert.deepEqual(all.map((b) => b.id).sort(), ['bienvenue', 'dj-experimente', 'premier-son'])
    assert.equal(sent.length, 1, 'one message for all of them')
    assert.ok(!all.some((b) => b.id === 'oiseau-de-nuit'), 'the secret badge is not earned')
    counters.nightOwl = true
    assert.deepEqual((await announcer.check('ann')).map((b) => b.id), ['oiseau-de-nuit'])
  })

  it('keeps a badge for later when the member is not connected', async () => {
    const { counters, announcer, setConnections, sent } = setup(0)
    counters.tracksPlayed = 1
    assert.deepEqual(await announcer.check('ann'), [])
    assert.equal(sent.length, 0)
    setConnections(2)
    assert.deepEqual((await announcer.check('ann')).map((b) => b.id), ['premier-son'])
  })

  it('never throws when the profile cannot be read, and announces nothing', async () => {
    const { counters, announcer, breakIt, sent } = setup()
    counters.tracksPlayed = 1
    breakIt()
    const quiet = console.error
    console.error = () => undefined
    try {
      assert.deepEqual(await announcer.check('ann'), [])
    } finally {
      console.error = quiet
    }
    assert.equal(sent.length, 0)
  })

  it('looks at a member shortly after something counted for them, once for a burst', async () => {
    const { counters, announcer, sent } = setup()
    counters.tracksPlayed = 1
    announcer.touch('ann')
    announcer.touch('ann')
    announcer.touch('ann')
    await new Promise((resolve) => setTimeout(resolve, 60))
    assert.equal(sent.length, 1)
    announcer.stop()
  })

  it('forget and stop cancel what is waiting', async () => {
    const { counters, announcer, sent } = setup()
    counters.tracksPlayed = 1
    announcer.touch('ann')
    announcer.forget('ann')
    announcer.touch('ben')
    announcer.stop()
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.equal(sent.length, 0)
  })
})
