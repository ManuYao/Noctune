import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Navigate } from 'react-router'
import { DJ_INPUT_MAX, PLAYLISTS_MAX, PLAYLIST_NAME_MAX, PLAYLIST_TRACKS_MAX, type PlaylistSummary } from '../../shared/protocol'
import { useAccount } from '../auth/useAccount'
import SiteHeader from '../components/SiteHeader'
import { formatClock } from '../data/duration'
import { usePlaylists, usePlaylistTracks } from '../playlists/usePlaylists'
import './PlaylistPage.css'

/** Without accents and capitals, so that "cafe" finds "Café froid". */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** A colour for a cover, the same every time for the same text (the mock-ups have gradient covers). */
function hueOf(text: string): number {
  let sum = 0
  for (const character of text) sum = (sum * 31 + character.charCodeAt(0)) % 360
  return sum
}

const trackCountText = (count: number) => `${count} morceau${count > 1 ? 'x' : ''}`

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The member's playlists: the list on the left, the tracks of the chosen one on the right (mock-up 5b). */
export default function PlaylistPage() {
  const { account, status } = useAccount()

  // The server has said nobody is signed in: playlists belong to members.
  if (status === 'ready' && !account) return <Navigate to="/connexion" replace />
  if (status !== 'ready') {
    return (
      <div>
        <SiteHeader />
        <main className="playlist">
          <p className="playlist__note" role="status">
            Chargement…
          </p>
        </main>
      </div>
    )
  }
  return <MemberPlaylists />
}

function MemberPlaylists() {
  const lists = usePlaylists()
  const activeId = lists.activeId
  const active = lists.playlists.find((playlist) => playlist.id === activeId) ?? null
  const tracks = usePlaylistTracks(activeId)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameTo, setRenameTo] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [link, setLink] = useState('')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  // After a track moved, which of its buttons gets the focus back (the row moved in the page, the focus must not be lost).
  const focusAfterMove = useRef<{ trackId: string; direction: 'up' | 'down' } | null>(null)
  const listsHeading = useRef<HTMLHeadingElement>(null)
  const tracksHeading = useRef<HTMLHeadingElement>(null)

  const trackList = tracks.tracks
  useEffect(() => {
    const pending = focusAfterMove.current
    if (!pending) return
    focusAfterMove.current = null
    const index = trackList.findIndex((track) => track.id === pending.trackId)
    // At either end one of the two buttons is disabled: the focus goes to the other one.
    const wanted = pending.direction === 'up' && index === 0 ? 'down' : pending.direction === 'down' && index === trackList.length - 1 ? 'up' : pending.direction
    document.getElementById(`pl-move-${wanted}-${pending.trackId}`)?.focus()
  }, [trackList])

  function resetMessages() {
    setError('')
    setNote('')
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    resetMessages()
    setBusy(true)
    const result = await lists.create(newName)
    setBusy(false)
    if (!result.ok) return setError(result.message)
    setCreating(false)
    setNewName('')
    setNote(`La playlist « ${result.value.name} » est créée.`)
    // After the screen has changed: the heading of the new playlist is not in the page yet.
    window.setTimeout(() => tracksHeading.current?.focus(), 0)
  }

  async function handleRename(event: FormEvent) {
    event.preventDefault()
    if (busy || !active) return
    resetMessages()
    setBusy(true)
    const result = await lists.rename(active.id, renameTo)
    setBusy(false)
    if (!result.ok) return setError(result.message)
    setRenaming(false)
    setNote('Le nom de la playlist est changé.')
  }

  async function handleDelete() {
    if (busy || !active) return
    resetMessages()
    setBusy(true)
    const result = await lists.remove(active.id)
    setBusy(false)
    setConfirmDelete(false)
    if (!result.ok) return setError(result.message)
    setNote(`La playlist « ${active.name} » est supprimée.`)
    window.setTimeout(() => listsHeading.current?.focus(), 0)
  }

  async function handleAddTrack(event: FormEvent) {
    event.preventDefault()
    if (busy || !active) return
    const input = link.trim()
    resetMessages()
    if (input === '') return setError("Colle le lien d'une vidéo YouTube.")
    setBusy(true)
    const result = await tracks.add(input)
    setBusy(false)
    if (!result.ok) return setError(result.message)
    setLink('')
    lists.countChanged(active.id, trackList.length + 1)
    setNote(`« ${result.value.title ?? 'Ce morceau'} » est ajouté à « ${active.name} ».`)
  }

  async function handleRemoveTrack(trackId: string, title: string) {
    if (busy || !active) return
    resetMessages()
    setBusy(true)
    const result = await tracks.remove(trackId)
    setBusy(false)
    if (!result.ok) return setError(result.message)
    lists.countChanged(active.id, trackList.length - 1)
    setNote(`« ${title} » est retiré de « ${active.name} ».`)
    window.setTimeout(() => tracksHeading.current?.focus(), 0)
  }

  async function handleMove(trackId: string, title: string, direction: 'up' | 'down') {
    if (busy) return
    const from = trackList.findIndex((track) => track.id === trackId)
    const position = direction === 'up' ? from - 1 : from + 1
    if (from === -1 || position < 0 || position >= trackList.length) return
    resetMessages()
    focusAfterMove.current = { trackId, direction }
    const result = await tracks.move(trackId, position)
    if (!result.ok) return setError(result.message)
    setNote(`« ${title} » est maintenant le n° ${position + 1}.`)
  }

  const wanted = fold(filter.trim())
  const shown = wanted === '' ? trackList : trackList.filter((track) => fold(`${track.title ?? ''} ${track.artist ?? ''}`).includes(wanted))
  const total = trackList.reduce((sum, track) => sum + (track.durationSec ?? 0), 0)

  return (
    <div>
      <SiteHeader />
      <main className="playlist">
        <h1 className="playlist__title">Mes playlists</h1>

        {/* Live regions: always in the page, empty most of the time. */}
        <p className="playlist__feedback playlist__feedback--error" role="alert">
          {error}
        </p>
        <p className="playlist__feedback playlist__feedback--done" role="status">
          {note}
        </p>

        {lists.status === 'loading' && (
          <p className="playlist__note" role="status">
            Chargement de tes playlists…
          </p>
        )}
        {lists.status === 'error' && (
          <div className="playlist__note">
            <p role="alert">{lists.error}</p>
            <button type="button" className="playlist__secondary" onClick={() => void lists.reload()}>
              Réessayer
            </button>
          </div>
        )}

        {lists.status === 'ready' && (
          <div className="playlist__layout">
            <section className="playlist__card" aria-labelledby="playlists-title">
              <header className="playlist__card-header">
                <h2 id="playlists-title" tabIndex={-1} ref={listsHeading}>
                  Playlists
                </h2>
                <span className="playlist__count">
                  {lists.playlists.length} / {PLAYLISTS_MAX}
                </span>
              </header>

              {lists.playlists.length === 0 && !creating && (
                <p className="playlist__note">Tu n'as pas encore de playlist. Crée la première : tu pourras y garder les morceaux que tu aimes, et les lancer d'un clic quand tu passes DJ.</p>
              )}

              {lists.playlists.length > 0 && (
                <ul className="playlist__items" role="list">
                  {lists.playlists.map((playlist: PlaylistSummary) => (
                    <li key={playlist.id}>
                      <button
                        type="button"
                        className="playlist__item"
                        aria-pressed={playlist.id === activeId}
                        onClick={() => {
                          lists.select(playlist.id)
                          setRenaming(false)
                          setConfirmDelete(false)
                          setFilter('')
                          resetMessages()
                        }}
                      >
                        <span className="playlist__cover" aria-hidden="true" style={{ '--hue': hueOf(playlist.id) } as CSSProperties}>
                          <NoteIcon />
                        </span>
                        <span className="playlist__item-text">
                          <span className="playlist__item-name">{playlist.name}</span>
                          <span className="playlist__item-meta">{trackCountText(playlist.trackCount)}</span>
                        </span>
                        <span className="playlist__pill" aria-hidden="true">
                          {playlist.id === activeId ? 'Active' : 'Choisir'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {creating ? (
                <form className="playlist__form" onSubmit={handleCreate} noValidate>
                  <label htmlFor="playlist-new-name">Nom de la playlist</label>
                  <input
                    id="playlist-new-name"
                    type="text"
                    maxLength={PLAYLIST_NAME_MAX}
                    autoComplete="off"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    // The member just asked for this field: it gets the focus.
                    autoFocus
                  />
                  <div className="playlist__row-actions">
                    <button type="submit" className="btn-primary" disabled={busy}>
                      Créer
                    </button>
                    <button
                      type="button"
                      className="playlist__secondary"
                      onClick={() => {
                        setCreating(false)
                        setNewName('')
                        resetMessages()
                      }}
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  className="playlist__create"
                  disabled={lists.playlists.length >= PLAYLISTS_MAX}
                  onClick={() => {
                    setCreating(true)
                    resetMessages()
                  }}
                >
                  + Créer une playlist
                </button>
              )}
              {lists.playlists.length >= PLAYLISTS_MAX && (
                <p className="playlist__note">Tu as atteint la limite de {PLAYLISTS_MAX} playlists.</p>
              )}
            </section>

            {active && (
              <section className="playlist__card" aria-labelledby="tracks-title">
                <header className="playlist__card-header playlist__card-header--tracks">
                  {renaming ? (
                    <form className="playlist__rename" onSubmit={handleRename} noValidate>
                      <label htmlFor="playlist-rename" className="visually-hidden">
                        Nouveau nom de la playlist
                      </label>
                      <input
                        id="playlist-rename"
                        type="text"
                        maxLength={PLAYLIST_NAME_MAX}
                        autoComplete="off"
                        value={renameTo}
                        onChange={(event) => setRenameTo(event.target.value)}
                        autoFocus
                      />
                      <button type="submit" className="btn-primary" disabled={busy}>
                        Enregistrer
                      </button>
                      <button type="button" className="playlist__secondary" onClick={() => setRenaming(false)}>
                        Annuler
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="playlist__heading">
                        <h2 id="tracks-title" tabIndex={-1} ref={tracksHeading}>
                          {active.name}
                        </h2>
                        <p className="playlist__count">
                          {trackList.length} / {PLAYLIST_TRACKS_MAX} morceaux{total > 0 && ` · ${formatClock(total)}`}
                        </p>
                      </div>
                      <div className="playlist__row-actions">
                        <button
                          type="button"
                          className="playlist__secondary"
                          onClick={() => {
                            setRenameTo(active.name)
                            setRenaming(true)
                            setConfirmDelete(false)
                            resetMessages()
                          }}
                        >
                          Renommer
                        </button>
                        <button type="button" className="playlist__secondary" onClick={() => setConfirmDelete(true)}>
                          Supprimer
                        </button>
                      </div>
                    </>
                  )}
                </header>

                {confirmDelete && (
                  <div className="playlist__confirm" role="group" aria-label="Confirmer la suppression">
                    <p>
                      Supprimer « {active.name} » ? Ses {trackCountText(trackList.length)} seront supprimés aussi, et on ne peut pas revenir en arrière.
                    </p>
                    <div className="playlist__row-actions">
                      <button type="button" className="playlist__danger" disabled={busy} onClick={() => void handleDelete()}>
                        Supprimer
                      </button>
                      <button type="button" className="playlist__secondary" onClick={() => setConfirmDelete(false)}>
                        Garder
                      </button>
                    </div>
                  </div>
                )}

                <form className="playlist__form" onSubmit={handleAddTrack} noValidate>
                  <label htmlFor="playlist-link">Ajouter un morceau</label>
                  <div className="playlist__field">
                    <input
                      id="playlist-link"
                      type="text"
                      inputMode="url"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      maxLength={DJ_INPUT_MAX}
                      placeholder="https://www.youtube.com/watch?v=…"
                      value={link}
                      aria-describedby="playlist-link-help"
                      onChange={(event) => {
                        setLink(event.target.value)
                        resetMessages()
                      }}
                    />
                    <button type="submit" className="btn-primary" disabled={busy || trackList.length >= PLAYLIST_TRACKS_MAX}>
                      Ajouter
                    </button>
                  </div>
                  <p id="playlist-link-help" className="playlist__hint">
                    Colle l'adresse d'une vidéo YouTube. Elle doit pouvoir être lue en dehors de YouTube.
                  </p>
                </form>

                {tracks.status === 'loading' && (
                  <p className="playlist__note" role="status">
                    Chargement de la playlist…
                  </p>
                )}
                {tracks.status === 'error' && (
                  <div className="playlist__note">
                    <p role="alert">{tracks.error}</p>
                    <button type="button" className="playlist__secondary" onClick={() => void tracks.reload()}>
                      Réessayer
                    </button>
                  </div>
                )}
                {tracks.status === 'ready' && trackList.length === 0 && <p className="playlist__note">Cette playlist est vide pour l'instant.</p>}

                {tracks.status === 'ready' && trackList.length > 0 && (
                  <>
                    <label htmlFor="playlist-filter" className="visually-hidden">
                      Filtrer cette playlist
                    </label>
                    <input
                      id="playlist-filter"
                      type="search"
                      className="playlist__filter"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Filtrer cette playlist…"
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                    />
                  </>
                )}
                {shown.length === 0 && trackList.length > 0 && (
                  <p className="playlist__note" role="status">
                    Aucun morceau ne correspond à « {filter.trim()} ».
                  </p>
                )}

                {shown.length > 0 && (
                  <ol className="playlist__tracks" role="list" aria-label={`Morceaux de ${active.name}`}>
                    {shown.map((track) => {
                      const title = track.title ?? 'Titre à actualiser'
                      const index = trackList.indexOf(track)
                      return (
                        <li key={track.id} className="playlist__track" data-unavailable={track.unavailable ? '' : undefined}>
                          <span className="playlist__rank" aria-hidden="true">
                            {index + 1}
                          </span>
                          <span className="playlist__cover" aria-hidden="true" style={{ '--hue': hueOf(track.videoId) } as CSSProperties}>
                            <NoteIcon />
                          </span>
                          <span className="playlist__track-text">
                            <span className="playlist__track-title">{title}</span>
                            <span className="playlist__track-meta">
                              {track.artist ?? 'Artiste inconnu'}
                              {track.durationSec !== null && ` · ${formatClock(track.durationSec)}`}
                            </span>
                            {track.unavailable && <span className="playlist__verdict">Indisponible : la vidéo ne peut plus être lue</span>}
                          </span>
                          <span className="playlist__track-actions">
                            {/* Moving is by buttons, not by dragging: it works with a keyboard and on a touch screen. With a
                                filter on, the order of the whole list is hidden, so the arrows wait until it is cleared. */}
                            <button
                              type="button"
                              id={`pl-move-up-${track.id}`}
                              aria-label={`Monter « ${title} »`}
                              disabled={busy || index === 0 || wanted !== ''}
                              onClick={() => void handleMove(track.id, title, 'up')}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              id={`pl-move-down-${track.id}`}
                              aria-label={`Descendre « ${title} »`}
                              disabled={busy || index === trackList.length - 1 || wanted !== ''}
                              onClick={() => void handleMove(track.id, title, 'down')}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="playlist__remove"
                              aria-label={`Retirer « ${title} » de la playlist`}
                              disabled={busy}
                              onClick={() => void handleRemoveTrack(track.id, title)}
                            >
                              Retirer
                            </button>
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
