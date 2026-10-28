import { randomUUID } from 'node:crypto'
import type { AvatarId, DjNotice, QueuedTrack } from '../../shared/protocol'

/** Why a track of a line-up can no longer play when its turn comes. */
export type DropReason = Extract<DjNotice, { kind: 'track-dropped' }>['reason']

/**
 * One DJ's place in the queue. A DJ is somebody with a track on the decks or lined up: a place that waits always holds
 * at least one track, and the one on the decks leaves when their last track ends.
 */
export interface DjEntry {
  /** Public id of the place: stays the same while the DJ keeps it. */
  readonly id: string
  /** Whose place it is. Never sent to the clients. */
  readonly accountId: string
  pseudo: string
  avatarId: AvatarId
  /** The tracks they will play, in order. Each one leaves the line-up when it starts. */
  lineup: QueuedTrack[]
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
  /** Every track of their line-up was dropped: they have nothing to play and lose their place. */
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
}

/**
 * The order the line-ups will play in if nothing changes, following the rotation of the booth: the DJ on the decks goes
 * to the back after their track (with what is left of their line-up). A DJ who is away is passed over, as the booth does
 * at their turn, so what is listed is what will really play. Rules that may drop a track later (length, replay delay)
 * are not simulated.
 */
export function projectUpcoming(
  current: DjEntry | null,
  waiting: readonly DjEntry[],
  isPresent: (accountId: string) => boolean,
  max: number,
): UpcomingStep[] {
  const ring = [...waiting, ...(current ? [current] : [])]
    .filter((entry) => isPresent(entry.accountId))
    .map((entry) => ({ entry, next: 0 }))
  const steps: UpcomingStep[] = []
  while (steps.length < max && ring.length > 0) {
    const slot = ring.shift()
    if (!slot) break
    const track = slot.entry.lineup[slot.next]
    if (!track) continue
    steps.push({ entry: slot.entry, track, position: steps.length + 1 })
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
  /** Waiting for their turn, the next one first. Each one has a track lined up. */
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

  /**
   * Puts someone at the end of the queue. An account has one place only: asking again gives the one it has. The caller
   * lines a track up at once: a place with nothing in it does not wait.
   */
  join(who: { accountId: string; pseudo: string; avatarId: AvatarId }): DjEntry {
    const existing = this.find(who.accountId)
    if (existing) return existing
    const entry: DjEntry = { id: randomUUID(), ...who, lineup: [] }
    this.waiting.push(entry)
    return entry
  }

  /** Takes a place out of the queue, wherever it is. */
  remove(entry: DjEntry): void {
    if (this.current === entry) this.current = null
    else this.waiting = this.waiting.filter((candidate) => candidate !== entry)
  }

  /**
   * The DJ who was on the decks leaves them: to the back of the queue when they have tracks left, out of it when their
   * last one has just played.
   */
  endCurrent(): void {
    const entry = this.current
    if (!entry) return
    this.current = null
    if (entry.lineup.length > 0) this.waiting.push(entry)
  }

  /**
   * The turn changes (a track ended or was skipped). The DJ who was on the decks goes to the back (or out), then the
   * queue is walked once from the front: see `takeFirstPlayable`.
   */
  nextTurn(context: TurnContext): Turn {
    this.endCurrent()
    const events: TurnEvent[] = []
    return { play: this.takeFirstPlayable(context, events), events }
  }

  /**
   * Nobody is on the decks (the room's own selection plays) and a DJ has something to play: the first present DJ in
   * line with a playable track takes the decks at once. The order does not change: this is not a turn that passed, only
   * a DJ who arrived.
   */
  takeOver(context: TurnContext): Turn {
    const events: TurnEvent[] = []
    if (this.current) return { play: null, events }
    return { play: this.takeFirstPlayable(context, events), events }
  }

  /**
   * Walks the queue once, from the front. A DJ who is away is passed over and keeps their place (the others play first,
   * nobody is penalised: the room puts them out after a few minutes). A present DJ whose every track is dropped has
   * nothing left and leaves the queue. The first present DJ with a track that can play takes the decks.
   */
  private takeFirstPlayable(context: TurnContext, events: TurnEvent[]): Turn['play'] {
    for (let index = 0; index < this.waiting.length; ) {
      const entry = this.waiting[index]
      if (!context.isPresent(entry.accountId)) {
        index += 1
        continue
      }
      const track = this.takePlayable(entry, context, events)
      this.waiting.splice(index, 1)
      if (track) {
        this.current = entry
        return { entry, track }
      }
      events.push({ kind: 'removed', accountId: entry.accountId })
    }
    return null
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
