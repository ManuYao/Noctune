import { useEffect, useState } from 'react'

/** The (non-standard) event Chromium fires when the site can be installed; it carries the browser's own install dialog. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// The event fires once, early: it is kept here from the moment this module loads (imported by main.tsx), not from the
// moment a component asks for it.
let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

function isInstalled(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

function isIos(): boolean {
  const ua = navigator.userAgent
  // iPadOS 13+ says "Macintosh" but has a touch screen.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function useInstallPrompt() {
  const [, force] = useState(0)
  useEffect(() => {
    const listener = () => force((n) => n + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return {
    /** Already opened as an installed app: nothing to propose. */
    installed: isInstalled(),
    ios: isIos(),
    /** The browser offered its install dialog: one tap installs. */
    canPrompt: deferred !== null,
    /** Opens the browser's install dialog; true when the person accepted. */
    async install(): Promise<boolean> {
      const event = deferred
      if (!event) return false
      deferred = null
      notify()
      await event.prompt()
      return (await event.userChoice).outcome === 'accepted'
    },
  }
}
