/** Lets each key (a participant) act at most once per interval. In memory only. */
export class MinInterval {
  private lastAt = new Map<string, number>()

  constructor(private readonly intervalMs: number) {}

  /**
   * Milliseconds the key still has to wait, 0 when it may act now. Capped at the interval so a system clock
   * set back cannot lock someone out for longer.
   */
  waitTime(key: string, now: number): number {
    const last = this.lastAt.get(key)
    if (last === undefined) return 0
    return Math.min(this.intervalMs, Math.max(0, last + this.intervalMs - now))
  }

  record(key: string, now: number) {
    this.lastAt.set(key, now)
  }

  forget(key: string) {
    this.lastAt.delete(key)
  }

  clear() {
    this.lastAt.clear()
  }
}
