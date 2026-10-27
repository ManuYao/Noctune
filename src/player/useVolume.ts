import { useCallback, useState } from 'react'

const STORAGE_KEY = 'noctune.volume'
const DEFAULT_VOLUME = 0.7

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

// Storage can be missing or throw (private window, blocked site data): the volume then just is not remembered.
function readStoredVolume(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === null) return DEFAULT_VOLUME
    const value = Number(stored)
    return Number.isFinite(value) ? clamp(value) : DEFAULT_VOLUME
  } catch {
    return DEFAULT_VOLUME
  }
}

/** Listening volume (0 to 1), remembered on this device, and a mute switch that is not remembered. */
export function useVolume() {
  const [volume, setVolumeState] = useState(readStoredVolume)
  const [muted, setMuted] = useState(false)

  const setVolume = useCallback((value: number) => {
    const next = clamp(value)
    setVolumeState(next)
    if (next > 0) setMuted(false)
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // Not remembered, nothing else to do.
    }
  }, [])

  const toggleMute = useCallback(() => setMuted((current) => !current), [])

  return { volume, muted, setVolume, setMuted, toggleMute }
}
