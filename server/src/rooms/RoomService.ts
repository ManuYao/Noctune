import { randomInt } from 'node:crypto'
import {
  ROOM_MAX_DJS_CHOICES,
  ROOM_MAX_TRACK_CHOICES,
  ROOM_REPEAT_CHOICES,
  ROOM_STYLES,
  ROOM_STYLES_MAX,
  ROOM_THEMES,
  ROOMS_PER_MEMBER_MAX,
  type RoomDetail,
  type RoomFailure,
  type RoomReply,
  type RoomRules,
  type RoomStyle,
  type RoomTheme,
} from '../../../shared/protocol'
import { normalizeRoomDescription, normalizeRoomName, roomNameKey } from '../../../shared/validation'
import { AttemptLimiter } from '../accounts/AttemptLimiter'
import { containsLink } from '../chatText'
import type { RoomInput, RoomStore, StoredRoom } from './RoomStore'

const HOUR_MS = 60 * 60 * 1000

/** Room ids have to be found again from a link, and cannot clash with the lobby channel (`#lobby`) or a participant id. */
export const ROOM_ID_SHAPE = /^[a-z0-9][a-z0-9-]{2,59}$/

/**
 * What the live side of the server is told once the store has changed: the realtime layer follows it. Assigned after the
 * service is made (the two need each other), so every member is optional until then.
 */
export interface RoomListener {
  created?: (room: StoredRoom) => void
  updated?: (room: StoredRoom) => void
  deleted?: (id: string) => void
}

interface Limit {
  max: number
  windowMs: number
}

export interface RoomServiceOptions {
  /** Milliseconds since the epoch. Tests replace the clock. */
  now?: () => number
  limits?: {
    /** Rooms created by one member (counted when it worked). */
    creations?: Limit
    /** Every request that creates, changes or deletes a room, valid or not. */
    changes?: Limit
  }
  /** Rooms one member hosts at once. */
  maxPerMember?: number
  /** Rooms made by members that the site holds at most (every room is a live object and a line of the list sent to everybody). */
  maxMemberRooms?: number
}

const fail = (error: Exclude<RoomFailure['error'], 'rate-limited'>): RoomFailure => ({ ok: false, error })

function asRecord(input: unknown): Record<string, unknown> | null {
  return typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : null
}

const isOneOf = <T>(choices: readonly T[], value: unknown): value is T => choices.includes(value as T)

/** The part of the name that makes an id: ASCII, lower case, dashes between words, never empty. */
function slugOf(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return slug || 'room'
}

const SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
/** `rock-progressif-7k3q`: readable in a link, and two rooms of the same name (once one is deleted) do not share an id. */
export function newRoomId(name: string): string {
  let suffix = ''
  for (let i = 0; i < 4; i += 1) suffix += SUFFIX_CHARS[randomInt(SUFFIX_CHARS.length)]
  return `${slugOf(name)}-${suffix}`
}

/**
 * Everything about rooms made by members that is not HTTP and not storage: what a room may be called and say, which rules
 * a host may pick, whose it is, how many a member may have, how fast they may make them.
 */
/** Rooms made by members that the site holds at most. */
export const MEMBER_ROOMS_TOTAL_MAX = 200

export class RoomService {
  private readonly now: () => number
  private readonly maxPerMember: number
  private readonly maxMemberRooms: number
  private readonly creations: AttemptLimiter
  private readonly changes: AttemptLimiter

  constructor(
    private readonly store: RoomStore,
    private readonly listener: RoomListener,
    options: RoomServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now
    this.maxPerMember = options.maxPerMember ?? ROOMS_PER_MEMBER_MAX
    this.maxMemberRooms = options.maxMemberRooms ?? MEMBER_ROOMS_TOTAL_MAX
    const creations = options.limits?.creations ?? { max: 5, windowMs: HOUR_MS }
    const changes = options.limits?.changes ?? { max: 30, windowMs: HOUR_MS }
    this.creations = new AttemptLimiter(creations.max, creations.windowMs)
    this.changes = new AttemptLimiter(changes.max, changes.windowMs)
  }

  /** Forgets old counters. Cheap: meant to run every minute. */
  sweep() {
    const now = this.now()
    this.creations.sweep(now)
    this.changes.sweep(now)
  }

  private detail(room: StoredRoom, viewer: string | undefined): RoomDetail {
    return {
      id: room.id,
      name: room.name,
      description: room.description,
      styles: [...room.styles],
      theme: room.theme,
      rules: { ...room.rules },
      host: room.hostPseudo,
      ...(room.createdAt !== null && { createdAt: room.createdAt }),
      mine: viewer !== undefined && room.hostAccountId !== null && room.hostAccountId === viewer,
    }
  }

  /** The request is counted, or the member is told how long to wait. */
  private limited(limiter: AttemptLimiter, accountId: string, record: boolean): RoomFailure | null {
    const now = this.now()
    const wait = limiter.retryAfterMs(accountId, now)
    if (wait > 0) return { ok: false, error: 'rate-limited', retryAfterSec: Math.max(1, Math.ceil(wait / 1000)) }
    if (record) limiter.record(accountId, now)
    return null
  }

  /** What the page sent, checked field by field: never trusted, and rebuilt so that nothing extra goes to the store. */
  parseSettings(body: unknown): { ok: true; input: RoomInput } | RoomFailure {
    const raw = asRecord(body)
    if (!raw) return fail('bad-request')

    const name = normalizeRoomName(raw.name)
    if (name === null) return fail('invalid-name')

    const description = normalizeRoomDescription(raw.description)
    // The description is shown on the card of every visitor: no link in it, as in the chat.
    if (description === null || containsLink(description)) return fail('invalid-description')

    const styles = raw.styles
    if (
      !Array.isArray(styles) ||
      styles.length < 1 ||
      styles.length > ROOM_STYLES_MAX ||
      !styles.every((style) => isOneOf(ROOM_STYLES, style)) ||
      new Set(styles).size !== styles.length
    ) {
      return fail('invalid-styles')
    }

    if (!isOneOf(ROOM_THEMES, raw.theme)) return fail('invalid-theme')

    const rules = asRecord(raw.rules)
    if (
      !rules ||
      !isOneOf(ROOM_MAX_TRACK_CHOICES, rules.maxTrackSec) ||
      !isOneOf(ROOM_REPEAT_CHOICES, rules.repeatDelaySec) ||
      !isOneOf(ROOM_MAX_DJS_CHOICES, rules.maxDjs)
    ) {
      return fail('invalid-rules')
    }
    const checked: RoomRules = { maxTrackSec: rules.maxTrackSec, repeatDelaySec: rules.repeatDelaySec, maxDjs: rules.maxDjs }

    return {
      ok: true,
      input: { name, nameKey: roomNameKey(name), description, styles: styles as RoomStyle[], theme: raw.theme as RoomTheme, rules: checked },
    }
  }

  /** One room, for anybody. `viewer` is the account asking, when there is one: it only decides `mine`. */
  async get(id: string, viewer?: string): Promise<RoomReply<{ room: RoomDetail }>> {
    if (typeof id !== 'string' || !ROOM_ID_SHAPE.test(id)) return fail('room-not-found')
    const room = await this.store.get(id)
    return room ? { ok: true, room: this.detail(room, viewer) } : fail('room-not-found')
  }

  /** The rooms the member hosts. */
  async mine(accountId: string): Promise<RoomReply<{ rooms: RoomDetail[] }>> {
    const rooms = await this.store.listByHost(accountId)
    return { ok: true, rooms: rooms.map((room) => this.detail(room, accountId)) }
  }

  async create(account: { id: string; pseudo: string }, body: unknown): Promise<RoomReply<{ room: RoomDetail }>> {
    const slow = this.limited(this.changes, account.id, true) ?? this.limited(this.creations, account.id, false)
    if (slow) return slow
    const parsed = this.parseSettings(body)
    if (!parsed.ok) return parsed
    // However many accounts there are, the site holds a bounded number of rooms made by members: it is not told at the
    // price of the store, so a slight overshoot under concurrency is fine.
    const made_ = (await this.store.list()).filter((room) => room.hostAccountId !== null).length
    if (made_ >= this.maxMemberRooms) return fail('rooms-full')

    // An id that is taken (the same name made twice in one instant) is a draw to make again, not an error to show.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const made = await this.store.create({ accountId: account.id, pseudo: account.pseudo }, newRoomId(parsed.input.name), parsed.input, this.maxPerMember)
      if (made.ok) {
        // Counted now, once it worked: somebody who fumbles with the form is not locked out for an hour.
        this.creations.record(account.id, this.now())
        this.listener.created?.(made.room)
        return { ok: true, room: this.detail(made.room, account.id) }
      }
      if (made.error !== 'id-taken') return fail(made.error)
    }
    return fail('server-error')
  }

  async update(accountId: string, id: string, body: unknown): Promise<RoomReply<{ room: RoomDetail }>> {
    const slow = this.limited(this.changes, accountId, true)
    if (slow) return slow
    if (typeof id !== 'string' || !ROOM_ID_SHAPE.test(id)) return fail('room-not-found')
    const parsed = this.parseSettings(body)
    if (!parsed.ok) return parsed
    const changed = await this.store.update(accountId, id, parsed.input)
    if (!changed.ok) return fail(changed.error)
    this.listener.updated?.(changed.room)
    return { ok: true, room: this.detail(changed.room, accountId) }
  }

  async delete(accountId: string, id: string): Promise<RoomReply> {
    const slow = this.limited(this.changes, accountId, true)
    if (slow) return slow
    if (typeof id !== 'string' || !ROOM_ID_SHAPE.test(id)) return fail('room-not-found')
    const deleted = await this.store.delete(accountId, id)
    if (!deleted.ok) return fail(deleted.error)
    this.listener.deleted?.(id)
    return { ok: true }
  }
}
