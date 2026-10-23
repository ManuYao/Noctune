import {
  SKIP_PROTECTED_SEC,
  type MyReactions,
  type Participant,
  type ReactResult,
  type Reactions,
  type Track,
} from '../../shared/protocol'
import { pseudoKey } from '../../shared/validation'
import { TEST_TRACKS } from './catalog'
import { ChatLog } from './ChatLog'
import { MinInterval } from './MinInterval'

// One person changing a reaction (like, vote) more than a few times a second is a bug or a flood.
const REACTION_MIN_INTERVAL_MS = 300
// However fast people click, a room is told about it at most four times a second.
const REACTIONS_BROADCAST_MS = 250

/** Votes needed to skip a track: strictly more than half of the people who can vote. */
export function skipVotesRequired(voters: number): number {
  return Math.floor(voters / 2) + 1
}

export interface RoomEvents {
  onTrackChange: (track: Track | null, reactions: Reactions) => void
  onReactionsChange: (reactions: Reactions) => void
}

export interface RoomOptions {
  /** Seconds at the start of a track during which nobody can vote to skip it. */
  skipProtectedSec?: number
}

/** In-memory state of one room. The server is the only source of truth. */
export class Room {
  private participants = new Map<string, Participant>()
  /** Which account is behind each member (participant id -> account id). Kept here, never sent to the clients. */
  private accountOf = new Map<string, string>()
  private trackIndex = 0
  private timer: NodeJS.Timeout | undefined
  private likes = new Set<string>()
  private skipVotes = new Set<string>()
  private reactionLimit = new MinInterval(REACTION_MIN_INTERVAL_MS)
  private reactionsTimer: NodeJS.Timeout | undefined
  private readonly skipProtectedSec: number
  nowPlaying: Track | null = null
  readonly chat = new ChatLog()

  constructor(
    readonly id: string,
    readonly name: string,
    private events: RoomEvents,
    options: RoomOptions = {},
  ) {
    this.skipProtectedSec = options.skipProtectedSec ?? SKIP_PROTECTED_SEC
  }

  get size() {
    return this.participants.size
  }

  list(): Participant[] {
    return [...this.participants.values()]
  }

  get(participantId: string): Participant | undefined {
    return this.participants.get(participantId)
  }

  isPseudoTaken(pseudo: string): boolean {
    const wanted = pseudoKey(pseudo)
    return this.list().some((participant) => pseudoKey(participant.pseudo) === wanted)
  }

  /** Is this account already here (another tab, another device)? A member is in a room once. */
  hasAccount(accountId: string): boolean {
    return [...this.accountOf.values()].includes(accountId)
  }

  add(participant: Participant, accountId?: string) {
    this.participants.set(participant.id, participant)
    if (accountId) this.accountOf.set(participant.id, accountId)
    if (this.participants.size === 1) this.startTrack()
    else this.scheduleReactionsBroadcast() // one more voter: the number of votes needed may have changed
  }

  /** Returns true when the participant was actually in the room. */
  remove(participantId: string): boolean {
    const removed = this.participants.delete(participantId)
    if (removed) {
      this.accountOf.delete(participantId)
      this.chat.forget(participantId)
      this.reactionLimit.forget(participantId)
      // A vote counts only while its author is here. Likes stay: they are about the track, not the audience.
      this.skipVotes.delete(participantId)
      if (this.participants.size === 0) {
        this.stopPlayback()
        // Nobody left to read it: the chat history is not kept for the next visitor.
        this.chat.clear()
      } else if (!this.skipIfMajority()) {
        this.scheduleReactionsBroadcast()
      }
    }
    return removed
  }

  reactions(): Reactions {
    return {
      likes: this.likes.size,
      skipVotes: this.skipVotes.size,
      skipRequired: skipVotesRequired(this.voterCount()),
    }
  }

  mine(participantId: string): MyReactions {
    return { liked: this.likes.has(participantId), votedSkip: this.skipVotes.has(participantId) }
  }

  /** Sets (true) or takes back (false) a like. Setting the same value twice changes nothing. */
  like(participantId: string, value: boolean, now = Date.now()): ReactResult {
    const gate = this.gate(participantId, now)
    if (!gate.ok) return gate
    if (value) this.likes.add(participantId)
    else this.likes.delete(participantId)
    this.reactionLimit.record(participantId, now)
    this.scheduleReactionsBroadcast()
    return { ok: true }
  }

  /** Sets or takes back a vote to skip. The track changes as soon as more than half of the room agrees. */
  voteSkip(participantId: string, value: boolean, now = Date.now()): ReactResult {
    const gate = this.gate(participantId, now)
    if (!gate.ok) return gate

    if (value) {
      const opensAt = gate.track.startedAt + this.skipProtectedSec * 1000
      if (now < opensAt) return { ok: false, error: 'too-early', retryAfterMs: opensAt - now }
      this.skipVotes.add(participantId)
    } else {
      this.skipVotes.delete(participantId)
    }
    this.reactionLimit.record(participantId, now)
    if (!this.skipIfMajority()) this.scheduleReactionsBroadcast()
    return { ok: true }
  }

  /** Everyone present can vote today. Once DJs exist, the one on the decks will be left out. */
  private voterCount(): number {
    return this.participants.size
  }

  /** A refused reaction does not use up the participant's turn. */
  private gate(participantId: string, now: number): { ok: true; track: Track } | Exclude<ReactResult, { ok: true }> {
    if (!this.participants.has(participantId)) return { ok: false, error: 'not-in-room' }
    if (!this.nowPlaying) return { ok: false, error: 'no-track' }
    const wait = this.reactionLimit.waitTime(participantId, now)
    if (wait > 0) return { ok: false, error: 'rate-limited', retryAfterMs: wait }
    return { ok: true, track: this.nowPlaying }
  }

  private skipIfMajority(): boolean {
    if (this.skipVotes.size === 0 || this.skipVotes.size < skipVotesRequired(this.voterCount())) return false
    clearTimeout(this.timer)
    this.startTrack()
    return true
  }

  private scheduleReactionsBroadcast() {
    if (this.reactionsTimer) return
    this.reactionsTimer = setTimeout(() => {
      this.reactionsTimer = undefined
      this.events.onReactionsChange(this.reactions())
    }, REACTIONS_BROADCAST_MS)
  }

  private resetReactions() {
    this.likes.clear()
    this.skipVotes.clear()
    // An update about the previous track must not reach the room after the new one started.
    clearTimeout(this.reactionsTimer)
    this.reactionsTimer = undefined
  }

  private startTrack() {
    const next = TEST_TRACKS[this.trackIndex % TEST_TRACKS.length]
    this.trackIndex += 1
    this.nowPlaying = { ...next, startedAt: Date.now() }
    this.resetReactions()
    this.events.onTrackChange(this.nowPlaying, this.reactions())
    this.timer = setTimeout(() => this.startTrack(), next.durationSec * 1000)
  }

  private stopPlayback() {
    clearTimeout(this.timer)
    this.timer = undefined
    this.nowPlaying = null
    this.resetReactions()
  }
}
