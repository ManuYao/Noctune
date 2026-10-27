import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { PLAYLISTS_MAX, PLAYLIST_NAME_MAX } from '../../shared/protocol'
import type { usePlaylists } from '../playlists/usePlaylists'
import PlaylistCover from './PlaylistCover'
import PlaylistPick from './PlaylistPick'
import '../pages/PageKit.css'
import './ProfilePlaylists.css'

/**
 * "Mes playlists" of mock-up 5b: the member's playlists, the active one lit ("Active", the one "Passer DJ" opens first),
 * the others to choose, a playlist to create, and the way to the playlists page where they are managed.
 */
export default function ProfilePlaylists({ lists }: { lists: ReturnType<typeof usePlaylists> }) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'done' | 'error'; text: string } | null>(null)
  const active = lists.playlists.find((playlist) => playlist.id === lists.activeId) ?? null
  const full = lists.playlists.length >= PLAYLISTS_MAX

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setFeedback(null)
    setBusy(true)
    const result = await lists.create(name)
    setBusy(false)
    if (!result.ok) {
      setFeedback({ kind: 'error', text: result.message })
      document.getElementById('profile-new-playlist')?.focus()
      return
    }
    setCreating(false)
    setName('')
    // A new playlist becomes the active one (see usePlaylists).
    setFeedback({ kind: 'done', text: `La playlist « ${result.value.name} » est créée : c'est ta playlist active.` })
  }

  return (
    <section className="kit-panel profile-pl" aria-labelledby="profile-playlists-title">
      <div className="kit-panel__head">
        <h2 className="kit-panel__title" id="profile-playlists-title">
          Mes playlists
        </h2>
        {lists.status === 'ready' && (
          <span className="kit-panel__count">
            {lists.playlists.length} playlist{lists.playlists.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {lists.status === 'loading' && (
        <p className="kit-hint" role="status">
          Chargement de tes playlists…
        </p>
      )}
      {lists.status === 'error' && (
        <div className="profile-pl__problem">
          <p className="kit-feedback kit-feedback--error" role="alert">
            {lists.error}
          </p>
          <button type="button" className="kit-btn kit-btn--ghost" onClick={() => void lists.reload()}>
            Réessayer
          </button>
        </div>
      )}

      {lists.status === 'ready' && (
        <>
          {lists.playlists.length === 0 && !creating && (
            <p className="kit-hint profile-pl__empty">Tu n'as pas encore de playlist. Crée la première : tu y gardes les morceaux que tu aimes.</p>
          )}
          {lists.playlists.length > 0 && (
            <ul className="profile-pl__list" role="list" aria-label="Choisir ta playlist active">
              {lists.playlists.map((playlist) => (
                <li key={playlist.id}>
                  <PlaylistPick
                    playlist={playlist}
                    active={playlist.id === lists.activeId}
                    onSelect={() => {
                      lists.select(playlist.id)
                      setFeedback(null)
                    }}
                  />
                </li>
              ))}
            </ul>
          )}

          {creating ? (
            <form className="profile-pl__create-form" onSubmit={handleCreate} noValidate>
              <label htmlFor="profile-new-playlist" className="kit-label">
                Nom de la nouvelle playlist
              </label>
              <div className="profile-pl__create-row">
                <input
                  id="profile-new-playlist"
                  className="kit-input"
                  type="text"
                  maxLength={PLAYLIST_NAME_MAX}
                  autoComplete="off"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  // The member just asked for this field: it gets the focus.
                  autoFocus
                />
                <button type="submit" className="kit-btn" disabled={busy}>
                  Créer
                </button>
                <button
                  type="button"
                  className="kit-btn kit-btn--ghost"
                  onClick={() => {
                    setCreating(false)
                    setName('')
                    setFeedback(null)
                  }}
                >
                  Annuler
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="profile-pl__create"
              disabled={full}
              onClick={() => {
                setCreating(true)
                setFeedback(null)
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M8 3 V13 M3 8 H13" />
              </svg>
              Créer une playlist
            </button>
          )}
          {full && <p className="kit-hint">Tu as atteint la limite de {PLAYLISTS_MAX} playlists.</p>}
        </>
      )}

      <p className={`kit-feedback kit-feedback--${feedback?.kind ?? 'done'}`} role={feedback?.kind === 'error' ? 'alert' : 'status'}>
        {feedback?.text ?? ''}
      </p>

      {/* Where the mock-up has "Mon morceau préféré" (not in the site): what the active playlist is for, and where the
          playlists are managed. */}
      <div className="profile-pl__box">
        <p className="kit-eyebrow">{active ? 'Playlist active' : 'Tes playlists'}</p>
        <div className="profile-pl__box-row">
          {active && <PlaylistCover seed={active.id} size={64} />}
          <span className="profile-pl__text">
            {active ? (
              <>
                <span className="profile-pl__box-name">{active.name}</span>
                <span className="profile-pl__meta">S'ouvre en premier quand tu passes DJ.</span>
              </>
            ) : (
              <span className="profile-pl__meta">Range tes morceaux, change leur ordre, ajoute-les par un lien YouTube.</span>
            )}
          </span>
          <Link to="/playlist" className="kit-btn kit-btn--ghost profile-pl__manage">
            Gérer<span className="visually-hidden"> mes playlists</span>
          </Link>
        </div>
      </div>
    </section>
  )
}
