import { Link } from 'react-router'
import ReportsButton from '../moderation/ReportsButton'
import SpeakerIcon from './SpeakerIcon'
import './MobileRoomHeader.css'

interface MobileRoomHeaderProps {
  roomId: string
  name: string
  /** People in the room right now. */
  online: number
  /** Pseudo of the host; null for a room of the team. */
  host: string | null
  /** The viewer hosts this room (as the server says). */
  isHost: boolean
  /** Shown while the room is being joined, or joined again after a dropped connection. */
  connecting: boolean
  muted: boolean
  /** The speaker is drawn crossed out: muted, or the volume is at zero. */
  silent: boolean
  /** No player (the viewer did not accept YouTube's): no sound to switch off. */
  noPlayer: boolean
  onToggleMute: () => void
  /** The option "keep the screen on" (off by default); null where the browser cannot do it. */
  keepScreenOn: { on: boolean; toggle: () => void } | null
}

/**
 * The header of the room on a phone (mock-up M3): back to the rooms, the name of the room with "N en ligne · Hôte …" under
 * it, and at the right the room's details (a new tab) and the mute button. The
 * host's two tools (the inbox of reports, the settings) get a row of their own under it.
 */
export default function MobileRoomHeader({ roomId, name, online, host, isHost, connecting, muted, silent, noPlayer, onToggleMute, keepScreenOn }: MobileRoomHeaderProps) {
  return (
    <header className="mroom-head">
      <div className="mroom-head__bar">
        <Link to="/rooms" className="mroom-head__button" aria-label="Retour aux rooms">
          <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 4 L7 11 L14 18" />
          </svg>
        </Link>
        <div className="mroom-head__titles">
          <h1 className="mroom-head__name">{name}</h1>
          <p className="mroom-head__sub">
            {connecting ? 'Connexion à la room…' : `${online} en ligne`}
            {!connecting && host && (
              <>
                {' · Hôte '}
                {host}
              </>
            )}
          </p>
        </div>
        {/* The details open in a new tab, so that the room and its player keep going. */}
        <Link to={`/rooms/${encodeURIComponent(roomId)}/infos`} target="_blank" rel="noopener noreferrer" className="mroom-head__button" aria-label="Infos de la room (nouvel onglet)">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11 V17" />
            <circle cx="12" cy="7.5" r="0.6" fill="currentColor" />
          </svg>
        </Link>
        {keepScreenOn && !noPlayer && (
          <button
            type="button"
            className="mroom-head__button"
            aria-pressed={keepScreenOn.on}
            aria-label="Garder l'écran allumé"
            title="Garder l'écran allumé : la musique continue tant que l'écran reste ouvert"
            onClick={keepScreenOn.toggle}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="7" y="3" width="10" height="18" rx="2.5" />
              <path d="M11 17.5 H13" />
              {keepScreenOn.on && <path d="M3.5 8 V16 M20.5 8 V16" />}
            </svg>
          </button>
        )}
        <button
          type="button"
          className="mroom-head__button"
          aria-pressed={muted}
          aria-label="Muet"
          disabled={noPlayer}
          onClick={onToggleMute}
        >
          <SpeakerIcon muted={silent} />
        </button>
      </div>
      {/* Said when the room is being joined, not at every arrival: the count above is not a live region. */}
      <p className="visually-hidden" role="status">
        {connecting ? 'Connexion à la room en cours…' : ''}
      </p>
      {isHost && (
        <div className="mroom-head__host">
          {/* The settings open in a new tab, so that the room and its player keep going. */}
          <ReportsButton />
          <Link to={`/rooms/${encodeURIComponent(roomId)}/edit`} target="_blank" rel="noopener noreferrer" className="room__settings">
            Réglages<span className="visually-hidden"> de la room (nouvel onglet)</span>
          </Link>
        </div>
      )}
    </header>
  )
}
