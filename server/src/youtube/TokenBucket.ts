/**
 * A budget of calls: `burst` at once, then one more every `refillMs`. In memory only. The clock is passed in, so a
 * test controls time and a system clock set back cannot freeze the bucket (only forward time earns calls).
 */
export class TokenBucket {
  private tokens: number
  private last: number

  constructor(
    private readonly burst: number,
    private readonly refillMs: number,
    now: number,
  ) {
    this.tokens = burst
    this.last = now
  }

  /** Spends one call if there is one left. */
  tryTake(now: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + Math.max(0, now - this.last) / this.refillMs)
    this.last = now
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }

  /** Milliseconds until a call can be spent: 0 when there is one now. Spends nothing. */
  waitMs(now: number): number {
    const tokens = Math.min(this.burst, this.tokens + Math.max(0, now - this.last) / this.refillMs)
    return tokens >= 1 ? 0 : Math.ceil((1 - tokens) * this.refillMs)
  }

  /** Is the budget whole again? Then there is nothing to remember about whoever it was kept for. */
  isFull(now: number): boolean {
    return this.tokens + Math.max(0, now - this.last) / this.refillMs >= this.burst
  }
}
