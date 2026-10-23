import { useContext } from 'react'
import { AccountContext, type AccountState } from './accountContext'

/** Who is signed in, and how to sign in, register and sign out. */
export function useAccount(): AccountState {
  const state = useContext(AccountContext)
  if (!state) throw new Error('useAccount needs an <AccountProvider> above it.')
  return state
}
