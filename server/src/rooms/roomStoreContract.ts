// What every RoomStore must do, whatever it keeps its data in. MemoryRoomStore.test.ts runs it on the memory version,
// pg.test.ts on the real database: the two cannot drift apart without a test noticing.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it, type TestContext } from 'node:test'
import { roomNameKey } from '../../../shared/validation'
import { ROOM_DEFS } from '../catalog'
import type { RoomInput, RoomStore } from './RoomStore'

export interface RoomStoreUnderTest {
  store: RoomStore
  /** Back to the rooms of the team and nothing else. */
  reset: () => Promise<void>
  /** A new account (the real database wants the member to exist): its id and its pseudo. */
  newAccount: () => Promise<{ id: string; pseudo: string }>
}

const MAX = 3

const input = (name: string, extra: Partial<RoomInput> = {}): RoomInput => ({
  name,
  nameKey: roomNameKey(name),
  description: `About ${name}`,
  styles: ['rock', 'jazz'],
  theme: 'sunset',
  rules: { maxTrackSec: 600, repeatDelaySec: null, maxDjs: 10 },
  ...extra,
})

let counter = 0
const freshId = () => `room-${(counter += 1)}-${randomUUID().slice(0, 6)}`

export function describeRoomStoreContract(name: string, open: () => Promise<RoomStoreUnderTest | null>) {
  describe(name, () => {
    /** Runs a test on a store with the rooms of the team and two members, or skips it when there is no store. */
    function test(
      title: string,
      body: (store: RoomStore, ann: { id: string; pseudo: string }, ben: { id: string; pseudo: string }) => Promise<void>,
    ) {
      it(title, async (t: TestContext) => {
        const under = await open()
        if (!under) return t.skip('pas de base de test : npm run db:setup')
        await under.reset()
        await body(under.store, await under.newAccount(), await under.newAccount())
      })
    }

    test('drops every room a member hosts, tells which, and touches neither the team\'s rooms nor another host\'s', async (store, ann, ben) => {
      const mine = [await made(store, ann, 'Rock nocturne'), await made(store, ann, 'Jazz de nuit')]
      const bens = await made(store, ben, 'Salon de Ben')
      const gone = await store.deleteByHost(ann.id)
      assert.deepEqual([...gone].sort(), mine.map((room) => room.id).sort())
      assert.deepEqual(await store.listByHost(ann.id), [])
      assert.ok(await store.get(bens.id), 'another host keeps their room')
      assert.equal((await store.list()).filter((room) => room.hostAccountId === null).length, ROOM_DEFS.length, 'the rooms of the team stay')
      assert.deepEqual(await store.deleteByHost(ann.id), [], 'again: nothing to delete')
    })

    test('lets a store that keeps a copy of the host\'s pseudo update it, and reads a changed one either way', async (store, ann) => {
      const room = await made(store, ann, 'Rock nocturne')
      await store.renameHost(ann.id, 'Anna')
      const read = await store.get(room.id)
      // A database reads the pseudo from the account (which this test did not change): only the copy of a memory store moves.
      assert.ok(read?.hostPseudo === 'Anna' || read?.hostPseudo === ann.pseudo, `host pseudo is ${read?.hostPseudo}`)
    })

    async function made(store: RoomStore, host: { id: string; pseudo: string }, roomName: string, extra: Partial<RoomInput> = {}) {
      const id = freshId()
      const created = await store.create({ accountId: host.id, pseudo: host.pseudo }, id, input(roomName, extra), MAX)
      assert.ok(created.ok, JSON.stringify(created))
      if (!created.ok) throw new Error('not created')
      return created.room
    }

    test('starts with the rooms of the team, in their order, with no host', async (store) => {
      const rooms = await store.list()
      assert.deepEqual(
        rooms.map((room) => room.id),
        ROOM_DEFS.map((def) => def.id),
      )
      for (const [index, room] of rooms.entries()) {
        const def = ROOM_DEFS[index]
        assert.deepEqual(
          { name: room.name, description: room.description, styles: room.styles, theme: room.theme, rules: room.rules },
          { name: def.name, description: def.description, styles: def.styles, theme: def.theme, rules: def.rules },
        )
        assert.equal(room.hostAccountId, null)
        assert.equal(room.hostPseudo, null)
        assert.equal(room.createdAt, null, 'the date of a migration is not when a team room opened')
      }
    })

    test('keeps what a host decided, and shows their pseudo', async (store, ann) => {
      const room = await made(store, ann, 'Rock progressif nocturne')
      assert.deepEqual(
        { name: room.name, description: room.description, styles: room.styles, theme: room.theme, rules: room.rules },
        { name: 'Rock progressif nocturne', description: 'About Rock progressif nocturne', styles: ['rock', 'jazz'], theme: 'sunset', rules: { maxTrackSec: 600, repeatDelaySec: null, maxDjs: 10 } },
      )
      assert.equal(room.hostAccountId, ann.id)
      assert.equal(room.hostPseudo, ann.pseudo)
      assert.ok(room.createdAt !== null && Math.abs(room.createdAt - Date.now()) < 60_000, `created at ${room.createdAt}`)
      assert.deepEqual(await store.get(room.id), room)
      assert.equal(await store.get('no-such-room'), null)
    })

    test('lists the rooms of the team first, then the others in the order they were made, and the rooms of a host alone', async (store, ann, ben) => {
      const first = await made(store, ann, 'Alpha room')
      const second = await made(store, ben, 'Bravo room')
      const third = await made(store, ann, 'Charlie room')
      const ids = (await store.list()).map((room) => room.id)
      assert.deepEqual(ids, [...ROOM_DEFS.map((def) => def.id), first.id, second.id, third.id])
      assert.deepEqual((await store.listByHost(ann.id)).map((room) => room.id), [first.id, third.id])
      assert.deepEqual((await store.listByHost(ben.id)).map((room) => room.id), [second.id])
      assert.deepEqual(await store.listByHost(randomUUID()), [])
    })

    test('does not let two rooms share a name, whatever the case, the rooms of the team included', async (store, ann, ben) => {
      await made(store, ann, 'Soirée Jazz')
      const sameName = await store.create({ accountId: ben.id, pseudo: ben.pseudo }, freshId(), input('SOIRÉE JAZZ'), MAX)
      assert.deepEqual(sameName, { ok: false, error: 'name-taken' })
      const team = await store.create({ accountId: ben.id, pseudo: ben.pseudo }, freshId(), input('ROCK & LÉGENDES'), MAX)
      assert.deepEqual(team, { ok: false, error: 'name-taken' })
    })

    test('does not reuse an id, the ids of the team included', async (store, ann) => {
      const taken = await store.create({ accountId: ann.id, pseudo: ann.pseudo }, ROOM_DEFS[0].id, input('Another name'), MAX)
      assert.deepEqual(taken, { ok: false, error: 'id-taken' })
    })

    test('stops a host at the limit, leaves others alone, and gives the place back when a room is deleted', async (store, ann, ben) => {
      const rooms = [await made(store, ann, 'One room'), await made(store, ann, 'Two rooms'), await made(store, ann, 'Three rooms')]
      const fourth = await store.create({ accountId: ann.id, pseudo: ann.pseudo }, freshId(), input('Four rooms'), MAX)
      assert.deepEqual(fourth, { ok: false, error: 'too-many-rooms' })
      assert.equal((await store.list()).some((room) => room.name === 'Four rooms'), false, 'and nothing was made')
      await made(store, ben, 'Ben room')

      assert.deepEqual(await store.delete(ann.id, rooms[1].id), { ok: true })
      await made(store, ann, 'Four rooms')
    })

    test('cannot be made to pass the limit by requests at the same moment', async (store, ann) => {
      const attempts = await Promise.all(
        Array.from({ length: 8 }, (_, index) => store.create({ accountId: ann.id, pseudo: ann.pseudo }, freshId(), input(`Parallel ${index}`), MAX)),
      )
      assert.equal(attempts.filter((attempt) => attempt.ok).length, MAX)
      assert.ok(attempts.filter((attempt) => !attempt.ok).every((attempt) => !attempt.ok && attempt.error === 'too-many-rooms'))
      assert.equal((await store.listByHost(ann.id)).length, MAX)
    })

    test('lets one of two members at the same moment have a name', async (store, ann, ben) => {
      const [first, second] = await Promise.all([
        store.create({ accountId: ann.id, pseudo: ann.pseudo }, freshId(), input('Same name'), MAX),
        store.create({ accountId: ben.id, pseudo: ben.pseudo }, freshId(), input('same NAME'), MAX),
      ])
      assert.equal([first, second].filter((attempt) => attempt.ok).length, 1)
      assert.deepEqual([first, second].find((attempt) => !attempt.ok), { ok: false, error: 'name-taken' })
    })

    test('lets the host change everything, and the room keeps its place in the list', async (store, ann) => {
      const room = await made(store, ann, 'Before')
      const after = await made(store, ann, 'After')
      const changed = await store.update(ann.id, room.id, input('Renamed', { description: '', styles: ['pop'], theme: 'jungle', rules: { maxTrackSec: null, repeatDelaySec: 3600, maxDjs: 50 } }))
      assert.ok(changed.ok, JSON.stringify(changed))
      if (!changed.ok) return
      assert.deepEqual(
        { name: changed.room.name, description: changed.room.description, styles: changed.room.styles, theme: changed.room.theme, rules: changed.room.rules },
        { name: 'Renamed', description: '', styles: ['pop'], theme: 'jungle', rules: { maxTrackSec: null, repeatDelaySec: 3600, maxDjs: 50 } },
      )
      assert.equal(changed.room.hostPseudo, ann.pseudo)
      assert.deepEqual(await store.get(room.id), changed.room)
      const ids = (await store.list()).map((entry) => entry.id)
      assert.deepEqual(ids.slice(ROOM_DEFS.length), [room.id, after.id])
    })

    test('lets a host keep their own name with another case, but not take the name of another room', async (store, ann, ben) => {
      const room = await made(store, ann, 'Late Night')
      await made(store, ben, 'Morning Show')
      const recased = await store.update(ann.id, room.id, input('LATE NIGHT'))
      assert.ok(recased.ok, JSON.stringify(recased))
      const taken = await store.update(ann.id, room.id, input('morning show'))
      assert.deepEqual(taken, { ok: false, error: 'name-taken' })
      assert.equal((await store.get(room.id))?.name, 'LATE NIGHT', 'and nothing changed')
    })

    test('lets only the host change or delete a room, and nobody the rooms of the team', async (store, ann, ben) => {
      const room = await made(store, ann, 'Hers')
      assert.deepEqual(await store.update(ben.id, room.id, input('His now')), { ok: false, error: 'not-host' })
      assert.deepEqual(await store.delete(ben.id, room.id), { ok: false, error: 'not-host' })
      assert.deepEqual(await store.get(room.id), room, 'untouched')

      for (const def of ROOM_DEFS) {
        assert.deepEqual(await store.update(ann.id, def.id, input('Mine now')), { ok: false, error: 'not-host' }, def.id)
        assert.deepEqual(await store.delete(ann.id, def.id), { ok: false, error: 'not-host' }, def.id)
      }
      assert.equal((await store.list()).length, ROOM_DEFS.length + 1)
    })

    test('says so when the room is not there', async (store, ann) => {
      assert.deepEqual(await store.update(ann.id, 'no-such-room', input('Anything')), { ok: false, error: 'room-not-found' })
      assert.deepEqual(await store.delete(ann.id, 'no-such-room'), { ok: false, error: 'room-not-found' })
    })

    test('deletes a room for good, and its name can be used again', async (store, ann, ben) => {
      const room = await made(store, ann, 'Short lived')
      assert.deepEqual(await store.delete(ann.id, room.id), { ok: true })
      assert.equal(await store.get(room.id), null)
      assert.deepEqual(await store.listByHost(ann.id), [])
      assert.deepEqual(await store.delete(ann.id, room.id), { ok: false, error: 'room-not-found' })
      await made(store, ben, 'Short lived')
    })

    test('hands out copies: changing what was returned changes nothing in the store', async (store, ann) => {
      const room = await made(store, ann, 'Untouchable')
      room.name = 'Hacked'
      room.styles.push('pop')
      room.rules.maxDjs = 5
      const again = await store.get(room.id)
      assert.equal(again?.name, 'Untouchable')
      assert.deepEqual(again?.styles, ['rock', 'jazz'])
      assert.equal(again?.rules.maxDjs, 10)
    })
  })
}
