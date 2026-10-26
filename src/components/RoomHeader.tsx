import { Link } from 'react-router'
import type { RoomStyle } from '../../shared/protocol'
import { useAccount } from '../auth/useAccount'
import { findAvatar } from '../data/avatars'
import ReportsButton from '../moderation/ReportsButton'
import { STYLE_LABELS } from '../rooms/roomLabels'
import Avatar from './Avatar'
import './RoomHeader.css'

interface RoomHeaderProps {
  roomId: string
  name: string
  styles: RoomStyle[]
  /** People in the room right now. */
  online: number
  /** Pseudo of the host; null for a room of the team. */
  host: string | null
  /** The viewer hosts this room (as the server says). */
  isHost: boolean
  /** Who the viewer is in the room. */
  self: { pseudo: string; avatarId: string; member: boolean }
  /** Shown while the room is being joined, or joined again after a dropped connection. */
  connecting: boolean
}

/**
 * The header of the room (mock-ups 3 and 3b): its name, its styles, how many are in it and who hosts it; on the right
 * the host's tools, who the viewer is, and the way to sign in or to the profile.
 */
export default function RoomHeader({ roomId, name, styles, online, host, isHost, self, connecting }: RoomHeaderProps) {
  const { account, status } = useAccount()
  const avatar = findAvatar(self.avatarId)

  return (
    <header className="room-head">
      <div className="room-head__room">
        <h1 className="room-head__name">{name}</h1>
        {styles.length > 0 && (
          <ul className="room-head__styles" aria-label="Styles">
            {styles.map((style) => (
              <li key={style} className="room-head__chip">
                {STYLE_LABELS[style]}
              </li>
            ))}
          </ul>
        )}
        <span className="room-head__online">
          <span className="room-head__eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {online} en ligne
        </span>
        {host && (
          <span className="room-head__host">
            Hôte : <strong>{host}</strong>
          </span>
        )}
        {connecting && (
          <span className="room-head__status" role="status">
            Connexion à la room en cours…
          </span>
        )}
      </div>

      <div className="room-head__end">
        {/* The host's inbox of reports, and the settings: the latter opens in a new tab, so that the room and its player keep going. */}
        <ReportsButton />
        {isHost && (
          <Link to={`/rooms/${encodeURIComponent(roomId)}/edit`} target="_blank" rel="noopener noreferrer" className="room__settings">
            Réglages<span className="visually-hidden"> de la room (nouvel onglet)</span>
          </Link>
        )}
        <span className="room-head__me">
          {avatar && <Avatar avatar={avatar} size={34} framing="icon" decorative />}
          <span className="room-head__me-text">
            <span className="room-head__me-name">{self.pseudo}</span>
            <span className="room-head__me-status">{self.member ? 'Connecté' : 'Visiteur'}</span>
          </span>
        </span>
        {/* Nothing until the server has said who is signed in: no flash of "Se connecter" for a member. */}
        {status === 'ready' &&
          (account ? (
            <Link to="/profil" className="room-head__link">
              <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="9" cy="6" r="3.2" />
                <path d="M3 15.5 C3.8 12.2 6.2 11 9 11 C11.8 11 14.2 12.2 15 15.5" />
              </svg>
              Mon profil
            </Link>
          ) : (
            <Link to="/connexion" className="room-head__link">
              Se connecter
            </Link>
          ))}
      </div>
    </header>
  )
}
