import { Link } from 'react-router'
import './SiteFooter.css'

/** The three legal pages, on every page that scrolls. (Not on the room: it fits the window, with no room for a footer.) */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="Informations légales">
        <Link to="/confidentialite">Confidentialité</Link>
        <Link to="/regles">Règles de la communauté</Link>
        <Link to="/mentions-legales">Mentions légales</Link>
      </nav>
    </footer>
  )
}
