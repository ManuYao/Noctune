import { Link } from 'react-router'
import { useConsentDialog } from '../consent/consentContext'
import './SiteFooter.css'

/** The three legal pages, on every page that scrolls. (Not on the room: it fits the window, with no room for a footer.) */
export default function SiteFooter() {
  const { ask } = useConsentDialog()
  return (
    <footer className="site-footer">
      <nav aria-label="Informations légales">
        <Link to="/confidentialite">Confidentialité</Link>
        <Link to="/regles">Règles de la communauté</Link>
        <Link to="/mentions-legales">Mentions légales</Link>
        {/* The answer about YouTube's player can be changed at any time, from any page that has a footer. */}
        <button type="button" onClick={() => ask({ intent: 'manage' })}>
          Gérer le lecteur YouTube
        </button>
      </nav>
    </footer>
  )
}
