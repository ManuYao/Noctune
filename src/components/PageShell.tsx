import { Outlet } from 'react-router'
import SiteFooter from './SiteFooter'

/** Every page except the room: the page itself, then the footer with the legal links. */
export default function PageShell() {
  return (
    <div className="app-shell">
      <Outlet />
      <SiteFooter />
    </div>
  )
}
