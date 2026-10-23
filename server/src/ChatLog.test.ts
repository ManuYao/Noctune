import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CHAT_MIN_INTERVAL_MS, type Participant } from '../../shared/protocol'
import { ChatLog } from './ChatLog'

const alice: Participant = { id: 'a', pseudo: 'Alice', avatarId: 'pulse', member: false }
const bob: Participant = { id: 'b', pseudo: 'Bob', avatarId: 'mango', member: false }

describe('ChatLog', () => {
  it('stores the message with the author taken from server state', () => {
    const log = new ChatLog()
    const result = log.post(alice, ' salut ', 1000)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.message.authorId, 'a')
    assert.equal(result.message.pseudo, 'Alice')
    assert.equal(result.message.avatarId, 'pulse')
    assert.equal(result.message.text, 'salut')
    assert.equal(result.message.sentAt, 1000)
    assert.deepEqual(log.recent(), [result.message])
  })

  it('refuses a second message too soon and says how long to wait', () => {
    const log = new ChatLog()
    log.post(alice, 'un', 1000)
    assert.deepEqual(log.post(alice, 'deux', 2000), { ok: false, error: 'rate-limited', retryAfterMs: 2000 })
    assert.deepEqual(log.post(alice, 'deux', 3999), { ok: false, error: 'rate-limited', retryAfterMs: 1 })
    assert.equal(log.post(alice, 'deux', 1000 + CHAT_MIN_INTERVAL_MS).ok, true)
    assert.equal(log.recent().length, 2)
  })

  it('does not count a refused message as the author\'s turn', () => {
    const log = new ChatLog()
    assert.deepEqual(log.post(alice, 'https://example.com', 1000), { ok: false, error: 'links-not-allowed' })
    assert.equal(log.post(alice, 'ok', 1001).ok, true)
  })

  it('limits each participant separately', () => {
    const log = new ChatLog()
    log.post(alice, 'un', 1000)
    assert.equal(log.post(bob, 'deux', 1001).ok, true)
  })

  it('never makes someone wait longer than the interval, even if the clock goes back', () => {
    const log = new ChatLog()
    log.post(alice, 'un', 100_000)
    assert.deepEqual(log.post(alice, 'deux', 0), {
      ok: false,
      error: 'rate-limited',
      retryAfterMs: CHAT_MIN_INTERVAL_MS,
    })
  })

  it('keeps only the 50 most recent messages, oldest first', () => {
    const log = new ChatLog()
    for (let i = 0; i < 60; i += 1) log.post(alice, `m${i}`, i * CHAT_MIN_INTERVAL_MS)
    const recent = log.recent()
    assert.equal(recent.length, 50)
    assert.equal(recent[0].text, 'm10')
    assert.equal(recent[49].text, 'm59')
  })

  it('lets someone who left send again right away', () => {
    const log = new ChatLog()
    log.post(alice, 'un', 1000)
    log.forget(alice.id)
    assert.equal(log.post(alice, 'deux', 1001).ok, true)
  })

  it('can be cleared', () => {
    const log = new ChatLog()
    log.post(alice, 'un', 1000)
    log.clear()
    assert.deepEqual(log.recent(), [])
    assert.equal(log.post(alice, 'deux', 1001).ok, true)
  })

  it('hands out a copy of the history, not the list it works on', () => {
    const log = new ChatLog()
    log.post(alice, 'un', 1000)
    log.recent().pop()
    assert.equal(log.recent().length, 1)
  })
})
