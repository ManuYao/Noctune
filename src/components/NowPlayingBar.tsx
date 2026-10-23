import type { ReactNode } from 'react'
import { trackPositionSec } from '../../shared/clock'
import type { Track } from '../../shared/protocol'
import { useServerNow } from '../player/useServerNow'
import type { PlayerStatus } from '../player/useYouTubePlayer'
import SpeakerIcon from './SpeakerIcon'
import './NowPlayingBar.css'

interface NowPlayingBarProps {
  track: Track | null
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
  status: PlayerStatus
  volume: number
  muted: boolean
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
  onEnableSound: () => void
  /** Buttons for what the audience can do with the track (like, skip). */
  actions: ReactNode
}

const STATUS_NOTES: Partial<Record<PlayerStatus, string>> = {
  loading: 'Chargement de la vidéo…',
  'sound-blocked': 'Ton navigateur a coupé le son : un clic suffit pour le remettre.',
  'tap-needed': 'Ton navigateur attend un clic pour lancer la vidéo.',
  'video-unavailable': 'YouTube ne permet pas de lire cette vidéo ici. Le morceau suivant démarrera tout seul.',
}

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function NowPlayingBar({
  track,
  clockOffsetMs,
  status,
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  onEnableSound,
  actions,
}: NowPlayingBarProps) {
  const serverNow = useServerNow(clockOffsetMs, track !== null)
  const position = track ? Math.min(track.durationSec, trackPositionSec(track, serverNow)) : 0
  const note = STATUS_NOTES[status]
  const needsTap = status === 'sound-blocked' || status === 'tap-needed'

  return (
    <div className="bar">
      <div className="bar__info">
        <p className="bar__title">{track ? track.title : 'Aucun morceau'}</p>
        {track && <p className="bar__artist">{track.artist}</p>}
      </div>

      {track && (
        <div className="bar__progress">
          <span>{formatTime(position)}</span>
          <progress max={track.durationSec} value={position} aria-label="Progression du morceau" />
          <span>{formatTime(track.durationSec)}</span>
        </div>
      )}

      <div className="bar__actions">{actions}</div>

      <div className="bar__sound">
        <button type="button" className="bar__mute" aria-pressed={muted} aria-label="Muet" onClick={onToggleMute}>
          <SpeakerIcon muted={muted || volume === 0} />
        </button>
        <input
          type="range"
          className="bar__volume"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          aria-label="Volume"
          onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
        />
      </div>

      {needsTap && (
        <button type="button" className="btn-primary bar__enable" onClick={onEnableSound}>
          {status === 'tap-needed' ? 'Lancer la lecture' : 'Activer le son'}
        </button>
      )}

      {note && (
        <p className="bar__note" role="status">
          {note}
        </p>
      )}
    </div>
  )
}
