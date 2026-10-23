/**
 * Counts events per key over a sliding window: "at most `max` in the last `windowMs`".
 * Nothing here records an attempt by itself: the caller asks, then records only the ones it lets through, so that
 * somebody who keeps hammering is not locked out longer and longer.
 * The number of keys is capped: with a new key for every request, an attacker would otherwise fill the memory.
 * Past the cap the oldest keys are forgotten (their owners get a fresh count, which is the lesser evil).
 */
export class AttemptLimiter {
  private readonly events = new Map<string, number[]>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxKeys: number = 50_000,
  ) {}

  /** Milliseconds until one more attempt is allowed; 0 when it is allowed now. */
  retryAfterMs(key: string, now: number): number {
    const recent = this.recent(key, now)
    if (recent.length < this.max) return 0
    return recent[recent.length - this.max] + this.windowMs - now
  }

  record(key: string, now: number) {
    if (!this.events.has(key) && this.events.size >= this.maxKeys) this.makeRoom(now)
    this.events.set(key, [...this.recent(key, now), now])
  }

  /** Forgets the key (a successful sign-in clears the failures of that e-mail). */
  reset(key: string) {
    this.events.delete(key)
  }

  /** Takes back the most recent attempt of the key: one that was counted but never really made. */
  undo(key: string, now: number) {
    const recent = this.recent(key, now)
    recent.pop()
    if (recent.length > 0) this.events.set(key, recent)
    else this.events.delete(key)
  }

  /** Drops the keys with nothing recent left, so that memory does not grow with every address ever seen. */
  sweep(now: number) {
    for (const key of [...this.events.keys()]) this.recent(key, now)
  }

  get size(): number {
    return this.events.size
  }

  private makeRoom(now: number) {
    this.sweep(now)
    // A Map keeps its keys in the order they were first added: the first ones are the oldest.
    while (this.events.size >= this.maxKeys) {
      const oldest = this.events.keys().next()
      if (oldest.done) return
      this.events.delete(oldest.value)
    }
  }

  private recent(key: string, now: number): number[] {
    const kept = (this.events.get(key) ?? []).filter((at) => now - at < this.windowMs)
    if (kept.length > 0) this.events.set(key, kept)
    else this.events.delete(key)
    return kept
  }
}
