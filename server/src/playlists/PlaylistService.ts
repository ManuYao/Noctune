import {
  DJ_INPUT_MAX,
  PLAYLISTS_MAX,
  PLAYLIST_TRACKS_MAX,
  type Playlist,
  type PlaylistFailure,
  type PlaylistReply,
  type PlaylistSummary,
  type PlaylistTrack,
  type VideoInfo,
} from '../../../shared/protocol'
import { normalizePlaylistName, playlistNameKey } from '../../../shared/validation'
import { AttemptLimiter } from '../accounts/AttemptLimiter'
import { withTimeout } from '../withTimeout'
import type { LookupBudget } from '../youtube/LookupBudget'
import { parseVideoId } from '../youtube/parseVideoId'
import type { ResolveResult, TrackResolver } from '../youtube/TrackResolver'
import type { PlaylistStore, StoredPlaylist, StoredTrack, VideoRefresh } from './PlaylistStore'

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

/** What YouTube says about a video is read again once it is this old... */
// A batch this small or smaller that YouTube does not know at all is taken at its word (see `refresh`).
const DOUBTFUL_BATCH_MIN = 3
export const REFRESH_AFTER_MS = 7 * DAY_MS
/** ...and is never shown, nor used, past this: the terms of the YouTube API allow keeping it 30 days without a refresh. */
export const MAX_AGE_MS = 30 * DAY_MS

const RESOLVER_TIMEOUT_MS = 8000
/** One call to YouTube answers for this many videos. */
const BATCH_SIZE = 50

interface Limit {
  max: number
  windowMs: number
}

export interface PlaylistServiceOptions {
  /** Milliseconds since the epoch. Tests replace the clock. */
  now?: () => number
  refreshAfterMs?: number
  maxAgeMs?: number
  resolverTimeoutMs?: number
  limits?: {
    /** Looking at the playlists. */
    reads?: Limit
    /** Creating, renaming, deleting, adding, removing, moving. */
    changes?: Limit
  }
}

/** What a room needs to judge a playlist track. */
export interface TrackToJudge {
  id: string
  videoId: string
  durationSec: number | null
  unavailable: boolean
  notMusic: boolean
}

export type VideoForDj =
  | { ok: true; video: VideoInfo }
  | { ok: false; error: 'no-such-track' | 'unavailable' | 'not-music' | 'service-unavailable' }
  | { ok: false; error: 'rate-limited'; retryAfterMs: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isStoreId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

const fail = (error: Exclude<PlaylistFailure['error'], 'rate-limited'>): PlaylistFailure => ({ ok: false, error })

function asRecord(input: unknown): Record<string, unknown> | null {
  return typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : null
}

const summary = ({ id, name, trackCount }: StoredPlaylist): PlaylistSummary => ({ id, name, trackCount })

/**
 * Everything about playlists that is not HTTP and not storage: whose they are, the limits, what may be said about a
 * video and for how long, and the refresh of what YouTube said.
 */
export class PlaylistService {
  private readonly now: () => number
  private readonly refreshAfterMs: number
  private readonly maxAgeMs: number
  private readonly resolverTimeoutMs: number
  private readonly reads: AttemptLimiter
  private readonly changes: AttemptLimiter

  constructor(
    private readonly store: PlaylistStore,
    /** Without it, links cannot be read: nothing can be added, and nothing is refreshed. */
    private readonly resolver: TrackResolver | null,
    private readonly budget: LookupBudget,
    options: PlaylistServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now
    this.refreshAfterMs = options.refreshAfterMs ?? REFRESH_AFTER_MS
    this.maxAgeMs = options.maxAgeMs ?? MAX_AGE_MS
    this.resolverTimeoutMs = options.resolverTimeoutMs ?? RESOLVER_TIMEOUT_MS
    const reads = options.limits?.reads ?? { max: 120, windowMs: MINUTE_MS }
    const changes = options.limits?.changes ?? { max: 40, windowMs: MINUTE_MS }
    this.reads = new AttemptLimiter(reads.max, reads.windowMs)
    this.changes = new AttemptLimiter(changes.max, changes.windowMs)
  }

  /** Counts this request, or says how long to wait. */
  private limited(limiter: AttemptLimiter, accountId: string): PlaylistFailure | null {
    const now = this.now()
    const wait = limiter.retryAfterMs(accountId, now)
    if (wait > 0) return { ok: false, error: 'rate-limited', retryAfterSec: Math.max(1, Math.ceil(wait / 1000)) }
    limiter.record(accountId, now)
    return null
  }

  /** Forgets old counters. Cheap: meant to run every minute. */
  sweep() {
    const now = this.now()
    this.reads.sweep(now)
    this.changes.sweep(now)
  }

  private toTrack(row: StoredTrack, now: number): PlaylistTrack {
    // What YouTube said is only shown while it is fresh enough to keep.
    const fresh = now - row.fetchedAt.getTime() < this.maxAgeMs
    return {
      id: row.id,
      videoId: row.videoId,
      title: fresh ? row.title : null,
      artist: fresh ? row.artist : null,
      durationSec: fresh ? row.durationSec : null,
      unavailable: row.unavailable,
    }
  }

  /**
   * Everything the member keeps in playlists, for their copy of their data: straight from the store, with no call to
   * YouTube, and with the same rule on what YouTube said (shown only while it is fresh enough to keep).
   */
  async exportOf(accountId: string): Promise<{ name: string; tracks: { videoId: string; title: string | null; artist: string | null; durationSec: number | null }[] }[]> {
    const now = this.now()
    const exported = []
    for (const listed of await this.store.list(accountId)) {
      const found = await this.store.get(accountId, listed.id)
      if (!found) continue
      exported.push({
        name: found.playlist.name,
        tracks: found.tracks.map((row) => {
          const track = this.toTrack(row, now)
          return { videoId: track.videoId, title: track.title, artist: track.artist, durationSec: track.durationSec }
        }),
      })
    }
    return exported
  }

  async listPlaylists(accountId: string): Promise<PlaylistReply<{ playlists: PlaylistSummary[] }>> {
    const limited = this.limited(this.reads, accountId)
    if (limited) return limited
    return { ok: true, playlists: (await this.store.list(accountId)).map(summary) }
  }

  async createPlaylist(accountId: string, body: unknown): Promise<PlaylistReply<{ playlist: PlaylistSummary }>> {
    const limited = this.limited(this.changes, accountId)
    if (limited) return limited
    const record = asRecord(body)
    if (!record) return fail('bad-request')
    const name = normalizePlaylistName(record.name)
    if (!name) return fail('invalid-name')
    const created = await this.store.create(accountId, name, playlistNameKey(name), PLAYLISTS_MAX)
    return created.ok ? { ok: true, playlist: summary(created.playlist) } : fail(created.error)
  }

  async renamePlaylist(accountId: string, playlistId: string, body: unknown): Promise<PlaylistReply<{ playlist: PlaylistSummary }>> {
    const limited = this.limited(this.changes, accountId)
    if (limited) return limited
    if (!isStoreId(playlistId)) return fail('playlist-not-found')
    const record = asRecord(body)
    if (!record) return fail('bad-request')
    const name = normalizePlaylistName(record.name)
    if (!name) return fail('invalid-name')
    const renamed = await this.store.rename(accountId, playlistId, name, playlistNameKey(name))
    return renamed.ok ? { ok: true, playlist: summary(renamed.playlist) } : fail(renamed.error)
  }

  async deletePlaylist(accountId: string, playlistId: string): Promise<PlaylistReply> {
    const limited = this.limited(this.changes, accountId)
    if (limited) return limited
    if (!isStoreId(playlistId)) return fail('playlist-not-found')
    return (await this.store.delete(accountId, playlistId)) ? { ok: true } : fail('playlist-not-found')
  }

  /** The playlist with its tracks; what YouTube said about the tracks that are getting old is read again first. */
  async getPlaylist(accountId: string, playlistId: string): Promise<PlaylistReply<{ playlist: Playlist }>> {
    const limited = this.limited(this.reads, accountId)
    if (limited) return limited
    if (!isStoreId(playlistId)) return fail('playlist-not-found')
    let found = await this.store.get(accountId, playlistId)
    if (!found) return fail('playlist-not-found')

    if (await this.refresh(accountId, found.tracks)) {
      found = (await this.store.get(accountId, playlistId)) ?? found
    }
    const now = this.now()
    return { ok: true, playlist: { ...summary(found.playlist), tracks: found.tracks.map((row) => this.toTrack(row, now)) } }
  }

  async addTrack(accountId: string, playlistId: string, body: unknown): Promise<PlaylistReply<{ track: PlaylistTrack }>> {
    const limited = this.limited(this.changes, accountId)
    if (limited) return limited
    if (!isStoreId(playlistId)) return fail('playlist-not-found')
    const record = asRecord(body)
    const input = record?.input
    if (typeof input !== 'string' || input.length < 1 || input.length > DJ_INPUT_MAX) return fail('bad-request')

    // What can be refused without asking YouTube is refused first: the quota is the whole site's.
    const found = await this.store.get(accountId, playlistId)
    if (!found) return fail('playlist-not-found')
    const videoId = parseVideoId(input)
    if (videoId === null) return fail('invalid-link')
    if (found.tracks.some((track) => track.videoId === videoId)) return fail('already-in-playlist')
    if (found.tracks.length >= PLAYLIST_TRACKS_MAX) return fail('playlist-full')
    if (!this.resolver) return fail('service-unavailable')
    const wait = this.budget.take(accountId, this.now())
    if (wait > 0) return { ok: false, error: 'rate-limited', retryAfterSec: Math.max(1, Math.ceil(wait / 1000)) }

    let resolved: ResolveResult
    try {
      resolved = await withTimeout(this.resolver.resolve(input), this.resolverTimeoutMs)
    } catch (error) {
      console.error(`[playlist] vidéo non lue : ${(error as Error).message}`)
      resolved = { ok: false, error: 'service-unavailable' }
    }
    if (!resolved.ok) return fail(resolved.error)

    // The store has the last word: while YouTube was being asked, the playlist may have filled up or got this video.
    const now = this.now()
    const added = await this.store.addTrack(accountId, playlistId, resolved.video, new Date(now), PLAYLIST_TRACKS_MAX)
    return added.ok ? { ok: true, track: this.toTrack(added.track, now) } : fail(added.error)
  }

  async removeTrack(accountId: string, playlistId: string, trackId: string): Promise<PlaylistReply> {
    const limited = this.limited(this.changes, accountId)
    if (limited) return limited
    if (!isStoreId(playlistId)) return fail('playlist-not-found')
    if (!isStoreId(trackId)) return fail('track-not-found')
    return (await this.store.removeTrack(accountId, playlistId, trackId)) ? { ok: true } : fail('track-not-found')
  }

  async moveTrack(accountId: string, playlistId: string, trackId: string, body: unknown): Promise<PlaylistReply> {
    const limited = this.limited(this.changes, accountId)
    if (limited) return limited
    if (!isStoreId(playlistId)) return fail('playlist-not-found')
    if (!isStoreId(trackId)) return fail('track-not-found')
    const position = asRecord(body)?.position
    if (typeof position !== 'number' || !Number.isInteger(position) || position < 0 || position >= PLAYLIST_TRACKS_MAX) {
      return fail('bad-request')
    }
    const moved = await this.store.moveTrack(accountId, playlistId, trackId, position)
    return moved ? { ok: true } : fail('track-not-found')
  }

  /**
   * For a DJ lining up a track of their own playlist: the video, from what is kept, read again first when it is getting
   * old. Costs nothing at YouTube while what is kept is recent.
   */
  async videoForDj(accountId: string, trackId: string): Promise<VideoForDj> {
    if (!isStoreId(trackId)) return { ok: false, error: 'no-such-track' }
    let row = await this.store.findTrack(accountId, trackId)
    if (!row) return { ok: false, error: 'no-such-track' }

    if (await this.refresh(accountId, [row])) {
      row = await this.store.findTrack(accountId, trackId)
      if (!row) return { ok: false, error: 'no-such-track' }
    }
    if (row.notMusic) return { ok: false, error: 'not-music' }
    if (row.unavailable) return { ok: false, error: 'unavailable' }
    // Too old to rely on, and it could not be read again: the room cannot check its rules against it.
    if (this.now() - row.fetchedAt.getTime() >= this.maxAgeMs) return { ok: false, error: 'service-unavailable' }
    return { ok: true, video: { videoId: row.videoId, title: row.title, artist: row.artist, durationSec: row.durationSec } }
  }

  /**
   * A playlist's tracks as they are kept, for judging them against a room. No call to YouTube. Null when not the member's.
   * The length is null once it is too old to rely on (see MAX_AGE_MS).
   */
  async tracksOf(accountId: string, playlistId: string): Promise<TrackToJudge[] | null> {
    if (!isStoreId(playlistId)) return null
    const found = await this.store.get(accountId, playlistId)
    if (!found) return null
    const now = this.now()
    return found.tracks.map((row) => ({
      id: row.id,
      videoId: row.videoId,
      durationSec: now - row.fetchedAt.getTime() < this.maxAgeMs ? row.durationSec : null,
      unavailable: row.unavailable,
      notMusic: row.notMusic,
    }))
  }

  /**
   * Reads again what YouTube says about the tracks that were last looked at a week ago or more: one call per 50 videos,
   * each one charged to the account's budget. Best effort: what cannot be refreshed now stays as it is (and is hidden
   * once it is too old to be shown). True when something was changed.
   */
  private async refresh(accountId: string, rows: StoredTrack[]): Promise<boolean> {
    if (!this.resolver) return false
    const now = this.now()
    const stale = [...new Set(rows.filter((row) => now - row.checkedAt.getTime() >= this.refreshAfterMs).map((row) => row.videoId))]
    let changed = false

    for (let start = 0; start < stale.length; start += BATCH_SIZE) {
      const ids = stale.slice(start, start + BATCH_SIZE)
      if (this.budget.take(accountId, this.now()) > 0) break // out of lookups for now: the rest waits for the next look
      let answers: Map<string, ResolveResult>
      try {
        answers = await withTimeout(this.resolver.resolveMany(ids), this.resolverTimeoutMs)
      } catch (error) {
        console.error(`[playlist] actualisation impossible : ${(error as Error).message}`)
        break
      }
      const at = new Date(this.now())
      // An answer that holds none of three or more videos is more likely a hiccup of YouTube than that many videos
      // vanishing together: flagging them would show them as "unavailable" to every member who holds them, for a week.
      const absent = ids.filter((id) => {
        const answer = answers.get(id)
        return answer !== undefined && !answer.ok && answer.error === 'not-found'
      })
      if (ids.length >= DOUBTFUL_BATCH_MIN && absent.length === ids.length) {
        console.error(`[playlist] actualisation ignorée : YouTube ne connaît aucune des ${ids.length} vidéos demandées`)
        continue
      }
      const refreshes: VideoRefresh[] = []
      for (const id of ids) {
        const answer = answers.get(id)
        if (!answer) continue
        if (answer.ok) refreshes.push({ videoId: id, video: answer.video, at })
        // The video is gone, private, not embeddable any more, a live: it is kept, flagged, and looked at again in a week.
        else if (answer.error === 'not-music') refreshes.push({ videoId: id, video: null, notMusic: true, at })
        else if (answer.error === 'not-found' || answer.error === 'not-embeddable' || answer.error === 'unavailable') {
          refreshes.push({ videoId: id, video: null, at })
        }
        // Anything else (YouTube out of reach, quota) says nothing about the video: try again next time.
      }
      if (refreshes.length > 0) {
        await this.store.applyRefresh(refreshes)
        changed = true
      }
    }
    return changed
  }
}
