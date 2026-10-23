import type { ReactNode } from 'react'
import { Link } from 'react-router'
import './SiteHeader.css'

/** `children` sits between the logo and the navigation: the room puts its title there to save height. */
export default function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="site-header">
      <Link to="/" className="site-header__logo">
        Noctune
      </Link>
      {children}
      <nav className="site-header__nav" aria-label="Navigation principale">
        <Link to="/rooms">Les rooms</Link>
      </nav>
    </header>
  )
}
