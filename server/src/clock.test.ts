// Tests of ../../shared/clock.ts, run here because the server workspace owns the test runner.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { estimateClockOffset, isOutOfSync, isTrackOver, trackPositionSec } from '../../shared/clock'

describe('estimateClockOffset', () => {
  it('puts the server stamp in the middle of the round trip', () => {
    // Request left at local 1000, answer came back at local 1100: the server stamped 5050 around local 1050,
    // so at local 1100 its clock reads 5100.
    const offset = estimateClockOffset(1000, 1100, 5050)
    assert.equal(offset, 4000)
    assert.equal(1100 + offset, 5100)
  })

  it('is zero when both clocks agree and the answer is instant', () => {
    assert.equal(estimateClockOffset(1000, 1000, 1000), 0)
  })

  it('is negative when the local clock is ahead of the server', () => {
    assert.equal(estimateClockOffset(10_000, 10_000, 4_000), -6000)
  })
})

describe('trackPositionSec', () => {
  const track = { startedAt: 10_000, durationSec: 200 }

  it('counts the seconds since the start', () => {
    assert.equal(trackPositionSec(track, 15_500), 5.5)
  })

  it('never goes negative when the clock estimate is a little behind', () => {
    assert.equal(trackPositionSec(track, 9_800), 0)
  })

  it('goes past the duration once the track is over', () => {
    assert.equal(trackPositionSec(track, 260_000), 250)
  })
})

describe('isTrackOver', () => {
  const track = { startedAt: 10_000, durationSec: 200 }

  it('is false until the full duration has elapsed', () => {
    assert.equal(isTrackOver(track, 209_999), false)
    assert.equal(isTrackOver(track, 210_000), true)
  })
})

describe('isOutOfSync', () => {
  it('tolerates a gap up to the tolerance, ahead or behind', () => {
    assert.equal(isOutOfSync(10, 11.5, 1.5), false)
    assert.equal(isOutOfSync(11.5, 10, 1.5), false)
  })

  it('flags a gap beyond the tolerance, ahead or behind', () => {
    assert.equal(isOutOfSync(10, 11.6, 1.5), true)
    assert.equal(isOutOfSync(11.6, 10, 1.5), true)
  })
})
