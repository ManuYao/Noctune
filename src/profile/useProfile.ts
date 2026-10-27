import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProfileData } from '../../shared/protocol'
import { fetchProfile, type ProfileResult } from '../auth/accountApi'

export type ProfileState =
  | { status: 'loading' }
  | { status: 'ready'; profile: ProfileData }
  | { status: 'error'; failure: Exclude<ProfileResult, { ok: true }>; profile: ProfileData | null }

/** The member's activity. Loaded when the page opens and again when it comes back to the front, so the numbers follow a session of listening. */
export function useProfile(): ProfileState & { reload: () => void } {
  const [state, setState] = useState<ProfileState>({ status: 'loading' })
  const mounted = useRef(true)
  const last = useRef<ProfileData | null>(null)

  const load = useCallback(async () => {
    const result = await fetchProfile()
    if (!mounted.current) return
    if (result.ok) {
      last.current = result.profile
      setState({ status: 'ready', profile: result.profile })
    } else {
      // The last numbers seen stay on screen: a failed refresh does not blank them.
      setState({ status: 'error', failure: result, profile: last.current })
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void load()
    const refresh = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      mounted.current = false
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [load])

  return { ...state, reload: () => void load() }
}
