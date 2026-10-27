import { useState } from 'react'
import { InstallDialog } from './InstallButton'
import { useInstallPrompt } from './installPrompt'
import './InstallNudge.css'

const VISITS_KEY = 'noctune.visits'
const DISMISSED_KEY = 'noctune.installNudgeDismissed'
const QUIET_DAYS = 30

// One visit = one browser session. Counted once, when this module loads.
let visits = 0
try {
  visits = Number(localStorage.getItem(VISITS_KEY) ?? 0)
  if (!sessionStorage.getItem(VISITS_KEY)) {
    sessionStorage.setItem(VISITS_KEY, '1')
    visits += 1
    localStorage.setItem(VISITS_KEY, String(visits))
  }
} catch {
  // Storage can be blocked: then the nudge simply never shows.
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY) ?? 0)
    return Date.now() - at < QUIET_DAYS * 86_400_000
  } catch {
    return true
  }
}

/**
 * A slim, dismissible line inviting to install the app. Quiet on purpose: never on a first visit, never once installed,
 * never again for 30 days after a "×", and only on a phone (the parent decides that).
 */
export default function InstallNudge() {
  const { installed } = useInstallPrompt()
  const [hidden, setHidden] = useState(() => visits < 2 || recentlyDismissed())
  const [open, setOpen] = useState(false)
  if (installed || hidden) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()))
    } catch {
      // Not remembered: it will show again next time.
    }
    setHidden(true)
  }

  return (
    <>
      <div className="install-nudge">
        <button type="button" className="install-nudge__open" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          <span aria-hidden="true">📲</span> Installe Noctune : une icône, plein écran
        </button>
        <button type="button" className="install-nudge__close" aria-label="Ne plus proposer l'installation" onClick={dismiss}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <InstallDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
