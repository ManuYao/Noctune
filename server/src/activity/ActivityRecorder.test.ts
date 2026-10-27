// The recorder with a clock of its own and a store that can be made to fail. No sockets, no timers.
import assert from 'node:assert/strict'
import { beforeEach, describe, it, mock } from 'node:test'
import { combine, emptyActivity, parisDayAndHour, isNightOwlHour, type Activity } from './activity'
import { ActivityRecorder, type RoomActivity } from './ActivityRecorder'
import type { ActivityStore } from './ActivityStore'
import { MemoryActivityStore } from './MemoryActivityStore'

// 2026-10-27 12:00 in Paris (UTC+1: summer time ended on the 25th).
const NOON = Date.parse('2026-10-27T11:00:00Z')
const SECOND = 1000

let clock: number
let store: MemoryActivityStore
let recorder: ActivityRecorder
let writes: number
let hooks: RoomActivity
let styles: string[]
let host: string | null

/** A store that counts the calls to `add`, and that fails while `down` is set. */
class FlakyStore extends MemoryActivityStore {
  down = false
  override async add(accountId: string, delta: Activity) {
    writes += 1
    if (this.down) throw new Error('database down')
    return super.add(accountId, delta)
  }
}

function setup(options: { store?: ActivityStore; hosted?: string[] } = {}) {
  clock = NOON
  writes = 0
  styles = ['rock']
  host = null
  store = new FlakyStore()
  recorder = new ActivityRecorder(options.store ?? store, { now: () => clock, hostedRoomIds: async () => options.hosted ?? [], accrualCapSec: 600 })
  hooks = recorder.forRoom({ id: 'room-a', styles: () => styles, hostAccountId: () => host })
}

beforeEach(() => {
  mock.method(console, 'error', () => undefined)
  setup()
})

describe('Paris time', () => {
  it('reads the day and hour in Paris, summer and winter time', () => {
    assert.deepEqual(parisDayAndHour(Date.parse('2026-07-01T22:30:00Z')), { day: '2026-07-02', hour: 0 })
    assert.deepEqual(parisDayAndHour(Date.parse('2026-12-01T22:30:00Z')), { day: '2026-12-01', hour: 23 })
  })
  it('knows the night hours: 02:00 included, 05:00 excluded', () => {
    assert.deepEqual([1, 2, 4, 5].map(isNightOwlHour), [false, true, true, false])
  })
})

describe('entering a room', () => {
  it('counts a visit, the day, the styles visited', async () => {
    hooks.entered('ann', 'p1')
    const read = await recorder.read('ann')
    assert.equal(read.rooms.get('room-a')?.visits, 1)
    assert.deepEqual([...read.days], ['2026-10-27'])
    assert.deepEqual(read.styles.get('rock'), { visited: true, played: false, seconds: 0 })
    assert.equal(read.nightOwl, false)
  })

  it('is a night owl between 02:00 and 05:00 in Paris, not at 05:00', async () => {
    clock = Date.parse('2026-10-27T01:30:00Z') // 02:30 in Paris
    hooks.entered('ann', 'p1')
    clock = Date.parse('2026-10-27T04:00:00Z') // 05:00 in Paris
    hooks.entered('ben', 'p2')
    assert.equal((await recorder.read('ann')).nightOwl, true)
    assert.equal((await recorder.read('ben')).nightOwl, false)
  })

  it('counts two visits to the same room as two visits and one room', async () => {
    hooks.entered('ann', 'p1')
    hooks.left('ann', 'p1')
    hooks.entered('ann', 'p2')
    const read = await recorder.read('ann')
    assert.equal(read.rooms.size, 1)
    assert.equal(read.rooms.get('room-a')?.visits, 2)
  })
})

describe('time spent', () => {
  it('counts the seconds of a stay, for the account, the room and each style', async () => {
    styles = ['rock', 'pop']
    hooks.entered('ann', 'p1')
    clock += 90 * SECOND
    hooks.left('ann', 'p1')
    const read = await recorder.read('ann')
    assert.equal(read.listenSeconds, 90)
    assert.equal(read.rooms.get('room-a')?.seconds, 90)
    assert.equal(read.styles.get('rock')?.seconds, 90)
    assert.equal(read.styles.get('pop')?.seconds, 90)
  })

  it('never counts the same second twice: a batch in the middle of a stay, then the departure', async () => {
    hooks.entered('ann', 'p1')
    clock += 40 * SECOND
    await recorder.flush()
    assert.equal((await store.read('ann')).listenSeconds, 40)
    clock += 25 * SECOND
    hooks.left('ann', 'p1')
    hooks.left('ann', 'p1') // a second departure of the same connection adds nothing
    assert.equal((await recorder.read('ann')).listenSeconds, 65)
  })

  it('includes the stay in progress when the profile is read', async () => {
    hooks.entered('ann', 'p1')
    clock += 30 * SECOND
    assert.equal((await recorder.read('ann')).listenSeconds, 30)
    clock += 30 * SECOND
    assert.equal((await recorder.read('ann')).listenSeconds, 60, 'reading twice does not count twice')
  })

  it('counts every room a member is in at the same time, each by its own connection', async () => {
    const other = recorder.forRoom({ id: 'room-b', styles: () => ['jazz'], hostAccountId: () => null })
    hooks.entered('ann', 'p1')
    other.entered('ann', 'p2')
    clock += 10 * SECOND
    const read = await recorder.read('ann')
    assert.equal(read.listenSeconds, 20)
    assert.equal(read.rooms.get('room-a')?.seconds, 10)
    assert.equal(read.rooms.get('room-b')?.seconds, 10)
  })

  it('cuts a stretch longer than the cap (a machine that slept) instead of counting it all', async () => {
    hooks.entered('ann', 'p1')
    clock += 3 * 3600 * SECOND
    hooks.left('ann', 'p1')
    assert.equal((await recorder.read('ann')).listenSeconds, 600)
  })

  it('ignores a departure that is not the one the account came in with', async () => {
    hooks.entered('ann', 'p1')
    clock += 10 * SECOND
    hooks.left('ben', 'p1')
    clock += 10 * SECOND
    hooks.left('ann', 'p1')
    assert.equal((await recorder.read('ann')).listenSeconds, 20)
    assert.equal((await recorder.read('ben')).listenSeconds, 0)
  })
})

describe('tracks, likes and messages', () => {
  it('counts a played track and the styles it played in', async () => {
    hooks.trackPlayed('ann')
    const read = await recorder.read('ann')
    assert.equal(read.tracksPlayed, 1)
    assert.equal(read.styles.get('rock')?.played, true)
    assert.equal(read.styles.get('rock')?.visited, false)
  })

  it('a like goes to the DJ (received) and to the liker (given); taking it back takes it back', async () => {
    hooks.likeChanged({ djAccountId: 'dj', likerAccountId: 'ann', delta: 1, trackLikes: 1 })
    hooks.likeChanged({ djAccountId: 'dj', delta: 1, trackLikes: 2 }) // a visitor
    hooks.likeChanged({ djAccountId: 'dj', likerAccountId: 'ann', delta: -1, trackLikes: 1 })
    const dj = await recorder.read('dj')
    assert.equal(dj.likesReceived, 1)
    assert.equal(dj.bestTrackLikes, 2, 'the best a track reached, not what it ended with')
    assert.equal((await recorder.read('ann')).likesGiven, 0)
  })

  it('a like on the room’s own selection counts as given and nobody receives it', async () => {
    hooks.likeChanged({ likerAccountId: 'ann', delta: 1, trackLikes: 1 })
    assert.equal((await recorder.read('ann')).likesGiven, 1)
    assert.equal(((recorder as unknown) as { pending: Map<string, Activity> }).pending.size, 1)
  })

  it('counts messages', async () => {
    hooks.messageSent('ann')
    hooks.messageSent('ann')
    assert.equal((await recorder.read('ann')).messagesSent, 2)
  })
})

describe('writing by batches', () => {
  it('writes nothing until a flush, then one write per account whatever the number of events', async () => {
    for (let i = 0; i < 50; i++) hooks.messageSent('ann')
    hooks.messageSent('ben')
    assert.equal(writes, 0)
    await recorder.flush()
    assert.equal(writes, 2)
    assert.equal((await store.read('ann')).messagesSent, 50)
    await recorder.flush()
    assert.equal(writes, 2, 'nothing new, nothing written')
  })

  it('a flush adds what the stay in progress has lasted so far', async () => {
    hooks.entered('ann', 'p1')
    clock += 61 * SECOND
    await recorder.flush()
    assert.equal((await store.read('ann')).listenSeconds, 61)
  })

  it('keeps what a failing store refused for the next batch, and tells nobody', async () => {
    const flaky = new FlakyStore()
    setup({ store: flaky })
    hooks.messageSent('ann')
    flaky.down = true
    await recorder.flush() // must not throw
    assert.equal((await flaky.read('ann')).messagesSent, 0)
    hooks.messageSent('ann') // counting goes on while the store is down
    assert.equal((await recorder.read('ann')).messagesSent, 2, 'what is waiting still shows in the profile')
    flaky.down = false
    await recorder.flush()
    assert.equal((await flaky.read('ann')).messagesSent, 2)
  })

  it('logs a failure without the account in it', async () => {
    const flaky = new FlakyStore()
    setup({ store: flaky })
    flaky.down = true
    hooks.messageSent('secret-account-id')
    await recorder.flush()
    const logged = (console.error as unknown as { mock: { calls: { arguments: unknown[] }[] } }).mock.calls.map((call) => String(call.arguments[0])).join('\n')
    assert.match(logged, /reportée/)
    assert.equal(logged.includes('secret-account-id'), false)
  })

  it('two flushes at once do not overlap', async () => {
    hooks.messageSent('ann')
    await Promise.all([recorder.flush(), recorder.flush()])
    assert.equal((await store.read('ann')).messagesSent, 1)
    assert.equal(writes, 1)
  })

  it('forget drops what is waiting and the stays in progress of an account', async () => {
    hooks.entered('ann', 'p1')
    hooks.messageSent('ann')
    hooks.messageSent('ben')
    recorder.forget('ann')
    clock += 30 * SECOND
    await recorder.flush()
    assert.equal(writes, 1, 'only Ben was written')
    assert.deepEqual(await store.read('ann'), emptyActivity())
  })

  it('stop writes what is left', async () => {
    hooks.messageSent('ann')
    await recorder.stop()
    assert.equal((await store.read('ann')).messagesSent, 1)
  })
})

describe('the members who came into a host’s rooms', () => {
  it('raises the host’s mark with the distinct members who entered, the host not counted', async () => {
    setup({ hosted: ['room-a'] })
    host = 'hostie'
    hooks.entered('hostie', 'p0')
    hooks.entered('ann', 'p1')
    hooks.entered('ben', 'p2')
    hooks.left('ann', 'p1')
    hooks.entered('ann', 'p3') // the same member again
    await recorder.flush()
    assert.equal((await store.read('hostie')).bestRoomMembers, 2)
  })

  it('does nothing for a room of the team (no host)', async () => {
    hooks.entered('ann', 'p1')
    await recorder.flush()
    assert.equal((await store.read('ann')).bestRoomMembers, 0)
  })
})

describe('combine', () => {
  it('adds plain, and clamps only when told to', () => {
    const minus = emptyActivity()
    minus.likesGiven = -2
    assert.equal(combine(emptyActivity(), minus).likesGiven, -2)
    assert.equal(combine(emptyActivity(), minus, true).likesGiven, 0)
  })
})
