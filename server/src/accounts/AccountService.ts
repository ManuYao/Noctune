import { randomBytes } from 'node:crypto'
import { AVATAR_IDS, type Account, type AuthError, type AvatarId } from '../../../shared/protocol'
import { isAcceptablePassword, isStaffLookalike, normalizeEmail, normalizePseudo } from '../../../shared/validation'
import type { AccountStore, AccountSummary } from './AccountStore'
import { AttemptLimiter } from './AttemptLimiter'
import { Gate } from './Gate'
import { DEFAULT_COST, hashPassword, verifyPassword, type PasswordCost } from './passwords'
import { hashToken, newSessionToken } from './sessionToken'

const SESSION_DAYS = 30
const HOUR_MS = 60 * 60 * 1000
const QUARTER_HOUR_MS = 15 * 60 * 1000

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

  /** True when a member has this pseudo: a visitor may not use it. */
  isPseudoReserved(pseudo: string): Promise<boolean> {
    return this.store.isPseudoTaken(pseudo)
  }

  /** Forgets old counters. Cheap: meant to run every minute. */
  sweepLimits() {
    const now = this.now()
    for (const limiter of [this.registerLimiter, this.loginLimiter, this.failuresPerAddress, this.failuresPerEmail]) limiter.sweep(now)
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
