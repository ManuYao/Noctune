import { NavLink } from 'react-router'
import { useConsentDialog } from '../consent/consentContext'
import './SiteFooter.css'

/**
 * The small underlined links of the mock-ups, at the bottom left of every page that scrolls. (Not on the room: it fits
 * the window, with no room for a footer.) The page the viewer is on is written in white.
 */
export default function SiteFooter() {
  const { ask } = useConsentDialog()
  return (
    <footer className="site-footer">
      <nav aria-label="Informations légales">
        <NavLink to="/regles">Règles de la communauté</NavLink>
        <NavLink to="/mentions-legales">Mentions légales</NavLink>
        <NavLink to="/confidentialite">Confidentialité</NavLink>
        {/* The answer about YouTube's player can be changed at any time, from any page that has a footer. */}
        <button type="button" onClick={() => ask({ intent: 'manage' })}>
          Gérer le lecteur YouTube
        </button>
      </nav>
    </footer>
  )
}
