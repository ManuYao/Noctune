import type { PlaylistSummary } from '../../shared/protocol'

const KEY = 'noctune.activePlaylist'

// A convenience of this browser, nothing more: storage can be missing or refuse (private window, blocked site data), and
// then the first playlist is the active one.
function readActivePlaylistId(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function writeActivePlaylistId(playlistId: string) {
  try {
    window.localStorage.setItem(KEY, playlistId)
  } catch {
    // Not remembered: the next visit starts from the first playlist.
  }
}

/** The playlist the member last chose, if they still have it; otherwise their first one. */
export function pickActivePlaylist(playlists: PlaylistSummary[]): PlaylistSummary | null {
  const remembered = readActivePlaylistId()
  return playlists.find((playlist) => playlist.id === remembered) ?? playlists[0] ?? null
}
