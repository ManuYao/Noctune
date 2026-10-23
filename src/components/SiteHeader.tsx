import { Link } from 'react-router'
import './SiteHeader.css'

export default function SiteHeader() {
  return (
    <header className="site-header">
      <Link to="/" className="site-header__logo">
        Noctune
      </Link>
      <nav className="site-header__nav" aria-label="Navigation principale">
        <Link to="/rooms">Les rooms</Link>
      </nav>
    </header>
  )
}
