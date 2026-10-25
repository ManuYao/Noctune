import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import type { TrackStatus } from '../../shared/protocol'
import { formatClock } from '../data/duration'
import { verdictText } from '../playlists/playlistMessages'
import { usePlaylists, usePlaylistTracks } from '../playlists/usePlaylists'
import type { SendPlaylistStatusResult } from '../realtime/useRoom'
import './DjPlaylistTab.css'

interface DjPlaylistTabProps {
  /** The member is in the queue already: the buttons say "Ajouter", otherwise "Rejoindre". */
  inQueue: boolean
  /** A request is out: the buttons wait for it. */
  busy: boolean
  /** Changes when the room's answer about a track may have changed: what plays, the member's own line-up. */
  refreshKey: string
  /** Goes up when a track was kept in a playlist from elsewhere in the dialog: the list is read again. */
  keptVersion: number
  onAdd: (playlistTrackId: string) => void
  onPlaylistStatus: (playlistId: string) => Promise<SendPlaylistStatusResult>
  /** "Pas dans ta playlist ?": the other tab. */
  onShowLink: () => void
}

/** Without accents and capitals, so that "cafe" finds "Café froid". */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** A colour for the cover of a track, the same every time for the same video (the mock-up has gradient covers). */
function coverHue(videoId: string): number {
  let sum = 0
  for (const character of videoId) sum = (sum * 31 + character.charCodeAt(0)) % 360
  return sum
}

export default function DjPlaylistTab({
  inQueue,
  busy,
  refreshKey,
  keptVersion,
  onAdd,
  onPlaylistStatus,
  onShowLink,
}: DjPlaylistTabProps) {
  const lists = usePlaylists()
  const { activeId } = lists
  const tracks = usePlaylistTracks(activeId, keptVersion)
  const [filter, setFilter] = useState('')
  const [statuses, setStatuses] = useState<Record<string, TrackStatus>>({})

  // What the room would say about each track. Asked again when the playlist, its tracks, what plays or the member's own
  // line-up change; a moment after, so that a burst of changes is one question.
  const trackIds = tracks.tracks.map((track) => track.id).join(',')
  useEffect(() => {
    if (!activeId || tracks.status !== 'ready' || trackIds === '') return
    let cancelled = false
    let timer: number | undefined
    const ask = async () => {
      const result = await onPlaylistStatus(activeId)
      if (cancelled) return
      if (result.ok) setStatuses(result.statuses)
      // Too many questions at once: once more when the server says it is fine. Any other failure leaves the tracks
      // without a verdict, and the server still says why when one of them is refused.
      else if (result.error === 'rate-limited') timer = window.setTimeout(ask, result.retryAfterMs + 50)
    }
    timer = window.setTimeout(ask, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [activeId, tracks.status, trackIds, refreshKey, onPlaylistStatus])

  const wanted = fold(filter.trim())
  const shown = wanted === '' ? tracks.tracks : tracks.tracks.filter((track) => fold(`${track.title ?? ''} ${track.artist ?? ''}`).includes(wanted))

  if (lists.status === 'loading') {
    return (
      <p className="dj-playlist__note" role="status">
        Chargement de tes playlists…
      </p>
    )
  }
  if (lists.status === 'error') {
    return (
      <div className="dj-playlist__note">
        <p role="alert">{lists.error}</p>
        <button type="button" className="dj-playlist__secondary" onClick={() => void lists.reload()}>
          Réessayer
        </button>
      </div>
    )
  }
  if (lists.playlists.length === 0) {
    return (
      <div className="dj-playlist__note">
        <p>Tu n'as pas encore de playlist. Garde un morceau avec « Garder dans ma playlist », ou crée-en une sur la page Playlist.</p>
        <div className="dj-playlist__actions">
          <button type="button" className="dj-playlist__secondary" onClick={onShowLink}>
            Coller un lien YouTube
          </button>
          {/* A new tab: the room, and its player, keep going while the playlist is made. */}
          <Link to="/playlist" target="_blank" rel="noopener noreferrer">
            Créer une playlist<span className="visually-hidden"> (nouvel onglet)</span>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="dj-playlist">
      <div className="dj-playlist__controls">
        <label htmlFor="dj-playlist-select">Ma playlist</label>
        <select id="dj-playlist-select" value={activeId ?? ''} onChange={(event) => lists.select(event.target.value)}>
          {lists.playlists.map((playlist) => (
            <option key={playlist.id} value={playlist.id}>
              {playlist.name} ({playlist.trackCount})
            </option>
          ))}
        </select>
      </div>
      <label htmlFor="dj-playlist-filter" className="visually-hidden">
        Filtrer ma playlist
      </label>
      <input
        id="dj-playlist-filter"
        type="search"
        autoComplete="off"
        spellCheck={false}
        placeholder="Filtrer ma playlist…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />

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
            const verdict = track.unavailable ? 'Indisponible' : verdictText(statuses[track.id] ?? { state: 'ok' })
            const title = track.title ?? 'Titre à actualiser'
            const refused = verdict !== null
            return (
              <li key={track.id} className="dj-playlist__row" data-refused={refused ? '' : undefined}>
                <span className="dj-playlist__cover" aria-hidden="true" style={{ '--hue': coverHue(track.videoId) } as CSSProperties}>
                  <svg viewBox="0 0 24 24" width="20" height="20" focusable="false">
                    <path d="M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="dj-playlist__text">
                  <span className="dj-playlist__title">{title}</span>
                  <span className="dj-playlist__meta">
                    {track.artist ?? 'Artiste inconnu'}
                    {track.durationSec !== null && ` · ${formatClock(track.durationSec)}`}
                  </span>
                  {verdict && (
                    <span className="dj-playlist__verdict" id={`dj-verdict-${track.id}`}>
                      {verdict}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="dj-playlist__add"
                  aria-label={inQueue ? `Ajouter « ${title} » à ma file` : `Rejoindre la file avec « ${title} »`}
                  aria-describedby={verdict ? `dj-verdict-${track.id}` : undefined}
                  disabled={busy || refused}
                  onClick={() => onAdd(track.id)}
                >
                  {inQueue ? 'Ajouter' : 'Rejoindre'}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" className="dj-playlist__elsewhere" onClick={onShowLink}>
        <strong>Pas dans ta playlist ?</strong>
        <span>Colle un lien YouTube</span>
      </button>
    </div>
  )
}
