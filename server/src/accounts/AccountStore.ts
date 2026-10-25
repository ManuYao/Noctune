import type { AvatarId } from '../../../shared/protocol'

/** What the rest of the server may know about an account. */
export interface AccountSummary {
  id: string
  /** Trimmed, lower case. */
  email: string
  pseudo: string
  avatarId: AvatarId
}

/** An account as the store keeps it. The password hash never leaves the accounts code: only sign-in needs it. */
export interface StoredAccount extends AccountSummary {
  passwordHash: string
  /** When the account was made. */
  createdAt: Date
}

export interface NewAccount {
  email: string
  passwordHash: string
  pseudo: string
  avatarId: AvatarId
}

export type CreateResult = { ok: true; account: StoredAccount } | { ok: false; error: 'email-taken' | 'pseudo-taken' }
export type UpdateProfileResult = { ok: true; account: AccountSummary } | { ok: false; error: 'pseudo-taken' | 'not-found' }

/**
 * Where accounts and sessions are kept. PostgreSQL in the real server (PgAccountStore), memory in tests
 * (MemoryAccountStore): both pass the same tests, see accountStoreContract.ts.
 */
export interface AccountStore {
  /** Fails, with nothing created, when the e-mail or the pseudo (compared in lower case) is already used. */
  create(account: NewAccount): Promise<CreateResult>
  findByEmail(email: string): Promise<StoredAccount | null>
  /** The account with its password hash (for the checks that ask for the current password), or null. */
  findById(accountId: string): Promise<StoredAccount | null>
  /**
   * Changes the pseudo and/or the avatar. The pseudo is compared like at creation (lower case): another account may not
   * have it, but the account itself may change its case. Nothing changes when it is refused.
   */
  updateProfile(accountId: string, changes: { pseudo?: string; avatarId?: AvatarId }): Promise<UpdateProfileResult>
  /** True when the account exists. */
  updatePassword(accountId: string, passwordHash: string): Promise<boolean>
  isPseudoTaken(pseudo: string): Promise<boolean>
  createSession(accountId: string, tokenHash: Buffer, expiresAt: Date): Promise<void>
  /** The account behind a session that exists and has not expired at `now`. Without its password hash. */
  findBySession(tokenHash: Buffer, now: Date): Promise<AccountSummary | null>
  deleteSession(tokenHash: Buffer): Promise<void>
  /** Ends every session of the account, or every one but the one whose hash is given. Returns how many were removed. */
  deleteSessionsForAccount(accountId: string, except?: Buffer): Promise<number>
  /** Removes the account and what hangs from it in the store (its sessions). True when it existed. */
  deleteAccount(accountId: string): Promise<boolean>
  /** Returns how many sessions were removed. */
  deleteExpiredSessions(now: Date): Promise<number>
  close(): Promise<void>
}
