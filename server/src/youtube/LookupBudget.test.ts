import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LookupBudget } from './LookupBudget'

const START = 1_000_000
const SECOND = 1000

describe('LookupBudget', () => {
  it('lets an account look a few videos up at once, then makes it wait, and says how long', () => {
    const budget = new LookupBudget({ burst: 3, refillMs: 10 * SECOND })
    assert.deepEqual([1, 2, 3].map(() => budget.take('ann', START)), [0, 0, 0])
    assert.equal(budget.take('ann', START), 10 * SECOND)
    assert.equal(budget.take('ann', START + 4 * SECOND), 6 * SECOND, 'a refusal does not push the next one further away')
  })

  it('earns one lookup per refill period, and never more than the burst', () => {
    const budget = new LookupBudget({ burst: 2, refillMs: 10 * SECOND })
    budget.take('ann', START)
    budget.take('ann', START)
    assert.equal(budget.take('ann', START + 9_999) > 0, true)
    assert.equal(budget.take('ann', START + 10 * SECOND), 0)
    assert.equal(budget.take('ann', START + 10 * SECOND) > 0, true)
    const later = START + 24 * 3600 * SECOND
    assert.deepEqual([1, 2, 3].map(() => budget.take('ann', later) === 0), [true, true, false])
  })

  it('keeps one budget per account: whoever spends theirs does not take from anybody else', () => {
    const budget = new LookupBudget({ burst: 1, refillMs: 10 * SECOND })
    assert.equal(budget.take('ann', START), 0)
    assert.equal(budget.take('ann', START) > 0, true)
    assert.equal(budget.take('ben', START), 0)
  })

  it('never answers 0 to a refusal, so that "wait 0 ms" cannot be read as "go"', () => {
    const budget = new LookupBudget({ burst: 1, refillMs: 1 })
    budget.take('ann', START)
    for (let at = 0; at < 3; at += 1) {
      const wait = budget.take('ann', START)
      assert.ok(wait === 0 || wait >= 1, `wait ${wait}`)
    }
  })

  it('has defaults: six at once, then one every ten seconds', () => {
    const budget = new LookupBudget()
    assert.deepEqual(Array.from({ length: 6 }, () => budget.take('ann', START)), [0, 0, 0, 0, 0, 0])
    assert.equal(budget.take('ann', START), 10 * SECOND)
  })

  it('keeps as many accounts as it is told, and forgets first the ones whose budget is whole again', () => {
    const budget = new LookupBudget({ burst: 2, refillMs: 10 * SECOND, maxAccounts: 3 })
    budget.take('a', START)
    budget.take('b', START)
    budget.take('c', START)
    assert.equal(budget.size, 3)
    // A minute later all three are whole again: a newcomer makes room by forgetting them.
    budget.take('d', START + 60 * SECOND)
    assert.equal(budget.size, 1)
  })

  it('forgets the oldest account when every one of them is spending', () => {
    const budget = new LookupBudget({ burst: 1, refillMs: 3600 * SECOND, maxAccounts: 3 })
    for (const id of ['a', 'b', 'c']) budget.take(id, START)
    assert.equal(budget.size, 3)
    budget.take('d', START + SECOND)
    assert.equal(budget.size, 3, 'bounded')
    // `a` was the oldest: it is the one that got a whole budget back; `b` still waits.
    assert.equal(budget.take('b', START + 2 * SECOND) > 0, true)
    assert.equal(budget.take('a', START + 2 * SECOND), 0)
  })

  it('does not grow with every account it sees', () => {
    const budget = new LookupBudget({ burst: 1, refillMs: 3600 * SECOND, maxAccounts: 50 })
    for (let index = 0; index < 5000; index += 1) budget.take(`account-${index}`, START + index)
    assert.ok(budget.size <= 50, `size ${budget.size}`)
  })
})
