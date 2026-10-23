import { randomUUID } from 'node:crypto'
import { pseudoKey } from '../../../shared/validation'
import type { AccountStore, AccountSummary, CreateResult, NewAccount, StoredAccount } from './AccountStore'

/** The same behaviour as PgAccountStore, without a database: for tests. Nothing survives the process. */
export class MemoryAccountStore implements AccountStore {
  private readonly accounts = new Map<string, StoredAccount>()
  private readonly sessions = new Map<string, { accountId: string; expiresAt: number }>()

  async create(account: NewAccount): Promise<CreateResult> {
    const accounts = [...this.accounts.values()]
    if (accounts.some((known) => known.email === account.email)) return { ok: false, error: 'email-taken' }
    if (accounts.some((known) => pseudoKey(known.pseudo) === pseudoKey(account.pseudo))) return { ok: false, error: 'pseudo-taken' }
    const stored: StoredAccount = { id: randomUUID(), ...account }
    this.accounts.set(stored.id, stored)
    return { ok: true, account: stored }
  }

  async findByEmail(email: string): Promise<StoredAccount | null> {
    return [...this.accounts.values()].find((account) => account.email === email) ?? null
  }

  async isPseudoTaken(pseudo: string): Promise<boolean> {
    return [...this.accounts.values()].some((account) => pseudoKey(account.pseudo) === pseudoKey(pseudo))
  }

  async createSession(accountId: string, tokenHash: Buffer, expiresAt: Date): Promise<void> {
    if (!this.accounts.has(accountId)) throw new Error('unknown account')
    this.sessions.set(tokenHash.toString('hex'), { accountId, expiresAt: expiresAt.getTime() })
  }

  async findBySession(tokenHash: Buffer, now: Date): Promise<AccountSummary | null> {
    const session = this.sessions.get(tokenHash.toString('hex'))
    if (!session || session.expiresAt <= now.getTime()) return null
    const account = this.accounts.get(session.accountId)
    if (!account) return null
    const { id, email, pseudo, avatarId } = account
    return { id, email, pseudo, avatarId }
  }

  async deleteSession(tokenHash: Buffer): Promise<void> {
    this.sessions.delete(tokenHash.toString('hex'))
  }

  async deleteExpiredSessions(now: Date): Promise<number> {
    let removed = 0
    for (const [key, session] of this.sessions) {
      if (session.expiresAt <= now.getTime()) {
        this.sessions.delete(key)
        removed += 1
      }
    }
    return removed
  }

  async close(): Promise<void> {}
}
