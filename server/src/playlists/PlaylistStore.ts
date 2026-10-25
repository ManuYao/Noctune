import type { VideoInfo } from '../../../shared/protocol'

export interface StoredPlaylist {
  id: string
  name: string
  trackCount: number
}

/** A track as the store keeps it. The metadata is YouTube's: it only lives as long as the terms of the API allow. */
export interface StoredTrack {
  id: string
  playlistId: string
  /** From 0, with no gap, in the order the member wants. */
  position: number
  videoId: string
  title: string
  artist: string
  durationSec: number
  /** At the last look the video could no longer be played (removed, private, no longer embeddable). */
  unavailable: boolean
  /** When the title, the artist and the length were last read from YouTube. */
  fetchedAt: Date
  /** When the video was last looked at, whatever the answer. */
  checkedAt: Date
}

/** What a refresh learned about one video. `video` is null when it could no longer be read: only the status changes. */
export interface VideoRefresh {
  videoId: string
  video: VideoInfo | null
  at: Date
}

export type CreatePlaylistResult =
  | { ok: true; playlist: StoredPlaylist }
  | { ok: false; error: 'name-taken' | 'playlists-full' }
export type RenamePlaylistResult =
  | { ok: true; playlist: StoredPlaylist }
  | { ok: false; error: 'playlist-not-found' | 'name-taken' }
export type AddTrackResult =
  | { ok: true; track: StoredTrack }
  | { ok: false; error: 'playlist-not-found' | 'already-in-playlist' | 'playlist-full' }

/**
 * Where playlists are kept. PostgreSQL in the real server (PgPlaylistStore), memory in tests (MemoryPlaylistStore): both
 * pass the same tests, see playlistStoreContract.ts.
 *
 * Every method that touches a member's playlist takes the account id and answers "not found" for what belongs to
 * somebody else: the store is where ownership is enforced, not only the code above it.
 * The limits (how many playlists, how many tracks) are decided by the caller and checked here, in the same step as the
 * change, so that two requests at the same moment cannot both pass the check.
 */
export interface PlaylistStore {
  /** The member's playlists, oldest first. */
  list(accountId: string): Promise<StoredPlaylist[]>
  /**
   * Everything the member has, tracks included: the end of their account. In the database the cascade from the account
   * already did it (this finds nothing to do); in memory nothing else would.
   */
  deleteAll(accountId: string): Promise<void>
  /** Fails, with nothing created, when the name key is used by another playlist of the member or they have `max` already. */
  create(accountId: string, name: string, nameKey: string, max: number): Promise<CreatePlaylistResult>
  rename(accountId: string, playlistId: string, name: string, nameKey: string): Promise<RenamePlaylistResult>
  /** True when it existed and was the member's. Its tracks go with it. */
  delete(accountId: string, playlistId: string): Promise<boolean>
  /** The playlist and its tracks in order, or null. */
  get(accountId: string, playlistId: string): Promise<{ playlist: StoredPlaylist; tracks: StoredTrack[] } | null>
  /** Puts the video at the end. Fails when it is already there or the playlist holds `max` tracks. */
  addTrack(accountId: string, playlistId: string, video: VideoInfo, at: Date, max: number): Promise<AddTrackResult>
  /** True when the track existed in that playlist of the member. The others close up. */
  removeTrack(accountId: string, playlistId: string, trackId: string): Promise<boolean>
  /** Puts the track at `position` (from 0, kept within the playlist). Null when there is no such track. */
  moveTrack(accountId: string, playlistId: string, trackId: string, position: number): Promise<StoredTrack[] | null>
  /** One track, from whichever playlist of the member holds it. */
  findTrack(accountId: string, trackId: string): Promise<StoredTrack | null>
  /**
   * What a refresh learned, applied to every track with that video in any playlist (what YouTube says about a video is
   * not personal). A video that could not be read is marked unavailable and its metadata is left as it was.
   */
  applyRefresh(refreshes: VideoRefresh[]): Promise<void>
}
