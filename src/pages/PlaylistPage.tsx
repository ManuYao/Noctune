import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router'
import { DJ_INPUT_MAX, PLAYLISTS_MAX, PLAYLIST_NAME_MAX, PLAYLIST_TRACKS_MAX, type PlaylistSummary } from '../../shared/protocol'
import { useAccount } from '../auth/useAccount'
import PlaylistCover from '../components/PlaylistCover'
import PlaylistPick from '../components/PlaylistPick'
import SiteHeader from '../components/SiteHeader'
import { formatClock } from '../data/duration'
import { usePlaylists, usePlaylistTracks } from '../playlists/usePlaylists'
import './PageKit.css'
import './PlaylistPage.css'

/** Without accents and capitals, so that "cafe" finds "Café froid". */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const trackCountText = (count: number) => `${count} morceau${count > 1 ? 'x' : ''}`

/**
 * The member's playlists (no mock-up of its own: dressed as the panels of 5b and 3c): the list on the left, the tracks
 * of the chosen one on the right.
 */
export default function PlaylistPage() {
  const { account, status } = useAccount()

  // The server has said nobody is signed in: playlists belong to members.
  if (status === 'ready' && !account) return <Navigate to="/connexion" replace />
  if (status !== 'ready') {
    return (
      <div>
        <SiteHeader />
        <main className="kit-page playlist">
          <p className="kit-hint" role="status">
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

  // A confirmation is a few words that go away by themselves: it is not something to read twice.
  useEffect(() => {
    if (note === '') return
    const timer = window.setTimeout(() => setNote(''), 4000)
    return () => window.clearTimeout(timer)
  }, [note])

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
    setNote('Playlist créée.')
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
    setNote('Nom changé.')
  }

  async function handleDelete() {
    if (busy || !active) return
    resetMessages()
    setBusy(true)
    const result = await lists.remove(active.id)
    setBusy(false)
    setConfirmDelete(false)
    if (!result.ok) return setError(result.message)
    setNote('Playlist supprimée.')
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
    setNote('Morceau ajouté.')
  }

  async function handleRemoveTrack(trackId: string) {
    if (busy || !active) return
    resetMessages()
    setBusy(true)
    const result = await tracks.remove(trackId)
    setBusy(false)
    if (!result.ok) return setError(result.message)
    lists.countChanged(active.id, trackList.length - 1)
    setNote('Morceau retiré.')
    window.setTimeout(() => tracksHeading.current?.focus(), 0)
  }

  async function handleMove(trackId: string, direction: 'up' | 'down') {
    if (busy) return
    const from = trackList.findIndex((track) => track.id === trackId)
    const position = direction === 'up' ? from - 1 : from + 1
    if (from === -1 || position < 0 || position >= trackList.length) return
    resetMessages()
    focusAfterMove.current = { trackId, direction }
    const result = await tracks.move(trackId, position)
    if (!result.ok) return setError(result.message)
    setNote(`Morceau déplacé : n° ${position + 1}.`)
  }

  const wanted = fold(filter.trim())
  const shown = wanted === '' ? trackList : trackList.filter((track) => fold(`${track.title ?? ''} ${track.artist ?? ''}`).includes(wanted))
  const total = trackList.reduce((sum, track) => sum + (track.durationSec ?? 0), 0)

  return (
    <div>
      <SiteHeader />
      <main className="kit-page playlist">
        <div className="kit-intro">
          <h1>Mes playlists</h1>
          <p>Range tes morceaux et choisis ta playlist active : c'est elle qui s'ouvre en premier quand tu passes DJ.</p>
        </div>

        {/* Live regions: always in the page, empty most of the time. */}
        <p className="kit-feedback kit-feedback--error playlist__feedback" role="alert">
          {error}
        </p>
        <p className="kit-feedback playlist__feedback playlist__note" role="status">
          {note}
        </p>

        {lists.status === 'loading' && (
          <p className="kit-hint" role="status">
            Chargement de tes playlists…
          </p>
        )}
        {lists.status === 'error' && (
          <div className="playlist__problem">
            <p role="alert">{lists.error}</p>
            <button type="button" className="kit-btn kit-btn--ghost" onClick={() => void lists.reload()}>
              Réessayer
            </button>
          </div>
        )}

        {lists.status === 'ready' && (
          <div className="playlist__layout">
            <section className="kit-panel playlist__lists" aria-labelledby="playlists-title">
              <div className="kit-panel__head">
                <h2 className="kit-panel__title" id="playlists-title" tabIndex={-1} ref={listsHeading}>
                  Playlists
                </h2>
                <span className="kit-panel__count">
                  {lists.playlists.length} / {PLAYLISTS_MAX}
                </span>
              </div>

              {lists.playlists.length === 0 && !creating && (
                <p className="kit-hint playlist__empty">
                  Tu n'as pas encore de playlist. Crée la première : tu pourras y garder les morceaux que tu aimes, et les lancer d'un
                  clic quand tu passes DJ.
                </p>
              )}

              {lists.playlists.length > 0 && (
                <ul className="playlist__items" role="list">
                  {lists.playlists.map((playlist: PlaylistSummary) => (
                    <li key={playlist.id}>
                      <PlaylistPick
                        playlist={playlist}
                        active={playlist.id === activeId}
                        onSelect={() => {
                          lists.select(playlist.id)
                          setRenaming(false)
                          setConfirmDelete(false)
                          setFilter('')
                          resetMessages()
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {creating ? (
                <form className="playlist__form" onSubmit={handleCreate} noValidate>
                  <label htmlFor="playlist-new-name" className="kit-label">
                    Nom de la playlist
                  </label>
                  <input
                    id="playlist-new-name"
                    className="kit-input"
                    type="text"
                    maxLength={PLAYLIST_NAME_MAX}
                    autoComplete="off"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    // The member just asked for this field: it gets the focus.
                    autoFocus
                  />
                  <div className="playlist__row-actions">
                    <button type="submit" className="kit-btn" disabled={busy}>
                      Créer
                    </button>
                    <button
                      type="button"
                      className="kit-btn kit-btn--ghost"
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
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M8 3 V13 M3 8 H13" />
                  </svg>
                  Créer une playlist
                </button>
              )}
              {lists.playlists.length >= PLAYLISTS_MAX && <p className="kit-hint">Tu as atteint la limite de {PLAYLISTS_MAX} playlists.</p>}
            </section>

            {active && (
              <section className="kit-panel playlist__tracks-panel" aria-labelledby="tracks-title">
                <div className="playlist__tracks-head">
                  {renaming ? (
                    <form className="playlist__rename" onSubmit={handleRename} noValidate>
                      <label htmlFor="playlist-rename" className="visually-hidden">
                        Nouveau nom de la playlist
                      </label>
                      <input
                        id="playlist-rename"
                        className="kit-input"
                        type="text"
                        maxLength={PLAYLIST_NAME_MAX}
                        autoComplete="off"
                        value={renameTo}
                        onChange={(event) => setRenameTo(event.target.value)}
                        autoFocus
                      />
                      <button type="submit" className="kit-btn" disabled={busy}>
                        Enregistrer
                      </button>
                      <button type="button" className="kit-btn kit-btn--ghost" onClick={() => setRenaming(false)}>
                        Annuler
                      </button>
                    </form>
                  ) : (
                    <>
                      <PlaylistCover seed={active.id} size={64} />
                      <div className="playlist__heading">
                        <h2 className="playlist__name" id="tracks-title" tabIndex={-1} ref={tracksHeading}>
                          {active.name}
                        </h2>
                        <p className="kit-panel__count">
                          {trackList.length} / {PLAYLIST_TRACKS_MAX} morceaux{total > 0 && ` · ${formatClock(total)}`}
                          {' · '}
                          <span className="playlist__active">Playlist active</span>
                        </p>
                      </div>
                      <div className="playlist__row-actions">
                        <button
                          type="button"
                          className="kit-btn kit-btn--ghost playlist__small"
                          onClick={() => {
                            setRenameTo(active.name)
                            setRenaming(true)
                            setConfirmDelete(false)
                            resetMessages()
                          }}
                        >
                          Renommer
                        </button>
                        <button type="button" className="kit-btn kit-btn--ghost playlist__small" onClick={() => setConfirmDelete(true)}>
                          Supprimer
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {confirmDelete && (
                  <div className="playlist__confirm" role="group" aria-label="Confirmer la suppression">
                    <p>
                      Supprimer « {active.name} » ? Ses {trackCountText(trackList.length)} seront supprimés aussi, et on ne peut pas revenir en arrière.
                    </p>
                    <div className="playlist__row-actions">
                      <button type="button" className="kit-btn playlist__danger" disabled={busy} onClick={() => void handleDelete()}>
                        Supprimer
                      </button>
                      <button type="button" className="kit-btn kit-btn--ghost" onClick={() => setConfirmDelete(false)}>
                        Garder
                      </button>
                    </div>
                  </div>
                )}

                <form className="playlist__form" onSubmit={handleAddTrack} noValidate>
                  <label htmlFor="playlist-link" className="kit-label">
                    Ajouter un morceau
                  </label>
                  <div className="playlist__field">
                    <span className="playlist__field-box">
                      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8.5 11.5 L11.5 8.5 M9 5.5 L10.5 4 A3.2 3.2 0 0 1 16 8.5 L14.5 10 M11 14.5 L9.5 16 A3.2 3.2 0 0 1 4 11.5 L5.5 10" />
                      </svg>
                      <input
                        id="playlist-link"
                        className="kit-input"
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
                    </span>
                    <button type="submit" className="kit-btn kit-btn--tall" disabled={busy || trackList.length >= PLAYLIST_TRACKS_MAX}>
                      Ajouter
                    </button>
                  </div>
                  <p id="playlist-link-help" className="kit-hint">
                    Colle l'adresse d'une vidéo YouTube. Elle doit pouvoir être lue en dehors de YouTube.
                  </p>
                </form>

                {tracks.status === 'loading' && (
                  <p className="kit-hint" role="status">
                    Chargement de la playlist…
                  </p>
                )}
                {tracks.status === 'error' && (
                  <div className="playlist__problem">
                    <p role="alert">{tracks.error}</p>
                    <button type="button" className="kit-btn kit-btn--ghost" onClick={() => void tracks.reload()}>
                      Réessayer
                    </button>
                  </div>
                )}
                {tracks.status === 'ready' && trackList.length === 0 && <p className="kit-hint playlist__empty">Cette playlist est vide pour l'instant.</p>}

                {tracks.status === 'ready' && trackList.length > 0 && (
                  <div className="playlist__filter">
                    <label htmlFor="playlist-filter" className="visually-hidden">
                      Filtrer cette playlist
                    </label>
                    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                      <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
                      <path d="M13 13 L17 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <input
                      id="playlist-filter"
                      type="search"
                      className="kit-input"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="Filtrer cette playlist…"
                      value={filter}
                      onChange={(event) => setFilter(event.target.value)}
                    />
                  </div>
                )}
                {shown.length === 0 && trackList.length > 0 && (
                  <p className="kit-hint" role="status">
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
                          <PlaylistCover seed={track.videoId} size={48} dimmed={track.unavailable} />
                          <span className="playlist__track-text">
                            <span className="playlist__track-title">{title}</span>
                            <span className="playlist__track-meta">
                              {track.artist ?? 'Artiste inconnu'}
                              {track.durationSec !== null && <span className="playlist__duration-inline">{` · ${formatClock(track.durationSec)}`}</span>}
                            </span>
                            {track.unavailable && <span className="playlist__verdict">Indisponible : la vidéo ne peut plus être lue</span>}
                          </span>
                          {track.durationSec !== null && (
                            <span className="playlist__duration" aria-hidden="true">
                              {formatClock(track.durationSec)}
                            </span>
                          )}
                          <span className="playlist__track-actions">
                            {/* Moving is by buttons, not by dragging: it works with a keyboard and on a touch screen. With a
                                filter on, the order of the whole list is hidden, so the arrows wait until it is cleared. */}
                            <button
                              type="button"
                              id={`pl-move-up-${track.id}`}
                              className="playlist__icon-button"
                              aria-label={`Monter « ${title} »`}
                              disabled={busy || index === 0 || wanted !== ''}
                              onClick={() => void handleMove(track.id, 'up')}
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 13 V3 M3.5 7.5 L8 3 L12.5 7.5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              id={`pl-move-down-${track.id}`}
                              className="playlist__icon-button"
                              aria-label={`Descendre « ${title} »`}
                              disabled={busy || index === trackList.length - 1 || wanted !== ''}
                              onClick={() => void handleMove(track.id, 'down')}
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M8 3 V13 M3.5 8.5 L8 13 L12.5 8.5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="kit-btn kit-btn--ghost playlist__small"
                              aria-label={`Retirer « ${title} » de la playlist`}
                              disabled={busy}
                              onClick={() => void handleRemoveTrack(track.id)}
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
