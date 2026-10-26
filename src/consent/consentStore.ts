// The visitor's answer to "may Noctune load the YouTube player?". Kept in the browser only, for twelve months, then asked
// again. Without the consent nothing is requested from YouTube or Google (see `loadYouTubeApi`).

export type ConsentChoice = 'accepted' | 'refused'

/** How long an answer is kept before the question is asked again. */
export const CONSENT_VALID_MS = 365 * 24 * 60 * 60 * 1000

const STORAGE_KEY = 'noctune.consent.youtube'

interface Stored {
  choice: ConsentChoice
  /** Milliseconds since the epoch, when the answer was given. */
  at: number
}

// Storage can be blocked (a private window, a browser setting): the answer then lives as long as the page, which is
// better than asking again at every click. Only used once a write has failed, so that clearing the site's data in another
// tab still takes the answer back.
let storageBroken = false
let memory: Stored | null = null
const listeners = new Set<() => void>()

function parse(raw: string | null): Stored | null {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { choice, at } = value as Record<string, unknown>
    if ((choice !== 'accepted' && choice !== 'refused') || typeof at !== 'number' || !Number.isFinite(at)) return null
    return { choice, at }
  } catch {
    return null
  }
}

function readStored(): Stored | null {
  if (storageBroken) return memory
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return memory
  }
}

/** What the visitor answered, or null when they have not (or the answer is more than twelve months old). */
export function getConsent(now: number = Date.now()): ConsentChoice | null {
  const stored = readStored()
  if (!stored || now - stored.at >= CONSENT_VALID_MS) return null
  return stored.choice
}

/** When the visitor answered, for the window that shows the current choice. */
export function getConsentDate(): Date | null {
  const stored = readStored()
  return stored ? new Date(stored.at) : null
}

export function setConsent(choice: ConsentChoice): void {
  const stored: Stored = { choice, at: Date.now() }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    storageBroken = false
  } catch {
    storageBroken = true
    memory = stored
  }
  for (const listener of listeners) listener()
}

/** Told when the answer changes here, or in another tab of the same browser. */
export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}
