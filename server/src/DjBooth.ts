import { randomUUID } from 'node:crypto'
import type { AvatarId, DjNotice, QueuedTrack } from '../../shared/protocol'

/** A DJ whose turn is skipped this many times in a row loses their place in the queue. */
export const MAX_MISSES = 2

/** Why a track of a line-up can no longer play when its turn comes. */
export type DropReason = Extract<DjNotice, { kind: 'track-dropped' }>['reason']

/** One DJ's place in the queue. */
export interface DjEntry {
  /** Public id of the place: stays the same while the DJ keeps it. */
  readonly id: string
  /** Whose place it is. Never sent to the clients. */
  readonly accountId: string
  pseudo: string
  avatarId: AvatarId
  /** The tracks they will play, in order. Each one leaves the line-up when it starts. */
  lineup: QueuedTrack[]
  /** Turns skipped in a row. */
  misses: number
}

/** What the booth must ask the room to decide a turn. */
export interface TurnContext {
  /** Is the DJ in the room right now? */
  isPresent(accountId: string): boolean
  /** Why this track can no longer play in the room, or null when it can. */
  refusal(track: QueuedTrack): DropReason | null
}

export type TurnEvent =
  /** A track left the line-up because it no longer fits the rules of the room. */
  | { kind: 'dropped'; accountId: string; title: string; reason: DropReason }
  /** The DJ's turn came and they could not play: they keep their place for one more turn. */
  | { kind: 'skipped'; accountId: string }
  /** The DJ's turn was skipped too often in a row: they lost their place. */
  | { kind: 'removed'; accountId: string }

export interface Turn {
  /** The DJ whose track starts, and that track (already taken out of their line-up). Null: nobody can play. */
  play: { entry: DjEntry; track: QueuedTrack } | null
  events: TurnEvent[]
}

/** One step of the projected play order. */
export interface UpcomingStep {
  entry: DjEntry
  track: QueuedTrack
  /** 1 = right after the track on the decks. */
  position: number
  away: boolean
}

/**
 * The order the line-ups will play in if nothing changes, following the rotation of the booth: the DJ on the decks goes
 * to the back after their track (with what is left of their line-up), a DJ without a track is passed over. Rules that
 * may drop a track later (length, replay delay) and skips of absent DJs are not simulated.
 */
export function projectUpcoming(
  current: DjEntry | null,
  waiting: readonly DjEntry[],
  isPresent: (accountId: string) => boolean,
  max: number,
): UpcomingStep[] {
  const ring = [...waiting, ...(current ? [current] : [])].map((entry) => ({ entry, next: 0 }))
  const steps: UpcomingStep[] = []
  while (steps.length < max && ring.length > 0) {
    const slot = ring.shift()
    if (!slot) break
    const track = slot.entry.lineup[slot.next]
    if (!track) continue
    steps.push({ entry: slot.entry, track, position: steps.length + 1, away: !isPresent(slot.entry.accountId) })
    slot.next += 1
    ring.push(slot)
  }
  return steps
}

/**
 * The DJ on the decks and the DJs waiting for their turn. Pure bookkeeping: it knows nothing about timers, sockets
 * or the clock. The room tells it who is present and which tracks still fit its rules.
 */
export class DjBooth {
  /** On the decks right now (their track plays, or just played). */
  current: DjEntry | null = null
  /** Waiting for their turn, the next one first. */
  waiting: DjEntry[] = []

  /** DJs in all, the one on the decks included. */
  get size(): number {
    return this.waiting.length + (this.current ? 1 : 0)
  }

  find(accountId: string): DjEntry | undefined {
    if (this.current?.accountId === accountId) return this.current
    return this.waiting.find((entry) => entry.accountId === accountId)
  }

  /** Is this video lined up by anyone, the DJ on the decks included? */
  hasVideo(videoId: string): boolean {
    const everyone = this.current ? [this.current, ...this.waiting] : this.waiting
    return everyone.some((entry) => entry.lineup.some((track) => track.videoId === videoId))
  }

  /** Puts someone at the end of the queue. An account has one place only: asking again gives the one it has. */
  join(who: { accountId: string; pseudo: string; avatarId: AvatarId }): DjEntry {
    const existing = this.find(who.accountId)
    if (existing) return existing
    const entry: DjEntry = { id: randomUUID(), ...who, lineup: [], misses: 0 }
    this.waiting.push(entry)
    return entry
  }

  /** Takes a place out of the queue, wherever it is. */
  remove(entry: DjEntry): void {
    if (this.current === entry) this.current = null
    else this.waiting = this.waiting.filter((candidate) => candidate !== entry)
  }

  /** The DJ who was on the decks goes to the back of the queue, as when their track ends. */
  endCurrent(): void {
    if (!this.current) return
    this.waiting.push(this.current)
    this.current = null
  }

  /**
   * The turn changes (a track ended or was skipped). The DJ who was on the decks goes to the back, then the queue is
   * walked once, from the front: a DJ who is away, or has nothing that can play, loses the turn and goes to the back
   * (or out, once it happened too often in a row); the first DJ with a playable track takes the decks.
   */
  nextTurn(context: TurnContext): Turn {
    const justPlayed = this.current
    this.endCurrent()
    const events: TurnEvent[] = []

    for (let turns = this.waiting.length; turns > 0; turns -= 1) {
      const entry = this.waiting.shift()
      if (!entry) break
      const track = context.isPresent(entry.accountId) ? this.takePlayable(entry, context, events) : null
      if (track) {
        entry.misses = 0
        this.current = entry
        return { play: { entry, track }, events }
      }

      // The DJ who has just played has not missed a turn: theirs has not come round yet. They wait at the back, and the
      // two turns they may miss are the next two (so a DJ whose last track just ended has time to line another up).
      if (entry === justPlayed) {
        this.waiting.push(entry)
        continue
      }

      entry.misses += 1
      if (entry.misses >= MAX_MISSES) {
        events.push({ kind: 'removed', accountId: entry.accountId })
      } else {
        events.push({ kind: 'skipped', accountId: entry.accountId })
        this.waiting.push(entry)
      }
    }
    return { play: null, events }
  }

  /**
   * Nobody is on the decks (the room's own selection plays) and a DJ has something to play: the first present DJ in
   * line with a playable track takes the decks at once. Nobody is penalised and the order does not change: this is
   * not a turn that passed, only a DJ who arrived.
   */
  takeOver(context: TurnContext): Turn {
    const events: TurnEvent[] = []
    if (this.current) return { play: null, events }

    for (let index = 0; index < this.waiting.length; index += 1) {
      const entry = this.waiting[index]
      if (!context.isPresent(entry.accountId)) continue
      const track = this.takePlayable(entry, context, events)
      if (!track) continue
      this.waiting.splice(index, 1)
      entry.misses = 0
      this.current = entry
      return { play: { entry, track }, events }
    }
    return { play: null, events }
  }

  /** The first track of the line-up that can play. Tracks that cannot are dropped on the way (and reported). */
  private takePlayable(entry: DjEntry, context: TurnContext, events: TurnEvent[]): QueuedTrack | null {
    for (let track = entry.lineup.shift(); track; track = entry.lineup.shift()) {
      const reason = context.refusal(track)
      if (!reason) return track
      events.push({ kind: 'dropped', accountId: entry.accountId, title: track.title, reason })
    }
    return null
  }
}
