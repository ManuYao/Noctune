import type { CSSProperties, ReactNode } from 'react'
import { trackPositionSec } from '../../shared/clock'
import type { DjQueueEntry, Track } from '../../shared/protocol'
import { formatClock } from '../data/duration'
import { UNAVAILABLE_TEXT, type UnavailableReason } from '../player/unavailable'
import { useServerNow } from '../player/useServerNow'
import type { PlayerStatus } from '../player/useYouTubePlayer'
import type { ReactionMessageKind } from './ReactionButtons'
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
  /** "Passer DJ" and its note, at the right end of the bar (a computer). Null where it lives elsewhere (a phone). */
  djAction?: ReactNode
  /** A refusal, or what was kept, said for a moment over the bar. */
  message: { kind: ReactionMessageKind; text: string } | null
  /** A phone: the one-row bar of mock-up M3 (sleeve, title, like, skip and a thin progress line), without volume. */
  compact?: boolean
}

const STATUS_NOTES: Partial<Record<PlayerStatus, string>> = {
  loading: 'Chargement de la vidéo…',
  'sound-blocked': 'Ton navigateur a coupé le son : un clic suffit pour le remettre.',
  'tap-needed': 'Ton navigateur attend un clic pour lancer la vidéo.',
  'consent-needed': 'Lecteur YouTube désactivé : pas de son.',
}

/** The sleeve of the mock-ups: a sun over the hills, in the colours of the room. Decoration (the title says the track). */
function renderCover() {
  return (
    <svg className="bar__cover" viewBox="0 0 60 60" width="60" height="60" aria-hidden="true" focusable="false">
      <rect width="60" height="60" rx="14" className="bar__cover-screen" />
      <circle cx="30" cy="26" r="13" className="bar__cover-sun" />
      <rect x="16" y="29" width="28" height="2" className="bar__cover-screen" />
      <rect x="16" y="33" width="28" height="2.5" className="bar__cover-screen" />
      <polygon points="0,60 0,46 14,38 24,45 36,36 48,44 60,40 60,60" className="bar__cover-hills" />
    </svg>
  )
}

/**
 * The track that plays (mock-ups 3 and 3b): its sleeve and who brought it, the progress and the reactions in the
 * middle, the sound and "Passer DJ" at the right end. What the bar has to say for a moment (the player waits for a
 * click, a refusal, a track kept) floats just above it, over the floor of the scene and never over the video.
 */
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
  djAction = null,
  message,
  compact = false,
}: NowPlayingBarProps) {
  const serverNow = useServerNow(clockOffsetMs, track !== null)
  const position = track ? Math.min(track.durationSec, trackPositionSec(track, serverNow)) : 0
  const unavailable = status === 'video-unavailable'
  // No player (the viewer did not accept YouTube's): there is no sound to adjust, and the screen says why.
  const noPlayer = status === 'consent-needed'
  const note = unavailable ? UNAVAILABLE_TEXT[unavailableReason ?? 'other'].note : STATUS_NOTES[status]
  const needsTap = status === 'sound-blocked' || status === 'tap-needed'
  const shownVolume = muted ? 0 : Math.round(volume * 100)

  // What the bar has to say for a moment: the same on a computer (over the floor of the scene) and on a phone (over the
  // top of the tab under the bar, never over the video).
  const floating = (
    <div className="bar__float">
      {(note || needsTap) && (
        <div className="bar__status">
          {note && (
            // The video screen announces the unavailable track in full: the bar only repeats it, shorter, for the eye.
            <p className="bar__note" role={unavailable || noPlayer ? undefined : 'status'}>
              {note}
            </p>
          )}
          {needsTap && (
            <button type="button" className="btn-primary bar__enable" onClick={onEnableSound}>
              {status === 'tap-needed' ? 'Lancer la lecture' : 'Activer le son'}
            </button>
          )}
        </div>
      )}
      {/* Always in the page, empty most of the time: a screen reader only hears a live region it already knew. */}
      <p className="bar__message" data-kind={message?.kind ?? 'info'} role="status">
        {message?.text ?? ''}
      </p>
    </div>
  )

  if (compact) {
    return (
      <section className={ownTurn ? 'bar bar--phone bar--own' : 'bar bar--phone'} aria-label="Morceau en cours">
        <div className="bar__row">
          {renderCover()}
          {/* A DJ's track brings its YouTube title, which can be long: one line, cut (the full text is in the tooltip). */}
          <div className="bar__text">
            <p className="bar__title" title={track?.title}>
              {track ? track.title : 'Aucun morceau'}
            </p>
            {track && (
              <p className="bar__artist">
                <span className="bar__artist-name" title={track.artist}>
                  {track.artist}
                </span>
                <span className="bar__time">
                  {' · '}
                  {formatClock(position)} / {formatClock(track.durationSec)}
                </span>
                <span className="visually-hidden">{dj ? `. Ajouté par ${dj.pseudo}` : '. Sélection de la room'}</span>
              </p>
            )}
          </div>
          {actions}
        </div>
        {track && <progress className="bar__line" max={track.durationSec} value={position} aria-label="Progression du morceau" />}
        {floating}
      </section>
    )
  }

  return (
    <section className={ownTurn ? 'bar bar--own' : 'bar'} aria-label="Morceau en cours">
      <div className="bar__inner">
        <div className="bar__info">
          {renderCover()}
          {/* A DJ's track brings its YouTube title, which can be long: the screen cuts it (the full text is in the
              tooltip, and read in full by a screen reader) so that the bar keeps its height. */}
          <div className="bar__text">
            <p className="bar__title" title={track?.title}>
              {track ? track.title : 'Aucun morceau'}
            </p>
            {track && (
              <p className="bar__artist" title={track.artist}>
                {track.artist}
              </p>
            )}
            {track && (
              <p className="bar__dj">
                {dj ? (
                  <>
                    Ajouté par <strong>{dj.pseudo}</strong>
                  </>
                ) : (
                  'Sélection de la room'
                )}
              </p>
            )}
          </div>
        </div>

        <div className="bar__middle">
          {track && (
            <div className="bar__progress">
              <span>{formatClock(position)}</span>
              <progress max={track.durationSec} value={position} aria-label="Progression du morceau" />
              <span>{formatClock(track.durationSec)}</span>
            </div>
          )}
          <div className="bar__actions">{actions}</div>
        </div>

        <div className="bar__right">
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
              style={{ '--fill': `${shownVolume}%` } as CSSProperties}
              onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
            />
          </div>
          {djAction}
        </div>
      </div>

      {floating}
    </section>
  )
}
