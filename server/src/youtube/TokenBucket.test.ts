import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TokenBucket } from './TokenBucket'

const START = 1_000_000

describe('TokenBucket', () => {
  it('lets a burst through, then refuses', () => {
    const bucket = new TokenBucket(3, 1000, START)
    assert.deepEqual([1, 2, 3, 4, 5].map(() => bucket.tryTake(START)), [true, true, true, false, false])
  })

  it('earns one call per refill period', () => {
    const bucket = new TokenBucket(2, 1000, START)
    bucket.tryTake(START)
    bucket.tryTake(START)
    assert.equal(bucket.tryTake(START + 999), false)
    assert.equal(bucket.tryTake(START + 1000), true)
    assert.equal(bucket.tryTake(START + 1000), false)
    assert.equal(bucket.tryTake(START + 2000), true)
  })

  it('never holds more than the burst, however long it rests', () => {
    const bucket = new TokenBucket(2, 1000, START)
    bucket.tryTake(START)
    const later = START + 10 * 60 * 60 * 1000
    assert.deepEqual([1, 2, 3].map(() => bucket.tryTake(later)), [true, true, false])
  })

  it('adds up fractions of a period', () => {
    const bucket = new TokenBucket(1, 1000, START)
    bucket.tryTake(START)
    assert.equal(bucket.tryTake(START + 400), false)
    assert.equal(bucket.tryTake(START + 800), false)
    assert.equal(bucket.tryTake(START + 1000), true)
  })

  it('says how long to wait for the next call, and spends nothing by asking', () => {
    const bucket = new TokenBucket(2, 1000, START)
    assert.equal(bucket.waitMs(START), 0)
    bucket.tryTake(START)
    bucket.tryTake(START)
    assert.equal(bucket.waitMs(START), 1000)
    assert.equal(bucket.waitMs(START + 400), 600)
    assert.equal(bucket.waitMs(START + 400), 600, 'asking twice changes nothing')
    assert.equal(bucket.waitMs(START + 1000), 0)
    assert.equal(bucket.tryTake(START + 1000), true, 'and the call that was announced is there')
  })

  it('knows when it is whole again', () => {
    const bucket = new TokenBucket(2, 1000, START)
    assert.equal(bucket.isFull(START), true)
    bucket.tryTake(START)
    assert.equal(bucket.isFull(START), false)
    assert.equal(bucket.isFull(START + 999), false)
    assert.equal(bucket.isFull(START + 1000), true)
  })

  it('is not frozen, nor refilled, by a clock set back', () => {
    const bucket = new TokenBucket(1, 1000, START)
    bucket.tryTake(START)
    assert.equal(bucket.tryTake(START - 60_000), false) // an hour back earns nothing
    assert.equal(bucket.tryTake(START - 60_000 + 1000), true) // and the time that follows counts again
  })
})
