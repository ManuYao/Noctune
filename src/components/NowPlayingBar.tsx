import type { ReactNode } from 'react'
import { trackPositionSec } from '../../shared/clock'
import type { DjQueueEntry, Track } from '../../shared/protocol'
import { formatClock } from '../data/duration'
import { UNAVAILABLE_TEXT, type UnavailableReason } from '../player/unavailable'
import { useServerNow } from '../player/useServerNow'
import type { PlayerStatus } from '../player/useYouTubePlayer'
import SpeakerIcon from './SpeakerIcon'
import './NowPlayingBar.css'

interface NowPlayingBarProps {
  track: Track | null
  /** The DJ whose track plays, or null while the room's own selection plays. */
  dj: DjQueueEntry | null
  /** The viewer is that DJ: their buttons say more, so on a phone they get a row of their own. */
  ownTurn: boolean
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
  status: PlayerStatus
  /** Why this viewer's player refused the track, while `status` says it did. */
  unavailableReason?: UnavailableReason | null
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
  'consent-needed': 'Lecteur YouTube désactivé : pas de son.',
}

export default function NowPlayingBar({
  track,
  dj,
  ownTurn,
  clockOffsetMs,
  status,
  unavailableReason = null,
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
  onEnableSound,
  actions,
}: NowPlayingBarProps) {
  const serverNow = useServerNow(clockOffsetMs, track !== null)
  const position = track ? Math.min(track.durationSec, trackPositionSec(track, serverNow)) : 0
  const unavailable = status === 'video-unavailable'
  // No player (the viewer did not accept YouTube's): there is no sound to adjust, and the screen says why.
  const noPlayer = status === 'consent-needed'
  const note = unavailable ? UNAVAILABLE_TEXT[unavailableReason ?? 'other'].note : STATUS_NOTES[status]
  const needsTap = status === 'sound-blocked' || status === 'tap-needed'

  return (
    <div className={ownTurn ? 'bar bar--own' : 'bar'}>
      <div className="bar__info">
        {/* A DJ's track brings its YouTube title, which can be long: the screen cuts it (the full text is in the tooltip,
            and read in full by a screen reader) so that the bar keeps a height the video can live with. */}
        <p className="bar__title" title={track?.title}>
          {track ? track.title : 'Aucun morceau'}
        </p>
        {track && (
          <p className="bar__artist">
            <span className="bar__artist-name">{track.artist}</span>
            <span className="bar__dj">{dj ? `Passé par ${dj.pseudo}` : 'Sélection de la room'}</span>
          </p>
        )}
      </div>

      {track && (
        <div className="bar__progress">
          <span>{formatClock(position)}</span>
          <progress max={track.durationSec} value={position} aria-label="Progression du morceau" />
          <span>{formatClock(track.durationSec)}</span>
        </div>
      )}

      <div className="bar__actions">{actions}</div>

      <div className="bar__sound">
        <button
          type="button"
          className="bar__mute"
          aria-pressed={muted}
          aria-label="Muet"
          disabled={noPlayer}
          onClick={onToggleMute}
        >
          <SpeakerIcon muted={muted || volume === 0} />
        </button>
        <input
          type="range"
          className="bar__volume"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          aria-label="Volume"
          disabled={noPlayer}
          onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
        />
      </div>

      {needsTap && (
        <button type="button" className="btn-primary bar__enable" onClick={onEnableSound}>
          {status === 'tap-needed' ? 'Lancer la lecture' : 'Activer le son'}
        </button>
      )}

      {note && (
        // The video screen announces the unavailable track in full: the bar only repeats it, shorter, for the eye.
        <p className="bar__note" role={unavailable || noPlayer ? undefined : 'status'}>
          {note}
        </p>
      )}
    </div>
  )
}
