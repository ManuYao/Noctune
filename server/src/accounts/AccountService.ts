import { randomBytes } from 'node:crypto'
import { AVATAR_IDS, PASSWORD_MAX, type Account, type AuthError, type AvatarId } from '../../../shared/protocol'
import { isAcceptablePassword, isStaffLookalike, normalizeEmail, normalizePseudo } from '../../../shared/validation'
import type { AccountStore, AccountSummary, StoredAccount } from './AccountStore'
import { AttemptLimiter } from './AttemptLimiter'
import { Gate } from './Gate'
import { DEFAULT_COST, hashPassword, verifyPassword, type PasswordCost } from './passwords'
import { hashToken, newSessionToken } from './sessionToken'

const SESSION_DAYS = 30
const HOUR_MS = 60 * 60 * 1000
const QUARTER_HOUR_MS = 15 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export type Refusal =
  | { ok: false; error: Exclude<AuthError, 'rate-limited'> }
  | { ok: false; error: 'rate-limited'; retryAfterSec: number }

/** A new session: the token goes to the browser (in a cookie), nowhere else. */
export interface Granted {
  ok: true
  account: Account
  token: string
  maxAgeSec: number
}

interface Limit {
  max: number
  windowMs: number
}

interface Slots {
  running: number
  waiting: number
}

export interface AccountServiceOptions {
  /** Milliseconds since the epoch. Tests replace the clock. */
  now?: () => number
  sessionTtlMs?: number
  /** Tests use a cheap cost: the real one takes a few tenths of a second per password. */
  cost?: PasswordCost
  limits?: {
    registerPerIp?: Limit
    loginPerIp?: Limit
    /** Wrong passwords for one e-mail from one address. */
    loginFailuresPerAddress?: Limit
    /** Wrong passwords for one e-mail from anywhere: the ceiling for guessing spread over many addresses. */
    loginFailuresPerEmail?: Limit
    /** Wrong current passwords given to confirm a sensitive change (new password, deletion): per account... */
    reauthFailuresPerAccount?: Limit
    /** ...and per address, so that one address cannot guess the passwords of many accounts it has sessions for. */
    reauthFailuresPerAddress?: Limit
    /** Changes of the pseudo (a pseudo is how others know somebody: it is not for changing every minute). */
    pseudoChanges?: Limit
    /** Changes of the profile of any kind. */
    profileChanges?: Limit
    /** Downloads of the member's data. */
    exports?: Limit
  }
  /** Passwords checked at once, and the ones allowed to wait: signing in, and registering (kept apart: a flood of one
   *  must not starve the other). */
  hashSlots?: Slots
  registerSlots?: Slots
}

const refuse = (error: Exclude<AuthError, 'rate-limited'>): Refusal => ({ ok: false, error })
const rateLimited = (waitMs: number): Refusal => ({ ok: false, error: 'rate-limited', retryAfterSec: Math.ceil(waitMs / 1000) })

const isAvatarId = (value: unknown): value is AvatarId => (AVATAR_IDS as readonly unknown[]).includes(value)

function asRecord(input: unknown): Record<string, unknown> | null {
  return typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : null
}

const publicAccount = ({ email, pseudo, avatarId }: AccountSummary): Account => ({ email, pseudo, avatarId })

/** Everything about accounts that is not HTTP: the rules, the limits, the sessions. */
export class AccountService {
  private readonly now: () => number
  private readonly sessionTtlMs: number
  private readonly cost: PasswordCost
  private readonly registerLimiter: AttemptLimiter
  private readonly loginLimiter: AttemptLimiter
  private readonly failuresPerAddress: AttemptLimiter
  private readonly failuresPerEmail: AttemptLimiter
  private readonly reauthPerAccount: AttemptLimiter
  private readonly reauthPerAddress: AttemptLimiter
  private readonly pseudoChanges: AttemptLimiter
  private readonly profileChanges: AttemptLimiter
  private readonly exports: AttemptLimiter
  private readonly loginGate: Gate
  private readonly registerGate: Gate
  /** A hash nobody can match, checked when the e-mail is unknown so that the answer takes as long as for a real one. */
  private readonly dummyHash: Promise<string>

  constructor(
    private readonly store: AccountStore,
    options: AccountServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now
    this.sessionTtlMs = options.sessionTtlMs ?? SESSION_DAYS * 24 * HOUR_MS
    this.cost = options.cost ?? DEFAULT_COST
    const limits = options.limits ?? {}
    const limiter = ({ max, windowMs }: Limit) => new AttemptLimiter(max, windowMs)
    this.registerLimiter = limiter(limits.registerPerIp ?? { max: 10, windowMs: HOUR_MS })
    this.loginLimiter = limiter(limits.loginPerIp ?? { max: 30, windowMs: QUARTER_HOUR_MS })
    this.failuresPerAddress = limiter(limits.loginFailuresPerAddress ?? { max: 8, windowMs: QUARTER_HOUR_MS })
    this.failuresPerEmail = limiter(limits.loginFailuresPerEmail ?? { max: 100, windowMs: QUARTER_HOUR_MS })
    this.reauthPerAccount = limiter(limits.reauthFailuresPerAccount ?? { max: 8, windowMs: QUARTER_HOUR_MS })
    this.reauthPerAddress = limiter(limits.reauthFailuresPerAddress ?? { max: 30, windowMs: QUARTER_HOUR_MS })
    this.pseudoChanges = limiter(limits.pseudoChanges ?? { max: 3, windowMs: DAY_MS })
    this.profileChanges = limiter(limits.profileChanges ?? { max: 30, windowMs: HOUR_MS })
    this.exports = limiter(limits.exports ?? { max: 10, windowMs: HOUR_MS })
    this.loginGate = new Gate(options.hashSlots?.running ?? 2, options.hashSlots?.waiting ?? 16)
    this.registerGate = new Gate(options.registerSlots?.running ?? 1, options.registerSlots?.waiting ?? 8)
    this.dummyHash = hashPassword(randomBytes(16).toString('hex'), this.cost)
    this.dummyHash.catch(() => undefined)
  }

  /** Counts this attempt, or says how long to wait. */
  private attempt(limiter: AttemptLimiter, key: string): Refusal | null {
    const now = this.now()
    const wait = limiter.retryAfterMs(key, now)
    if (wait > 0) return rateLimited(wait)
    limiter.record(key, now)
    return null
  }

  async register(input: unknown, ip: string): Promise<Granted | Refusal> {
    const body = asRecord(input)
    if (!body) return refuse('bad-request')
    const email = normalizeEmail(body.email)
    if (!email) return refuse('invalid-email')
    const pseudo = normalizePseudo(body.pseudo)
    if (!pseudo) return refuse('invalid-pseudo')
    const avatarId = body.avatarId
    if (!isAvatarId(avatarId)) return refuse('invalid-avatar')
    const password = body.password
    if (!isAcceptablePassword(password)) return refuse('weak-password')
    // A pseudo that would pass for the team is not for anybody: it is said as "taken".
    if (isStaffLookalike(pseudo)) return refuse('pseudo-taken')

    // Only what costs something is counted: a request refused above did not use the hash.
    const limited = this.attempt(this.registerLimiter, ip)
    if (limited) return limited

    // Cheap answers first, before the costly hash. The database still has the last word (a race between two people).
    if (await this.store.findByEmail(email)) return refuse('email-taken')
    if (await this.store.isPseudoTaken(pseudo)) return refuse('pseudo-taken')

    const hashed = await this.registerGate.run(() => hashPassword(password, this.cost))
    if (!hashed.ok) return refuse('busy')
    const created = await this.store.create({ email, passwordHash: hashed.value, pseudo, avatarId })
    if (!created.ok) return refuse(created.error)
    return this.openSession(created.account)
  }

  async login(input: unknown, ip: string): Promise<Granted | Refusal> {
    const body = asRecord(input)
    if (!body || typeof body.password !== 'string') return refuse('bad-request')
    const password = body.password

    const limited = this.attempt(this.loginLimiter, ip)
    if (limited) return limited

    const email = normalizeEmail(body.email)
    // Not even shaped like an address: nobody has this account, and saying so teaches nothing.
    if (!email) return refuse('bad-credentials')

    // Wrong passwords are counted per e-mail and address, so that somebody who types an e-mail they do not own cannot
    // lock its owner out from another address; and per e-mail alone with a much higher ceiling, so that guessing spread
    // over many addresses is still capped.
    const now = this.now()
    const key = `${email}|${ip}`
    const wait = Math.max(this.failuresPerAddress.retryAfterMs(key, now), this.failuresPerEmail.retryAfterMs(email, now))
    if (wait > 0) return rateLimited(wait)
    // The attempt is counted now, before the slow work: requests in flight at the same moment cannot all slip past the
    // check while the first ones are still being hashed. A right password takes it back.
    this.failuresPerAddress.record(key, now)
    this.failuresPerEmail.record(email, now)

    const account = await this.store.findByEmail(email)
    const against = account ? account.passwordHash : await this.dummyHash
    const checked = await this.loginGate.run(() => verifyPassword(password, against))
    if (!checked.ok) {
      // It was not tried: it must not count against the owner.
      this.forgetOneFailure(key, email, now)
      return refuse('busy')
    }
    if (!account || !checked.value) return refuse('bad-credentials')

    this.failuresPerAddress.reset(key)
    this.failuresPerEmail.reset(email)
    return this.openSession(account)
  }

  /** Gives back the place taken by an attempt that never reached the password check. */
  private forgetOneFailure(key: string, email: string, now: number) {
    this.failuresPerAddress.undo(key, now)
    this.failuresPerEmail.undo(email, now)
  }

  private async openSession(account: AccountSummary): Promise<Granted> {
    const { token, hash } = newSessionToken()
    await this.store.createSession(account.id, hash, new Date(this.now() + this.sessionTtlMs))
    return { ok: true, account: publicAccount(account), token, maxAgeSec: Math.floor(this.sessionTtlMs / 1000) }
  }

  /** The account behind a session token, or null (no token, unknown, expired). */
  async accountForToken(token: string | undefined): Promise<AccountSummary | null> {
    if (!token) return null
    return this.store.findBySession(hashToken(token), new Date(this.now()))
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.store.deleteSession(hashToken(token))
  }

  /**
   * The guard of what would be a disaster in the wrong hands (a new password, the end of the account): the member types
   * their current password again, even though they hold a session. Wrong ones are counted per account and per address
   * before the slow check (a burst cannot slip past while the first ones are being hashed), through the same slots as
   * signing in.
   */
  private async reauthenticate(accountId: string, password: string, ip: string): Promise<Refusal | { ok: true; account: StoredAccount }> {
    // Nobody's password is this long: not worth hashing.
    if (password.length === 0 || password.length > PASSWORD_MAX) return refuse('wrong-password')
    const now = this.now()
    const wait = Math.max(this.reauthPerAccount.retryAfterMs(accountId, now), this.reauthPerAddress.retryAfterMs(ip, now))
    if (wait > 0) return rateLimited(wait)
    this.reauthPerAccount.record(accountId, now)
    this.reauthPerAddress.record(ip, now)

    const account = await this.store.findById(accountId)
    if (!account) {
      this.reauthPerAccount.undo(accountId, now)
      this.reauthPerAddress.undo(ip, now)
      return refuse('not-signed-in')
    }
    const checked = await this.loginGate.run(() => verifyPassword(password, account.passwordHash))
    if (!checked.ok) {
      // It was not tried: it must not count against the owner.
      this.reauthPerAccount.undo(accountId, now)
      this.reauthPerAddress.undo(ip, now)
      return refuse('busy')
    }
    if (!checked.value) return refuse('wrong-password')
    this.reauthPerAccount.reset(accountId)
    return { ok: true, account }
  }

  /** Counts a request against a limiter, or says how long to wait. */
  private count(limiter: AttemptLimiter, key: string): Refusal | null {
    return this.attempt(limiter, key)
  }

  /**
   * Changes the avatar and/or the pseudo of the member. The pseudo follows the rules of registration (an account never
   * gets one that passes for the team, or one that is taken) and may change a few times a day only.
   */
  async updateProfile(accountId: string, input: unknown): Promise<{ ok: true; account: Account } | Refusal> {
    const body = asRecord(input)
    if (!body) return refuse('bad-request')
    const changes: { pseudo?: string; avatarId?: AvatarId } = {}
    if (body.pseudo !== undefined) {
      const pseudo = normalizePseudo(body.pseudo)
      if (!pseudo) return refuse('invalid-pseudo')
      if (isStaffLookalike(pseudo)) return refuse('pseudo-taken')
      changes.pseudo = pseudo
    }
    if (body.avatarId !== undefined) {
      if (!isAvatarId(body.avatarId)) return refuse('invalid-avatar')
      changes.avatarId = body.avatarId
    }
    if (changes.pseudo === undefined && changes.avatarId === undefined) return refuse('bad-request')

    const limited = this.count(this.profileChanges, accountId)
    if (limited) return limited
    const current = await this.store.findById(accountId)
    if (!current) return refuse('not-signed-in')
    if (changes.pseudo === current.pseudo) delete changes.pseudo
    if (changes.avatarId === current.avatarId) delete changes.avatarId
    if (changes.pseudo === undefined && changes.avatarId === undefined) return { ok: true, account: publicAccount(current) }

    if (changes.pseudo !== undefined) {
      const wait = this.pseudoChanges.retryAfterMs(accountId, this.now())
      if (wait > 0) return rateLimited(wait)
    }
    const updated = await this.store.updateProfile(accountId, changes)
    if (!updated.ok) return refuse(updated.error === 'not-found' ? 'not-signed-in' : 'pseudo-taken')
    // Counted once it worked: a pseudo that was refused does not use up the day's changes.
    if (changes.pseudo !== undefined) this.pseudoChanges.record(accountId, this.now())
    return { ok: true, account: publicAccount(updated.account) }
  }

  /**
   * A new password, after the current one was given again. The session that asked stays; every other session of the
   * account ends (somebody who had stolen one, or forgotten to sign out on a shared computer, is out).
   */
  async changePassword(accountId: string, keep: Buffer, input: unknown, ip: string): Promise<{ ok: true; account: Account } | Refusal> {
    const body = asRecord(input)
    if (!body || typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string') return refuse('bad-request')
    const next = body.newPassword
    // Checked first: it costs nothing, and a weak password is not a guess at the current one.
    if (!isAcceptablePassword(next)) return refuse('weak-password')

    const checked = await this.reauthenticate(accountId, body.currentPassword, ip)
    if (!checked.ok) return checked
    const hashed = await this.registerGate.run(() => hashPassword(next, this.cost))
    if (!hashed.ok) return refuse('busy')
    // The other sessions first: if the second step fails, the password is unchanged and nobody who held a session is
    // let in by a half-done change (the other way round, the new password would be set and a stolen session would live on).
    await this.store.deleteSessionsForAccount(accountId, keep)
    if (!(await this.store.updatePassword(accountId, hashed.value))) return refuse('not-signed-in')
    return { ok: true, account: publicAccount(checked.account) }
  }

  /** Ends every session of the account, this one included. */
  async logoutEverywhere(accountId: string): Promise<void> {
    await this.store.deleteSessionsForAccount(accountId)
  }

  /** The end of the account, after the current password was given again. What hangs from it is the caller's to clean. */
  async deleteAccount(accountId: string, input: unknown, ip: string): Promise<{ ok: true } | Refusal> {
    const body = asRecord(input)
    if (!body || typeof body.password !== 'string') return refuse('bad-request')
    const checked = await this.reauthenticate(accountId, body.password, ip)
    if (!checked.ok) return checked
    if (!(await this.store.deleteAccount(accountId))) return refuse('not-signed-in')
    return { ok: true }
  }

  /** What the account itself holds, for the member's copy of their data. Never the password hash. */
  async exportProfile(accountId: string): Promise<{ ok: true; profile: { email: string; pseudo: string; avatarId: AvatarId; createdAt: string } } | Refusal> {
    const limited = this.count(this.exports, accountId)
    if (limited) return limited
    const account = await this.store.findById(accountId)
    if (!account) return refuse('not-signed-in')
    return { ok: true, profile: { email: account.email, pseudo: account.pseudo, avatarId: account.avatarId, createdAt: account.createdAt.toISOString() } }
  }

  /** True when a member has this pseudo: a visitor may not use it. */
  isPseudoReserved(pseudo: string): Promise<boolean> {
    return this.store.isPseudoTaken(pseudo)
  }

  /** Forgets old counters. Cheap: meant to run every minute. */
  sweepLimits() {
    const now = this.now()
    for (const limiter of [
      this.registerLimiter,
      this.loginLimiter,
      this.failuresPerAddress,
      this.failuresPerEmail,
      this.reauthPerAccount,
      this.reauthPerAddress,
      this.pseudoChanges,
      this.profileChanges,
      this.exports,
    ]) {
      limiter.sweep(now)
    }
  }

  /** Removes the sessions that have expired. Meant to run now and then (hourly). */
  async sweepSessions(): Promise<void> {
    await this.store.deleteExpiredSessions(new Date(this.now()))
  }

  async sweep(): Promise<void> {
    this.sweepLimits()
    await this.sweepSessions()
  }
}
