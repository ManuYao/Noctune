const KEY = 'noctune:calm-motion'
const EVENT = 'noctune:calm-motion-change'

/** The "Réduire les animations" choice, kept in this browser only (false when storage is unavailable). */
export function readCalmMotion(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Puts the choice on <html>, where the stylesheets read it (the same rules as `prefers-reduced-motion`: see index.css). */
export function applyCalmMotion(calm: boolean): void {
  if (calm) document.documentElement.dataset.motion = 'calm'
  else delete document.documentElement.dataset.motion
}

export function writeCalmMotion(calm: boolean): void {
  try {
    if (calm) window.localStorage.setItem(KEY, '1')
    else window.localStorage.removeItem(KEY)
  } catch {
    // Storage blocked: the choice still holds until the page closes.
  }
  applyCalmMotion(calm)
  window.dispatchEvent(new Event(EVENT))
}

/** Applies the saved choice at start-up, and follows the other tabs of the browser. */
export function startCalmMotion(): void {
  applyCalmMotion(readCalmMotion())
  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === null) applyCalmMotion(readCalmMotion())
  })
}

export function subscribeCalmMotion(listener: () => void): () => void {
  window.addEventListener(EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}
