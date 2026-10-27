import { Link } from 'react-router'
import './RoomRail.css'

interface RoomRailProps {
  /** The room the rail belongs to: "La room" leads to its details. */
  roomId?: string
  /** "room": the rail of the room itself, whose player must keep going. "info": the rail of the details page, which has no player. */
  page?: 'room' | 'info'
}

/**
 * The rail on the left of the room (mock-ups 3 and 3b) and of its details (mock-up 4): the logo, the rooms, this room,
 * the playlists and the rules. In the room, what would leave it opens in a new tab, so that its player keeps going;
 * "Rooms" and the logo leave it, as the header of the other pages does. "Historique" has no page yet: no link to nowhere.
 */
export default function RoomRail({ roomId, page = 'room' }: RoomRailProps) {
  const inRoom = page === 'room'
  const away = inRoom ? { target: '_blank', rel: 'noopener noreferrer' } : {}
  const newTab = inRoom ? <span className="visually-hidden"> (nouvel onglet)</span> : null
  const roomIcon = (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11 V17" />
      <circle cx="12" cy="7.5" r="0.6" fill="currentColor" />
    </svg>
  )

  return (
    <nav className="room-rail" aria-label="Navigation">
      <Link to="/" className="room-rail__logo" aria-label="Noctune, accueil">
        <svg viewBox="0 0 38 38" width="40" height="40" aria-hidden="true" focusable="false">
          <rect width="38" height="38" rx="12" className="room-rail__logo-tile" />
          <rect x="8" y="15" width="4" height="12" rx="2" className="room-rail__logo-bar" />
          <rect x="14.5" y="9" width="4" height="20" rx="2" className="room-rail__logo-bar" />
          <rect x="21" y="12" width="4" height="15" rx="2" className="room-rail__logo-bar" />
          <rect x="27.5" y="17" width="4" height="9" rx="2" className="room-rail__logo-bar" />
        </svg>
      </Link>
      <Link to="/rooms" className="room-rail__item">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
        </svg>
        Rooms
      </Link>
      {/* In the room, the lit tile is the way to its details (a new tab); on the details page it is where the viewer is. */}
      {inRoom && roomId ? (
        <Link to={`/rooms/${encodeURIComponent(roomId)}/infos`} {...away} className="room-rail__item room-rail__item--current">
          {roomIcon}
          La room<span className="visually-hidden"> : infos (nouvel onglet)</span>
        </Link>
      ) : (
        <span className="room-rail__item room-rail__item--current" aria-current={inRoom ? undefined : 'page'}>
          {roomIcon}
          La room
        </span>
      )}
      <Link to="/playlist" {...away} className="room-rail__item">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 6 H15 M3 12 H15 M3 18 H10" />
          <circle cx="18" cy="17" r="3" />
          <path d="M21 17 V8" />
        </svg>
        Playlist{newTab}
      </Link>
      <span className="room-rail__space" />
      <Link to="/regles" {...away} className="room-rail__item">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M12 3 L20 6 V12 C20 16.5 16.5 20 12 21 C7.5 20 4 16.5 4 12 V6 Z" />
        </svg>
        Règles{newTab}
      </Link>
    </nav>
  )
}
