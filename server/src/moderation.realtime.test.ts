// Moderation through real connections: who may act, what a report carries, what a mute, an exclusion and a removed track do,
// and what keeps a sanctioned person out (a member by account, a visitor by address). Members sign up through the real API;
// visitors are told apart by the address a proxy would give (`x-forwarded-for`, with one trusted proxy).
import assert from 'node:assert/strict'
import { afterEach, describe, it, mock } from 'node:test'
import type {
  ChatMessage,
  ChatResult,
  DjQueue,
  JoinResult,
  ModNotice,
  ModResult,
  QueuedTrack,
  Report,
  ReportResult,
  ReportTarget,
  RoomSnapshot,
  RoomSummary,
} from '../../shared/protocol'
import { Room } from './Room'
import { FakeResolver } from './testing/FakeResolver'
import { api, startServer, type Started, type TestSocket } from './testing/startServer'

const PASSWORD = 'a long enough password'
const LOFI = 'lofi-du-soir' // a room of the team: no host
const SETTINGS = {
  name: 'Rock nocturne',
  description: 'Des guitares la nuit.',
  styles: ['rock'],
  theme: 'sunset',
  rules: { maxTrackSec: 900, repeatDelaySec: 7200, maxDjs: 10 },
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let server: Started

const VIDEOS = {
  aaaaaaaaaa1: { videoId: 'aaaaaaaaaa1', title: 'Alpha', artist: 'Artist', durationSec: 200 },
  bbbbbbbbbb1: { videoId: 'bbbbbbbbbb1', title: 'Bravo', artist: 'Artist', durationSec: 200 },
}

async function start(options: Parameters<typeof startServer>[0] = {}) {
  server = await startServer({ resolver: new FakeResolver(VIDEOS), trustedProxies: 1, ...options })
}

afterEach(async () => {
  mock.restoreAll()
  await server.close()
})

async function until(condition: () => boolean, what: string, timeoutMs = 2000) {
  const started = Date.now()
  while (!condition()) {
    if (Date.now() - started > timeoutMs) assert.fail(`timed out waiting for: ${what}`)
    await sleep(10)
  }
}

function answer<T>(send: (callback: (value: T) => void) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no answer from the server in 2 s')), 2000)
    send((value) => {
      clearTimeout(timer)
      resolve(value)
    })
  })
}

let accounts = 0
async function signUp(pseudo: string): Promise<string> {
  accounts += 1
  const reply = await api(server.url, '/api/auth/register', {
    body: { email: `mod${accounts}@example.com`, password: PASSWORD, pseudo, avatarId: 'pulse' },
  })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))
  return reply.cookie as string
}

async function makeRoom(cookie: string, name = SETTINGS.name): Promise<string> {
  const reply = await api(server.url, '/api/rooms', { cookie, body: { ...SETTINGS, name } })
  assert.equal(reply.status, 201, JSON.stringify(reply.body))
  return reply.body.room.id as string
}

interface Who {
  /** A member's session. */
  cookie?: string
  /** A visitor's address, as a proxy would give it. */
  ip?: string
  pseudo?: string
}

async function connectAs(who: Who): Promise<TestSocket> {
  return server.connect({ ...(who.cookie ? { cookie: who.cookie } : {}), ...(who.ip ? { headers: { 'x-forwarded-for': who.ip } } : {}) })
}

const joinResult = (socket: TestSocket, roomId: string, pseudo = 'Guest') =>
  answer<JoinResult>((callback) => socket.emit('room:join', { roomId, pseudo, avatarId: 'moss' }, callback))

interface Seen {
  socket: TestSocket
  snapshot: RoomSnapshot
  inbox: Report[][]
  notices: ModNotice[]
  messages: ChatMessage[]
  lineups: QueuedTrack[][]
  queue: DjQueue | undefined
  tracks: string[]
  excluded: number
  left: string[]
}

/** A connection that has joined a room, with everything it was told. */
async function inRoom(roomId: string, who: Who = {}): Promise<Seen> {
  const socket = await connectAs(who)
  const seen: Seen = { socket, snapshot: undefined as never, inbox: [], notices: [], messages: [], lineups: [], queue: undefined, tracks: [], excluded: 0, left: [] }
  socket.on('mod:reports', (reports) => seen.inbox.push(reports))
  socket.on('mod:notice', (notice) => seen.notices.push(notice))
  socket.on('chat:message', (message) => seen.messages.push(message))
  socket.on('dj:lineup', (lineup) => seen.lineups.push(lineup))
  socket.on('dj:queue', (queue) => (seen.queue = queue))
  socket.on('room:track', (track, _reactions, queue) => {
    seen.queue = queue
    seen.tracks.push(track?.id ?? '')
  })
  socket.on('room:excluded', () => (seen.excluded += 1))
  socket.on('room:participant-left', (id) => seen.left.push(id))
  const joined = await joinResult(socket, roomId, who.pseudo ?? 'Guest')
  assert.ok(joined.ok, JSON.stringify(joined))
  if (!joined.ok) throw new Error('not joined')
  seen.snapshot = joined.snapshot
  return seen
}

const say = (seen: Seen, text: string) => answer<ChatResult>((callback) => seen.socket.emit('chat:send', { text }, callback))
const report = (seen: Seen, target: ReportTarget | unknown, reason: unknown = 'spam') =>
  answer<ReportResult>((callback) => seen.socket.emit('report:create', { target, reason } as never, callback))
const act = (seen: Seen, action: unknown, participantId: unknown, reportId?: unknown) =>
  answer<ModResult>((callback) => seen.socket.emit('mod:act', { action, participantId, reportId } as never, callback))
const removeTrack = (seen: Seen, entryId: unknown, trackId: unknown, reportId?: unknown) =>
  answer<ModResult>((callback) => seen.socket.emit('mod:remove-track', { entryId, trackId, reportId } as never, callback))
const dismiss = (seen: Seen, reportId: unknown) => answer<ModResult>((callback) => seen.socket.emit('mod:dismiss', { reportId } as never, callback))
const lineUp = (seen: Seen, input: string) => answer<{ ok: boolean }>((callback) => seen.socket.emit('dj:add', { input }, callback as never))

/** The id of the message somebody said, as the others saw it. */
async function saidBy(speaker: Seen, listener: Seen, text: string): Promise<string> {
  assert.ok((await say(speaker, text)).ok, 'the message was accepted')
  await until(() => listener.messages.some((message) => message.text === text), `"${text}" to reach the listener`)
  return listener.messages.find((message) => message.text === text)!.id
}

/** A room with a host, a member and a visitor in it. */
async function crowd() {
  const hostCookie = await signUp('Hanna')
  const roomId = await makeRoom(hostCookie)
  const host = await inRoom(roomId, { cookie: hostCookie })
  const annCookie = await signUp('Ann')
  const ann = await inRoom(roomId, { cookie: annCookie })
  const vic = await inRoom(roomId, { ip: '10.0.0.1', pseudo: 'Vic' })
  return { hostCookie, roomId, host, annCookie, ann, vic }
}

describe('a report', () => {
  it('reaches the host of the room, with the excerpt of what was said, and nobody else', async () => {
    await start()
    const { host, ann, vic } = await crowd()
    const messageId = await saidBy(vic, ann, 'something unkind')
    assert.deepEqual(await report(ann, { kind: 'chat', messageId }, 'harassment'), { ok: true, toHost: true })

    await until(() => host.inbox.length > 0, 'the inbox of the host')
    const inbox = host.inbox.at(-1)!
    assert.equal(inbox.length, 1)
    assert.deepEqual(
      { reason: inbox[0].reason, count: inbox[0].count, target: inbox[0].target },
      { reason: 'harassment', count: 1, target: { kind: 'chat', messageId, participantId: vic.snapshot.selfId, pseudo: 'Vic', text: 'something unkind' } },
    )
    await sleep(400)
    assert.deepEqual([ann.inbox, vic.inbox], [[], []], 'nobody but the host is given the inbox')
    assert.deepEqual([ann.snapshot.reports, vic.snapshot.reports], [[], []])
  })

  it('is given to the host in the snapshot when they come back, and to nobody who is not the host', async () => {
    await start()
    const { hostCookie, roomId, host, ann, vic } = await crowd()
    const messageId = await saidBy(vic, ann, 'rude')
    assert.ok((await report(ann, { kind: 'chat', messageId })).ok)
    await until(() => host.inbox.length > 0, 'the inbox')
    host.socket.emit('room:leave')
    await until(() => ann.left.includes(host.snapshot.selfId), 'the host to leave')

    const later = await inRoom(roomId, { cookie: await signUp('Late') })
    assert.deepEqual(later.snapshot.reports, [], 'a member who is not the host has nothing')
    const back = await inRoom(roomId, { cookie: hostCookie })
    assert.equal(back.snapshot.reports.length, 1, 'the host finds the report where it was')
    assert.equal(back.snapshot.reports[0].target.kind === 'chat' && back.snapshot.reports[0].target.text, 'rude')
  })

  it('puts the reports of several people about the same thing in one, with a count', async () => {
    await start()
    const { host, ann, vic } = await crowd()
    const ben = await inRoom(host.snapshot.roomId, { cookie: await signUp('Ben') })
    const messageId = await saidBy(vic, ann, 'spam spam')
    assert.ok((await report(ann, { kind: 'chat', messageId }, 'spam')).ok)
    assert.ok((await report(ben, { kind: 'chat', messageId }, 'harassment')).ok)
    await until(() => host.inbox.at(-1)?.[0]?.count === 2, 'the count to reach two')
    assert.equal(host.inbox.at(-1)!.length, 1)
    assert.equal(host.inbox.at(-1)![0].reason, 'spam', 'the first reason stays')
  })

  it('cannot be filed again by the same person after the host set it aside', async () => {
    await start()
    const { host, ann, vic } = await crowd()
    const messageId = await saidBy(vic, ann, 'borderline')
    assert.ok((await report(ann, { kind: 'chat', messageId })).ok)
    await until(() => host.inbox.at(-1)?.length === 1, 'the report')
    assert.deepEqual(await dismiss(host, host.inbox.at(-1)![0].id), { ok: true })
    await until(() => host.inbox.at(-1)?.length === 0, 'the inbox to empty')
    assert.deepEqual(await report(ann, { kind: 'chat', messageId }), { ok: false, error: 'already-reported' })
    await sleep(400)
    assert.equal(host.inbox.at(-1)!.length, 0, 'the host is not bothered again')
  })

  it('is gone with the room when it empties: the host who comes back finds nothing', async () => {
    await start()
    const { hostCookie, roomId, host, ann, vic } = await crowd()
    const messageId = await saidBy(vic, ann, 'rude')
    assert.ok((await report(ann, { kind: 'chat', messageId })).ok)
    await until(() => host.inbox.length > 0, 'the inbox')
    for (const seen of [host, ann, vic]) seen.socket.emit('room:leave')
    // Asked of the lobby: the room is empty once it says nobody is in it.
    const watcher = await connectAs({ ip: '10.0.0.77' })
    let online = -1
    const asked = async () => (online = (await answer<RoomSummary[]>((callback) => watcher.emit('lobby:join', callback))).find((room) => room.id === roomId)?.online ?? -1)
    for (let tries = 0; tries < 40 && (await asked()) !== 0; tries += 1) await sleep(25)
    assert.equal(online, 0, 'the room is empty')

    const back = await inRoom(roomId, { cookie: hostCookie })
    assert.deepEqual(back.snapshot.reports, [], 'the reports were not kept for whoever comes next')
    assert.deepEqual(back.snapshot.chat, [], 'nor the chat')
  })

  it('is refused for the same person twice, for a message that is not there, for one\'s own message and for a bad shape', async () => {
    await start()
    const { ann, vic } = await crowd()
    const messageId = await saidBy(vic, ann, 'first')
    assert.ok((await report(ann, { kind: 'chat', messageId })).ok)
    assert.deepEqual(await report(ann, { kind: 'chat', messageId }), { ok: false, error: 'already-reported' })
    assert.deepEqual(await report(ann, { kind: 'chat', messageId: 'not-a-message' }), { ok: false, error: 'no-such-target' })
    assert.deepEqual(await report(vic, { kind: 'chat', messageId }), { ok: false, error: 'own-target' }, 'Vic wrote it')
    assert.deepEqual(await report(ann, { kind: 'chat', messageId }, 'not-a-reason'), { ok: false, error: 'invalid' })
    assert.deepEqual(await report(ann, { kind: 'chat', messageId: 5 }), { ok: false, error: 'invalid' })
    assert.deepEqual(await report(ann, { kind: 'something' }), { ok: false, error: 'invalid' })
    assert.deepEqual(await report(ann, null), { ok: false, error: 'invalid' })
    assert.deepEqual(await report(ann, { kind: 'chat', messageId: 'x'.repeat(500) }), { ok: false, error: 'invalid' })
  })

  it('cannot point at a message of another room', async () => {
    await start()
    const { ann, vic } = await crowd()
    const otherHost = await signUp('Olga')
    const otherRoom = await makeRoom(otherHost, 'Jazz de nuit')
    const stranger = await inRoom(otherRoom, { ip: '10.0.0.9', pseudo: 'Stranger' })
    const messageId = await saidBy(vic, ann, 'in the first room')
    assert.deepEqual(await report(stranger, { kind: 'chat', messageId }), { ok: false, error: 'no-such-target' })
  })

  it('carries no more than an excerpt of a long message', async () => {
    await start()
    const { host, ann, vic } = await crowd()
    const long = 'word '.repeat(60).trim() // 299 characters
    const messageId = await saidBy(vic, ann, long)
    assert.ok((await report(ann, { kind: 'chat', messageId })).ok)
    await until(() => host.inbox.length > 0, 'the inbox')
    const target = host.inbox.at(-1)![0].target
    assert.equal(target.kind === 'chat' && [...target.text].length, 100)
  })

  it('can point at the next track of a DJ in the queue, and not at one that is not there or one\'s own', async () => {
    await start()
    const { host, ann, roomId } = await crowd()
    const dee = await inRoom(roomId, { cookie: await signUp('Dee') })
    assert.ok((await lineUp(dee, 'aaaaaaaaaa1')).ok)
    assert.ok((await lineUp(dee, 'bbbbbbbbbb1')).ok)
    await until(() => dee.queue?.current?.next?.title === 'Bravo', 'the queue to show Dee and her next track')
    const entry = dee.queue!.current!
    const next = entry.next!

    assert.deepEqual(await report(ann, { kind: 'track', entryId: entry.id, trackId: next.id }, 'off-topic'), { ok: true, toHost: true })
    await until(() => host.inbox.length > 0, 'the inbox')
    assert.deepEqual(host.inbox.at(-1)![0].target, { kind: 'track', entryId: entry.id, trackId: next.id, pseudo: 'Dee', title: 'Bravo' })
    assert.deepEqual(await report(dee, { kind: 'track', entryId: entry.id, trackId: next.id }), { ok: false, error: 'own-target' })
    assert.deepEqual(await report(ann, { kind: 'track', entryId: entry.id, trackId: 'nope' }), { ok: false, error: 'no-such-target' })
    assert.deepEqual(await report(ann, { kind: 'track', entryId: 'nope', trackId: next.id }), { ok: false, error: 'no-such-target' })
  })

  it('goes to the log of the team in a room that has no host, without the text of the message', async () => {
    await start()
    const log = mock.method(console, 'log', () => {})
    const ann = await inRoom(LOFI, { cookie: await signUp('Ann') })
    const vic = await inRoom(LOFI, { ip: '10.0.0.1', pseudo: 'Vic' })
    const messageId = await saidBy(vic, ann, 'a secret sentence')
    assert.deepEqual(await report(ann, { kind: 'chat', messageId }, 'spam'), { ok: true, toHost: false })

    const lines = log.mock.calls.map((call) => String(call.arguments[0])).filter((line) => line.includes('[signalement]'))
    assert.equal(lines.length, 1)
    assert.match(lines[0], /room=lofi-du-soir motif=spam cible=chat pseudo=Vic/)
    assert.ok(!lines[0].includes('secret'), 'never the text of a message')
    assert.deepEqual(await report(ann, { kind: 'chat', messageId }), { ok: false, error: 'already-reported' }, 'and it is deduplicated there too')
  })

  it('is limited to one every few seconds and a number an hour for each person, however they come', async () => {
    await start({ moderation: { reportGapMs: 5000 } })
    const { ann, vic } = await crowd()
    const ben = await inRoom(ann.snapshot.roomId, { cookie: await signUp('Ben') })
    const first = await saidBy(vic, ann, 'one')
    const second = await saidBy(ben, ann, 'two')
    assert.ok((await report(ann, { kind: 'chat', messageId: first })).ok)
    const fast = await report(ann, { kind: 'chat', messageId: second })
    assert.equal(fast.ok, false)
    if (fast.ok || fast.error !== 'rate-limited') return assert.fail(JSON.stringify(fast))
    assert.ok(fast.retryAfterMs > 0 && fast.retryAfterMs <= 5000, `wait ${fast.retryAfterMs} ms`)
  })

  it('has an hourly cap for each person', async () => {
    await start({ moderation: { reportGapMs: 0, reportsPerHour: 1 } })
    const { ann, vic } = await crowd()
    const ben = await inRoom(ann.snapshot.roomId, { cookie: await signUp('Ben') })
    const first = await saidBy(vic, ann, 'one')
    const second = await saidBy(ben, ann, 'two')
    assert.ok((await report(ann, { kind: 'chat', messageId: first })).ok)
    const capped = await report(ann, { kind: 'chat', messageId: second })
    assert.equal(!capped.ok && capped.error, 'rate-limited')
  })
})

describe('who may act', () => {
  it('only the host of the room: a member, a visitor, the host of another room, and somebody who is not in a room, are refused', async () => {
    await start()
    const { roomId, host, ann, vic } = await crowd()
    const otherHostCookie = await signUp('Olga')
    await makeRoom(otherHostCookie, 'Jazz de nuit')
    const olga = await inRoom(roomId, { cookie: otherHostCookie }) // a host, but of another room
    const outside = await connectAs({ cookie: await signUp('Hanna2') })
    const outsideHost = { socket: outside } as Seen

    for (const who of [ann, vic, olga]) {
      assert.deepEqual(await act(who, 'mute', host.snapshot.selfId), { ok: false, error: 'not-host' })
      assert.deepEqual(await act(who, 'exclude', ann.snapshot.selfId), { ok: false, error: 'not-host' })
      assert.deepEqual(await removeTrack(who, 'e', 't'), { ok: false, error: 'not-host' })
      assert.deepEqual(await dismiss(who, 'r'), { ok: false, error: 'not-host' })
    }
    assert.deepEqual(await act(outsideHost, 'mute', ann.snapshot.selfId), { ok: false, error: 'not-in-room' })
    assert.ok((await say(ann, 'still here')).ok, 'nothing happened to Ann')
    assert.equal(ann.notices.length + vic.notices.length, 0)
  })

  it('and not in a room of the team: nobody is the host there', async () => {
    await start()
    const ann = await inRoom(LOFI, { cookie: await signUp('Ann') })
    const vic = await inRoom(LOFI, { ip: '10.0.0.1', pseudo: 'Vic' })
    assert.deepEqual(await act(ann, 'exclude', vic.snapshot.selfId), { ok: false, error: 'not-host' })
    assert.equal(ann.snapshot.isHost, false)
  })

  it('the host cannot act on themselves, on somebody who is not in the room, or with a bad shape', async () => {
    await start()
    const { host, ann, roomId } = await crowd()
    const olgaCookie = await signUp('Olga')
    const olgaRoom = await makeRoom(olgaCookie, 'Jazz de nuit')
    const olga = await inRoom(olgaRoom, { cookie: olgaCookie })

    assert.deepEqual(await act(host, 'exclude', host.snapshot.selfId), { ok: false, error: 'self' })
    assert.deepEqual(await act(host, 'mute', 'nobody'), { ok: false, error: 'no-such-person' })
    assert.deepEqual(await act(host, 'mute', olga.snapshot.selfId), { ok: false, error: 'no-such-person' }, 'a person of another room')
    assert.deepEqual(await act(host, 'ban', ann.snapshot.selfId), { ok: false, error: 'invalid' })
    assert.deepEqual(await act(host, 'mute', 5), { ok: false, error: 'invalid' })
    assert.deepEqual(await act(host, 'mute', ann.snapshot.selfId, 7), { ok: false, error: 'invalid' })
    assert.deepEqual(await act(host, 'mute', 'x'.repeat(500)), { ok: false, error: 'invalid' })
    assert.deepEqual(await act(host, 'mute', ann.snapshot.selfId, 'not-a-report'), { ok: false, error: 'no-such-report' })
    assert.ok((await say(ann, 'untouched')).ok, 'a refused act changed nothing')
    assert.equal(roomId, host.snapshot.roomId)
  })

  it('is told by the server from the account: a second connection of the host is the host too, a visitor never', async () => {
    await start()
    const { hostCookie, roomId, ann, host } = await crowd()
    assert.equal(host.snapshot.isHost, true)
    host.socket.emit('room:leave')
    await until(() => ann.left.includes(host.snapshot.selfId), 'the host to leave')
    const back = await inRoom(roomId, { cookie: hostCookie })
    assert.equal(back.snapshot.isHost, true)
    assert.deepEqual(await act(back, 'warn', ann.snapshot.selfId), { ok: true, warnings: 1 })
  })

  it('limits the acts of a host to a number a minute', async () => {
    await start({ moderation: { reportGapMs: 0, actionsPerMinute: 2 } })
    const { host, ann } = await crowd()
    assert.ok((await act(host, 'warn', ann.snapshot.selfId)).ok)
    assert.ok((await act(host, 'warn', ann.snapshot.selfId)).ok)
    const third = await act(host, 'warn', ann.snapshot.selfId)
    assert.equal(!third.ok && third.error, 'rate-limited')
    assert.ok(!third.ok && third.error === 'rate-limited' && third.retryAfterMs > 0 && third.retryAfterMs <= 60_000)
  })
})

describe('the ladder', () => {
  it('a warning is told to the person alone, and counted', async () => {
    await start()
    const { host, ann, vic } = await crowd()
    assert.deepEqual(await act(host, 'warn', ann.snapshot.selfId), { ok: true, warnings: 1 })
    assert.deepEqual(await act(host, 'warn', ann.snapshot.selfId), { ok: true, warnings: 2 })
    await until(() => ann.notices.length === 2, 'two warnings')
    assert.deepEqual(ann.notices, [{ kind: 'warning' }, { kind: 'warning' }])
    assert.deepEqual([vic.notices, host.notices], [[], []], 'nobody else hears of it')
    assert.ok((await say(ann, 'I can still talk')).ok, 'a warning silences nobody')
  })

  it('a mute silences the person for ten minutes (here a short one), tells them, and leaves everybody else alone', async () => {
    await start({ moderation: { reportGapMs: 0, muteMs: 800 } })
    const { host, ann, vic } = await crowd()
    assert.deepEqual(await act(host, 'mute', ann.snapshot.selfId), { ok: true })
    await until(() => ann.notices.length === 1, 'the notice of the mute')
    assert.equal(ann.notices[0].kind, 'muted')
    const told = ann.notices[0]
    assert.ok(told.kind === 'muted' && told.retryAfterMs > 0 && told.retryAfterMs <= 800)

    const refused = await say(ann, 'let me speak')
    assert.equal(refused.ok, false)
    if (refused.ok || refused.error !== 'muted') return assert.fail(JSON.stringify(refused))
    assert.ok(refused.retryAfterMs > 0 && refused.retryAfterMs <= 800)
    assert.ok((await say(vic, 'I am not muted')).ok)
    assert.ok((await say(host, 'nor the host')).ok)

    await sleep(850)
    assert.ok((await say(ann, 'free again')).ok, 'the mute ended, and the refused message did not use up the turn')
  })

  it('a mute follows a member to another connection and a visitor\'s address, but not other people', async () => {
    await start()
    const { host, ann, annCookie, vic, roomId } = await crowd()
    assert.ok((await act(host, 'mute', ann.snapshot.selfId)).ok)
    assert.ok((await act(host, 'mute', vic.snapshot.selfId)).ok)
    ann.socket.emit('room:leave')
    vic.socket.emit('room:leave')
    await until(() => host.left.length === 2, 'both to leave')

    const annAgain = await inRoom(roomId, { cookie: annCookie, ip: '10.0.0.51' }) // another device, another address
    const vicAgain = await inRoom(roomId, { ip: '10.0.0.1', pseudo: 'Vic2' })
    const stranger = await inRoom(roomId, { ip: '10.0.0.2', pseudo: 'Other' })
    assert.equal((await say(annAgain, 'back')).ok, false, 'the member, by account')
    assert.equal((await say(vicAgain, 'back')).ok, false, 'the visitor, by address, under another pseudo')
    assert.ok((await say(stranger, 'hello')).ok, 'another address')
  })

  it('an exclusion puts the person out, tells them and the others, and frees a DJ place', async () => {
    await start()
    const { host, ann, roomId } = await crowd()
    const deeCookie = await signUp('Dee')
    const dee = await inRoom(roomId, { cookie: deeCookie })
    assert.ok((await lineUp(dee, 'aaaaaaaaaa1')).ok)
    await until(() => host.queue?.current?.pseudo === 'Dee', 'Dee on the decks')

    assert.deepEqual(await act(host, 'exclude', dee.snapshot.selfId), { ok: true })
    await until(() => dee.excluded === 1, 'Dee to be told')
    await until(() => ann.left.includes(dee.snapshot.selfId), 'the others to see her go')
    await until(() => host.queue?.current === null && host.queue.waiting.length === 0, 'her place and her track to go')
    assert.deepEqual(await say(dee, 'am I still here?'), { ok: false, error: 'not-in-room' })
  })

  it('an excluded member cannot come back from another device, an excluded visitor cannot from the same address', async () => {
    await start()
    const { host, ann, annCookie, vic, roomId } = await crowd()
    assert.ok((await act(host, 'exclude', ann.snapshot.selfId)).ok)
    assert.ok((await act(host, 'exclude', vic.snapshot.selfId)).ok)

    const annElsewhere = await connectAs({ cookie: annCookie, ip: '10.0.0.50' }) // another device, another address
    assert.deepEqual(await joinResult(annElsewhere, roomId), { ok: false, error: 'excluded' }, 'by account')
    const neighbour = await connectAs({ cookie: await signUp('Zed') }) // another member, from the address Ann was excluded from
    assert.ok((await joinResult(neighbour, roomId)).ok, 'a member is kept out for who they are, not for the address they share')
    const vicAgain = await connectAs({ ip: '10.0.0.1' })
    assert.deepEqual(await joinResult(vicAgain, roomId, 'Fresh'), { ok: false, error: 'excluded' }, 'by address, under another pseudo')
    const other = await connectAs({ ip: '10.0.0.2' })
    const allowed = await joinResult(other, roomId, 'Fresh')
    assert.ok(allowed.ok, 'another address is welcome')
    // The exclusion is of this room only.
    const otherRoom = await makeRoom(await signUp('Olga'), 'Jazz de nuit')
    await sleep(350) // one connection may only ask to join every 300 ms
    assert.ok((await joinResult(annElsewhere, otherRoom)).ok, 'and the same member can enter another room')
  })

  it('an exclusion ends by itself', async () => {
    await start({ moderation: { reportGapMs: 0, excludeMs: 200 } })
    const { host, vic, roomId } = await crowd()
    assert.ok((await act(host, 'exclude', vic.snapshot.selfId)).ok)
    const refused = await connectAs({ ip: '10.0.0.1' })
    assert.deepEqual(await joinResult(refused, roomId), { ok: false, error: 'excluded' })
    await sleep(400)
    assert.ok((await joinResult(refused, roomId)).ok, 'twenty-four hours later, in this test two hundred milliseconds')
  })

  it('the sanction of a room is not a sanction of another one', async () => {
    await start({ moderation: { reportGapMs: 0, muteMs: 60_000 } })
    const { host, ann, annCookie } = await crowd()
    const otherHost = await signUp('Olga')
    const otherRoom = await makeRoom(otherHost, 'Jazz de nuit')
    assert.ok((await act(host, 'mute', ann.snapshot.selfId)).ok)
    const annThere = await inRoom(otherRoom, { cookie: annCookie })
    assert.ok((await say(annThere, 'free here')).ok)
  })

  it('handles the report it came from: it leaves the inbox, and an act on a report that is not there changes nothing', async () => {
    await start()
    const { host, ann, vic } = await crowd()
    const messageId = await saidBy(vic, ann, 'rude')
    assert.ok((await report(ann, { kind: 'chat', messageId })).ok)
    await until(() => host.inbox.at(-1)?.length === 1, 'the report')
    const reportId = host.inbox.at(-1)![0].id

    assert.deepEqual(await act(host, 'warn', 'nobody', reportId), { ok: false, error: 'no-such-person' })
    assert.equal(host.inbox.at(-1)!.length, 1, 'a refused act leaves the report')
    assert.deepEqual(await act(host, 'warn', vic.snapshot.selfId, reportId), { ok: true, warnings: 1 })
    await until(() => host.inbox.at(-1)?.length === 0, 'the inbox to empty')
    assert.deepEqual(await act(host, 'warn', vic.snapshot.selfId, reportId), { ok: false, error: 'no-such-report' })
    assert.equal(vic.notices.length, 1, 'and the second warning was not given')
  })

  it('a report can be set aside', async () => {
    await start()
    const { host, ann, vic } = await crowd()
    const messageId = await saidBy(vic, ann, 'meh')
    assert.ok((await report(ann, { kind: 'chat', messageId })).ok)
    await until(() => host.inbox.at(-1)?.length === 1, 'the report')
    assert.deepEqual(await dismiss(host, 'not-a-report'), { ok: false, error: 'no-such-report' })
    assert.deepEqual(await dismiss(host, host.inbox.at(-1)![0].id), { ok: true })
    await until(() => host.inbox.at(-1)?.length === 0, 'the inbox to empty')
  })
})

describe('taking a track out', () => {
  async function djWithTwoTracks() {
    const crowded = await crowd()
    const dee = await inRoom(crowded.roomId, { cookie: await signUp('Dee') })
    assert.ok((await lineUp(dee, 'aaaaaaaaaa1')).ok)
    assert.ok((await lineUp(dee, 'bbbbbbbbbb1')).ok)
    await until(() => dee.queue?.current?.next?.title === 'Bravo', 'Dee, on the decks, with a next track')
    return { ...crowded, dee, entry: dee.queue!.current!, next: dee.queue!.current!.next! }
  }

  it('takes the next track out of the DJ\'s line-up, tells them, and handles the report', async () => {
    await start()
    const { host, ann, dee, entry, next } = await djWithTwoTracks()
    assert.ok((await report(ann, { kind: 'track', entryId: entry.id, trackId: next.id })).ok)
    await until(() => host.inbox.at(-1)?.length === 1, 'the report')

    assert.deepEqual(await removeTrack(host, entry.id, next.id, host.inbox.at(-1)![0].id), { ok: true })
    await until(() => dee.lineups.at(-1)?.length === 0, 'the line-up of Dee to be empty')
    await until(() => dee.notices.some((notice) => notice.kind === 'track-removed'), 'the notice')
    assert.deepEqual(dee.notices.find((notice) => notice.kind === 'track-removed'), { kind: 'track-removed', title: 'Bravo' })
    await until(() => host.inbox.at(-1)?.length === 0, 'the report to be handled')
    assert.equal(ann.notices.length, 0, 'only the DJ is told')
    assert.deepEqual(await removeTrack(host, entry.id, next.id), { ok: false, error: 'no-such-track' }, 'nothing left to remove')
  })

  it('cuts the track that plays: the turn passes on', async () => {
    await start()
    const { host, dee, entry } = await djWithTwoTracks()
    // What plays is the first track Dee lined up: its id came with the `room:track` that started it.
    const playingId = host.tracks.at(-1)!
    const tracksBefore = host.tracks.length
    assert.deepEqual(await removeTrack(host, entry.id, playingId), { ok: true })
    await until(() => host.tracks.length > tracksBefore, 'a new track to start')
    assert.notEqual(host.tracks.at(-1), playingId, 'another track plays now')
    await until(() => dee.notices.some((notice) => notice.kind === 'track-removed'), 'Dee to be told')
  })

  it('is for the host alone, and says when the place or the track is not there', async () => {
    await start()
    const { host, ann, dee, entry, next } = await djWithTwoTracks()
    assert.deepEqual(await removeTrack(ann, entry.id, next.id), { ok: false, error: 'not-host' })
    assert.deepEqual(await removeTrack(dee, entry.id, next.id), { ok: false, error: 'not-host' }, 'not even its own DJ, this way')
    assert.equal(dee.queue!.current!.next!.id, next.id, 'the track is still there')
    assert.deepEqual(await removeTrack(host, 'nope', next.id), { ok: false, error: 'no-such-track' })
    assert.deepEqual(await removeTrack(host, entry.id, 'nope'), { ok: false, error: 'no-such-track' })
    assert.deepEqual(await removeTrack(host, 5, next.id), { ok: false, error: 'invalid' })
    assert.deepEqual(await removeTrack(host, entry.id, next.id, 'not-a-report'), { ok: false, error: 'no-such-report' })
    assert.equal(dee.queue!.current!.next!.id, next.id, 'and a refused act removed nothing')
  })
})

describe('what a room forgets', () => {
  const events = { onTrackChange() {}, onReactionsChange() {}, onQueueChange() {}, onLineupChange() {}, onNotice() {} }
  const person = { id: 'p1', pseudo: 'Pat', avatarId: 'pulse' as const, member: false }

  it('keeps the sanctions when the room empties, drops the reports, and drops everything when the room is deleted', () => {
    const room = new Room('r', 'R', events)
    room.add(person, undefined, 'v:abc')
    const now = Date.now()
    room.moderation.mute('v:abc', now)
    room.moderation.file('v:xyz', 'chat:1', 'spam', { kind: 'chat', messageId: '1', participantId: 'p1', pseudo: 'Pat', text: 'x' }, now)
    room.remove('p1')
    assert.ok(room.moderation.mutedFor('v:abc', now) > 0, 'the mute outlives an empty room')
    assert.equal(room.moderation.list(now).length, 0, 'the reports do not')

    room.moderation.file('v:xyz', 'chat:2', 'spam', { kind: 'chat', messageId: '2', participantId: 'p1', pseudo: 'Pat', text: 'x' }, now)
    room.moderation.exclude('v:abc', now)
    room.close()
    assert.equal(room.moderation.mutedFor('v:abc', now), 0)
    assert.equal(room.moderation.excludedFor('v:abc', now), 0)
    assert.equal(room.moderation.list(now).length, 0)
  })

  it('forgets what a participant\'s sanctions stick to as soon as they leave', () => {
    const room = new Room('r', 'R', events)
    room.add(person, undefined, 'v:abc')
    assert.equal(room.sanctionKeyOf('p1'), 'v:abc')
    room.remove('p1')
    assert.equal(room.sanctionKeyOf('p1'), undefined)
    room.close()
  })
})
