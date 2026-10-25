import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { ROOMS_PER_MEMBER_MAX, type RoomFailure, type RoomReply } from '../../../shared/protocol'
import { ROOM_DEFS } from '../catalog'
import { MemoryRoomStore } from './MemoryRoomStore'
import { newRoomId, ROOM_ID_SHAPE, RoomService, type RoomListener, type RoomServiceOptions } from './RoomService'
import type { StoredRoom } from './RoomStore'

const HOUR = 60 * 60 * 1000
const START = Date.parse('2026-10-25T10:00:00Z')

const ann = { id: 'account-ann', pseudo: 'Ann' }
const ben = { id: 'account-ben', pseudo: 'Ben' }

const SETTINGS = {
  name: 'Rock nocturne',
  description: 'Des guitares la nuit.',
  styles: ['rock'],
  theme: 'sunset',
  rules: { maxTrackSec: 900, repeatDelaySec: 7200, maxDjs: 10 },
}
const settings = (extra: Record<string, unknown> = {}) => ({ ...SETTINGS, ...extra })

let clock: number
let store: MemoryRoomStore
let told: { created: StoredRoom[]; updated: StoredRoom[]; deleted: string[] }
let service: RoomService

function setup(options: RoomServiceOptions = {}) {
  clock = START
  store = new MemoryRoomStore()
  told = { created: [], updated: [], deleted: [] }
  const listener: RoomListener = {
    created: (room) => told.created.push(room),
    updated: (room) => told.updated.push(room),
    deleted: (id) => told.deleted.push(id),
  }
  service = new RoomService(store, listener, { now: () => clock, ...options })
}
beforeEach(() => setup())

/** The reply of a call that must have worked. */
function worked<T extends object>(reply: RoomReply<T>): T {
  assert.ok(reply.ok, JSON.stringify(reply))
  if (!reply.ok) throw new Error('refused')
  return reply
}
const refusal = (reply: RoomReply<object>) => (reply.ok ? 'ok' : reply.error)

describe('what a host may decide', () => {
  it('accepts a complete, valid set of settings and keeps exactly those fields', () => {
    const parsed = service.parseSettings(settings())
    assert.ok(parsed.ok, JSON.stringify(parsed))
    if (!parsed.ok) return
    assert.deepEqual(parsed.input, { name: 'Rock nocturne', nameKey: 'rock nocturne', description: 'Des guitares la nuit.', styles: ['rock'], theme: 'sunset', rules: SETTINGS.rules })
  })

  it('does not take anything the page was not asked for: no host, no id, no key, no extra rule', () => {
    const parsed = service.parseSettings(
      settings({ id: 'evil', hostAccountId: 'account-ben', host: 'Ben', mine: true, nameKey: 'x', rules: { ...SETTINGS.rules, hacked: true } }),
    )
    assert.ok(parsed.ok, JSON.stringify(parsed))
    if (!parsed.ok) return
    assert.deepEqual(Object.keys(parsed.input).sort(), ['description', 'name', 'nameKey', 'rules', 'styles', 'theme'])
    assert.equal(parsed.input.nameKey, 'rock nocturne', 'computed by the server')
    assert.deepEqual(Object.keys(parsed.input.rules).sort(), ['maxDjs', 'maxTrackSec', 'repeatDelaySec'])
  })

  it('accepts the choices with no limit, and an empty description', () => {
    const parsed = service.parseSettings(settings({ description: '   ', rules: { maxTrackSec: null, repeatDelaySec: null, maxDjs: 50 } }))
    assert.ok(parsed.ok, JSON.stringify(parsed))
    if (parsed.ok) assert.equal(parsed.input.description, '')
  })

  it('refuses what is not a set of settings at all', () => {
    for (const body of [null, undefined, 'room', 5, [], [SETTINGS]]) assert.equal(refusal(service.parseSettings(body) as RoomFailure), 'bad-request', JSON.stringify(body))
  })

  it('refuses names that are too short, too long, invisible, not text, or that pass for the team', () => {
    const bad: unknown[] = ['ab', 'x'.repeat(41), '   ', ' ', 42, null, 'Room' + String.fromCodePoint(0x202e) + 'evil', 'A' + String.fromCodePoint(0x200b) + 'BC', 'Admin', 'noctune', 'N o c t u n e', 'Support', 'Modérateur']
    for (const name of bad) assert.equal(refusal(service.parseSettings(settings({ name })) as RoomFailure), 'invalid-name', JSON.stringify(name))
  })

  it('accepts names with accents and emoji, counted in characters', () => {
    for (const name of ['Électro de nuit', 'Soir ' + String.fromCodePoint(0x2764, 0xfe0f), 'x'.repeat(40), 'abc']) {
      assert.ok(service.parseSettings(settings({ name })).ok, name)
    }
  })

  it('refuses a description that is too long, invisible, not text, or that holds a link', () => {
    const bad: unknown[] = [
      'x'.repeat(201),
      42,
      'hello' + String.fromCodePoint(0x200b) + 'there',
      'Rejoins-nous sur http://spam.example.com',
      'ou sur www.spam.com',
      'ou spam.com/offre',
      'HTTPS://SPAM.IO',
      'écris-moi sur discord.gg/abc',
    ]
    for (const description of bad) assert.equal(refusal(service.parseSettings(settings({ description })) as RoomFailure), 'invalid-description', JSON.stringify(description))
  })

  it('folds a description onto one line', () => {
    const parsed = service.parseSettings(settings({ description: 'Une\nligne\r\n  seule' }))
    assert.ok(parsed.ok)
    if (parsed.ok) assert.equal(parsed.input.description, 'Une ligne seule')
  })

  it('refuses styles that are missing, too many, repeated, unknown or not a list', () => {
    const bad: unknown[] = [[], ['rock', 'jazz', 'pop', 'afro'], ['rock', 'rock'], ['polka'], 'rock', null, [5], ['ROCK']]
    for (const styles of bad) assert.equal(refusal(service.parseSettings(settings({ styles })) as RoomFailure), 'invalid-styles', JSON.stringify(styles))
    assert.ok(service.parseSettings(settings({ styles: ['rock', 'jazz', 'pop'] })).ok, 'three is the limit')
  })

  it('refuses an ambiance nobody knows', () => {
    for (const theme of ['pink', '', null, 3, 'NEON']) assert.equal(refusal(service.parseSettings(settings({ theme })) as RoomFailure), 'invalid-theme', JSON.stringify(theme))
  })

  it('refuses rules that are not exactly one of the choices of the form', () => {
    const rules = SETTINGS.rules
    const bad: unknown[] = [
      { ...rules, maxTrackSec: 480 },
      { ...rules, maxTrackSec: '420' },
      { ...rules, maxTrackSec: 0 },
      { ...rules, maxTrackSec: Infinity },
      { ...rules, repeatDelaySec: 60 },
      { ...rules, maxDjs: 8 },
      { ...rules, maxDjs: 51 },
      { ...rules, maxDjs: 4 },
      { maxTrackSec: 900, repeatDelaySec: 7200 },
      { maxDjs: 10, repeatDelaySec: 7200 },
      { maxTrackSec: undefined, repeatDelaySec: 7200, maxDjs: 10 },
      null,
      [],
      'rules',
    ]
    for (const value of bad) assert.equal(refusal(service.parseSettings(settings({ rules: value })) as RoomFailure), 'invalid-rules', JSON.stringify(value))
  })
})

describe('making a room', () => {
  it('makes the member the host, tells the live side, and gives the room an id of its own', async () => {
    const { room } = worked(await service.create(ann, settings()))
    assert.deepEqual({ host: room.host, mine: room.mine, name: room.name }, { host: 'Ann', mine: true, name: 'Rock nocturne' })
    assert.match(room.id, ROOM_ID_SHAPE)
    assert.ok(room.id.startsWith('rock-nocturne-'), room.id)
    assert.equal(told.created.length, 1)
    assert.equal(told.created[0].hostAccountId, ann.id)
    assert.equal(told.created[0].id, room.id)
  })

  it('does not let the page choose who hosts it, or its id', async () => {
    const { room } = worked(await service.create(ann, settings({ hostAccountId: ben.id, host: 'Ben', id: 'lofi-du-soir' })))
    assert.equal(told.created[0].hostAccountId, ann.id)
    assert.equal(room.host, 'Ann')
    assert.notEqual(room.id, 'lofi-du-soir')
    assert.equal((await store.get('lofi-du-soir'))?.name, 'Lo-fi du soir', 'the room of the team is untouched')
  })

  it('gives two rooms with the same name different ids (once the first is gone, the name is free again)', async () => {
    const first = worked(await service.create(ann, settings())).room
    assert.equal(refusal(await service.create(ben, settings({ name: 'ROCK NOCTURNE' }))), 'name-taken')
    worked(await service.delete(ann.id, first.id))
    const again = worked(await service.create(ben, settings())).room
    assert.notEqual(again.id, first.id)
  })

  it('refuses the name of a room of the team, in any case', async () => {
    assert.equal(refusal(await service.create(ann, settings({ name: 'LO-FI DU SOIR' }))), 'name-taken')
    assert.equal(told.created.length, 0, 'and nobody was told')
  })

  it('stops a member at their limit of rooms, not the others', async () => {
    for (let index = 0; index < ROOMS_PER_MEMBER_MAX; index += 1) worked(await service.create(ann, settings({ name: `Room number ${index}` })))
    assert.equal(refusal(await service.create(ann, settings({ name: 'One too many' }))), 'too-many-rooms')
    worked(await service.create(ben, settings({ name: 'Ben has his own' })))
    assert.equal(told.created.length, ROOMS_PER_MEMBER_MAX + 1)
  })

  it('refuses invalid settings without making or announcing anything', async () => {
    assert.equal(refusal(await service.create(ann, settings({ theme: 'pink' }))), 'invalid-theme')
    assert.equal(told.created.length, 0)
    assert.equal((await store.list()).length, ROOM_DEFS.length)
  })

  it('limits how many rooms a member makes in an hour, and only counts the ones that worked', async () => {
    setup({ maxPerMember: 100, limits: { creations: { max: 3, windowMs: HOUR }, changes: { max: 100, windowMs: HOUR } } })
    for (let index = 0; index < 5; index += 1) assert.equal(refusal(await service.create(ann, settings({ theme: 'pink' }))), 'invalid-theme', 'fumbling the form is free')
    for (let index = 0; index < 3; index += 1) worked(await service.create(ann, settings({ name: `Made ${index}` })))
    const slow = await service.create(ann, settings({ name: 'Made 4' }))
    assert.deepEqual(slow, { ok: false, error: 'rate-limited', retryAfterSec: 3600 })
    clock += HOUR
    worked(await service.create(ann, settings({ name: 'Made 4' })))
  })

  it('limits every request that changes something, valid or not, so that a script cannot hammer it', async () => {
    setup({ limits: { creations: { max: 100, windowMs: HOUR }, changes: { max: 5, windowMs: HOUR } } })
    for (let index = 0; index < 5; index += 1) assert.equal(refusal(await service.create(ann, 'garbage')), 'bad-request')
    assert.equal(refusal(await service.create(ann, 'garbage')), 'rate-limited')
    assert.equal(refusal(await service.update(ann.id, 'any-room', settings())), 'rate-limited')
    assert.equal(refusal(await service.delete(ann.id, 'any-room')), 'rate-limited')
    assert.equal(refusal(await service.create(ben, 'garbage')), 'bad-request', 'somebody else is not slowed down')
  })
})

describe('reading rooms', () => {
  it('gives any room to anybody, and says whether it is the viewer’s', async () => {
    const made = worked(await service.create(ann, settings())).room
    const asAnn = worked(await service.get(made.id, ann.id)).room
    const asBen = worked(await service.get(made.id, ben.id)).room
    const asVisitor = worked(await service.get(made.id)).room
    assert.deepEqual([asAnn.mine, asBen.mine, asVisitor.mine], [true, false, false])
    assert.deepEqual({ ...asBen, mine: true }, asAnn)
    const team = worked(await service.get('lofi-du-soir', ann.id)).room
    assert.deepEqual({ host: team.host, mine: team.mine }, { host: null, mine: false })
  })

  it('answers “not found” for an id that cannot be one, without asking the store', async () => {
    for (const id of ['', '#lobby', 'A', 'x'.repeat(61), 'Rock Room', '../etc/passwd', null, 5]) {
      assert.equal(refusal(await service.get(id as string)), 'room-not-found', JSON.stringify(id))
    }
  })

  it('lists the rooms a member hosts, and only those', async () => {
    worked(await service.create(ann, settings({ name: 'Ann room one' })))
    worked(await service.create(ben, settings({ name: 'Ben room' })))
    worked(await service.create(ann, settings({ name: 'Ann room two' })))
    const mine = worked(await service.mine(ann.id)).rooms
    assert.deepEqual(mine.map((room) => room.name), ['Ann room one', 'Ann room two'])
    assert.ok(mine.every((room) => room.mine && room.host === 'Ann'))
    assert.deepEqual(worked(await service.mine('nobody')).rooms, [])
  })
})

describe('changing and deleting', () => {
  it('lets the host change everything and tells the live side', async () => {
    const made = worked(await service.create(ann, settings())).room
    const changed = worked(await service.update(ann.id, made.id, settings({ name: 'Jazz du matin', styles: ['jazz', 'pop'], theme: 'vinyl', rules: { maxTrackSec: null, repeatDelaySec: null, maxDjs: 5 } }))).room
    assert.deepEqual({ name: changed.name, styles: changed.styles, theme: changed.theme, rules: changed.rules, id: changed.id }, { name: 'Jazz du matin', styles: ['jazz', 'pop'], theme: 'vinyl', rules: { maxTrackSec: null, repeatDelaySec: null, maxDjs: 5 }, id: made.id })
    assert.equal(told.updated.length, 1)
    assert.equal(told.updated[0].name, 'Jazz du matin')
    assert.equal(told.updated[0].hostAccountId, ann.id, 'still hers')
  })

  it('refuses everybody but the host, and the rooms of the team, and tells nobody', async () => {
    const made = worked(await service.create(ann, settings())).room
    assert.equal(refusal(await service.update(ben.id, made.id, settings({ name: 'Stolen' }))), 'not-host')
    assert.equal(refusal(await service.delete(ben.id, made.id)), 'not-host')
    assert.equal(refusal(await service.update(ann.id, 'lofi-du-soir', settings({ name: 'Mine now' }))), 'not-host')
    assert.equal(refusal(await service.delete(ann.id, 'lofi-du-soir')), 'not-host')
    assert.deepEqual([told.updated.length, told.deleted.length], [0, 0])
    assert.equal((await store.get(made.id))?.name, 'Rock nocturne')
  })

  it('says a room is not there, for an id that is not one as for an id nobody has', async () => {
    assert.equal(refusal(await service.update(ann.id, 'no-such-room', settings())), 'room-not-found')
    assert.equal(refusal(await service.update(ann.id, '#lobby', settings())), 'room-not-found')
    assert.equal(refusal(await service.delete(ann.id, 'no-such-room')), 'room-not-found')
    assert.equal(refusal(await service.delete(ann.id, '../x')), 'room-not-found')
  })

  it('refuses a new name that is another room’s, and invalid settings, and changes nothing', async () => {
    const made = worked(await service.create(ann, settings())).room
    assert.equal(refusal(await service.update(ann.id, made.id, settings({ name: 'jazz café' }))), 'name-taken')
    assert.equal(refusal(await service.update(ann.id, made.id, settings({ styles: [] }))), 'invalid-styles')
    assert.equal(told.updated.length, 0)
    assert.equal((await store.get(made.id))?.name, 'Rock nocturne')
  })

  it('deletes a room and tells the live side', async () => {
    const made = worked(await service.create(ann, settings())).room
    worked(await service.delete(ann.id, made.id))
    assert.deepEqual(told.deleted, [made.id])
    assert.equal(refusal(await service.get(made.id)), 'room-not-found')
  })
})

describe('room ids', () => {
  it('are readable, safe in a link, and always of the right shape', () => {
    const names = ['Rock progressif', 'Électro de nuit', '🔥🔥🔥', 'Ça ira ?!', '   a b   ', 'x'.repeat(40), '---', 'ÀÉÎÕÜ', 'Straße', '日本語の部屋']
    for (const name of names) {
      const id = newRoomId(name)
      assert.match(id, ROOM_ID_SHAPE, `${name} -> ${id}`)
      assert.ok(id.length <= 60)
    }
    assert.ok(newRoomId('Rock progressif').startsWith('rock-progressif-'))
    assert.ok(newRoomId('Électro de nuit').startsWith('electro-de-nuit-'))
    assert.ok(newRoomId('🔥🔥🔥').startsWith('room-'))
  })

  it('differ between two draws for one name', () => {
    assert.equal(new Set(Array.from({ length: 50 }, () => newRoomId('Same name'))).size > 40, true)
  })
})

describe('the cap on rooms made by members, for the whole site', () => {
  it('refuses a new room when the site holds as many as it accepts, and a deleted one makes room again', async () => {
    setup({ maxMemberRooms: 2 })
    const first = worked(await service.create(ann, settings({ name: 'Rock nocturne' })))
    worked(await service.create(ben, settings({ name: 'Jazz de nuit' })))
    assert.equal(refusal(await service.create(ann, settings({ name: 'Rap du matin' }))), 'rooms-full')

    await service.delete(ann.id, first.room.id)
    worked(await service.create(ann, settings({ name: 'Rap du matin' })))
  })

  it('does not count the rooms of the team', async () => {
    setup({ maxMemberRooms: 1 })
    assert.ok(ROOM_DEFS.length > 1, 'the team has rooms in the store')
    worked(await service.create(ann, settings({ name: 'Rock nocturne' })))
    assert.equal(refusal(await service.create(ben, settings({ name: 'Jazz de nuit' }))), 'rooms-full')
  })
})
