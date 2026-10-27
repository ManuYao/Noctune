import { randomUUID } from 'node:crypto'
import {
  LINEUP_MAX,
  OWN_SKIP_MIN_SEC,
  SKIP_PROTECTED_SEC,
  type AddTrackResult,
  type DjFailure,
  type DjNotice,
  type DjQueue,
  type DjQueueEntry,
  type DjResult,
  type MyReactions,
  type Participant,
  type QueuedTrack,
  type ReactResult,
  type Reactions,
  type RoomRules,
  type Track,
  type TrackStatus,
  type VideoInfo,
} from '../../shared/protocol'
import { pseudoKey } from '../../shared/validation'
import type { RoomActivity } from './activity/ActivityRecorder'
import { TEST_TRACKS } from './catalog'
import { ChatLog } from './ChatLog'
import { DjBooth, type DjEntry, type DropReason, type TurnContext, type TurnEvent } from './DjBooth'
import { MinInterval } from './MinInterval'
import { Moderation, type ModerationOptions } from './moderation/Moderation'

// One person changing a reaction (like, vote) more than a few times a second is a bug or a flood.
const REACTION_MIN_INTERVAL_MS = 300
// However fast people click, a room is told about it at most four times a second.
const REACTIONS_BROADCAST_MS = 250
// Same for the queue: however many DJs come, go and line tracks up, the room hears of it a few times a second at most.
const QUEUE_BROADCAST_MS = 250
// Plays a room remembers, so that one that lives for months does not grow without end. (A room that never lets a
// track repeat forgets the oldest ones past this: a bound on memory, not a rule.)
const HISTORY_MAX = 1000
// A video longer than this is not a track. Also keeps the timer far from the largest delay a timer accepts.
const TRACK_MAX_SEC = 24 * 60 * 60
const VIDEO_ID = /^[\w-]{11}$/
// A track that did not play this long does not count as played: the room emptied right after it started, or it was cut at
// once. (Somebody who opens a room and leaves again must not use up the room's own selection, nor make a DJ's track
// "played recently" when nobody heard it.)
const MIN_HEARD_MS = 10 * 1000

/** What a room asks of its DJs when nobody has chosen: no limit on length, a track waits an hour to repeat. */
export const DEFAULT_RULES: RoomRules = Object.freeze({ maxTrackSec: null, repeatDelaySec: 60 * 60, maxDjs: 10 })

/** Votes needed to skip a track: strictly more than half of the people who can vote. */
export function skipVotesRequired(voters: number): number {
  return Math.floor(voters / 2) + 1
}

export interface RoomEvents {
  /** A new track started, or the room emptied (null). Likes and votes are back to zero and the queue has moved on. */
  onTrackChange: (track: Track | null, reactions: Reactions, queue: DjQueue) => void
  onReactionsChange: (reactions: Reactions) => void
  /** The queue changed without a new track: someone joined, left, came back, lined a track up. */
  onQueueChange: (queue: DjQueue) => void
  /** One participant's own line-up changed. */
  onLineupChange: (participantId: string, lineup: QueuedTrack[]) => void
  /** Something to tell one participant, and nobody else. */
  onNotice: (participantId: string, notice: DjNotice) => void
}

export interface RoomOptions {
  /** Seconds at the start of a track during which nobody can vote to skip it. */
  skipProtectedSec?: number
  /** Seconds at the start of a track during which its own DJ cannot skip it either. */
  ownSkipMinSec?: number
  /** What the room asks of the tracks its DJs bring. */
  rules?: RoomRules
  /** How long changes to the queue are gathered before the room hears of them (tests make it short). */
  queueBroadcastMs?: number
  /** Lengths of the sanctions and limits of the reports (tests shorten them). */
  moderation?: ModerationOptions
  /** Counts what members do in the room (profile and badges). Never changes the room: see RoomActivity. */
  activity?: RoomActivity
}

type Refusal = { reason: 'too-long'; maxSec: number } | { reason: 'recently-played'; retryAfterSec: number | null }

/** In-memory state of one room. The server is the only source of truth. */
export class Room {
  private participants = new Map<string, Participant>()
  /** Which account is behind each member (participant id -> account id). Kept here, never sent to the clients. */
  private accountOf = new Map<string, string>()
  /** The other way round: which participant an account is right now. A member is in a room once. */
  private participantOf = new Map<string, string>()
  /** What each participant's sanctions stick to (account or hashed address): see SanctionKeys. Never sent anywhere. */
  private sanctionKeys = new Map<string, string>()
  private readonly booth = new DjBooth()
  /** When each video last started in this room (house selection included). Insertion order is time order. */
  private playedAt = new Map<string, number>()
  /** The play that is in the memory but that nobody may have heard yet, and what the memory held for it before. */
  private lastPlay: { videoId: string; startedAt: number; durationSec: number; before: number | undefined; djAccountId?: string } | null = null
  /** The account of the DJ whose track plays; undefined for the room's own selection. */
  private currentDj: string | undefined
  /** Accounts whose like counts for this track (once each, whichever connection they like from) and the likes it earned the DJ. */
  private likeAccounts = new Set<string>()
  private earnedLikes = 0
  private trackIndex = 0
  private timer: NodeJS.Timeout | undefined
  private likes = new Set<string>()
  private skipVotes = new Set<string>()
  private reactionLimit = new MinInterval(REACTION_MIN_INTERVAL_MS)
  private reactionsTimer: NodeJS.Timeout | undefined
  private queueTimer: NodeJS.Timeout | undefined
  private readonly skipProtectedSec: number
  private readonly ownSkipMinSec: number
  private readonly queueBroadcastMs: number
  private readonly activity: RoomActivity | undefined
  /** What the room asks of its DJs. The host may change it while the room lives: see setRules. */
  rules: RoomRules
  /** Set once the room is deleted: nobody can come in any more, and nothing is left running. */
  private closed = false
  nowPlaying: Track | null = null
  readonly chat = new ChatLog()
  /** Sanctions, reports and their allowances. Memory only; the host's inbox, and what keeps somebody out or silent. */
  readonly moderation: Moderation

  constructor(
    readonly id: string,
    /** The host may rename the room while it lives. */
    public name: string,
    private events: RoomEvents,
    options: RoomOptions = {},
  ) {
    this.skipProtectedSec = options.skipProtectedSec ?? SKIP_PROTECTED_SEC
    this.ownSkipMinSec = options.ownSkipMinSec ?? OWN_SKIP_MIN_SEC
    this.queueBroadcastMs = options.queueBroadcastMs ?? QUEUE_BROADCAST_MS
    this.rules = options.rules ?? DEFAULT_RULES
    this.moderation = new Moderation(options.moderation)
    this.activity = options.activity
  }

  get size() {
    return this.participants.size
  }

  /** DJs in the queue, the one on the decks included. */
  get djCount() {
    return this.booth.size
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
    return this.participantOf.has(accountId)
  }

  /** Is the room gone (deleted by its host)? Nobody can come in, and no timer is left. */
  get isClosed() {
    return this.closed
  }

  /**
   * The host changed the rules. They count from now on: what is lined up is judged by them when it is about to play, and a
   * queue that is longer than the new limit loses nobody, it only takes nobody new.
   */
  setRules(rules: RoomRules) {
    this.rules = rules
  }

  /**
   * The room is deleted: everybody is out (the connections are taken out by the caller), playback stops, every timer is
   * cleared, and it cannot be joined again.
   */
  close() {
    if (this.closed) return
    this.closed = true
    for (const [participantId, accountId] of this.accountOf) this.activity?.left(accountId, participantId)
    this.participants.clear()
    this.accountOf.clear()
    this.participantOf.clear()
    this.sanctionKeys.clear()
    this.chat.clear()
    this.moderation.clear()
    this.stopPlayback()
    clearTimeout(this.reactionsTimer)
    this.reactionsTimer = undefined
    clearTimeout(this.queueTimer)
    this.queueTimer = undefined
  }

  /** The account behind a participant, or undefined for a visitor. For the server's own use: never sent to a client. */
  accountIdOf(participantId: string): string | undefined {
    return this.accountOf.get(participantId)
  }

  /** The participant an account is in this room, if it is here. */
  participantIdOf(accountId: string): string | undefined {
    return this.participantOf.get(accountId)
  }

  /** What this participant's sanctions stick to (set when they came in). */
  sanctionKeyOf(participantId: string): string | undefined {
    return this.sanctionKeys.get(participantId)
  }

  add(participant: Participant, accountId?: string, sanctionKey?: string) {
    // A join that was waiting for the database while the host deleted the room must not bring it back to life.
    if (this.closed) throw new Error('room closed')
    this.participants.set(participant.id, participant)
    if (sanctionKey) this.sanctionKeys.set(participant.id, sanctionKey)
    let place: DjEntry | undefined
    if (accountId) {
      this.accountOf.set(participant.id, accountId)
      this.participantOf.set(accountId, participant.id)
      this.activity?.entered(accountId, participant.id)
      place = this.booth.find(accountId)
      if (place) {
        // A DJ who comes back keeps their place, under the name their account has now.
        place.pseudo = participant.pseudo
        place.avatarId = participant.avatarId
      }
    }

    if (this.participants.size === 1) {
      this.advance()
    } else {
      this.scheduleReactionsBroadcast() // one more voter: the number of votes needed may have changed
      if (place) {
        this.scheduleQueueBroadcast() // the DJ is no longer away
        this.takeOverFromHouse()
      }
    }
  }

  /** Returns true when the participant was actually in the room. */
  remove(participantId: string): boolean {
    const removed = this.participants.delete(participantId)
    if (removed) {
      const accountId = this.accountOf.get(participantId)
      this.accountOf.delete(participantId)
      if (accountId) this.activity?.left(accountId, participantId)
      if (accountId && this.participantOf.get(accountId) === participantId) this.participantOf.delete(accountId)
      this.sanctionKeys.delete(participantId)
      this.chat.forget(participantId)
      this.reactionLimit.forget(participantId)
      // A vote counts only while its author is here. Likes stay: they are about the track, not the audience.
      this.skipVotes.delete(participantId)
      if (this.participants.size === 0) {
        this.stopPlayback()
        // Nobody left to read it: the chat history and the reports are not kept for the next visitor.
        this.chat.clear()
        this.moderation.clearReports()
      } else {
        // A DJ who leaves keeps their place and their track plays on: they are only away now.
        if (accountId && this.booth.find(accountId)) this.scheduleQueueBroadcast()
        if (!this.skipIfMajority()) this.scheduleReactionsBroadcast()
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
    // A refused like does not use up the turn either.
    if (this.isOnDecks(participantId)) return { ok: false, error: 'own-track' }
    const had = this.likes.has(participantId)
    if (value) this.likes.add(participantId)
    else this.likes.delete(participantId)
    this.countLike(participantId, value, had)
    this.reactionLimit.record(participantId, now)
    this.scheduleReactionsBroadcast()
    return { ok: true }
  }

  /**
   * A like, for counting: once per person and track, a person being an account for a member (so a member who comes back
   * under another connection cannot like the same track twice) and a connection for a visitor. A visitor's like still
   * counts for the DJ; only a member's counts as given.
   */
  private countLike(participantId: string, value: boolean, had: boolean) {
    if (!this.activity) return
    const likerAccountId = this.accountOf.get(participantId)
    let change: 1 | -1 | 0 = 0
    if (likerAccountId) {
      if (value && !this.likeAccounts.has(likerAccountId)) change = 1
      else if (!value && this.likeAccounts.has(likerAccountId)) change = -1
      if (change === 1) this.likeAccounts.add(likerAccountId)
      if (change === -1) this.likeAccounts.delete(likerAccountId)
    } else {
      change = value && !had ? 1 : !value && had ? -1 : 0
    }
    if (change === 0) return
    this.earnedLikes = Math.max(0, this.earnedLikes + change)
    this.activity.likeChanged({ djAccountId: this.currentDj, likerAccountId, delta: change, trackLikes: this.earnedLikes })
  }

  /** An accepted chat message, for counting (members only). */
  recordMessage(participantId: string) {
    const accountId = this.accountOf.get(participantId)
    if (accountId) this.activity?.messageSent(accountId)
  }

  /**
   * Sets or takes back a vote to skip. The track changes as soon as more than half of the room agrees.
   * The DJ on the decks skipping their own track needs no vote: it changes at once.
   */
  voteSkip(participantId: string, value: boolean, now = Date.now()): ReactResult {
    const gate = this.gate(participantId, now)
    if (!gate.ok) return gate

    if (this.isOnDecks(participantId)) {
      if (value) {
        // Not a vote, but not at once either: a DJ who could change tracks as fast as they like would make every
        // listener's player reload over and over, and nobody else can stop them (the DJ is not a voter).
        const opensAt = gate.track.startedAt + this.ownSkipMinSec * 1000
        if (now < opensAt) return { ok: false, error: 'too-early', retryAfterMs: opensAt - now }
      }
      this.reactionLimit.record(participantId, now)
      // The decks go to the next DJ in line: the one who skipped goes to the back, as when a track ends.
      if (value) this.advance()
      return { ok: true }
    }

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

  // ---- DJs

  /** The queue as everybody sees it. */
  queueView(): DjQueue {
    return {
      current: this.booth.current ? this.entryView(this.booth.current) : null,
      waiting: this.booth.waiting.map((entry) => this.entryView(entry)),
    }
  }

  /** The tracks this participant will play, in order. Empty for a visitor or someone not in the queue. */
  lineupOf(participantId: string): QueuedTrack[] {
    const accountId = this.accountOf.get(participantId)
    const place = accountId ? this.booth.find(accountId) : undefined
    return place ? [...place.lineup] : []
  }

  /** First check of a DJ request: the participant is in the room, and has an account. */
  memberError(participantId: string): DjFailure | null {
    const who = this.member(participantId)
    return who.ok ? null : who
  }

  /**
   * Refusals that need no look at YouTube: the queue is full (and the member is not in it) or their line-up is.
   * Asked before the network is used, so that a request that cannot succeed costs no quota.
   */
  placeError(participantId: string): DjFailure | null {
    const who = this.member(participantId)
    if (!who.ok) return who
    const place = this.booth.find(who.accountId)
    if (!place && this.booth.size >= this.rules.maxDjs) return { ok: false, error: 'queue-full' }
    if (place && place.lineup.length >= LINEUP_MAX) return { ok: false, error: 'lineup-full' }
    return null
  }

  /**
   * Lines a video up for the member's turns, and puts them in the queue if they are not. Everything is checked again
   * here, at the moment of the change: the room moved on while YouTube was being asked.
   */
  addTrack(participantId: string, video: VideoInfo, now = Date.now()): AddTrackResult {
    const refused = this.placeError(participantId)
    if (refused) return refused
    const who = this.member(participantId)
    if (!who.ok) return who

    // The resolver is trusted to check what it hands over, but a room does not take on trust what would break its
    // timer (a duration that is not a sensible whole number of seconds would fire at once, over and over) or the
    // player (a video id that is not one).
    if (
      !VIDEO_ID.test(video.videoId) ||
      typeof video.title !== 'string' ||
      typeof video.artist !== 'string' ||
      !Number.isInteger(video.durationSec) ||
      video.durationSec < 1 ||
      video.durationSec > TRACK_MAX_SEC
    ) {
      return { ok: false, error: 'unavailable' }
    }
    const refusal = this.refusal(video, now)
    if (refusal?.reason === 'too-long') return { ok: false, error: 'too-long', maxSec: refusal.maxSec }
    if (refusal) return { ok: false, error: 'recently-played', retryAfterSec: refusal.retryAfterSec }
    if (this.nowPlaying?.videoId === video.videoId || this.booth.hasVideo(video.videoId)) {
      return { ok: false, error: 'already-queued' }
    }

    const place =
      this.booth.find(who.accountId) ??
      this.booth.join({ accountId: who.accountId, pseudo: who.participant.pseudo, avatarId: who.participant.avatarId })
    const track: QueuedTrack = {
      id: randomUUID(),
      videoId: video.videoId,
      title: video.title,
      artist: video.artist,
      durationSec: video.durationSec,
    }
    place.lineup.push(track)
    this.sendLineup(who.accountId)
    this.scheduleQueueBroadcast()
    this.takeOverFromHouse()
    return { ok: true, track }
  }

  /**
   * Would this room take this video now? The same checks, in the same order, as `addTrack` makes, without changing
   * anything: for showing a member their playlist with the room's verdict on each track.
   */
  statusOf(video: { videoId: string; durationSec: number }, now = Date.now()): TrackStatus {
    const refusal = this.refusal(video, now)
    if (refusal?.reason === 'too-long') return { state: 'too-long', maxSec: refusal.maxSec }
    if (refusal) return { state: 'recently-played', retryAfterSec: refusal.retryAfterSec }
    if (this.nowPlaying?.videoId === video.videoId || this.booth.hasVideo(video.videoId)) return { state: 'queued' }
    return { state: 'ok' }
  }

  /** Takes one track out of the member's own line-up. */
  removeTrack(participantId: string, trackId: string): DjResult {
    const who = this.member(participantId)
    if (!who.ok) return who
    const place = this.booth.find(who.accountId)
    if (!place) return { ok: false, error: 'not-in-queue' }
    const index = place.lineup.findIndex((track) => track.id === trackId)
    if (index === -1) return { ok: false, error: 'no-such-track' }
    place.lineup.splice(index, 1)
    this.sendLineup(who.accountId)
    if (index === 0) this.scheduleQueueBroadcast() // the queue shows the first track of each line-up
    return { ok: true }
  }

  /**
   * A DJ's queued track as the queue shows it, for a report to point at: the place by its public id, and the track either
   * in the line-up or the one that plays now. Null when either is not there.
   */
  queuedTrack(entryId: string, trackId: string): { pseudo: string; title: string; accountId: string } | null {
    const entry = this.entryById(entryId)
    if (!entry) return null
    const playing = this.booth.current === entry && this.nowPlaying?.id === trackId ? this.nowPlaying : null
    const track = playing ?? entry.lineup.find((candidate) => candidate.id === trackId)
    return track ? { pseudo: entry.pseudo, title: track.title, accountId: entry.accountId } : null
  }

  /**
   * The host takes a track out of a DJ's line-up; the one that plays is cut and the turn passes on. The caller has
   * checked that the asker is the host: this only finds the track. Returns whose it was, to tell them.
   */
  removeQueuedTrack(entryId: string, trackId: string): { ok: true; title: string; accountId: string } | { ok: false; error: 'no-such-track' } {
    const entry = this.entryById(entryId)
    if (!entry) return { ok: false, error: 'no-such-track' }
    if (this.booth.current === entry && this.nowPlaying?.id === trackId) {
      const title = this.nowPlaying.title
      this.advance()
      return { ok: true, title, accountId: entry.accountId }
    }
    const index = entry.lineup.findIndex((track) => track.id === trackId)
    if (index === -1) return { ok: false, error: 'no-such-track' }
    const [track] = entry.lineup.splice(index, 1)
    this.sendLineup(entry.accountId)
    if (index === 0) this.scheduleQueueBroadcast() // the queue shows the first track of each line-up
    return { ok: true, title: track.title, accountId: entry.accountId }
  }

  private entryById(entryId: string): DjEntry | undefined {
    if (this.booth.current?.id === entryId) return this.booth.current
    return this.booth.waiting.find((entry) => entry.id === entryId)
  }

  /** Leaves the queue, line-up included. On the decks, that cuts the track that plays. */
  leaveQueue(participantId: string): DjResult {
    const who = this.member(participantId)
    if (!who.ok) return who
    const place = this.booth.find(who.accountId)
    if (!place) return { ok: false, error: 'not-in-queue' }
    const wasOnDecks = this.booth.current === place
    this.booth.remove(place)
    this.sendLineup(who.accountId)
    if (wasOnDecks) this.advance()
    else this.scheduleQueueBroadcast()
    return { ok: true }
  }

  /**
   * An account is gone for good: its place in the queue goes with it (on the decks, its track is cut), absent or not. The
   * connections of the account are closed by whoever calls this, which takes its participants out first.
   */
  forgetAccount(accountId: string): void {
    const place = this.booth.find(accountId)
    if (!place) return
    const wasOnDecks = this.booth.current === place
    this.booth.remove(place)
    // Nobody is left to hear it, in an empty room: nothing to start.
    if (wasOnDecks && this.participants.size > 0) this.advance()
    else this.scheduleQueueBroadcast()
  }

  private member(participantId: string): { ok: true; accountId: string; participant: Participant } | DjFailure {
    const participant = this.participants.get(participantId)
    if (!participant) return { ok: false, error: 'not-in-room' }
    const accountId = this.accountOf.get(participantId)
    if (!accountId) return { ok: false, error: 'members-only' }
    return { ok: true, accountId, participant }
  }

  private entryView(entry: DjEntry): DjQueueEntry {
    return {
      id: entry.id,
      pseudo: entry.pseudo,
      avatarId: entry.avatarId,
      participantId: this.participantOf.get(entry.accountId) ?? null,
      next: entry.lineup[0] ?? null,
    }
  }

  /** Is this participant the DJ whose track plays? Judged by account, so a DJ who came back is still the one. */
  private isOnDecks(participantId: string): boolean {
    const accountId = this.accountOf.get(participantId)
    return accountId !== undefined && this.booth.current?.accountId === accountId
  }

  /** Why a track may not play in this room right now, or null. Rules are checked at adding and again at playing. */
  private refusal(track: { videoId: string; durationSec: number }, now: number): Refusal | null {
    const { maxTrackSec, repeatDelaySec } = this.rules
    if (maxTrackSec !== null && track.durationSec > maxTrackSec) return { reason: 'too-long', maxSec: maxTrackSec }

    const last = this.playedAt.get(track.videoId)
    if (last === undefined) return null
    if (repeatDelaySec === null) return { reason: 'recently-played', retryAfterSec: null }
    const waitMs = last + repeatDelaySec * 1000 - now
    return waitMs > 0 ? { reason: 'recently-played', retryAfterSec: Math.ceil(waitMs / 1000) } : null
  }

  /**
   * The track that plays is ending, or is being cut. A play nobody had time to hear is taken back out of the memory,
   * which goes back to what it held before (a short track that played to its end was heard in full).
   */
  private settlePlay(now: number) {
    const play = this.lastPlay
    this.lastPlay = null
    if (!play) return
    if (now - play.startedAt >= Math.min(MIN_HEARD_MS, play.durationSec * 1000)) {
      // Heard: it counts as played, for the anti-doublon memory and for the DJ's profile, once.
      if (play.djAccountId) this.activity?.trackPlayed(play.djAccountId)
      return
    }
    if (this.playedAt.get(play.videoId) !== play.startedAt) return // a later play already took its place

    this.playedAt.delete(play.videoId)
    if (play.before !== undefined) {
      this.playedAt.set(play.videoId, play.before)
      // Put back at the end, with its old time: the map must stay in order of time.
      this.playedAt = new Map([...this.playedAt].sort((a, b) => a[1] - b[1]))
    }
  }

  private remember(videoId: string, at: number) {
    // Deleted first so that it goes to the end: the map stays in order of time, the oldest first.
    this.playedAt.delete(videoId)
    this.playedAt.set(videoId, at)
    const { repeatDelaySec } = this.rules
    for (const [oldest, playedAt] of this.playedAt) {
      const expired = repeatDelaySec !== null && at - playedAt >= repeatDelaySec * 1000
      if (!expired && this.playedAt.size <= HISTORY_MAX) break
      this.playedAt.delete(oldest)
    }
  }

  private turnContext(): TurnContext {
    const now = Date.now()
    return {
      isPresent: (accountId) => this.participantOf.has(accountId),
      refusal: (track): DropReason | null => this.refusal(track, now)?.reason ?? null,
    }
  }

  /** Tells the DJs what happened to their turn, and the room that the queue changed. */
  private tell(events: TurnEvent[]) {
    if (events.length === 0) return
    const touched = new Set<string>()
    for (const event of events) {
      const participantId = this.participantOf.get(event.accountId)
      if (!participantId) continue // away: nobody to tell, they will see the queue when they come back
      touched.add(event.accountId)
      if (event.kind === 'dropped') {
        this.events.onNotice(participantId, { kind: 'track-dropped', title: event.title, reason: event.reason })
      } else {
        this.events.onNotice(participantId, { kind: event.kind })
      }
    }
    for (const accountId of touched) this.sendLineup(accountId)
    this.scheduleQueueBroadcast()
  }

  private sendLineup(accountId: string) {
    const participantId = this.participantOf.get(accountId)
    if (!participantId) return
    const place = this.booth.find(accountId)
    this.events.onLineupChange(participantId, place ? [...place.lineup] : [])
  }

  /** The voters are everybody here except the DJ on the decks: their own track is not theirs to judge. */
  private voterCount(): number {
    const current = this.booth.current
    const djIsHere = current !== null && this.participantOf.has(current.accountId)
    return this.participants.size - (djIsHere ? 1 : 0)
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
    this.advance()
    return true
  }

  private scheduleReactionsBroadcast() {
    if (this.reactionsTimer) return
    this.reactionsTimer = setTimeout(() => {
      this.reactionsTimer = undefined
      this.events.onReactionsChange(this.reactions())
    }, REACTIONS_BROADCAST_MS)
  }

  /** The room is told the queue as it is when the message goes out, once for any number of changes before it. */
  private scheduleQueueBroadcast() {
    if (this.queueTimer) return
    this.queueTimer = setTimeout(() => {
      this.queueTimer = undefined
      this.events.onQueueChange(this.queueView())
    }, this.queueBroadcastMs)
  }

  private resetReactions() {
    this.likes.clear()
    this.likeAccounts.clear()
    this.earnedLikes = 0
    this.skipVotes.clear()
    // An update about the previous track must not reach the room after the new one started.
    clearTimeout(this.reactionsTimer)
    this.reactionsTimer = undefined
  }

  /** The turn changes: the next DJ's track starts, or the room's own selection when no DJ can play. */
  private advance() {
    this.settlePlay(Date.now())
    clearTimeout(this.timer)
    const turn = this.booth.nextTurn(this.turnContext())
    this.tell(turn.events)
    if (turn.play) this.start(turn.play.track, turn.play.entry.accountId)
    else this.startHouse()
  }

  /**
   * The room's own selection is playing and a DJ has just become able to play (lined a track up, came back): their
   * track takes over at once instead of waiting for the end of a track nobody chose.
   */
  private takeOverFromHouse() {
    // Nothing plays (the room just emptied), or a DJ is on the decks already.
    if (!this.nowPlaying || this.booth.current) return
    const turn = this.booth.takeOver(this.turnContext())
    this.tell(turn.events)
    // Nobody can take over: the room's selection plays on, untouched.
    if (!turn.play) return
    this.settlePlay(Date.now())
    clearTimeout(this.timer)
    this.start(turn.play.track, turn.play.entry.accountId)
  }

  private startHouse() {
    const next = TEST_TRACKS[this.trackIndex % TEST_TRACKS.length]
    this.trackIndex += 1
    this.start(next)
  }

  private start(track: QueuedTrack, djAccountId?: string) {
    const startedAt = Date.now()
    this.nowPlaying = { ...track, startedAt }
    this.lastPlay = { videoId: track.videoId, startedAt, durationSec: track.durationSec, before: this.playedAt.get(track.videoId), djAccountId }
    this.currentDj = djAccountId
    this.remember(track.videoId, startedAt)
    this.resetReactions()
    // The queue goes out with the track.
    clearTimeout(this.queueTimer)
    this.queueTimer = undefined
    this.events.onTrackChange(this.nowPlaying, this.reactions(), this.queueView())
    if (djAccountId) this.sendLineup(djAccountId)
    this.timer = setTimeout(() => this.advance(), track.durationSec * 1000)
  }

  private stopPlayback() {
    this.settlePlay(Date.now())
    clearTimeout(this.timer)
    this.timer = undefined
    clearTimeout(this.queueTimer)
    this.queueTimer = undefined
    this.nowPlaying = null
    this.currentDj = undefined
    // The DJ who was on the decks goes to the back, as if the track had ended. Everybody keeps their place.
    this.booth.endCurrent()
    this.resetReactions()
  }
}
