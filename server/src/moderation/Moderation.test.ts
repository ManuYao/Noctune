import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EXCLUDE_SEC, MUTE_SEC } from '../../../shared/protocol'
import { excerpt, Moderation } from './Moderation'
import { RateWindow } from './RateWindow'
import { SanctionKeys } from './SanctionKeys'

const START = 1_000_000
const SECOND = 1000
const HOUR = 3600 * SECOND

const chatTarget = (messageId: string) => ({ kind: 'chat' as const, messageId, participantId: 'p-bob', pseudo: 'Bob', text: 'hello' })
const trackTarget = (trackId: string) => ({ kind: 'track' as const, entryId: 'e1', trackId, pseudo: 'Dee', title: 'A song' })

describe('mutes and exclusions', () => {
  it('last as long as the ladder says, and end by themselves', () => {
    const moderation = new Moderation()
    assert.equal(moderation.mute('m:ann', START), MUTE_SEC * SECOND)
    assert.equal(moderation.mutedFor('m:ann', START), MUTE_SEC * SECOND)
    assert.equal(moderation.mutedFor('m:ann', START + MUTE_SEC * SECOND - 1), 1)
    assert.equal(moderation.mutedFor('m:ann', START + MUTE_SEC * SECOND), 0, 'ten minutes, not a millisecond more')

    moderation.exclude('m:ann', START)
    assert.equal(moderation.excludedFor('m:ann', START + EXCLUDE_SEC * SECOND - 1), 1)
    assert.equal(moderation.excludedFor('m:ann', START + EXCLUDE_SEC * SECOND), 0, 'twenty-four hours')
  })

  it('stick to one key: nobody else is silenced or kept out', () => {
    const moderation = new Moderation()
    moderation.mute('m:ann', START)
    moderation.exclude('m:ann', START)
    assert.equal(moderation.mutedFor('m:ben', START), 0)
    assert.equal(moderation.excludedFor('m:ben', START), 0)
    assert.equal(moderation.mutedFor('v:abc', START), 0)
  })

  it('take several keys: written on all of them, and one hit is enough', () => {
    const moderation = new Moderation()
    moderation.mute(['m:ann', 'a:xyz'], START)
    moderation.exclude(['m:ann', 'a:xyz'], START)
    assert.equal(moderation.mutedFor(['m:ben', 'a:xyz'], START) > 0, true, 'by the second key')
    assert.equal(moderation.excludedFor(['v:zzz', 'm:ann'], START) > 0, true, 'by the first key')
    assert.equal(moderation.mutedFor(['m:ben', 'v:zzz'], START), 0)
    assert.equal(moderation.excludedFor([], START), 0)
  })

  it('are told apart: a mute does not keep anybody out, an exclusion does not silence', () => {
    const moderation = new Moderation()
    moderation.mute('m:ann', START)
    assert.equal(moderation.excludedFor('m:ann', START), 0)
    moderation.exclude('m:ben', START)
    assert.equal(moderation.mutedFor('m:ben', START), 0)
  })

  it('count warnings per key, and forget them after a day', () => {
    const moderation = new Moderation()
    assert.equal(moderation.warn('m:ann', START), 1)
    assert.equal(moderation.warn('m:ann', START + 1000), 2)
    assert.equal(moderation.warn('m:ben', START + 1000), 1)
    assert.equal(moderation.warn('m:ann', START + 25 * HOUR), 1, 'a day later it starts again')
  })

  it('stay bounded: expired ones go first, then the oldest', () => {
    const moderation = new Moderation({ maxKeys: 3, muteMs: 10 * SECOND })
    moderation.mute('a', START)
    moderation.mute('b', START)
    moderation.mute('c', START)
    moderation.mute('d', START + 20 * SECOND) // a, b and c have ended: they make room
    assert.equal(moderation.mutedFor('d', START + 20 * SECOND) > 0, true)
    // Nothing has ended: the oldest is dropped, the room never holds more than the limit.
    const full = new Moderation({ maxKeys: 2 })
    full.mute('a', START)
    full.mute('b', START + 1)
    full.mute('c', START + 2)
    assert.equal(full.mutedFor('a', START + 3), 0, 'the oldest went')
    assert.equal(full.mutedFor('b', START + 3) > 0 && full.mutedFor('c', START + 3) > 0, true)
  })
})

describe('reports', () => {
  it('make one report per target, with a count of the people who reported it', () => {
    const moderation = new Moderation()
    const first = moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START)
    assert.ok(first.ok && first.created, 'the first report creates it')
    const second = moderation.file('m:ben', 'chat:1', 'harassment', chatTarget('1'), START + 1)
    assert.ok(second.ok && !second.created, 'the second one joins it')
    const inbox = moderation.list(START + 2)
    assert.equal(inbox.length, 1)
    assert.equal(inbox[0].count, 2)
    assert.equal(inbox[0].reason, 'spam', 'the reason is the first one given')
  })

  it('refuse the same person twice for the same target, and do not count them again', () => {
    const moderation = new Moderation()
    moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START)
    assert.deepEqual(moderation.file('m:ann', 'chat:1', 'other', chatTarget('1'), START + 1), { ok: false, error: 'already-reported' })
    assert.equal(moderation.list(START + 2)[0].count, 1)
  })

  it('keep different targets apart, oldest first', () => {
    const moderation = new Moderation()
    moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START)
    moderation.file('m:ann', 'track:t1', 'off-topic', trackTarget('t1'), START + 1)
    assert.deepEqual(moderation.list(START + 2).map((report) => report.target.kind), ['chat', 'track'])
  })

  it('hold at most the limit, the oldest dropped, and let each one expire after its time', () => {
    const moderation = new Moderation({ maxReports: 2, reportTtlMs: 10 * SECOND })
    moderation.file('m:a', 'chat:1', 'spam', chatTarget('1'), START)
    moderation.file('m:a', 'chat:2', 'spam', chatTarget('2'), START + 1)
    moderation.file('m:a', 'chat:3', 'spam', chatTarget('3'), START + 2)
    assert.deepEqual(moderation.list(START + 3).map((report) => report.target.kind === 'chat' && report.target.messageId), ['2', '3'])
    assert.equal(moderation.list(START + 10 * SECOND + 1).length, 1, 'the first of the two ended')
    assert.equal(moderation.list(START + 20 * SECOND).length, 0)
  })

  it('a full inbox gives up its least corroborated report, never one more people made than the new one', () => {
    const moderation = new Moderation({ maxReports: 3 })
    moderation.file('m:a', 'chat:real', 'harassment', chatTarget('real'), START)
    moderation.file('m:b', 'chat:real', 'harassment', chatTarget('real'), START + 1) // corroborated: count 2
    moderation.file('m:a', 'chat:1', 'spam', chatTarget('1'), START + 2)
    moderation.file('m:a', 'chat:2', 'spam', chatTarget('2'), START + 3)
    // Full. New reports push out the oldest of the single-person ones, never the corroborated (and oldest) one.
    assert.ok(moderation.file('m:c', 'chat:3', 'spam', chatTarget('3'), START + 4).ok)
    assert.ok(moderation.file('m:c', 'chat:4', 'spam', chatTarget('4'), START + 5).ok)
    const left = moderation.list(START + 6).map((report) => report.target.kind === 'chat' && report.target.messageId)
    assert.deepEqual(left, ['real', '3', '4'])
  })

  it('refuses a new report when the inbox is full of reports that more people made', () => {
    const moderation = new Moderation({ maxReports: 2 })
    for (const target of ['1', '2']) {
      moderation.file('m:a', `chat:${target}`, 'spam', chatTarget(target), START)
      moderation.file('m:b', `chat:${target}`, 'spam', chatTarget(target), START + 1)
    }
    const refused = moderation.file('m:c', 'chat:3', 'spam', chatTarget('3'), START + 2)
    assert.equal(!refused.ok && refused.error, 'inbox-full')
    assert.ok(!refused.ok && refused.error === 'inbox-full' && refused.retryAfterMs > 0)
    assert.equal(moderation.list(START + 3).length, 2, 'nothing was pushed out')
    assert.equal(moderation.reportWait('m:c', START + 3), 0, 'a refused report does not use up the allowance')
    // Joining a report already there is still possible when the inbox is full.
    assert.ok(moderation.file('m:c', 'chat:1', 'spam', chatTarget('1'), START + 4).ok)
  })

  it('give out copies: what the host does with them cannot change what is kept', () => {
    const moderation = new Moderation()
    moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START)
    const inbox = moderation.list(START)
    inbox[0].count = 99
    if (inbox[0].target.kind === 'chat') inbox[0].target.text = 'changed'
    const again = moderation.list(START)[0]
    assert.equal(again.count, 1)
    assert.equal(again.target.kind === 'chat' && again.target.text, 'hello')
  })

  it('are handled once: resolving removes it, and says whether there was one', () => {
    const moderation = new Moderation()
    const filed = moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START)
    assert.ok(filed.ok)
    if (!filed.ok) return
    assert.equal(moderation.has(filed.report.id), true)
    assert.equal(moderation.resolve(filed.report.id), true)
    assert.equal(moderation.has(filed.report.id), false)
    assert.equal(moderation.resolve(filed.report.id), false, 'nothing to resolve twice')
  })

  it('cannot be filed again by the same person once the host set them aside, while somebody else still can', () => {
    const moderation = new Moderation()
    const filed = moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START)
    assert.ok(filed.ok, 'the first report is taken')
    if (!filed.ok) return
    assert.ok(moderation.resolve(filed.report.id), 'the host sets it aside')
    assert.deepEqual(moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START + SECOND), { ok: false, error: 'already-reported' })
    assert.equal(moderation.list(START + SECOND).length, 0, 'and nothing came back to the inbox')
    const other = moderation.file('m:bob', 'chat:1', 'spam', chatTarget('1'), START + SECOND)
    assert.ok(other.ok && other.created, 'another person is heard, in a new report')
  })

  it('may be filed again by the same person after a day, or once the room has emptied', () => {
    const moderation = new Moderation({ reportTtlMs: HOUR })
    const first = moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START)
    assert.ok(first.ok, 'taken')
    if (!first.ok) return
    moderation.resolve(first.report.id)
    assert.equal(moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START + HOUR - 1).ok, false, 'still remembered')
    assert.equal(moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START + HOUR).ok, true, 'forgotten when the report would have expired')
    moderation.clearReports()
    assert.equal(moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START + HOUR + 1).ok, true, 'and forgotten when the room empties')
  })

  it('go when the room empties, while sanctions stay until they end', () => {
    const moderation = new Moderation()
    moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START)
    moderation.mute('m:bob', START)
    moderation.clearReports()
    assert.equal(moderation.list(START).length, 0)
    assert.ok(moderation.mutedFor('m:bob', START) > 0, 'the mute is still there')
  })

  it('and everything goes when the room is deleted', () => {
    const moderation = new Moderation()
    moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START)
    moderation.mute('m:bob', START)
    moderation.exclude('m:bob', START)
    moderation.warn('m:bob', START)
    moderation.clear()
    assert.equal(moderation.list(START).length, 0)
    assert.equal(moderation.mutedFor('m:bob', START), 0)
    assert.equal(moderation.excludedFor('m:bob', START), 0)
    assert.equal(moderation.warn('m:bob', START), 1, 'the warnings are forgotten too')
  })

  it('cut a long message to an excerpt, counted in characters', () => {
    assert.equal(excerpt('short'), 'short')
    const cut = excerpt('é'.repeat(300))
    assert.equal([...cut].length, 100)
    assert.ok(cut.endsWith('…'), 'and it says it was cut')
  })
})

describe('the allowances', () => {
  it('let a person report once every five seconds and twenty times an hour', () => {
    const moderation = new Moderation()
    assert.equal(moderation.reportWait('m:ann', START), 0)
    moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START)
    assert.equal(moderation.reportWait('m:ann', START + 1000), 4000, 'four seconds to wait')
    assert.equal(moderation.reportWait('m:ann', START + 5000), 0)
    assert.equal(moderation.reportWait('m:ben', START + 1000), 0, 'somebody else is not slowed down')

    const hourly = new Moderation({ reportGapMs: 0, reportsPerHour: 3 })
    for (let index = 1; index <= 3; index += 1) hourly.file('m:ann', `chat:${index}`, 'spam', chatTarget(String(index)), START + index)
    assert.ok(hourly.reportWait('m:ann', START + 10) > 0, 'the fourth in the hour waits')
    assert.equal(hourly.reportWait('m:ann', START + HOUR + 10), 0, 'and it is free again an hour after')
  })

  it('count a report only once it was taken: a refused one does not use up the person\'s turn', () => {
    const moderation = new Moderation()
    moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START)
    moderation.file('m:ann', 'chat:1', 'spam', chatTarget('1'), START + 5000) // already reported: refused
    assert.equal(moderation.reportWait('m:ann', START + 5000), 0)
  })

  it('let a host act thirty times a minute, counted as the acts are taken', () => {
    const moderation = new Moderation({ actionsPerMinute: 2 })
    assert.equal(moderation.actionWait('m:host', START), 0)
    moderation.recordAction('m:host', START)
    moderation.recordAction('m:host', START + 1000)
    assert.equal(moderation.actionWait('m:host', START + 2000), 58_000)
    assert.equal(moderation.actionWait('m:host', START + 59_999), 1, 'the first act leaves the window a millisecond later')
    assert.equal(moderation.actionWait('m:host', START + 60_000), 0)
    assert.equal(moderation.actionWait('m:other', START + 2000), 0)
  })
})

describe('RateWindow', () => {
  it('forgets keys that have nothing left to count, and stays bounded', () => {
    const window = new RateWindow(1, 1000, 3)
    for (const key of ['a', 'b', 'c', 'd']) window.record(key, START)
    assert.equal(window.wait('a', START), 0, 'the oldest key was dropped')
    assert.ok(window.wait('d', START) > 0)
    window.forget('d')
    assert.equal(window.wait('d', START), 0)
  })
})

describe('the keys sanctions stick to', () => {
  it('follow an account, and hide the address of a visitor behind a keyed hash', () => {
    const keys = new SanctionKeys(Buffer.from('a-secret-for-the-test'))
    assert.equal(keys.member('account-1'), 'm:account-1')
    const visitor = keys.visitor('203.0.113.7')
    assert.match(visitor, /^v:[0-9a-f]{32}$/)
    assert.ok(!visitor.includes('203'), 'the address is not in the key')
    assert.equal(keys.visitor('203.0.113.7'), visitor, 'the same address, the same key')
    assert.notEqual(keys.visitor('203.0.113.8'), visitor)
    assert.notEqual(new SanctionKeys(Buffer.from('another secret')).visitor('203.0.113.7'), visitor, 'and the secret changes every key')
  })

  it('give a member two keys (account and address) and a visitor one, checked crosswise', () => {
    const keys = new SanctionKeys(Buffer.from('a-secret-for-the-test'))
    const member = keys.identity('account-1', '203.0.113.7')
    const visitor = keys.identity(undefined, '203.0.113.7')
    const neighbour = keys.identity('account-2', '203.0.113.7')
    assert.equal(member.primary, 'm:account-1')
    assert.equal(visitor.primary, keys.visitor('203.0.113.7'))
    const moderation = new Moderation()
    // A member's sanction keeps a visitor of the same address out, but not another member of it.
    moderation.exclude(member.mark, START)
    assert.ok(moderation.excludedFor(visitor.check, START) > 0)
    assert.equal(moderation.excludedFor(neighbour.check, START), 0)
    assert.ok(moderation.excludedFor(member.check, START) > 0)
    // A visitor's sanction keeps any member of the same address out.
    const other = new Moderation()
    other.mute(visitor.mark, START)
    assert.ok(other.mutedFor(member.check, START) > 0)
    assert.ok(other.mutedFor(neighbour.check, START) > 0)
    assert.equal(other.mutedFor(keys.identity(undefined, '203.0.113.8').check, START), 0, 'another address')
  })
})
