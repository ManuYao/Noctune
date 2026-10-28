import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { PLAYLIST_NAME_MAX, type PlaylistSummary } from '../../shared/protocol'
import { pickActivePlaylist, writeActivePlaylistId } from '../playlists/activePlaylist'
import { addPlaylistTrack, createPlaylist, listPlaylists } from '../playlists/playlistApi'
import { playlistErrorMessage } from '../playlists/playlistMessages'
import '../pages/PageKit.css'
import '../moderation/Moderation.css'
import './KeepPicker.css'

/** Where the track went. `already`: it was in that playlist before. */
export interface KeepOutcome {
  kind: 'added' | 'already'
  playlistName: string
}

interface KeepPickerProps {
  videoId: string
  onDone: (outcome: KeepOutcome) => void
  /** Shown as a quiet button when given (in a window the cross closes it already). */
  onCancel?: () => void
}

const countText = (count: number) => `${count} morceau${count > 1 ? 'x' : ''}`

/**
 * "Keep this track": the member's playlists to choose from (the active one first), or a new one to make. Nothing is added
 * until they have chosen: a track must not end up in a playlist they did not mean.
 */
export default function KeepPicker({ videoId, onDone, onCancel }: KeepPickerProps) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  // The name field only grabs the focus after a press on "Nouvelle playlist": a keyboard must not rise on its own.
  const [focusName, setFocusName] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    let alive = true
    void listPlaylists().then((result) => {
      if (!alive) return
      if (!result.ok) return setError(playlistErrorMessage(result))
      const active = pickActivePlaylist(result.playlists)
      setPlaylists(active ? [active, ...result.playlists.filter((playlist) => playlist.id !== active.id)] : [])
      if (result.playlists.length === 0) setCreating(true)
    })
    return () => {
      alive = false
    }
  }, [])

  async function addTo(playlist: PlaylistSummary) {
    if (busy) return
    setBusy(true)
    setError('')
    const result = await addPlaylistTrack(playlist.id, videoId)
    setBusy(false)
    if (result.ok) return onDone({ kind: 'added', playlistName: playlist.name })
    if (result.error === 'already-in-playlist') return onDone({ kind: 'already', playlistName: playlist.name })
    setError(playlistErrorMessage(result))
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (name.trim() === '') return setError('Donne un nom à ta playlist.')
    setBusy(true)
    setError('')
    const created = await createPlaylist(name.trim())
    if (!created.ok) {
      setBusy(false)
      return setError(playlistErrorMessage(created))
    }
    // The first playlist of a member is the one "Passer DJ" opens on.
    if ((playlists?.length ?? 0) === 0) writeActivePlaylistId(created.playlist.id)
    const added = await addPlaylistTrack(created.playlist.id, videoId)
    setBusy(false)
    if (added.ok) return onDone({ kind: 'added', playlistName: created.playlist.name })
    // The playlist exists, the track is not in it: say so, and show the playlist in the list.
    setPlaylists((previous) => [...(previous ?? []), created.playlist])
    setCreating(false)
    setName('')
    setError(playlistErrorMessage(added))
  }

  return (
    <div className="keep">
      {error && (
        <p className="keep__error" role="alert">
          {error}
        </p>
      )}
      {playlists === null && !error && (
        <p className="mod-hint" role="status">
          Chargement de tes playlists…
        </p>
      )}

      {playlists !== null && playlists.length > 0 && (
        <ul className="keep__list" role="list" aria-label="Tes playlists">
          {playlists.map((playlist, index) => (
            <li key={playlist.id}>
              <button type="button" className="keep__item" disabled={busy} data-autofocus={index === 0 ? '' : undefined} onClick={() => void addTo(playlist)}>
                <span className="keep__name">{playlist.name}</span>
                <span className="keep__count">{countText(playlist.trackCount)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {playlists !== null && !creating && (
        <button
          type="button"
          className="keep__new"
          disabled={busy}
          onClick={() => {
            setCreating(true)
            setFocusName(true)
          }}
        >
          + Nouvelle playlist
        </button>
      )}

      {creating && (
        <form className="keep__form" onSubmit={handleCreate} noValidate>
          <label htmlFor="keep-new-name" className="kit-label">
            Nom de la nouvelle playlist
          </label>
          <input
            id="keep-new-name"
            className="kit-input"
            type="text"
            maxLength={PLAYLIST_NAME_MAX}
            autoComplete="off"
            autoFocus={focusName}
            data-autofocus={playlists !== null && playlists.length === 0 ? '' : undefined}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="kit-btn" disabled={busy}>
            {busy ? 'Un instant…' : 'Créer et garder le morceau'}
          </button>
        </form>
      )}

      {onCancel && (
        <button type="button" className="mod-btn mod-btn--quiet" onClick={onCancel}>
          Annuler
        </button>
      )}
    </div>
  )
}
