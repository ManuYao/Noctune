import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'noctune.keepScreenOn'

function readStored(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * An option, off by default: keeps the screen on while the room is open, so that the page stays visible and the player is
 * not suspended behind a locked screen. It costs battery, which is why it is a choice and not a default.
 * The system releases the lock whenever the page is hidden, so it is asked again when the page comes back.
 */
export function useWakeLock() {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  const [on, setOn] = useState(readStored)

  useEffect(() => {
    if (!supported || !on) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    async function acquire() {
      if (cancelled || (sentinel && !sentinel.released) || document.visibilityState !== 'visible') return
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void lock.release().catch(() => {})
          return
        }
        sentinel = lock
        lock.addEventListener('release', () => {
          if (sentinel === lock) sentinel = null
        })
      } catch {
        // Refused (low battery, power saver): the screen simply follows the phone's own settings.
      }
    }

    void acquire()
    const onVisible = () => void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      const held = sentinel
      sentinel = null
      if (held) void held.release().catch(() => {})
    }
  }, [supported, on])

  const toggle = useCallback(() => {
    setOn((current) => {
      const next = !current
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // Not remembered, nothing else to do.
      }
      return next
    })
  }, [])

  return { supported, on, toggle }
}
