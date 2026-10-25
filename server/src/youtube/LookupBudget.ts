import { TokenBucket } from './TokenBucket'

export interface LookupBudgetOptions {
  /** Lookups an account may make at once. */
  burst?: number
  /** The time it takes an account to earn one more. */
  refillMs?: number
  /** Accounts whose budget is kept: past this, the ones that are whole again are forgotten, then the oldest. */
  maxAccounts?: number
}

/**
 * What each account may ask YouTube for. The YouTube quota is one for the whole site, so a limit per connection does not
 * protect it: a member opens one connection per room, and a new one each time they drop. The budget belongs to the
 * account, whatever the number of its connections or of the doors it comes through (a DJ pasting a link, a playlist
 * being filled): a few lookups at once (a set being lined up), then one every ten seconds.
 * In memory only: a restart gives everybody a whole budget, which is the lesser evil.
 */
export class LookupBudget {
  private readonly burst: number
  private readonly refillMs: number
  private readonly maxAccounts: number
  /** Insertion order is arrival order, so the first entry is the oldest. */
  private readonly buckets = new Map<string, TokenBucket>()

  constructor(options: LookupBudgetOptions = {}) {
    this.burst = options.burst ?? 6
    this.refillMs = options.refillMs ?? 10_000
    this.maxAccounts = options.maxAccounts ?? 5000
  }

  /** Spends one lookup of the account's budget. 0: go ahead. Otherwise the milliseconds to wait (never 0 for a refusal). */
  take(accountId: string, now: number = Date.now()): number {
    let bucket = this.buckets.get(accountId)
    if (!bucket) {
      if (this.buckets.size >= this.maxAccounts) this.makeRoom(now)
      bucket = new TokenBucket(this.burst, this.refillMs, now)
      this.buckets.set(accountId, bucket)
    }
    return bucket.tryTake(now) ? 0 : Math.max(1, bucket.waitMs(now))
  }

  get size(): number {
    return this.buckets.size
  }

  private makeRoom(now: number) {
    for (const [id, bucket] of this.buckets) if (bucket.isFull(now)) this.buckets.delete(id)
    // Still full of accounts that are spending: the oldest goes.
    while (this.buckets.size >= this.maxAccounts) {
      const oldest = this.buckets.keys().next()
      if (oldest.done) return
      this.buckets.delete(oldest.value)
    }
  }
}
