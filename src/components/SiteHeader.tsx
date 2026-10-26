import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAccount } from '../auth/useAccount'
import { AVATARS } from '../data/avatars'
import Avatar from './Avatar'
import './SiteHeader.css'

/** `children` sits between the logo and the navigation: the room puts its title there to save height. */
export default function SiteHeader({ children }: { children?: ReactNode }) {
  const { account, status, logout } = useAccount()
  const navigate = useNavigate()
  const [logoutFailed, setLogoutFailed] = useState(false)
  const avatar = account && AVATARS.find((candidate) => candidate.id === account.avatarId)

  async function handleLogout() {
    setLogoutFailed(false)
    // Only when the server has ended the session: on a shared computer, "signed out" must be true.
    if (!(await logout())) return setLogoutFailed(true)
    // Back to the entry screen: whatever room was open belonged to the member.
    navigate('/')
  }

  return (
    <header className="site-header">
      <Link to="/" className="site-header__logo">
        Noctune
      </Link>
      {children}
      <nav className="site-header__nav" aria-label="Navigation principale">
        <Link to="/rooms">Les rooms</Link>
        {/* Playlists belong to members: the link is theirs alone. */}
        {status === 'ready' && account && <Link to="/playlist">Playlist</Link>}
        {/* Nothing until the server has said who is signed in: no flash of "Se connecter" for a member. */}
        {status === 'ready' &&
          (account ? (
            <span className="site-header__account">
              {/* The pseudo and the avatar lead to the profile; on a phone, where they are hidden, the word "Profil". */}
              <Link to="/profil" className="site-header__profile" aria-label={`Mon profil (${account.pseudo})`}>
                {avatar && <Avatar avatar={avatar} size={32} framing="icon" decorative />}
                <span className="site-header__pseudo">{account.pseudo}</span>
                <span className="site-header__profile-short" aria-hidden="true">
                  Profil
                </span>
              </Link>
              <button type="button" onClick={handleLogout}>
                Se déconnecter
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
