import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router'
import { useAccount } from '../auth/useAccount'
import { findAvatar } from '../data/avatars'
import Avatar from './Avatar'
import './SiteHeader.css'

/**
 * The header of the pages (mock-ups 2, 2b, 5, 7): the logo on the left; on the right the rooms, the rules, and the way
 * to sign in or, for a member, the pill of their account that leads to the profile.
 * `children` sits between the logo and the navigation: the room puts its title there on a phone.
 */
export default function SiteHeader({ children }: { children?: ReactNode }) {
  const { account, status, logout } = useAccount()
  const navigate = useNavigate()
  const [logoutFailed, setLogoutFailed] = useState(false)
  const avatar = account ? findAvatar(account.avatarId) : undefined

  async function handleLogout() {
    setLogoutFailed(false)
    // Only when the server has ended the session: on a shared computer, "signed out" must be true.
    if (!(await logout())) return setLogoutFailed(true)
    // Back to the entry screen: whatever room was open belonged to the member.
    navigate('/')
  }

  return (
    // With children (the room's title on a phone) the header keeps its own phone layout; without, it wears the phone one of
    // mock-ups M1 and M2 (the logo and a round profile pill; the rest is in the tab bar and the footer).
    <header className={children ? 'site-header site-header--with-children' : 'site-header'}>
      <Link to="/" className="site-header__logo">
        <svg viewBox="0 0 38 38" width="38" height="38" aria-hidden="true" focusable="false">
          <rect width="38" height="38" rx="12" className="site-header__logo-tile" />
          <rect x="8" y="15" width="4" height="12" rx="2" className="site-header__logo-bar" />
          <rect x="14.5" y="9" width="4" height="20" rx="2" className="site-header__logo-bar" />
          <rect x="21" y="12" width="4" height="15" rx="2" className="site-header__logo-bar" />
          <rect x="27.5" y="17" width="4" height="9" rx="2" className="site-header__logo-bar" />
        </svg>
        Noctune
      </Link>
      {children}
      <nav className="site-header__nav" aria-label="Navigation principale">
        {/* "Les rooms" stays lit on the pages under it (making a room, its settings), as in mock-up 2b. */}
        <NavLink to="/rooms" className="site-header__link">
          Les rooms
        </NavLink>
        <NavLink to="/regles" className="site-header__link">
          Règles
        </NavLink>
        {/* Playlists belong to members: the link is theirs alone. */}
        {status === 'ready' && account && (
          <NavLink to="/playlist" className="site-header__link">
            Playlist
          </NavLink>
        )}
        {/* Nothing until the server has said who is signed in: no flash of "Se connecter" for a member. */}
        {status === 'ready' &&
          (account ? (
            <span className="site-header__account">
              {/* The pill of mock-up 2b leads to the profile. */}
              <NavLink to="/profil" className="site-header__profile" aria-label={`Mon profil (${account.pseudo})`}>
                {avatar && <Avatar avatar={avatar} size={34} framing="icon" decorative />}
                <span className="site-header__who">
                  <span className="site-header__pseudo">{account.pseudo}</span>
                  <span className="site-header__status">Connecté</span>
                </span>
                {/* Where the pseudo is hidden (a narrow window), the avatar alone, or this word without one. */}
                {!avatar && (
                  <span className="site-header__profile-short" aria-hidden="true">
                    Profil
                  </span>
                )}
              </NavLink>
              {/* Not drawn in the mock-ups: a round button next to the pill, its name given by its label. */}
              <button type="button" className="site-header__logout" onClick={handleLogout} aria-label="Se déconnecter" title="Se déconnecter">
                <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3.5 H5 A1.5 1.5 0 0 0 3.5 5 V15 A1.5 1.5 0 0 0 5 16.5 H8" />
                  <path d="M12 6 L16 10 L12 14 M16 10 H7.5" />
                </svg>
              </button>
            </span>
          ) : (
            <Link to="/connexion" className="site-header__login">
              Se connecter
            </Link>
          ))}
      </nav>
      {logoutFailed && (
        <p className="site-header__error" role="alert">
          Déconnexion impossible pour l'instant : vérifie ta connexion et réessaie. Tu es toujours connecté.
        </p>
      )}
    </header>
  )
}
