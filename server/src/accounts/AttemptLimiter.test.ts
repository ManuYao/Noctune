import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AttemptLimiter } from './AttemptLimiter'

const MINUTE = 60_000

describe('attempt limiter', () => {
  it('allows attempts until the maximum is reached, then says how long to wait', () => {
    const limiter = new AttemptLimiter(3, 10 * MINUTE)
    for (let i = 0; i < 3; i += 1) {
      assert.equal(limiter.retryAfterMs('a', i * 1000), 0)
      limiter.record('a', i * 1000)
    }
    // The first attempt, at 0, leaves the window at 10 minutes: that is when a place is free again.
    assert.equal(limiter.retryAfterMs('a', 3000), 10 * MINUTE - 3000)
  })

  it('does not count an attempt it was only asked about', () => {
    const limiter = new AttemptLimiter(1, MINUTE)
    for (let i = 0; i < 10; i += 1) assert.equal(limiter.retryAfterMs('a', 0), 0)
  })

  it('lets attempts through again as the old ones leave the window', () => {
    const limiter = new AttemptLimiter(2, MINUTE)
    limiter.record('a', 0)
    limiter.record('a', 30_000)
    assert.equal(limiter.retryAfterMs('a', 40_000), 20_000, 'the attempt from 0 leaves in 20 s')
    assert.equal(limiter.retryAfterMs('a', MINUTE), 0, 'it has left: one place is free')
    limiter.record('a', MINUTE)
    assert.equal(limiter.retryAfterMs('a', MINUTE), 30_000, 'the one from 30 s is next to leave')
  })

  it('keeps every key apart', () => {
    const limiter = new AttemptLimiter(1, MINUTE)
    limiter.record('a', 0)
    assert.ok(limiter.retryAfterMs('a', 1) > 0)
    assert.equal(limiter.retryAfterMs('b', 1), 0)
  })

  it('forgets a key on reset', () => {
    const limiter = new AttemptLimiter(1, MINUTE)
    limiter.record('a', 0)
    limiter.reset('a')
    assert.equal(limiter.retryAfterMs('a', 1), 0)
  })

  it('does not grow past its cap, whatever the number of keys thrown at it', () => {
    const limiter = new AttemptLimiter(5, MINUTE, 100)
    for (let i = 0; i < 10_000; i += 1) limiter.record(`ip-${i}`, i)
    assert.ok(limiter.size <= 100, `size ${limiter.size}`)
    // The most recent keys are the ones that are still counted.
    limiter.record('ip-9999', 10_000)
    assert.equal(limiter.retryAfterMs('ip-9999', 10_001), 0, 'still counted, below the maximum')
  })

  it('makes room by dropping the keys with nothing recent first, and only then the oldest ones', () => {
    const limiter = new AttemptLimiter(1, MINUTE, 3)
    limiter.record('stale-1', 0)
    limiter.record('stale-2', 0)
    limiter.record('live', 2 * MINUTE)
    limiter.record('new', 2 * MINUTE + 1)
    assert.ok(limiter.retryAfterMs('live', 2 * MINUTE + 2) > 0, 'a live key is not dropped while stale ones can go')
    assert.ok(limiter.retryAfterMs('new', 2 * MINUTE + 2) > 0)
    assert.equal(limiter.size, 2)
  })

  it('does not grow with the keys it has seen: sweeping drops the ones with nothing recent', () => {
    const limiter = new AttemptLimiter(5, MINUTE)
    for (let i = 0; i < 1000; i += 1) limiter.record(`ip-${i}`, 0)
    limiter.record('recent', 2 * MINUTE)
    limiter.sweep(2 * MINUTE)
    const size = (limiter as unknown as { events: Map<string, number[]> }).events.size
    assert.equal(size, 1)
    assert.ok(limiter.retryAfterMs('recent', 2 * MINUTE + 1) === 0)
  })
})
