import type pg from 'pg'
import type { AvatarId } from '../../../shared/protocol'
import { pseudoKey } from '../../../shared/validation'
import type { AccountStore, AccountSummary, CreateResult, NewAccount, StoredAccount, UpdateProfileResult } from './AccountStore'

interface SummaryRow {
  id: string
  email: string
  pseudo: string
  avatar_id: string
}

interface AccountRow extends SummaryRow {
  password_hash: string
  created_at: Date
}

const SUMMARY_COLUMNS = 'u.id, u.email, u.pseudo, u.avatar_id'
const COLUMNS = `${SUMMARY_COLUMNS}, u.password_hash, u.created_at`
// Ids come from the store itself (a session says which account it is), but a malformed one must not reach the database.
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const toSummary = (row: SummaryRow): AccountSummary => ({
  id: row.id,
  email: row.email,
  pseudo: row.pseudo,
  avatarId: row.avatar_id as AvatarId,
})

const toAccount = (row: AccountRow): StoredAccount => ({ ...toSummary(row), passwordHash: row.password_hash, createdAt: row.created_at })

export class PgAccountStore implements AccountStore {
  constructor(private readonly pool: pg.Pool) {}

  async create(account: NewAccount): Promise<CreateResult> {
    // ON CONFLICT DO NOTHING rather than catching the error: a refused row would put the e-mail of the person who
    // already has the account in the database log (the DETAIL line of a unique violation).
    // The database is still the judge: two people registering at the same moment cannot both win.
    const { rows } = await this.pool.query<AccountRow>(
      `INSERT INTO users AS u (email, password_hash, pseudo, pseudo_key, avatar_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING ${COLUMNS}`,
      [account.email, account.passwordHash, account.pseudo, pseudoKey(account.pseudo), account.avatarId],
    )
    if (rows[0]) return { ok: true, account: toAccount(rows[0]) }
    const sameEmail = await this.pool.query('SELECT 1 FROM users WHERE email = $1', [account.email])
    return { ok: false, error: (sameEmail.rowCount ?? 0) > 0 ? 'email-taken' : 'pseudo-taken' }
  }

  async findByEmail(email: string): Promise<StoredAccount | null> {
    const { rows } = await this.pool.query<AccountRow>(`SELECT ${COLUMNS} FROM users u WHERE u.email = $1`, [email])
    return rows[0] ? toAccount(rows[0]) : null
  }

  async findById(accountId: string): Promise<StoredAccount | null> {
    if (!UUID_SHAPE.test(accountId)) return null
    const { rows } = await this.pool.query<AccountRow>(`SELECT ${COLUMNS} FROM users u WHERE u.id = $1`, [accountId])
    return rows[0] ? toAccount(rows[0]) : null
  }

  async updateProfile(accountId: string, changes: { pseudo?: string; avatarId?: AvatarId }): Promise<UpdateProfileResult> {
    if (!UUID_SHAPE.test(accountId)) return { ok: false, error: 'not-found' }
    if (changes.pseudo !== undefined) {
      // Asked before the UPDATE rather than learned from its error: a refused row would put somebody else's pseudo in the
      // database log (the DETAIL line of a unique violation). The unique key still has the last word in a race.
      const clash = await this.pool.query('SELECT 1 FROM users WHERE pseudo_key = $1 AND id <> $2', [pseudoKey(changes.pseudo), accountId])
      if ((clash.rowCount ?? 0) > 0) return { ok: false, error: 'pseudo-taken' }
    }
    try {
      const { rows } = await this.pool.query<SummaryRow>(
        `UPDATE users u
            SET pseudo = COALESCE($2, u.pseudo), pseudo_key = COALESCE($3, u.pseudo_key), avatar_id = COALESCE($4, u.avatar_id)
          WHERE u.id = $1
          RETURNING ${SUMMARY_COLUMNS}`,
        [accountId, changes.pseudo ?? null, changes.pseudo === undefined ? null : pseudoKey(changes.pseudo), changes.avatarId ?? null],
      )
      return rows[0] ? { ok: true, account: toSummary(rows[0]) } : { ok: false, error: 'not-found' }
    } catch (error) {
      if ((error as { code?: string }).code === '23505') return { ok: false, error: 'pseudo-taken' }
      throw error
    }
  }

  async updatePassword(accountId: string, passwordHash: string): Promise<boolean> {
    if (!UUID_SHAPE.test(accountId)) return false
    const { rowCount } = await this.pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [accountId, passwordHash])
    return (rowCount ?? 0) > 0
  }

  async isPseudoTaken(pseudo: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('SELECT 1 FROM users WHERE pseudo_key = $1', [pseudoKey(pseudo)])
    return (rowCount ?? 0) > 0
  }

  async createSession(accountId: string, tokenHash: Buffer, expiresAt: Date): Promise<void> {
    await this.pool.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [tokenHash, accountId, expiresAt])
  }

  async findBySession(tokenHash: Buffer, now: Date): Promise<AccountSummary | null> {
    const { rows } = await this.pool.query<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > $2`,
      [tokenHash, now],
    )
    return rows[0] ? toSummary(rows[0]) : null
  }

  async deleteSession(tokenHash: Buffer): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash])
  }

  async deleteSessionsForAccount(accountId: string, except?: Buffer): Promise<number> {
    if (!UUID_SHAPE.test(accountId)) return 0
    const { rowCount } = await this.pool.query('DELETE FROM sessions WHERE user_id = $1 AND ($2::bytea IS NULL OR token_hash <> $2::bytea)', [
      accountId,
      except ?? null,
    ])
    return rowCount ?? 0
  }

  async deleteAccount(accountId: string): Promise<boolean> {
    if (!UUID_SHAPE.test(accountId)) return false
    // One statement, so one transaction: the sessions, the playlists and the rooms hosted go with the row (ON DELETE CASCADE).
    const { rowCount } = await this.pool.query('DELETE FROM users WHERE id = $1', [accountId])
    return (rowCount ?? 0) > 0
  }

  async deleteExpiredSessions(now: Date): Promise<number> {
    const { rowCount } = await this.pool.query('DELETE FROM sessions WHERE expires_at <= $1', [now])
    return rowCount ?? 0
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
