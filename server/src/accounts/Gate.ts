/**
 * Lets a few tasks run at once and a few more wait; refuses the rest. Checking a password takes tens of megabytes
 * and a few tenths of a second: without this, a crowd of sign-in attempts would use up the memory of the server.
 */
export class Gate {
  private running = 0
  private readonly waiting: (() => void)[] = []

  constructor(
    private readonly maxRunning: number,
    private readonly maxWaiting: number,
  ) {}

  async run<T>(task: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    if (this.running >= this.maxRunning) {
      if (this.waiting.length >= this.maxWaiting) return { ok: false }
      // The place is handed over by the task that ends, so `running` does not change hands.
      await new Promise<void>((resolve) => this.waiting.push(resolve))
    } else {
      this.running += 1
    }
    try {
      return { ok: true, value: await task() }
    } finally {
      const next = this.waiting.shift()
      if (next) next()
      else this.running -= 1
    }
  }
}
