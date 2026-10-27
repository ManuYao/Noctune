import { NavLink } from 'react-router'
import './MobileTabBar.css'

/**
 * The bar of the bottom of a phone (mock-up M2): the rooms, making a room, the profile. It lies at the end of the page
 * (sticky at the bottom of the window) so that it never covers anything; PageShell puts it on every page but the entry,
 * and the room, which has none, keeps the bottom for its chat. A visitor who taps "Créer" or "Profil" lands on the page
 * that says what an account gives (the creation page sends visitors to the sign-in).
 */
export default function MobileTabBar() {
  return (
    <nav className="tab-bar" aria-label="Navigation mobile">
      <NavLink to="/rooms" end className="tab-bar__tab">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="2" />
          <rect x="14" y="3" width="7" height="7" rx="2" />
          <rect x="3" y="14" width="7" height="7" rx="2" />
          <rect x="14" y="14" width="7" height="7" rx="2" />
        </svg>
        Rooms
      </NavLink>
      <NavLink to="/rooms/new" className="tab-bar__tab">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8 V16 M8 12 H16" />
        </svg>
        Créer
      </NavLink>
      <NavLink to="/profil" className="tab-bar__tab">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="8" r="3.6" />
          <path d="M4.5 20 C5.5 16 8.5 14.5 12 14.5 C15.5 14.5 18.5 16 19.5 20" />
        </svg>
        Profil
      </NavLink>
    </nav>
  )
}
