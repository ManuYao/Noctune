import { addPlaylistTrack, createPlaylist, listPlaylists } from './playlistApi'
import { pickActivePlaylist, writeActivePlaylistId } from './activePlaylist'
import { playlistErrorMessage } from './playlistMessages'

export type KeepResult =
  | { ok: true; playlistName: string }
  | { ok: false; error: 'already'; playlistName: string }
  | { ok: false; error: 'failed'; message: string }

const FIRST_PLAYLIST_NAME = 'Ma playlist'

/**
 * Keeps a video in the member's active playlist ("Garder dans ma playlist", "+ Playlist" in the bar). A member who has
 * no playlist yet gets one, called "Ma playlist": keeping a track must never ask them to set something up first.
 */
export async function keepInPlaylist(videoId: string): Promise<KeepResult> {
  const listed = await listPlaylists()
  if (!listed.ok) return { ok: false, error: 'failed', message: playlistErrorMessage(listed) }

  let target = pickActivePlaylist(listed.playlists)
  if (!target) {
    const created = await createPlaylist(FIRST_PLAYLIST_NAME)
    if (created.ok) {
      target = created.playlist
    } else if (created.error === 'name-taken') {
      // Another tab (or a double click) made it a moment ago: use that one.
      const again = await listPlaylists()
      target = again.ok ? pickActivePlaylist(again.playlists) : null
    }
    if (!target) {
      return { ok: false, error: 'failed', message: playlistErrorMessage(created.ok ? { ok: false, error: 'server-error' } : created) }
    }
    writeActivePlaylistId(target.id)
  }

  const added = await addPlaylistTrack(target.id, videoId)
  if (added.ok) return { ok: true, playlistName: target.name }
  if (added.error === 'already-in-playlist') return { ok: false, error: 'already', playlistName: target.name }
  return { ok: false, error: 'failed', message: playlistErrorMessage(added) }
}
