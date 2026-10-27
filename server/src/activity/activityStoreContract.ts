// What every ActivityStore must do, whatever it keeps its data in. MemoryActivityStore.test.ts runs it on the memory
// version, pg.test.ts on the real database: the two cannot drift apart without a test noticing.
import assert from 'node:assert/strict'
import { describe, it, type TestContext } from 'node:test'
import { emptyActivity, type Activity } from './activity'
import type { ActivityStore } from './ActivityStore'

export interface ActivityStoreUnderTest {
  store: ActivityStore
  /** Back to an empty store. */
  reset: () => Promise<void>
  /** A new account (the real database wants the member to exist), its id. */
  newAccount: () => Promise<string>
}

/** A delta from the fields a test cares about. */
function delta(fields: Partial<Omit<Activity, 'days' | 'styles' | 'rooms'>> & { days?: string[]; styles?: Record<string, { visited?: boolean; played?: boolean; seconds?: number }>; rooms?: Record<string, { visits?: number; seconds?: number }> } = {}): Activity {
  const { days, styles, rooms, ...counters } = fields
  const activity = { ...emptyActivity(), ...counters }
  for (const day of days ?? []) activity.days.add(day)
  for (const [style, v] of Object.entries(styles ?? {})) activity.styles.set(style, { visited: v.visited ?? false, played: v.played ?? false, seconds: v.seconds ?? 0 })
  for (const [room, v] of Object.entries(rooms ?? {})) activity.rooms.set(room, { visits: v.visits ?? 0, seconds: v.seconds ?? 0 })
  return activity
}

export function describeActivityStoreContract(name: string, open: () => Promise<ActivityStoreUnderTest | null>) {
  describe(name, () => {
    /** Runs a test on an empty store with two members, or skips it when there is no store (no database on this machine). */
    function test(title: string, body: (store: ActivityStore, ann: string, ben: string, newAccount: () => Promise<string>) => Promise<void>) {
      it(title, async (t: TestContext) => {
        const under = await open()
        if (!under) return t.skip('pas de base de test : npm run db:setup')
        await under.reset()
        await body(under.store, await under.newAccount(), await under.newAccount(), under.newAccount)
      })
    }

    test('an account with nothing counted reads as empty', async (store, ann) => {
      assert.deepEqual(await store.read(ann), emptyActivity())
    })

    test('additions add up, and the high-water marks keep the larger value', async (store, ann) => {
      await store.add(ann, delta({ tracksPlayed: 1, likesReceived: 3, likesGiven: 2, messagesSent: 4, listenSeconds: 100, bestTrackLikes: 3, bestRoomMembers: 2 }))
      await store.add(ann, delta({ tracksPlayed: 2, likesReceived: 1, likesGiven: 1, messagesSent: 1, listenSeconds: 20, bestTrackLikes: 1, bestRoomMembers: 5 }))
      const read = await store.read(ann)
      assert.equal(read.tracksPlayed, 3)
      assert.equal(read.likesReceived, 4)
      assert.equal(read.likesGiven, 3)
      assert.equal(read.messagesSent, 5)
      assert.equal(read.listenSeconds, 120)
      assert.equal(read.bestTrackLikes, 3, 'a smaller value does not lower the mark')
      assert.equal(read.bestRoomMembers, 5, 'a larger value raises it')
      assert.equal(read.nightOwl, false)
    })

    test('a counter never goes under zero', async (store, ann, ben) => {
      await store.add(ann, delta({ likesReceived: 1, likesGiven: 1 }))
      await store.add(ann, delta({ likesReceived: -3, likesGiven: -1 }))
      const read = await store.read(ann)
      assert.equal(read.likesReceived, 0)
      assert.equal(read.likesGiven, 0)
      // A first write that is negative is zero, not an error.
      await store.add(ben, delta({ likesReceived: -2 }))
      assert.equal((await store.read(ben)).likesReceived, 0)
    })

    test('night owl stays once earned', async (store, ann) => {
      await store.add(ann, delta({ nightOwl: true }))
      await store.add(ann, delta({ nightOwl: false, tracksPlayed: 1 }))
      assert.equal((await store.read(ann)).nightOwl, true)
    })

    test('days are a set: the same day twice is one', async (store, ann) => {
      await store.add(ann, delta({ days: ['2026-10-01', '2026-10-02'] }))
      await store.add(ann, delta({ days: ['2026-10-02', '2026-10-03'] }))
      assert.deepEqual([...(await store.read(ann)).days].sort(), ['2026-10-01', '2026-10-02', '2026-10-03'])
    })

    test('styles keep their flags and add their seconds; rooms add their visits and seconds', async (store, ann) => {
      await store.add(ann, delta({ styles: { rock: { visited: true, seconds: 30 }, jazz: { visited: true } }, rooms: { 'rock-room': { visits: 1, seconds: 30 } } }))
      await store.add(ann, delta({ styles: { rock: { played: true, seconds: 15 } }, rooms: { 'rock-room': { visits: 1, seconds: 15 }, other: { visits: 1 } } }))
      const read = await store.read(ann)
      assert.deepEqual(read.styles.get('rock'), { visited: true, played: true, seconds: 45 })
      assert.deepEqual(read.styles.get('jazz'), { visited: true, played: false, seconds: 0 })
      assert.deepEqual(read.rooms.get('rock-room'), { visits: 2, seconds: 45 })
      assert.deepEqual(read.rooms.get('other'), { visits: 1, seconds: 0 })
      assert.equal(read.rooms.size, 2)
    })

    test('each account has its own numbers (isolation)', async (store, ann, ben) => {
      await store.add(ann, delta({ tracksPlayed: 5, days: ['2026-10-01'], styles: { rock: { visited: true } }, rooms: { r: { visits: 1 } } }))
      await store.add(ben, delta({ messagesSent: 2 }))
      const forBen = await store.read(ben)
      assert.equal(forBen.tracksPlayed, 0)
      assert.equal(forBen.messagesSent, 2)
      assert.equal(forBen.days.size, 0)
      assert.equal(forBen.styles.size, 0)
      assert.equal(forBen.rooms.size, 0)
      assert.equal((await store.read(ann)).messagesSent, 0)
    })

    test('a read is a copy: changing it changes nothing in the store', async (store, ann) => {
      await store.add(ann, delta({ days: ['2026-10-01'], rooms: { r: { visits: 1 } } }))
      const read = await store.read(ann)
      read.days.add('2030-01-01')
      read.rooms.get('r')!.visits = 99
      const again = await store.read(ann)
      assert.equal(again.days.size, 1)
      assert.equal(again.rooms.get('r')?.visits, 1)
    })

    test('counts the distinct members who entered a room, the asker excluded, the largest of several rooms', async (store, ann, ben, newAccount) => {
      const cat = await newAccount()
      await store.add(ben, delta({ rooms: { mine: { visits: 3 }, other: { visits: 1 } } }))
      await store.add(cat, delta({ rooms: { mine: { visits: 1 } } }))
      await store.add(cat, delta({ rooms: { mine: { visits: 1 } } }))
      assert.equal(await store.mostMembersIn(['mine', 'other'], ann), 2, 'Ben and Cat came into mine, once each as members')
      assert.equal(await store.mostMembersIn(['other'], ann), 1)
      assert.equal(await store.mostMembersIn([], ann), 0)
      assert.equal(await store.mostMembersIn(['mine'], ben), 1, 'the host themself is not counted')
      assert.equal(await store.mostMembersIn(['nowhere'], ann), 0)
    })

    test('the mark of members in a room only rises', async (store, ann) => {
      await store.raiseBestRoomMembers(ann, 4)
      await store.raiseBestRoomMembers(ann, 2)
      assert.equal((await store.read(ann)).bestRoomMembers, 4)
      await store.raiseBestRoomMembers(ann, 7)
      assert.equal((await store.read(ann)).bestRoomMembers, 7)
    })

    test('deleteAll removes everything of the account and only of the account', async (store, ann, ben) => {
      const full = delta({ tracksPlayed: 1, days: ['2026-10-01'], styles: { rock: { visited: true } }, rooms: { r: { visits: 1 } } })
      await store.add(ann, full)
      await store.add(ben, full)
      await store.deleteAll(ann)
      assert.deepEqual(await store.read(ann), emptyActivity())
      assert.equal((await store.read(ben)).tracksPlayed, 1)
    })
  })
}
