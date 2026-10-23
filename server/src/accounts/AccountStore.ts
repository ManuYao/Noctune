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
}

export interface NewAccount {
  email: string
  passwordHash: string
  pseudo: string
  avatarId: AvatarId
}

export type CreateResult = { ok: true; account: StoredAccount } | { ok: false; error: 'email-taken' | 'pseudo-taken' }

/**
 * Where accounts and sessions are kept. PostgreSQL in the real server (PgAccountStore), memory in tests
 * (MemoryAccountStore): both pass the same tests, see accountStoreContract.ts.
 */
export interface AccountStore {
  /** Fails, with nothing created, when the e-mail or the pseudo (compared in lower case) is already used. */
  create(account: NewAccount): Promise<CreateResult>
  findByEmail(email: string): Promise<StoredAccount | null>
  isPseudoTaken(pseudo: string): Promise<boolean>
  createSession(accountId: string, tokenHash: Buffer, expiresAt: Date): Promise<void>
  /** The account behind a session that exists and has not expired at `now`. Without its password hash. */
  findBySession(tokenHash: Buffer, now: Date): Promise<AccountSummary | null>
  deleteSession(tokenHash: Buffer): Promise<void>
  /** Returns how many sessions were removed. */
  deleteExpiredSessions(now: Date): Promise<number>
  close(): Promise<void>
}
