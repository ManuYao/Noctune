import { useEffect, useState } from 'react'

const REFRESH_MS = 500

/** The server clock as it reads now, refreshed twice a second while `active`. */
export function useServerNow(clockOffsetMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now() + clockOffsetMs)
  useEffect(() => {
    if (!active) return
    const update = () => setNow(Date.now() + clockOffsetMs)
    update()
    const interval = window.setInterval(update, REFRESH_MS)
    return () => window.clearInterval(interval)
  }, [clockOffsetMs, active])
  return now
}
