import { useState } from 'react'
import { Link } from 'react-router'
import type { PlaylistTrack, RoomRules } from '../../shared/protocol'
import { formatClock } from '../data/duration'
import TrackCover from './TrackCover'
import { trackVerdict, type DjPlaylist } from './useDjPlaylist'
import './DjPlaylistTab.css'

interface DjPlaylistTabProps {
  playlist: DjPlaylist
  rules: RoomRules
  /** The track chosen for "Ton morceau", if it is one of the playlist's. */
  pickedId: string | null
  /** A row was pressed: the dialog chooses it, or says why the room would refuse it. */
  onPick: (track: PlaylistTrack) => void
  onSelectPlaylist: (playlistId: string) => void
  /** On a phone, the link is behind the other tab: a way to it. Absent on a computer, where it is in view. */
  onShowLink?: () => void
}

/** Without accents and capitals, so that "cafe" finds "Café froid". */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * "Ma playlist" of mock-up 3c: the playlist menu, the filter, and one row per track with its length and either
 * "Choisir" / "Choisi" or what the room says about it ("Joué il y a 41 min", "Trop long · max 7:00"). A row is one
 * button, pressed or not; a track the room would refuse stays in the list, quiet, and pressing it says why.
 */
export default function DjPlaylistTab({ playlist, rules, pickedId, onPick, onSelectPlaylist, onShowLink }: DjPlaylistTabProps) {
  const { lists, tracks, statuses } = playlist
  const [filter, setFilter] = useState('')

  const heading = (
    <h3 id="dj-playlist-title" className="dj-playlist__heading">
      {lists.status === 'ready' && lists.playlists.length > 0 ? <label htmlFor="dj-playlist-select">Ma playlist</label> : 'Ma playlist'}
    </h3>
  )

  if (lists.status === 'loading') {
    return (
      <>
        <div className="dj-playlist__top">{heading}</div>
        <p className="dj-playlist__note" role="status">
          Chargement de tes playlists…
        </p>
      </>
    )
  }
  if (lists.status === 'error') {
    return (
      <>
        <div className="dj-playlist__top">{heading}</div>
        <div className="dj-playlist__note">
          <p role="alert">{lists.error}</p>
          <button type="button" className="dj-playlist__secondary" onClick={() => void lists.reload()}>
            Réessayer
          </button>
        </div>
      </>
    )
  }
  if (lists.playlists.length === 0) {
    return (
      <>
        <div className="dj-playlist__top">{heading}</div>
        <div className="dj-playlist__note">
          <p>Tu n'as pas encore de playlist. Garde un morceau avec « Garder dans ma playlist », ou crée-en une sur la page Playlist.</p>
          <div className="dj-playlist__actions">
            {onShowLink && (
              <button type="button" className="dj-playlist__secondary" onClick={onShowLink}>
                Coller un lien YouTube
              </button>
            )}
            {/* A new tab: the room, and its player, keep going while the playlist is made. */}
            <Link to="/playlist" target="_blank" rel="noopener noreferrer" className="dj-playlist__secondary">
              Créer une playlist<span className="visually-hidden"> (nouvel onglet)</span>
            </Link>
          </div>
        </div>
      </>
    )
  }

  const wanted = fold(filter.trim())
  const shown = wanted === '' ? tracks.tracks : tracks.tracks.filter((track) => fold(`${track.title ?? ''} ${track.artist ?? ''}`).includes(wanted))

  return (
    <>
      <div className="dj-playlist__top">
        {heading}
        <span className="dj-playlist__menu">
          <select id="dj-playlist-select" value={lists.activeId ?? ''} onChange={(event) => onSelectPlaylist(event.target.value)}>
            {lists.playlists.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 4.5 L6 8 L9.5 4.5" />
          </svg>
        </span>
      </div>

      <div className="dj-search">
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="M13 13 L17 17" />
        </svg>
        <input
          type="search"
          aria-label="Filtrer ma playlist"
          autoComplete="off"
          spellCheck={false}
          placeholder="Filtrer ma playlist…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>

      {tracks.status === 'loading' && (
        <p className="dj-playlist__note" role="status">
          Chargement de ta playlist…
        </p>
      )}
      {tracks.status === 'error' && (
        <div className="dj-playlist__note">
          <p role="alert">{tracks.error}</p>
          <button type="button" className="dj-playlist__secondary" onClick={() => void tracks.reload()}>
            Réessayer
          </button>
        </div>
      )}
      {tracks.status === 'ready' && tracks.tracks.length === 0 && (
        <p className="dj-playlist__note">Cette playlist est vide : garde un lien avec « Garder dans ma playlist », ou ajoutes-en depuis la page Playlist.</p>
      )}
      {tracks.status === 'ready' && tracks.tracks.length > 0 && shown.length === 0 && (
        <p className="dj-playlist__note" role="status">
          Aucun morceau ne correspond à « {filter.trim()} ».
        </p>
      )}

      {shown.length > 0 && (
        <ul className="dj-playlist__list" role="list" aria-label="Morceaux de la playlist">
          {shown.map((track) => {
            const verdict = trackVerdict(track, statuses[track.id], rules)
            const picked = track.id === pickedId
            const title = track.title ?? 'Titre à actualiser'
            const artist = track.artist ?? 'Artiste inconnu'
            return (
              <li key={track.id}>
                <button
                  type="button"
                  className="dj-track"
                  aria-pressed={picked}
                  // Still reachable, so that the reason (in its name) can be heard: pressing it says it in full.
                  aria-disabled={verdict ? true : undefined}
                  onClick={() => onPick(track)}
                >
                  <TrackCover seed={track.videoId} />
                  <span className="dj-track__text">
                    <span className="dj-track__title">{title}</span>
                    <span className="dj-track__artist">{artist}</span>
                  </span>
                  {track.durationSec !== null && (
                    <span className="dj-track__length">
                      <span className="visually-hidden">Durée </span>
                      {formatClock(track.durationSec)}
                    </span>
                  )}
                  {verdict ? (
                    <span className="dj-track__verdict">{verdict.short}</span>
                  ) : (
                    <span className="dj-track__pick" aria-hidden="true">
                      {picked ? 'Choisi' : 'Choisir'}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {onShowLink && (
        <button type="button" className="dj-playlist__elsewhere" onClick={onShowLink}>
          <strong>Pas dans ta playlist ?</strong>
          <span>Colle un lien YouTube</span>
        </button>
      )}
    </>
  )
}
