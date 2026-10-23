import { createContext } from 'react'
import type { Account } from '../../shared/protocol'
import type { AuthCallResult, RegisterInput } from './authApi'

export interface AccountState {
  /** `loading` until the server has said who is signed in (a few milliseconds when it answers). */
  status: 'loading' | 'ready'
  /** The signed-in member, or null for a visitor. */
  account: Account | null
  register: (input: RegisterInput) => Promise<AuthCallResult>
  login: (input: { email: string; password: string }) => Promise<AuthCallResult>
  /** False when the server could not end the session: the member is then still signed in. */
  logout: () => Promise<boolean>
}

export const AccountContext = createContext<AccountState | null>(null)
