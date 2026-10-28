// The life of a DJ in a room, from the first track to the departure: leaving the queue, leaving the site, coming back,
// and what the room shows of it. The other room tests check each rule alone; these follow a DJ through the transitions, the
// way the beta testers did, and a seeded random walk checks the same facts after every action.
//
// The rules they hold the room to (agreed with the user on 28/10/2026):
// - a DJ is somebody with a track on the decks or lined up: when their last track has ended, or they take their last
//   queued track back, they are out of the queue at once;
// - a DJ who leaves the site keeps their place and queued tracks for 3 minutes (counted from the last time they left),
//   passed over at their turn without penalty; their track on the decks plays to its end; then everything goes;
// - what "À suivre" lists is what will really play: never the track of a DJ who is away.
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import type { DjQueue, DjQueueEntry, Participant, QueuedTrack, RoomRules, VideoInfo } from '../../shared/protocol'
import { TEST_TRACKS } from './catalog'
import { Room, type RoomEvents } from './Room'

const START = 1_000_000
const SECOND = 1000
/** A DJ who leaves the site keeps their queued tracks this long (28/10/2026). */
const ABSENCE_GRACE_MS = 3 * 60 * SECOND

const MEMBERS = ['Ann', 'Ben', 'Cat'] as const
type Member = (typeof MEMBERS)[number]
const ACCOUNT: Record<Member, string> = { Ann: 'acc-ann', Ben: 'acc-ben', Cat: 'acc-cat' }
const MEMBER_OF_ACCOUNT = new Map(MEMBERS.map((name) => [ACCOUNT[name], name]))
const AVATAR = { Ann: 'pulse', Ben: 'mango', Cat: 'moss' } as const

const noEvents: RoomEvents = {
  onTrackChange: () => {},
  onReactionsChange: () => {},
  onQueueChange: () => {},
  onLineupChange: () => {},
  onNotice: () => {},
}

/** A room that keeps track of who is in it, under which connection: the ground truth the checks compare the room to. */
class Scene {
  readonly room: Room
  private connections = 0
  /** Member → their connection (participant id) while they are in the room. */
  readonly here = new Map<Member, string>()
  /** Member → when they left the room, while they are away. */
  readonly leftAt = new Map<Member, number>()
  private tracks = 0

  constructor(rules: Partial<RoomRules> = {}) {
    const full: RoomRules = { maxTrackSec: 600, repeatDelaySec: 2 * 3600, maxDjs: 5, ...rules }
    // No protected seconds: a vote can be cast at once.
    this.room = new Room('lifecycle', 'Lifecycle', noEvents, { skipProtectedSec: 0, ownSkipMinSec: 0, rules: full })
  }

  join(name: Member): string {
    assert.ok(!this.here.has(name), `${name} is already here`)
    this.connections += 1
    const person: Participant = { id: `p-${name.toLowerCase()}-${this.connections}`, pseudo: name, avatarId: AVATAR[name], member: true }
    this.room.add(person, ACCOUNT[name])
    this.here.set(name, person.id)
    this.leftAt.delete(name)
    return person.id
  }

  leave(name: Member) {
    const id = this.here.get(name)
    assert.ok(id, `${name} is not here`)
    this.room.remove(id)
    this.here.delete(name)
    this.leftAt.set(name, Date.now())
  }

  /** Lines a new video up for a member who is here. */
  lineUp(name: Member, seconds = 60): QueuedTrack | null {
    const id = this.here.get(name)
    assert.ok(id, `${name} is not here`)
    this.tracks += 1
    const title = `t${this.tracks}`
    const video: VideoInfo = { videoId: title.padEnd(11, '_'), title, artist: 'Artist', durationSec: seconds }
    const result = this.room.addTrack(id, video)
    return result.ok ? result.track : null
  }

  /**
   * Lets time pass, a second at a time: one big tick does not fire the timers that the first ones set (the next track's),
   * so a turn that comes after another one would never come.
   */
  wait(seconds: number) {
    for (let elapsed = 0; elapsed < seconds; elapsed += 1) mock.timers.tick(SECOND)
  }

  /** The titles that start playing during the next `seconds` seconds, in order. */
  playedDuring(seconds: number): string[] {
    const played: string[] = []
    let last = this.room.nowPlaying?.id
    for (let elapsed = 0; elapsed < seconds; elapsed += 1) {
      mock.timers.tick(SECOND)
      const now = this.room.nowPlaying
      if (now && now.id !== last) played.push(now.title)
      last = now?.id
    }
    return played
  }

  get view(): DjQueue {
    return this.room.queueView()
  }

  get waitingNames(): string[] {
    return this.view.waiting.map((entry) => entry.pseudo)
  }

  get playing(): string | null {
    return this.room.nowPlaying?.title ?? null
  }

  close() {
    for (const id of this.here.values()) this.room.remove(id)
    this.here.clear()
  }
}

let scene: Scene

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START })
})

afterEach(() => {
  scene?.close()
  mock.timers.reset()
})

describe('a DJ who has played their last track', () => {
  it('is out of the queue at once, not "first in the queue" with nothing to play (28/10: « 1er dans la file alors qu’il n’est plus DJ »)', () => {
    scene = new Scene()
    scene.join('Ann')
    scene.join('Ben')
    scene.lineUp('Ann', 60)
    scene.lineUp('Ben', 60)
    assert.equal(scene.playing, 't1')

    scene.wait(60) // Ann's only track ends, Ben's plays
    assert.equal(scene.playing, 't2')
    assert.deepEqual(scene.waitingNames, [], 'Ann has nothing lined up: she is not in the waiting list')
    assert.equal(scene.room.djCount, 1, 'only Ben is a DJ now')
  })

  it('is out as soon as their last track ends, even with nobody else in the queue', () => {
    scene = new Scene()
    scene.join('Ann')
    scene.join('Ben')
    scene.lineUp('Ann', 60)
    scene.wait(60)
    assert.equal(scene.room.djCount, 0)
    assert.equal(scene.view.current, null)
  })

  it('is out too when they take their last queued track back (found by the random walk)', () => {
    scene = new Scene()
    scene.join('Ann')
    scene.join('Ben')
    scene.lineUp('Ann', 60)
    const track = scene.lineUp('Ben', 60)
    assert.ok(track)
    assert.deepEqual(scene.waitingNames, ['Ben'])

    const removed = scene.room.removeTrack(scene.here.get('Ben') ?? '', track.id)
    assert.ok(removed.ok, JSON.stringify(removed))
    assert.deepEqual(scene.waitingNames, [], 'with nothing lined up, Ben is no longer in the waiting list')
  })

  it('can queue a track again afterwards and is at the back of the queue', () => {
    scene = new Scene()
    scene.join('Ann')
    scene.join('Ben')
    scene.lineUp('Ann', 60)
    scene.lineUp('Ben', 60)
    scene.wait(60)
    assert.ok(scene.lineUp('Ann', 60), 'she can line a new track up')
    assert.deepEqual(scene.waitingNames, ['Ann'], 'behind Ben, who is on the decks')
  })
})

describe('a DJ who leaves the queue by choice', () => {
  it('on the decks: their track is cut, their line-up is gone, the next DJ plays and they are out', () => {
    scene = new Scene()
    scene.join('Ann')
    scene.join('Ben')
    scene.lineUp('Ann', 60) // t1, on the decks
    scene.lineUp('Ann', 60) // t2, queued
    scene.lineUp('Ben', 60) // t3
    const annId = scene.here.get('Ann') ?? ''

    const left = scene.room.leaveQueue(annId)
    assert.ok(left.ok, JSON.stringify(left))
    assert.equal(scene.playing, 't3', 'Ben plays')
    assert.deepEqual(scene.waitingNames, [], 'Ann does not come back at the end of the queue')
    assert.equal(scene.room.djCount, 1)
    assert.deepEqual(scene.room.lineupOf(annId), [])
    assert.ok(scene.view.upcoming.every((step) => step.pseudo !== 'Ann'), 'and her queued track is not in "À suivre"')
  })
})

describe('a DJ who leaves the site', () => {
  /** Ann plays a long run of short tracks; Ben has two lined up; Ben leaves. */
  function benLeavesWithTwoTracks() {
    scene = new Scene()
    scene.join('Ann')
    scene.join('Ben')
    for (let track = 0; track < 8; track += 1) scene.lineUp('Ann', 30)
    scene.lineUp('Ben', 30)
    scene.lineUp('Ben', 30)
    scene.leave('Ben')
  }

  it('is never shown as the next track while they are away: only what will really play is "À suivre"', () => {
    benLeavesWithTwoTracks()
    const ahead = scene.view.upcoming
    assert.ok(ahead.length > 0)
    assert.ok(ahead.every((step) => step.pseudo !== 'Ben'), 'none of Ben’s tracks is listed: he is not there to play them')
  })

  it('keeps their place and their tracks for 3 minutes, however many turns pass', () => {
    benLeavesWithTwoTracks()
    scene.wait(90) // three turns have come round: before, Ben was out after two
    assert.deepEqual(scene.waitingNames, ['Ben'])
    assert.equal(scene.view.waiting[0].next?.title, 't9', 'his first track is still the next one')
    assert.equal(scene.view.waiting[0].participantId, null, 'shown as away')
  })

  // Holds today for another reason (two skipped turns, about a minute here): it must go on holding when the 3 minutes replace them.
  it('loses their place and their queued tracks after 3 minutes', () => {
    benLeavesWithTwoTracks()
    scene.wait(ABSENCE_GRACE_MS / SECOND + 1)
    assert.deepEqual(scene.waitingNames, [])
    assert.equal(scene.room.djCount, 1, 'only Ann is left')
  })

  it('finds everything as they left it when they come back within 3 minutes', () => {
    benLeavesWithTwoTracks()
    scene.wait(100)
    scene.join('Ben')
    assert.deepEqual(scene.waitingNames, ['Ben'])
    assert.deepEqual(scene.room.lineupOf(scene.here.get('Ben') ?? '').map((track) => track.title), ['t9', 't10'])
  })

  it('counts the 3 minutes from the last time they left (phone asleep, tunnel: the connection drops again)', () => {
    benLeavesWithTwoTracks()
    scene.wait(100)
    scene.join('Ben') // back before any of his turns
    scene.wait(10)
    scene.leave('Ben') // gone again at 110 s
    scene.wait(150) // 260 s in: more than 3 minutes since the first time, 2.5 minutes since the last
    assert.deepEqual(scene.waitingNames, ['Ben'])
  })
})

describe('the track of a DJ who leaves while it plays', () => {
  function annLeavesDuringALongTrack() {
    scene = new Scene({ maxTrackSec: 900 })
    scene.join('Ann')
    scene.join('Ben')
    scene.lineUp('Ann', 400) // plays now
    scene.lineUp('Ann', 60) // queued
    scene.lineUp('Ben', 60)
    scene.wait(10)
    scene.leave('Ann')
  }

  it('plays on to its end (his sound stays unless the public skips it)', () => {
    annLeavesDuringALongTrack()
    scene.wait(300)
    assert.equal(scene.playing, 't1')
    assert.equal(scene.view.current?.pseudo, 'Ann')
    assert.equal(scene.view.current?.participantId, null, 'shown as away')
  })

  it('has its queued tracks removed after 3 minutes, but not the track that plays', () => {
    annLeavesDuringALongTrack()
    scene.wait(ABSENCE_GRACE_MS / SECOND + 1)
    assert.equal(scene.playing, 't1', 'the track on the decks is not cut')
    assert.equal(scene.view.current?.pseudo, 'Ann')
    assert.ok(scene.view.upcoming.every((step) => step.pseudo !== 'Ann'), 'her queued track is gone')
  })

  it('then leaves the queue for good when that track ends', () => {
    annLeavesDuringALongTrack()
    scene.wait(400) // t1 ends at 400 s
    assert.equal(scene.playing, 't3', 'Ben’s track: Ann has nothing left to play')
    assert.deepEqual(scene.waitingNames, [])
    assert.equal(scene.room.djCount, 1)
  })

  it('can be skipped by the public like any other', () => {
    annLeavesDuringALongTrack()
    scene.join('Cat')
    for (const voter of ['Ben', 'Cat'] as const) {
      const vote = scene.room.voteSkip(scene.here.get(voter) ?? '', true)
      assert.ok(vote.ok, JSON.stringify(vote))
    }
    assert.equal(scene.playing, 't3', 'both people present voted: Ben’s track plays')
  })
})

describe('a friend who becomes DJ while another DJ is on the decks', () => {
  it('plays right after the track on the decks, then the rotation goes on (27/10 test with a friend)', () => {
    scene = new Scene()
    scene.join('Ann')
    scene.join('Ben')
    scene.lineUp('Ann', 60) // t1: on the decks
    scene.lineUp('Ann', 60) // t2
    scene.lineUp('Ann', 60) // t3
    scene.wait(10)
    scene.lineUp('Ben', 60) // t4
    scene.lineUp('Ben', 60) // t5
    assert.deepEqual(scene.playedDuring(240), ['t4', 't2', 't5', 't3'])
  })
})

/** Seeded generator: the same numbers for the same seed, so that a failure can be replayed. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

describe('the order shown is the order played', () => {
  it('for 60 random queues with everybody present', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const random = mulberry32(seed)
      scene = new Scene({ maxDjs: 10 })
      for (const name of MEMBERS) scene.join(name)
      // Each member lines up 0 to 4 tracks of 20 to 80 seconds, in a random order.
      const order = [...MEMBERS].sort(() => random() - 0.5)
      for (const name of order) {
        const count = Math.floor(random() * 5)
        for (let track = 0; track < count; track += 1) scene.lineUp(name, 20 + Math.floor(random() * 61))
      }
      const shown = scene.view.upcoming.map((step) => step.track.title)
      if (shown.length === 0) {
        scene.close()
        mock.timers.reset()
        mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START })
        continue
      }
      const played: string[] = []
      while (played.length < shown.length) {
        const playing = scene.room.nowPlaying
        assert.ok(playing, `seed ${seed}: something plays`)
        scene.wait(playing.durationSec)
        const next = scene.room.nowPlaying
        if (next) played.push(next.title)
      }
      assert.deepEqual(played, shown, `seed ${seed}: what was shown is what played`)
      scene.close()
      mock.timers.reset()
      mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START })
    }
  })
})

type Action = string

/** The facts that must hold after every action, today. Returns the first one that does not, or null. */
function brokenToday(scene: Scene): string | null {
  const { view, room } = scene
  const entries = [view.current, ...view.waiting].filter((entry): entry is DjQueueEntry => entry !== null)

  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) return 'two places with the same id'
  if (new Set(entries.map((entry) => entry.pseudo)).size !== entries.length) return 'the same DJ twice in the queue'

  for (const entry of entries) {
    const member = entry.pseudo as Member
    const expected = scene.here.get(member) ?? null
    if (entry.participantId !== expected) return `${member}: the queue says connection ${entry.participantId}, in fact ${expected}`
  }

  const misnumbered = view.upcoming.findIndex((step, index) => step.position !== index + 1)
  if (misnumbered !== -1) return `"À suivre": position ${view.upcoming[misnumbered].position} at rank ${misnumbered + 1}`
  const ids = view.upcoming.map((step) => step.track.id)
  if (new Set(ids).size !== ids.length) return 'a track twice in "À suivre"'

  for (const entry of entries) {
    const connection = scene.here.get(entry.pseudo as Member)
    if (!connection) continue
    const lineup = room.lineupOf(connection).map((track) => track.id)
    const listed = view.upcoming.filter((step) => step.entryId === entry.id).map((step) => step.track.id)
    // A DJ's tracks in "À suivre" are the start of their line-up, in order (the one that plays is not in it).
    if (listed.some((id, index) => id !== lineup[index])) return `${entry.pseudo}: "À suivre" does not follow their line-up`
  }

  const playing = room.nowPlaying
  const house = playing !== null && TEST_TRACKS.some((track) => track.videoId === playing.videoId)
  if (playing === null && view.current !== null) return 'a DJ is on the decks and nothing plays'
  if (house && view.current !== null) return 'the room’s own selection plays with a DJ on the decks'
  if (playing !== null && !house && view.current === null) return 'a DJ’s track plays and nobody is on the decks'
  if (scene.here.size === 0 && playing !== null) return 'the room is empty and something plays'
  return null
}

/** The rules of 28/10/2026, after every action. */
function brokenByNewRules(scene: Scene): string | null {
  const { view } = scene
  for (const entry of view.waiting) {
    if (entry.next === null) return `${entry.pseudo} is in the waiting list with nothing to play`
  }
  for (const step of view.upcoming) {
    if (!scene.here.has(step.pseudo as Member)) return `"À suivre" lists ${step.pseudo}'s track, but ${step.pseudo} is away`
  }
  for (const [member, left] of scene.leftAt) {
    if (Date.now() - left > ABSENCE_GRACE_MS + SECOND && scene.waitingNames.includes(member)) {
      return `${member} has been away for more than 3 minutes and is still waiting`
    }
  }
  return null
}

/**
 * A random walk over the life of three members: coming, going, lining tracks up, voting, time passing. Returns what it
 * did, so that a test can check that the walk is not empty (a check on actions that never happen proves nothing).
 */
function randomWalk(check: (scene: Scene) => string | null, label: string) {
  const stats = { actions: 0, comes: 0, leaves: 0, lineUps: 0, removals: 0, leaveQueues: 0, votes: 0, waits: 0, tracksSeen: 0, awayWhileDj: 0 }
  for (let seed = 1; seed <= 80; seed += 1) {
    const random = mulberry32(seed)
    const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]
    scene = new Scene({ maxDjs: 5 })
    const log: Action[] = []
    const seen = new Set<string>()
    for (let step = 0; step < 45; step += 1) {
      const present = MEMBERS.filter((name) => scene.here.has(name))
      const absent = MEMBERS.filter((name) => !scene.here.has(name))
      const roll = random()
      let action: Action
      if (roll < 0.16 && absent.length > 0) {
        const name = pick([...absent])
        scene.join(name)
        stats.comes += 1
        action = `${name} comes`
      } else if (roll < 0.26 && present.length > 0) {
        const name = pick([...present])
        if (scene.view.current?.pseudo === name || scene.waitingNames.includes(name)) stats.awayWhileDj += 1
        scene.leave(name)
        stats.leaves += 1
        action = `${name} leaves`
      } else if (roll < 0.54 && present.length > 0) {
        const name = pick([...present])
        const seconds = pick([20, 30, 60, 90])
        scene.lineUp(name, seconds)
        stats.lineUps += 1
        action = `${name} lines up ${seconds} s`
      } else if (roll < 0.6 && present.length > 0) {
        const name = pick([...present])
        const first = scene.room.lineupOf(scene.here.get(name) ?? '')[0]
        if (first) scene.room.removeTrack(scene.here.get(name) ?? '', first.id)
        stats.removals += 1
        action = `${name} removes a track`
      } else if (roll < 0.66 && present.length > 0) {
        const name = pick([...present])
        const left = scene.room.leaveQueue(scene.here.get(name) ?? '')
        stats.leaveQueues += 1
        action = `${name} leaves the queue`
        // Whoever leaves the queue by choice is out of it, wherever they were (on the decks or waiting).
        const stillThere = [scene.view.current, ...scene.view.waiting].some((entry) => entry?.pseudo === name)
        assert.ok(!(left.ok && stillThere), `${label}, seed ${seed}, step ${step}: ${name} left the queue and is still in it`)
      } else if (roll < 0.74 && present.length > 0) {
        const name = pick([...present])
        scene.room.voteSkip(scene.here.get(name) ?? '', true)
        stats.votes += 1
        action = `${name} votes to skip`
      } else {
        const seconds = pick([5, 20, 45, 70, 200])
        scene.wait(seconds)
        stats.waits += 1
        action = `${seconds} s pass`
      }
      stats.actions += 1
      const playing = scene.room.nowPlaying
      if (playing && !seen.has(playing.id)) {
        seen.add(playing.id)
        stats.tracksSeen += 1
      }
      log.push(action)
      const broken = check(scene)
      assert.equal(broken, null, `${label}, seed ${seed}, step ${step}: ${broken}\n  after: ${log.slice(-8).join(' → ')}`)
    }
    scene.close()
    mock.timers.reset()
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START })
  }
  return stats
}

describe('random walks over the life of the members', () => {
  it('keep the queue, the people and what plays coherent (what holds today)', (t) => {
    const stats = randomWalk(brokenToday, 'coherence')
    t.diagnostic(JSON.stringify(stats))
    // The walk must really exercise the transitions: people leaving while DJs, tracks playing, time passing.
    assert.ok(stats.actions >= 3000, `enough actions: ${JSON.stringify(stats)}`)
    assert.ok(stats.leaves >= 200 && stats.comes >= 200, `people come and go: ${JSON.stringify(stats)}`)
    assert.ok(stats.awayWhileDj >= 50, `DJs leave the room: ${JSON.stringify(stats)}`)
    assert.ok(stats.tracksSeen >= 200, `tracks play: ${JSON.stringify(stats)}`)
  })

  it('follow the rules of 28/10/2026: no empty place, no away DJ in "À suivre", 3 minutes at most', () => {
    randomWalk(brokenByNewRules, 'new rules')
  })
})
