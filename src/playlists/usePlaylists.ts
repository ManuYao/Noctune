import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlaylistSummary, PlaylistTrack } from '../../shared/protocol'
import { pickActivePlaylist, writeActivePlaylistId } from './activePlaylist'
import {
  addPlaylistTrack,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  movePlaylistTrack,
  removePlaylistTrack,
  renamePlaylist,
} from './playlistApi'
import { playlistErrorMessage } from './playlistMessages'

export type LoadStatus = 'loading' | 'ready' | 'error'

/** What an action on a playlist leads to: a value, or the words that say why not. */
export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; message: string }

/** The member's playlists (a summary of each) and which one is active. Loaded when the screen that uses it opens. */
export function usePlaylists() {
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [error, setError] = useState('')
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(async () => {
    setStatus('loading')
    const result = await listPlaylists()
    if (!mounted.current) return
    if (!result.ok) {
      setError(playlistErrorMessage(result))
      setStatus('error')
      return
    }
    setPlaylists(result.playlists)
    setActiveId(pickActivePlaylist(result.playlists)?.id ?? null)
    setError('')
    setStatus('ready')
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const select = useCallback((playlistId: string) => {
    writeActivePlaylistId(playlistId)
    setActiveId(playlistId)
  }, [])

  const create = useCallback(
    async (name: string): Promise<ActionResult<PlaylistSummary>> => {
      const result = await createPlaylist(name)
      if (!result.ok) return { ok: false, message: playlistErrorMessage(result) }
      if (mounted.current) {
        setPlaylists((previous) => [...previous, result.playlist])
        select(result.playlist.id)
      }
      return { ok: true, value: result.playlist }
    },
    [select],
  )

  const rename = useCallback(async (playlistId: string, name: string): Promise<ActionResult> => {
    const result = await renamePlaylist(playlistId, name)
    if (!result.ok) return { ok: false, message: playlistErrorMessage(result) }
    if (mounted.current) {
      setPlaylists((previous) => previous.map((playlist) => (playlist.id === playlistId ? result.playlist : playlist)))
    }
    return { ok: true, value: undefined }
  }, [])

  const remove = useCallback(async (playlistId: string): Promise<ActionResult> => {
    const result = await deletePlaylist(playlistId)
    if (!result.ok) return { ok: false, message: playlistErrorMessage(result) }
    if (mounted.current) setPlaylists((previous) => previous.filter((playlist) => playlist.id !== playlistId))
    return { ok: true, value: undefined }
  }, [])

  /** The page changed the number of tracks of a playlist: the summary follows without asking the server again. */
  const countChanged = useCallback((playlistId: string, trackCount: number) => {
    setPlaylists((previous) => previous.map((playlist) => (playlist.id === playlistId ? { ...playlist, trackCount } : playlist)))
  }, [])

  // The active playlist was deleted: the first one takes over, without anything else to keep in step.
  const active = playlists.find((playlist) => playlist.id === activeId) ?? playlists[0] ?? null

  return { status, error, playlists, activeId: active?.id ?? null, select, create, rename, remove, countChanged, reload: load }
}

interface TracksState {
  /** Which playlist these tracks belong to: tracks of another one are never shown as these. */
  playlistId: string | null
  status: LoadStatus
  error: string
  tracks: PlaylistTrack[]
}

/** The tracks of one playlist. `reloadKey` going up asks for them again (something added them from elsewhere). */
export function usePlaylistTracks(playlistId: string | null, reloadKey = 0) {
  const [state, setState] = useState<TracksState>({ playlistId: null, status: 'loading', error: '', tracks: [] })
  const latest = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(
    async (id: string | null) => {
      const mine = (latest.current += 1)
      if (id === null) {
        setState({ playlistId: null, status: 'ready', error: '', tracks: [] })
        return
      }
      // Tracks that are already on screen stay while they are asked for again: no flash of "loading".
      setState((previous) => (previous.playlistId === id ? previous : { playlistId: id, status: 'loading', error: '', tracks: [] }))
      const result = await getPlaylist(id)
      // The answer of an earlier request, or one that comes after the screen is gone, says nothing about what is shown now.
      if (!mounted.current || mine !== latest.current) return
      if (!result.ok) {
        setState((previous) => ({ ...previous, playlistId: id, status: 'error', error: playlistErrorMessage(result) }))
        return
      }
      setState({ playlistId: id, status: 'ready', error: '', tracks: result.playlist.tracks })
    },
    [],
  )

  useEffect(() => {
    void load(playlistId)
  }, [load, playlistId, reloadKey])

  const setTracks = useCallback((update: (tracks: PlaylistTrack[]) => PlaylistTrack[]) => {
    setState((previous) => ({ ...previous, tracks: update(previous.tracks) }))
  }, [])

  // Tracks of the playlist that was shown before are not these: until the new ones arrive, there are none.
  const current = state.playlistId === playlistId ? state : { playlistId, status: 'loading' as const, error: '', tracks: [] }

  const add = useCallback(
    async (input: string): Promise<ActionResult<PlaylistTrack>> => {
      if (playlistId === null) return { ok: false, message: "Choisis d'abord une playlist." }
      const result = await addPlaylistTrack(playlistId, input)
      if (!result.ok) return { ok: false, message: playlistErrorMessage(result) }
      if (mounted.current) setTracks((tracks) => [...tracks, result.track])
      return { ok: true, value: result.track }
    },
    [playlistId, setTracks],
  )

  const remove = useCallback(
    async (trackId: string): Promise<ActionResult> => {
      if (playlistId === null) return { ok: false, message: "Choisis d'abord une playlist." }
      const result = await removePlaylistTrack(playlistId, trackId)
      if (!result.ok) return { ok: false, message: playlistErrorMessage(result) }
      if (mounted.current) setTracks((tracks) => tracks.filter((track) => track.id !== trackId))
      return { ok: true, value: undefined }
    },
    [playlistId, setTracks],
  )

  /** The track changes place on screen at once; if the server refuses, the list is asked for again. */
  const move = useCallback(
    async (trackId: string, position: number): Promise<ActionResult> => {
      if (playlistId === null) return { ok: false, message: "Choisis d'abord une playlist." }
      setTracks((tracks) => {
        const from = tracks.findIndex((track) => track.id === trackId)
        if (from === -1 || position < 0 || position >= tracks.length) return tracks
        const reordered = [...tracks]
        const [moved] = reordered.splice(from, 1)
        reordered.splice(position, 0, moved)
        return reordered
      })
      const result = await movePlaylistTrack(playlistId, trackId, position)
      if (!result.ok) {
        void load(playlistId)
        return { ok: false, message: playlistErrorMessage(result) }
      }
      return { ok: true, value: undefined }
    },
    [load, playlistId, setTracks],
  )

  return { ...current, reload: () => load(playlistId), add, remove, move }
}
