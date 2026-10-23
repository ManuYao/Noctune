import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Account } from '../../shared/protocol'
import { socket } from '../realtime/socket'
import { AccountContext, type AccountState } from './accountContext'
import * as authApi from './authApi'

const TABS_CHANNEL = 'noctune-account'
// Coming back to a tab asks the server who is signed in, at most this often.
const REFRESH_MIN_INTERVAL_MS = 5000

/**
 * The realtime connection learned who it belongs to when it opened (from the session cookie). After signing in or
 * out, it has to be opened again to learn the new answer. That goes for a connection that is still opening too: it
 * may have been sent before the cookie changed. A connection that is closed is left alone: the next screen that
 * opens one will carry the right cookie.
 */
function reopenConnection() {
  if (socket.active) socket.disconnect().connect()
}

/** Tells the other tabs of this browser that who is signed in has changed. */
function notifyOtherTabs() {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(TABS_CHANNEL)
  channel.postMessage('changed')
  channel.close()
}

export default function AccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountState['status']>('loading')
  const [account, setAccount] = useState<Account | null>(null)
  // What this tab believes, readable from the callbacks that outlive a render.
  const knownEmail = useRef<string | null>(null)
  const lastRefresh = useRef(0)

  const adopt = useCallback((next: Account | null) => {
    knownEmail.current = next?.email ?? null
    setAccount(next)
    setStatus('ready')
  }, [])

  useEffect(() => {
    let active = true
    authApi.fetchSession().then((found) => {
      if (!active) return
      // Undefined: the server could not be asked. The page then works as for a visitor, and the first
      // sign-in will say what is wrong.
      adopt(found ?? null)
    })
    return () => {
      active = false
    }
  }, [adopt])

  // Another tab signed in or out (or the session ended elsewhere): this tab must not go on showing, and acting as,
  // somebody else. It asks again when told by another tab, and when it comes back into view.
  useEffect(() => {
    let active = true
    async function refresh() {
      if (Date.now() - lastRefresh.current < REFRESH_MIN_INTERVAL_MS) return
      lastRefresh.current = Date.now()
      const found = await authApi.fetchSession()
      // Could not be asked: what is known stays.
      if (!active || found === undefined) return
      if ((found?.email ?? null) !== knownEmail.current) {
        adopt(found)
        reopenConnection()
      }
    }
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(TABS_CHANNEL)
    // Told by another tab: always ask, whatever was asked a moment ago.
    const onTold = () => {
      lastRefresh.current = 0
      void refresh()
    }
    channel?.addEventListener('message', onTold)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      channel?.removeEventListener('message', onTold)
      channel?.close()
      window.removeEventListener('focus', refresh)
    }
  }, [adopt])

  const enter = useCallback(
    async (call: Promise<authApi.AuthCallResult>) => {
      const result = await call
      if (result.ok) {
        adopt(result.account)
        reopenConnection()
        notifyOtherTabs()
      }
      return result
    },
    [adopt],
  )

  const value = useMemo<AccountState>(
    () => ({
      status,
      account,
      register: (input) => enter(authApi.register(input)),
      login: (input) => enter(authApi.login(input)),
      logout: async () => {
        // Signed out on screen only once the server has ended the session.
        if (!(await authApi.logout())) return false
        adopt(null)
        reopenConnection()
        notifyOtherTabs()
        return true
      },
    }),
    [status, account, enter, adopt],
  )

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}
