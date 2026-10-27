import { combine, emptyActivity, isNightOwlHour, parisDayAndHour, type Activity } from './activity'
import type { ActivityStore } from './ActivityStore'

/**
 * What a room tells about its members, for counting. A room only calls these for accounts: a visitor has nothing counted.
 * None of them may throw, change the room's state or wait: counting never gets in the way of a room.
 */
export interface RoomActivity {
  entered(accountId: string, participantId: string): void
  left(accountId: string, participantId: string): void
  /** A track of this DJ counts as played (heard for 10 s, the room's own rule). */
  trackPlayed(djAccountId: string): void
  /**
   * A member's like was given (+1) or taken back (-1), once per account and track. `trackLikes` is the members' likes the
   * track has now (visitors' are not counted). The DJ is absent for the room's own selection.
   */
  likeChanged(change: { djAccountId?: string; likerAccountId: string; delta: 1 | -1; trackLikes: number }): void
  messageSent(accountId: string): void
}

export interface ActivityRecorderOptions {
  now?: () => number
  /** The ids of the rooms a member hosts, to find how many members came into them. */
  hostedRoomIds?: (hostAccountId: string) => Promise<string[]>
  /** Something that can earn a badge was counted for this member (not the passing of time: that is not an event). */
  onActivity?: (accountId: string) => void
  /** The longest a stretch of presence counts in one go (a machine that slept, a clock that jumped). */
  accrualCapSec?: number
}

/** The one description of a live room the recorder needs, read at the moment of each event (a host may change it). */
export interface CountedRoom {
  id: string
  styles: () => readonly string[]
  hostAccountId: () => string | null
}

interface Presence {
  accountId: string
  roomId: string
  styles: readonly string[]
  since: number
}

const FLUSH_MS = 45_000
const ACCRUAL_CAP_SEC = 10 * 60
// How long the store is left alone after a failed batch.
const RETRY_PAUSE_MS = 10_000

/**
 * Counts what members do, in memory, and writes it to the store by batches: never one write per event. A failing store
 * costs nothing but the counting (what could not be written is kept for the next batch); it never reaches a room.
 */
export class ActivityRecorder {
  private pending = new Map<string, Activity>()
  private presence = new Map<string, Presence>()
  private hostsToCheck = new Set<string>()
  private timer: NodeJS.Timeout | undefined
  private flushing: Promise<void> = Promise.resolve()
  private lastError: Error | undefined
  /** No batch is written before this time (set after a failure). */
  private retryAt = 0
  private readonly now: () => number
  private readonly accrualCapMs: number

  constructor(
    private readonly store: ActivityStore,
    private readonly options: ActivityRecorderOptions = {},
  ) {
    this.now = options.now ?? Date.now
    this.accrualCapMs = (options.accrualCapSec ?? ACCRUAL_CAP_SEC) * 1000
  }

  /** Begins writing a batch every so often. Not started by the constructor: tests flush by hand. */
  start(flushMs = FLUSH_MS) {
    if (this.timer) return
    this.timer = setInterval(() => void this.flush(), flushMs)
    this.timer.unref()
  }

  /** Stops the clock and writes what is left (the end of the server), pause or not. */
  async stop() {
    clearInterval(this.timer)
    this.timer = undefined
    await this.flush(true)
  }

  /** The hooks of one room. Each is safe: whatever goes wrong inside is logged, never thrown into the room. */
  forRoom(room: CountedRoom): RoomActivity {
    const safe =
      <A extends unknown[]>(work: (...args: A) => void) =>
      (...args: A) => {
        try {
          work(...args)
        } catch (error) {
          console.error(`[activite] ${(error as Error).message}`)
        }
      }
    return {
      entered: safe((accountId, participantId) => {
        const now = this.now()
        const styles = [...room.styles()]
        const delta = this.deltaOf(accountId)
        const { day, hour } = parisDayAndHour(now)
        delta.days.add(day)
        if (isNightOwlHour(hour)) delta.nightOwl = true
        this.addRoom(delta, room.id, 1, 0)
        for (const style of styles) this.addStyle(delta, style, { visited: true })
        this.presence.set(`${room.id}:${participantId}`, { accountId, roomId: room.id, styles, since: now })
        const host = room.hostAccountId()
        if (host && host !== accountId) this.hostsToCheck.add(host)
        this.options.onActivity?.(accountId)
      }),
      left: safe((accountId, participantId) => {
        const key = `${room.id}:${participantId}`
        const here = this.presence.get(key)
        if (!here || here.accountId !== accountId) return
        this.accrue(here, this.now())
        this.presence.delete(key)
      }),
      trackPlayed: safe((djAccountId) => {
        const delta = this.deltaOf(djAccountId)
        delta.tracksPlayed += 1
        for (const style of room.styles()) this.addStyle(delta, style, { played: true })
        this.options.onActivity?.(djAccountId)
      }),
      likeChanged: safe(({ djAccountId, likerAccountId, delta: change, trackLikes }) => {
        // Nobody who is not a member counts, for the liker or for the DJ.
        if (!likerAccountId) return
        this.deltaOf(likerAccountId).likesGiven += change
        if (djAccountId) {
          const djDelta = this.deltaOf(djAccountId)
          djDelta.likesReceived += change
          if (change > 0) djDelta.bestTrackLikes = Math.max(djDelta.bestTrackLikes, trackLikes)
          this.options.onActivity?.(djAccountId)
        }
        this.options.onActivity?.(likerAccountId)
      }),
      messageSent: safe((accountId) => {
        this.deltaOf(accountId).messagesSent += 1
        this.options.onActivity?.(accountId)
      }),
    }
  }

  /** The account is gone: nothing is kept for it any more (what is written for it later is ignored by the store). */
  forget(accountId: string) {
    this.pending.delete(accountId)
    for (const [key, here] of this.presence) if (here.accountId === accountId) this.presence.delete(key)
  }

  /** Everything counted for the account, what the store holds and what is still waiting to be written included. */
  async read(accountId: string): Promise<Activity> {
    const stored = await this.store.read(accountId)
    const now = this.now()
    for (const here of this.presence.values()) if (here.accountId === accountId) this.accrue(here, now)
    const waiting = this.pending.get(accountId)
    return waiting ? combine(stored, waiting, true) : stored
  }

  /** Writes what is waiting. Never throws; calls follow each other, so that two batches never overlap. */
  flush(force = false): Promise<void> {
    const run = this.flushing.then(() => this.writeBatch(force)).catch((error: Error) => console.error(`[activite] ${error.message}`))
    this.flushing = run
    return run
  }

  private async writeBatch(force: boolean) {
    const now = this.now()
    // After a failure the store gets a pause: counting goes on in memory (one entry per account at most), nothing is lost.
    if (!force && now < this.retryAt) return
    for (const here of this.presence.values()) this.accrue(here, now)
    const batch = [...this.pending]
    this.pending = new Map()
    const hosts = [...this.hostsToCheck]
    this.hostsToCheck.clear()

    // The first error of a batch ends it: what is left goes back as it is, instead of waiting for the store's timeout once
    // per account (a batch of a thousand accounts would block every flush behind it for hours).
    let failed = 0
    let next = 0
    for (; next < batch.length; next++) {
      try {
        await this.store.add(batch[next][0], batch[next][1])
      } catch (error) {
        this.lastError = error as Error
        break
      }
    }
    let nextHost = 0
    if (next >= batch.length) {
      for (; nextHost < hosts.length; nextHost++) {
        try {
          const rooms = (await this.options.hostedRoomIds?.(hosts[nextHost])) ?? []
          const members = await this.store.mostMembersIn(rooms, hosts[nextHost])
          if (members > 0) await this.store.raiseBestRoomMembers(hosts[nextHost], members)
        } catch (error) {
          this.lastError = error as Error
          break
        }
      }
    }
    // Kept for the next batch, merged with what came in since.
    for (const [accountId, delta] of batch.slice(next)) {
      const since = this.pending.get(accountId)
      this.pending.set(accountId, since ? combine(delta, since) : delta)
      failed += 1
    }
    for (const host of hosts.slice(nextHost)) {
      this.hostsToCheck.add(host)
      failed += 1
    }
    if (failed > 0) this.retryAt = this.now() + RETRY_PAUSE_MS
    // One line per batch, with no account in it.
    if (failed > 0) console.error(`[activite] ${failed} écriture(s) reportée(s) : ${this.lastError?.message ?? 'erreur'}`)
  }

  private deltaOf(accountId: string): Activity {
    let delta = this.pending.get(accountId)
    if (!delta) {
      delta = emptyActivity()
      this.pending.set(accountId, delta)
    }
    return delta
  }

  private addRoom(delta: Activity, roomId: string, visits: number, seconds: number) {
    const known = delta.rooms.get(roomId)
    delta.rooms.set(roomId, { visits: (known?.visits ?? 0) + visits, seconds: (known?.seconds ?? 0) + seconds })
  }

  private addStyle(delta: Activity, style: string, add: { visited?: boolean; played?: boolean; seconds?: number }) {
    const known = delta.styles.get(style)
    delta.styles.set(style, {
      visited: (known?.visited ?? false) || add.visited === true,
      played: (known?.played ?? false) || add.played === true,
      seconds: (known?.seconds ?? 0) + (add.seconds ?? 0),
    })
  }

  /**
   * Adds the whole seconds a presence has lasted since it was last counted, to the account and to the room and styles it
   * is in. What is counted moves `since` forward, so the same second is never counted twice (by a batch and then by the
   * departure); a stretch longer than the cap is cut to it.
   */
  private accrue(here: Presence, now: number) {
    const elapsed = now - here.since
    if (elapsed < 1000) return
    const seconds = Math.min(Math.floor(elapsed / 1000), this.accrualCapMs / 1000)
    here.since = elapsed > this.accrualCapMs ? now : here.since + seconds * 1000
    const delta = this.deltaOf(here.accountId)
    delta.listenSeconds += seconds
    this.addRoom(delta, here.roomId, 0, seconds)
    for (const style of here.styles) this.addStyle(delta, style, { seconds })
  }
}
