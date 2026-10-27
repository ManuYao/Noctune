import { useEffect, useRef, useState } from 'react'

const HEART_MS = 3400
const MAX_HEARTS = 6

/**
 * A heart that rises from the floor at each like: one per batch of likes from the server, never over the video. `spots`
 * is how many places it can start from; each heart gets one at random.
 */
export function useHearts(likePulse: number, spots: number) {
  const [hearts, setHearts] = useState<{ id: number; spot: number }[]>([])
  const lastPulse = useRef(likePulse)
  const timers = useRef(new Set<number>())
  useEffect(() => {
    if (likePulse === lastPulse.current) return
    lastPulse.current = likePulse
    const id = likePulse
    setHearts((current) => [...current.slice(-(MAX_HEARTS - 1)), { id, spot: Math.floor(Math.random() * spots) }])
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      setHearts((current) => current.filter((heart) => heart.id !== id))
    }, HEART_MS)
    timers.current.add(timer)
    // `spots` only decides where the next heart starts: a change of it must not make one of its own.
  }, [likePulse])
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending) window.clearTimeout(timer)
      pending.clear()
    }
  }, [])
  return hearts
}
