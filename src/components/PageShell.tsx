import { Outlet, useLocation } from 'react-router'
import BadgeToasts from './BadgeToasts'
import MobileTabBar from './MobileTabBar'
import SiteFooter from './SiteFooter'

/**
 * Every page except the room: the page itself, then the footer with the legal links, then (on a phone only, see its
 * CSS) the tab bar. The entry screen has no tab bar (mock-up M1).
 */
export default function PageShell() {
  const onEntry = useLocation().pathname === '/'
  return (
    <div className="app-shell">
      <Outlet />
      <BadgeToasts />
      <SiteFooter />
      {!onEntry && <MobileTabBar />}
    </div>
  )
}
