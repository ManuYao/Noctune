import { createContext } from 'react'
import type { Account } from '../../shared/protocol'
import type { AccountCallResult, AccountDoneResult } from './accountApi'
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
  /** Avatar and pseudo. A room shows the change the next time the member enters it. */
  updateProfile: (input: { pseudo?: string; avatarId?: string }) => Promise<AccountCallResult>
  /** This session stays; every other one of the account ends. */
  changePassword: (input: { currentPassword: string; newPassword: string }) => Promise<AccountCallResult>
  /** Every session ends, this one included: the page is then a visitor's. */
  logoutEverywhere: () => Promise<AccountDoneResult>
  /** The account and everything of theirs goes: the page is then a visitor's. */
  deleteAccount: (password: string) => Promise<AccountDoneResult>
}

export const AccountContext = createContext<AccountState | null>(null)
