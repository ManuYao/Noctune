import type pg from 'pg'
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

interface PlaylistRow {
  id: string
  name: string
  track_count: number
}

interface TrackRow {
  id: string
  playlist_id: string
  position: number
  video_id: string
  title: string
  artist: string
  duration_sec: number
  unavailable: boolean
  fetched_at: Date
  checked_at: Date
}

const TRACK_COLUMNS = 't.id, t.playlist_id, t.position, t.video_id, t.title, t.artist, t.duration_sec, t.unavailable, t.fetched_at, t.checked_at'

const toPlaylist = (row: PlaylistRow): StoredPlaylist => ({ id: row.id, name: row.name, trackCount: row.track_count })

const toTrack = (row: TrackRow): StoredTrack => ({
  id: row.id,
  playlistId: row.playlist_id,
  position: row.position,
  videoId: row.video_id,
  title: row.title,
  artist: row.artist,
  durationSec: row.duration_sec,
  unavailable: row.unavailable,
  fetchedAt: row.fetched_at,
  checkedAt: row.checked_at,
})

export class PgPlaylistStore implements PlaylistStore {
  constructor(private readonly pool: pg.Pool) {}

  /** One transaction. Whatever throws rolls it back, and the connection goes back to the pool either way. */
  private async inTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  /** Locks the member's row: what changes a member's set of playlists then happens one at a time (limits, names). */
  private async lockMember(client: pg.PoolClient, accountId: string): Promise<void> {
    const { rowCount } = await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [accountId])
    if (!rowCount) throw new Error('unknown account')
  }

  /** Locks one of the member's playlists, so that its tracks change one request at a time. False when it is not theirs. */
  private async lockPlaylist(client: pg.PoolClient, accountId: string, playlistId: string): Promise<boolean> {
    const { rowCount } = await client.query('SELECT 1 FROM playlists WHERE id = $1 AND user_id = $2 FOR UPDATE', [playlistId, accountId])
    return (rowCount ?? 0) > 0
  }

  async deleteAll(accountId: string): Promise<void> {
    await this.pool.query('DELETE FROM playlists WHERE user_id = $1', [accountId])
  }

  async list(accountId: string): Promise<StoredPlaylist[]> {
    const { rows } = await this.pool.query<PlaylistRow>(
      `SELECT p.id, p.name, count(t.id)::int AS track_count
         FROM playlists p LEFT JOIN playlist_tracks t ON t.playlist_id = p.id
        WHERE p.user_id = $1
        GROUP BY p.id
        ORDER BY p.created_at, p.id`,
      [accountId],
    )
    return rows.map(toPlaylist)
  }

  async create(accountId: string, name: string, nameKey: string, max: number): Promise<CreatePlaylistResult> {
    return this.inTransaction(async (client) => {
      await this.lockMember(client, accountId)
      const taken = await client.query('SELECT 1 FROM playlists WHERE user_id = $1 AND name_key = $2', [accountId, nameKey])
      if (taken.rowCount) return { ok: false, error: 'name-taken' }
      const count = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM playlists WHERE user_id = $1', [accountId])
      if (count.rows[0].count >= max) return { ok: false, error: 'playlists-full' }
      // The unique key is the judge in the end; ON CONFLICT rather than a caught error keeps the name out of the database log.
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO playlists (user_id, name, name_key) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, name_key) DO NOTHING RETURNING id`,
        [accountId, name, nameKey],
      )
      if (!rows[0]) return { ok: false, error: 'name-taken' }
      return { ok: true, playlist: { id: rows[0].id, name, trackCount: 0 } }
    })
  }

  async rename(accountId: string, playlistId: string, name: string, nameKey: string): Promise<RenamePlaylistResult> {
    return this.inTransaction(async (client) => {
      await this.lockMember(client, accountId)
      const mine = await client.query('SELECT 1 FROM playlists WHERE id = $1 AND user_id = $2', [playlistId, accountId])
      if (!mine.rowCount) return { ok: false, error: 'playlist-not-found' }
      const taken = await client.query('SELECT 1 FROM playlists WHERE user_id = $1 AND name_key = $2 AND id <> $3', [accountId, nameKey, playlistId])
      if (taken.rowCount) return { ok: false, error: 'name-taken' }
      await client.query('UPDATE playlists SET name = $3, name_key = $4 WHERE id = $1 AND user_id = $2', [playlistId, accountId, name, nameKey])
      const count = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM playlist_tracks WHERE playlist_id = $1', [playlistId])
      return { ok: true, playlist: { id: playlistId, name, trackCount: count.rows[0].count } }
    })
  }

  async delete(accountId: string, playlistId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM playlists WHERE id = $1 AND user_id = $2', [playlistId, accountId])
    return (rowCount ?? 0) > 0
  }

  async get(accountId: string, playlistId: string) {
    const found = await this.pool.query<{ id: string; name: string }>('SELECT id, name FROM playlists WHERE id = $1 AND user_id = $2', [playlistId, accountId])
    if (!found.rows[0]) return null
    const { rows } = await this.pool.query<TrackRow>(`SELECT ${TRACK_COLUMNS} FROM playlist_tracks t WHERE t.playlist_id = $1 ORDER BY t.position`, [playlistId])
    return { playlist: { id: found.rows[0].id, name: found.rows[0].name, trackCount: rows.length }, tracks: rows.map(toTrack) }
  }

  async addTrack(accountId: string, playlistId: string, video: VideoInfo, at: Date, max: number): Promise<AddTrackResult> {
    return this.inTransaction(async (client): Promise<AddTrackResult> => {
      if (!(await this.lockPlaylist(client, accountId, playlistId))) return { ok: false, error: 'playlist-not-found' }
      const stats = await client.query<{ count: number; has: boolean }>(
        'SELECT count(*)::int AS count, coalesce(bool_or(video_id = $2), false) AS has FROM playlist_tracks WHERE playlist_id = $1',
        [playlistId, video.videoId],
      )
      if (stats.rows[0].has) return { ok: false, error: 'already-in-playlist' }
      if (stats.rows[0].count >= max) return { ok: false, error: 'playlist-full' }
      const { rows } = await client.query<TrackRow>(
        `INSERT INTO playlist_tracks AS t (playlist_id, position, video_id, title, artist, duration_sec, fetched_at, checked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
         ON CONFLICT (playlist_id, video_id) DO NOTHING
         RETURNING ${TRACK_COLUMNS}`,
        [playlistId, stats.rows[0].count, video.videoId, video.title, video.artist, video.durationSec, at],
      )
      return rows[0] ? { ok: true, track: toTrack(rows[0]) } : { ok: false, error: 'already-in-playlist' }
    })
  }

  async removeTrack(accountId: string, playlistId: string, trackId: string): Promise<boolean> {
    return this.inTransaction(async (client) => {
      if (!(await this.lockPlaylist(client, accountId, playlistId))) return false
      const removed = await client.query<{ position: number }>('DELETE FROM playlist_tracks WHERE id = $1 AND playlist_id = $2 RETURNING position', [trackId, playlistId])
      if (!removed.rows[0]) return false
      // The others close up (the positions are only checked when the transaction ends).
      await client.query('UPDATE playlist_tracks SET position = position - 1 WHERE playlist_id = $1 AND position > $2', [playlistId, removed.rows[0].position])
      return true
    })
  }

  async moveTrack(accountId: string, playlistId: string, trackId: string, position: number): Promise<StoredTrack[] | null> {
    return this.inTransaction(async (client) => {
      if (!(await this.lockPlaylist(client, accountId, playlistId))) return null
      const current = await client.query<{ position: number }>('SELECT position FROM playlist_tracks WHERE id = $1 AND playlist_id = $2', [trackId, playlistId])
      if (!current.rows[0]) return null
      const count = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM playlist_tracks WHERE playlist_id = $1', [playlistId])
      const from = current.rows[0].position
      const to = Math.min(Math.max(position, 0), count.rows[0].count - 1)
      if (from !== to) {
        await client.query(
          `UPDATE playlist_tracks
              SET position = CASE
                    WHEN id = $2 THEN $4::int
                    WHEN $3::int < $4::int THEN position - 1
                    ELSE position + 1
                  END
            WHERE playlist_id = $1
              AND position BETWEEN least($3::int, $4::int) AND greatest($3::int, $4::int)`,
          [playlistId, trackId, from, to],
        )
      }
      const { rows } = await client.query<TrackRow>(`SELECT ${TRACK_COLUMNS} FROM playlist_tracks t WHERE t.playlist_id = $1 ORDER BY t.position`, [playlistId])
      return rows.map(toTrack)
    })
  }

  async findTrack(accountId: string, trackId: string): Promise<StoredTrack | null> {
    const { rows } = await this.pool.query<TrackRow>(
      `SELECT ${TRACK_COLUMNS} FROM playlist_tracks t JOIN playlists p ON p.id = t.playlist_id WHERE t.id = $2 AND p.user_id = $1`,
      [accountId, trackId],
    )
    return rows[0] ? toTrack(rows[0]) : null
  }

  async applyRefresh(refreshes: VideoRefresh[]): Promise<void> {
    // In the order of the video ids: two refreshes at the same moment take the rows in the same order.
    for (const refresh of [...refreshes].sort((a, b) => (a.videoId < b.videoId ? -1 : a.videoId > b.videoId ? 1 : 0))) {
      if (refresh.video) {
        await this.pool.query(
          `UPDATE playlist_tracks SET title = $2, artist = $3, duration_sec = $4, unavailable = false, fetched_at = $5, checked_at = $5
            WHERE video_id = $1`,
          [refresh.videoId, refresh.video.title, refresh.video.artist, refresh.video.durationSec, refresh.at],
        )
      } else {
        await this.pool.query('UPDATE playlist_tracks SET unavailable = true, checked_at = $2 WHERE video_id = $1', [refresh.videoId, refresh.at])
      }
    }
  }
}
