import { registerSW } from 'virtual:pwa-register'
import { useSyncExternalStore } from 'react'

// How often an open page asks whether a newer version of the site exists (a tab left open for days must not run old code).
const CHECK_EVERY_MS = 2 * 60 * 1000

let ready = false
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null
const listeners = new Set<() => void>()

function setReady() {
  ready = true
  for (const listener of listeners) listener()
}

/** In a room the page is not reloaded by itself (the music and the place would be lost): a banner offers it instead. */
const inRoom = () => window.location.pathname.startsWith('/room/')

/**
 * Watches for a new version of the site. The page asks on a timer and whenever it comes back to the front; when one is
 * ready, any page but a room switches to it at once, and a room shows a banner ("Recharger"). Called once, at start.
 */
export function startUpdateWatcher() {
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (!inRoom()) void applyUpdate?.(true)
      else setReady()
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => void registration.update().catch(() => undefined)
      window.setInterval(check, CHECK_EVERY_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
}

/** Switches to the new version now (reloads the page). */
export function reloadForUpdate() {
  void applyUpdate?.(true)
}

/** Is a newer version waiting? */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => ready,
    () => false,
  )
}
