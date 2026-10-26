/**
 * At most `max` actions per `windowMs` for each key (a person, a host). In memory, bounded: a key that has nothing left to
 * count is forgotten, and past `maxKeys` the oldest are dropped. The clock is passed in, so a test controls time.
 */
export class RateWindow {
  private times = new Map<string, number[]>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxKeys = 5000,
  ) {}

  /** Milliseconds to wait before the key may act again: 0 when it may act now. Asking counts nothing. */
  wait(key: string, now: number): number {
    const recent = this.recent(key, now)
    if (recent.length < this.max) return 0
    // The oldest action that still counts leaves the window at this time.
    return Math.max(1, recent[recent.length - this.max] + this.windowMs - now)
  }

  record(key: string, now: number) {
    const recent = this.recent(key, now)
    recent.push(now)
    // Put at the end: the map keeps the keys in order of their last action.
    this.times.delete(key)
    this.times.set(key, recent)
    if (this.times.size > this.maxKeys) {
      for (const stale of this.times.keys()) {
        if (this.times.size <= this.maxKeys) break
        this.times.delete(stale)
      }
    }
  }

  forget(key: string) {
    this.times.delete(key)
  }

  clear() {
    this.times.clear()
  }

  private recent(key: string, now: number): number[] {
    return (this.times.get(key) ?? []).filter((time) => now - time < this.windowMs)
  }
}
