import type { Playlist, PlaylistReply, PlaylistSummary, PlaylistTrack } from '../../shared/protocol'

/** What the server answered, or a failure that never got an answer (offline, server down). */
export type PlaylistCall<T = object> = PlaylistReply<T> | { ok: false; error: 'network' }

// The session lives in a cookie the page cannot read: the browser sends it by itself, to this site only.
// In development Vite forwards /api to the realtime server (see vite.config.ts).
async function call<T = object>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<PlaylistCall<T>> {
  try {
    const response = await fetch(
      path,
      // Every method that changes something carries a JSON body, even an empty one: the server only reads JSON.
      method === 'GET' ? undefined : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) },
    )
    return (await response.json()) as PlaylistReply<T>
  } catch {
    // No connection, or something that is not our server answering (a proxy error page): not a refusal of ours.
    return { ok: false, error: 'network' }
  }
}

const playlistPath = (playlistId: string) => `/api/playlists/${encodeURIComponent(playlistId)}`

export const listPlaylists = () => call<{ playlists: PlaylistSummary[] }>('GET', '/api/playlists')

export const createPlaylist = (name: string) => call<{ playlist: PlaylistSummary }>('POST', '/api/playlists', { name })

export const renamePlaylist = (playlistId: string, name: string) =>
  call<{ playlist: PlaylistSummary }>('PATCH', playlistPath(playlistId), { name })

export const deletePlaylist = (playlistId: string) => call('DELETE', playlistPath(playlistId))

export const getPlaylist = (playlistId: string) => call<{ playlist: Playlist }>('GET', playlistPath(playlistId))

/** `input`: a YouTube link or a video id. */
export const addPlaylistTrack = (playlistId: string, input: string) =>
  call<{ track: PlaylistTrack }>('POST', `${playlistPath(playlistId)}/tracks`, { input })

export const removePlaylistTrack = (playlistId: string, trackId: string) =>
  call('DELETE', `${playlistPath(playlistId)}/tracks/${encodeURIComponent(trackId)}`)

/** `position`: the new place of the track, from 0. */
export const movePlaylistTrack = (playlistId: string, trackId: string, position: number) =>
  call('POST', `${playlistPath(playlistId)}/tracks/${encodeURIComponent(trackId)}/move`, { position })
