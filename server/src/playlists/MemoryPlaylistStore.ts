import { randomUUID } from 'node:crypto'
import type { VideoInfo } from '../../../shared/protocol'
import type {
  AddTrackResult,
  CreatePlaylistResult,
  PlaylistStore,
  RenamePlaylistResult,
  StoredPlaylist,
  StoredTrack,
  VideoRefresh,
} from './PlaylistStore'

interface Entry {
  id: string
  accountId: string
  name: string
  nameKey: string
  createdAt: number
  tracks: StoredTrack[]
}

/** The same behaviour as PgPlaylistStore, without a database: for tests. Nothing survives the process. */
export class MemoryPlaylistStore implements PlaylistStore {
  private readonly playlists = new Map<string, Entry>()
  private clock = 0

  private owned(accountId: string, playlistId: string): Entry | undefined {
    const entry = this.playlists.get(playlistId)
    return entry && entry.accountId === accountId ? entry : undefined
  }

  private summary(entry: Entry): StoredPlaylist {
    return { id: entry.id, name: entry.name, trackCount: entry.tracks.length }
  }

  async deleteAll(accountId: string): Promise<void> {
    for (const [id, entry] of this.playlists) if (entry.accountId === accountId) this.playlists.delete(id)
  }

  async list(accountId: string): Promise<StoredPlaylist[]> {
    return [...this.playlists.values()]
      .filter((entry) => entry.accountId === accountId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((entry) => this.summary(entry))
  }

  async create(accountId: string, name: string, nameKey: string, max: number): Promise<CreatePlaylistResult> {
    const mine = [...this.playlists.values()].filter((entry) => entry.accountId === accountId)
    if (mine.some((entry) => entry.nameKey === nameKey)) return { ok: false, error: 'name-taken' }
    if (mine.length >= max) return { ok: false, error: 'playlists-full' }
    const entry: Entry = { id: randomUUID(), accountId, name, nameKey, createdAt: (this.clock += 1), tracks: [] }
    this.playlists.set(entry.id, entry)
    return { ok: true, playlist: this.summary(entry) }
  }

  async rename(accountId: string, playlistId: string, name: string, nameKey: string): Promise<RenamePlaylistResult> {
    const entry = this.owned(accountId, playlistId)
    if (!entry) return { ok: false, error: 'playlist-not-found' }
    const taken = [...this.playlists.values()].some(
      (other) => other.accountId === accountId && other.id !== entry.id && other.nameKey === nameKey,
    )
    if (taken) return { ok: false, error: 'name-taken' }
    entry.name = name
    entry.nameKey = nameKey
    return { ok: true, playlist: this.summary(entry) }
  }

  async delete(accountId: string, playlistId: string): Promise<boolean> {
    return this.owned(accountId, playlistId) ? this.playlists.delete(playlistId) : false
  }

  async get(accountId: string, playlistId: string) {
    const entry = this.owned(accountId, playlistId)
    return entry ? { playlist: this.summary(entry), tracks: entry.tracks.map((track) => ({ ...track })) } : null
  }

  async addTrack(accountId: string, playlistId: string, video: VideoInfo, at: Date, max: number): Promise<AddTrackResult> {
    const entry = this.owned(accountId, playlistId)
    if (!entry) return { ok: false, error: 'playlist-not-found' }
    if (entry.tracks.some((track) => track.videoId === video.videoId)) return { ok: false, error: 'already-in-playlist' }
    if (entry.tracks.length >= max) return { ok: false, error: 'playlist-full' }
    const track: StoredTrack = {
      id: randomUUID(),
      playlistId,
      position: entry.tracks.length,
      videoId: video.videoId,
      title: video.title,
      artist: video.artist,
      durationSec: video.durationSec,
      unavailable: false,
      notMusic: false,
      fetchedAt: at,
      checkedAt: at,
    }
    entry.tracks.push(track)
    return { ok: true, track: { ...track } }
  }

  async removeTrack(accountId: string, playlistId: string, trackId: string): Promise<boolean> {
    const entry = this.owned(accountId, playlistId)
    const index = entry ? entry.tracks.findIndex((track) => track.id === trackId) : -1
    if (!entry || index === -1) return false
    entry.tracks.splice(index, 1)
    entry.tracks.forEach((track, position) => (track.position = position))
    return true
  }

  async moveTrack(accountId: string, playlistId: string, trackId: string, position: number): Promise<StoredTrack[] | null> {
    const entry = this.owned(accountId, playlistId)
    const index = entry ? entry.tracks.findIndex((track) => track.id === trackId) : -1
    if (!entry || index === -1) return null
    const [track] = entry.tracks.splice(index, 1)
    entry.tracks.splice(Math.min(Math.max(position, 0), entry.tracks.length), 0, track)
    entry.tracks.forEach((kept, place) => (kept.position = place))
    return entry.tracks.map((kept) => ({ ...kept }))
  }

  async findTrack(accountId: string, trackId: string): Promise<StoredTrack | null> {
    for (const entry of this.playlists.values()) {
      if (entry.accountId !== accountId) continue
      const track = entry.tracks.find((candidate) => candidate.id === trackId)
      if (track) return { ...track }
    }
    return null
  }

  async applyRefresh(refreshes: VideoRefresh[]): Promise<void> {
    for (const refresh of refreshes) {
      for (const entry of this.playlists.values()) {
        for (const track of entry.tracks) {
          if (track.videoId !== refresh.videoId) continue
          track.checkedAt = refresh.at
          if (refresh.video) {
            track.title = refresh.video.title
            track.artist = refresh.video.artist
            track.durationSec = refresh.video.durationSec
            track.unavailable = false
            track.notMusic = false
            track.fetchedAt = refresh.at
          } else {
            track.unavailable = true
            track.notMusic = refresh.notMusic === true
          }
        }
      }
    }
  }
}
