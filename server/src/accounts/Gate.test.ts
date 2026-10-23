import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Gate } from './Gate'

const tick = () => new Promise((resolve) => setImmediate(resolve))

/** A task that ends when the test says so, and counts how many are running at once. */
function controlled() {
  let running = 0
  let peak = 0
  const started: string[] = []
  const finishers = new Map<string, () => void>()
  const task = (name: string) => async () => {
    running += 1
    peak = Math.max(peak, running)
    started.push(name)
    await new Promise<void>((resolve) => finishers.set(name, resolve))
    running -= 1
    return name
  }
  return { task, started, finish: (name: string) => finishers.get(name)?.(), peak: () => peak }
}

describe('gate', () => {
  it('never runs more tasks at once than it was given places', async () => {
    const gate = new Gate(2, 10)
    const work = controlled()
    const results = ['a', 'b', 'c', 'd'].map((name) => gate.run(work.task(name)))
    await tick()
    assert.deepEqual(work.started, ['a', 'b'])
    work.finish('a')
    await tick()
    assert.deepEqual(work.started, ['a', 'b', 'c'], 'a place freed, the next one starts')
    work.finish('b')
    work.finish('c')
    await tick()
    work.finish('d')
    assert.deepEqual(await Promise.all(results), [
      { ok: true, value: 'a' },
      { ok: true, value: 'b' },
      { ok: true, value: 'c' },
      { ok: true, value: 'd' },
    ])
    assert.equal(work.peak(), 2)
  })

  it('refuses the tasks that would wait beyond the allowed queue', async () => {
    const gate = new Gate(1, 1)
    const work = controlled()
    const first = gate.run(work.task('first'))
    const second = gate.run(work.task('second'))
    assert.deepEqual(await gate.run(work.task('third')), { ok: false })
    await tick()
    assert.deepEqual(work.started, ['first'], 'the refused one never started')
    work.finish('first')
    await tick()
    work.finish('second')
    assert.deepEqual(await first, { ok: true, value: 'first' })
    assert.deepEqual(await second, { ok: true, value: 'second' })
  })

  it('frees the place of a task that fails', async () => {
    const gate = new Gate(1, 1)
    await assert.rejects(gate.run(async () => Promise.reject(new Error('boom'))), /boom/)
    assert.deepEqual(await gate.run(async () => 'next'), { ok: true, value: 'next' })
  })

  it('hands the place to the waiting task even when the running one fails', async () => {
    const gate = new Gate(1, 1)
    const release: { fail?: () => void } = {}
    const failing = gate.run(() => new Promise((_, reject) => (release.fail = () => reject(new Error('boom')))))
    const waiting = gate.run(async () => 'ran')
    await tick()
    release.fail?.()
    await assert.rejects(failing, /boom/)
    assert.deepEqual(await waiting, { ok: true, value: 'ran' })
  })
})
