// What every PlaylistStore must do, whatever it keeps its data in. MemoryPlaylistStore.test.ts runs it on the memory
// version, pg.test.ts on the real database: the two cannot drift apart without a test noticing.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it, type TestContext } from 'node:test'
import type { VideoInfo } from '../../../shared/protocol'
import type { PlaylistStore, StoredTrack } from './PlaylistStore'

export interface PlaylistStoreUnderTest {
  store: PlaylistStore
  /** Back to an empty store. */
  reset: () => Promise<void>
  /** A new account (the real database wants the member to exist), its id. */
  newAccount: () => Promise<string>
}

const AT = new Date('2026-10-24T20:00:00Z')
const LATER = new Date('2026-11-05T20:00:00Z')
const MAX = 3

const video = (name: string, durationSec = 200): VideoInfo => ({
  videoId: name.padEnd(11, '_').slice(0, 11),
  title: `Title ${name}`,
  artist: `Artist ${name}`,
  durationSec,
})
const ids = (tracks: StoredTrack[]) => tracks.map((track) => track.videoId)
const key = (name: string) => name.toLowerCase()

export function describePlaylistStoreContract(name: string, open: () => Promise<PlaylistStoreUnderTest | null>) {
  describe(name, () => {
    /** Runs a test on an empty store with two members, or skips it when there is no store (no database on this machine). */
    function test(title: string, body: (store: PlaylistStore, ann: string, ben: string) => Promise<void>) {
      it(title, async (t: TestContext) => {
        const under = await open()
        if (!under) return t.skip('pas de base de test : npm run db:setup')
        await under.reset()
        await body(under.store, await under.newAccount(), await under.newAccount())
      })
    }

    /** A playlist of the member with these videos in it. */
    async function filled(store: PlaylistStore, account: string, title: string, ...names: string[]) {
      const created = await store.create(account, title, key(title), 20)
      assert.ok(created.ok, JSON.stringify(created))
      if (!created.ok) throw new Error('not created')
      for (const videoName of names) {
        const added = await store.addTrack(account, created.playlist.id, video(videoName), AT, 200)
        assert.ok(added.ok, JSON.stringify(added))
      }
      return created.playlist.id
    }

    test('creates a playlist, empty, and lists it', async (store, ann) => {
      const created = await store.create(ann, 'Chill du soir', key('Chill du soir'), MAX)
      assert.ok(created.ok, JSON.stringify(created))
      if (!created.ok) return
      assert.match(created.playlist.id, /^[0-9a-f-]{36}$/)
      assert.deepEqual({ ...created.playlist, id: undefined }, { id: undefined, name: 'Chill du soir', trackCount: 0 })
      assert.deepEqual(await store.list(ann), [created.playlist])
    })

    test('does not show a playlist to anybody but its owner: not its tracks, not its name', async (store, ann, ben) => {
      const id = await filled(store, ann, 'Private', 'a1')
      assert.equal(await store.get(ben, id), null)
      assert.deepEqual(await store.list(ben), [])
      assert.ok(await store.get(ann, id))
    })

    test('lists the playlists of a member, oldest first, and nobody else’s', async (store, ann, ben) => {
      const first = await filled(store, ann, 'One')
      const second = await filled(store, ann, 'Two', 'a1', 'a2')
      await filled(store, ben, 'Ben’s')
      assert.deepEqual(
        (await store.list(ann)).map((playlist) => [playlist.id, playlist.name, playlist.trackCount]),
        [
          [first, 'One', 0],
          [second, 'Two', 2],
        ],
      )
      assert.deepEqual((await store.list(ben)).map((playlist) => playlist.name), ['Ben’s'])
    })

    test('refuses a name the member already uses, whatever the case, and creates nothing', async (store, ann, ben) => {
      await store.create(ann, 'Chill', key('Chill'), MAX)
      assert.deepEqual(await store.create(ann, 'CHILL', key('CHILL'), MAX), { ok: false, error: 'name-taken' })
      assert.equal((await store.list(ann)).length, 1)
      const other = await store.create(ben, 'Chill', key('Chill'), MAX)
      assert.ok(other.ok, 'another member may use the same name')
    })

    test('refuses a playlist beyond the limit, counted per member', async (store, ann, ben) => {
      for (const title of ['a', 'b', 'c']) assert.ok((await store.create(ann, title, key(title), MAX)).ok)
      assert.deepEqual(await store.create(ann, 'd', key('d'), MAX), { ok: false, error: 'playlists-full' })
      assert.ok((await store.create(ben, 'd', key('d'), MAX)).ok, 'Ben has none yet')
    })

    test('calls it taken, not full, when both are true', async (store, ann) => {
      for (const title of ['a', 'b', 'c']) await store.create(ann, title, key(title), MAX)
      assert.deepEqual(await store.create(ann, 'A', key('A'), MAX), { ok: false, error: 'name-taken' })
    })

    test('lets only the limit through when many are created at the same moment', async (store, ann) => {
      const results = await Promise.all(['a', 'b', 'c', 'd', 'e', 'f'].map((title) => store.create(ann, title, key(title), MAX)))
      assert.equal(results.filter((result) => result.ok).length, MAX)
      assert.equal((await store.list(ann)).length, MAX)
    })

    test('lets one of two playlists with the same name through when they are created at the same moment', async (store, ann) => {
      const results = await Promise.all([store.create(ann, 'Same', key('Same'), MAX), store.create(ann, 'SAME', key('SAME'), MAX)])
      assert.equal(results.filter((result) => result.ok).length, 1)
      assert.equal((await store.list(ann)).length, 1)
    })

    test('renames a playlist, also to the same name in another case', async (store, ann) => {
      const id = await filled(store, ann, 'Chill', 'a1')
      assert.deepEqual(await store.rename(ann, id, 'Soir', key('Soir')), { ok: true, playlist: { id, name: 'Soir', trackCount: 1 } })
      assert.deepEqual(await store.rename(ann, id, 'SOIR', key('SOIR')), { ok: true, playlist: { id, name: 'SOIR', trackCount: 1 } })
      assert.deepEqual((await store.list(ann)).map((playlist) => playlist.name), ['SOIR'])
    })

    test('refuses to rename to a name another playlist of the member has, and to rename somebody else’s', async (store, ann, ben) => {
      const first = await filled(store, ann, 'One')
      await filled(store, ann, 'Two')
      assert.deepEqual(await store.rename(ann, first, 'two', key('two')), { ok: false, error: 'name-taken' })
      assert.deepEqual(await store.rename(ben, first, 'Mine now', key('Mine now')), { ok: false, error: 'playlist-not-found' })
      assert.deepEqual(await store.rename(ann, randomUUID(), 'x', key('x')), { ok: false, error: 'playlist-not-found' })
      assert.deepEqual((await store.list(ann)).map((playlist) => playlist.name), ['One', 'Two'], 'nothing changed')
    })

    test('deletes a playlist with its tracks, and only for its owner', async (store, ann, ben) => {
      const id = await filled(store, ann, 'Chill', 'a1', 'a2')
      assert.equal(await store.delete(ben, id), false)
      assert.ok(await store.get(ann, id), 'still there')
      assert.equal(await store.delete(ann, id), true)
      assert.equal(await store.get(ann, id), null)
      assert.equal(await store.delete(ann, id), false)
      assert.deepEqual(await store.list(ann), [])
    })

    test('keeps what YouTube said when a track is added, at the end, from position 0', async (store, ann) => {
      const id = await filled(store, ann, 'Chill')
      const first = await store.addTrack(ann, id, video('a1', 187), AT, MAX)
      const second = await store.addTrack(ann, id, video('a2'), AT, MAX)
      assert.ok(first.ok && second.ok)
      if (!first.ok || !second.ok) return
      assert.match(first.track.id, /^[0-9a-f-]{36}$/)
      assert.deepEqual(
        { ...first.track, id: undefined, playlistId: undefined },
        {
          id: undefined,
          playlistId: undefined,
          position: 0,
          videoId: video('a1').videoId,
          title: 'Title a1',
          artist: 'Artist a1',
          durationSec: 187,
          unavailable: false,
          fetchedAt: AT,
          checkedAt: AT,
        },
      )
      assert.equal(second.track.position, 1)
      const read = await store.get(ann, id)
      assert.deepEqual(read?.tracks, [first.track, second.track])
      assert.equal(read?.playlist.trackCount, 2)
    })

    test('refuses a video the playlist already holds, and a track beyond the limit', async (store, ann) => {
      const id = await filled(store, ann, 'Chill', 'a1', 'a2', 'a3')
      assert.deepEqual(await store.addTrack(ann, id, video('a2'), AT, MAX), { ok: false, error: 'already-in-playlist' })
      assert.deepEqual(await store.addTrack(ann, id, video('a4'), AT, MAX), { ok: false, error: 'playlist-full' })
      assert.deepEqual(await store.addTrack(ann, id, video('a1'), AT, MAX), { ok: false, error: 'already-in-playlist' }, 'said first when both are true')
      assert.equal((await store.get(ann, id))?.tracks.length, 3)
    })

    test('lets the same video be in two playlists', async (store, ann) => {
      const first = await filled(store, ann, 'One', 'a1')
      const second = await filled(store, ann, 'Two', 'a1')
      assert.equal((await store.get(ann, first))?.tracks.length, 1)
      assert.equal((await store.get(ann, second))?.tracks.length, 1)
    })

    test('adds only to a playlist that is the member’s', async (store, ann, ben) => {
      const id = await filled(store, ann, 'Chill')
      assert.deepEqual(await store.addTrack(ben, id, video('a1'), AT, MAX), { ok: false, error: 'playlist-not-found' })
      assert.deepEqual(await store.addTrack(ann, randomUUID(), video('a1'), AT, MAX), { ok: false, error: 'playlist-not-found' })
      assert.equal((await store.get(ann, id))?.tracks.length, 0)
    })

    test('lets only one of the same video through when it is added at the same moment', async (store, ann) => {
      const id = await filled(store, ann, 'Chill')
      const results = await Promise.all([1, 2, 3, 4].map(() => store.addTrack(ann, id, video('a1'), AT, 10)))
      assert.equal(results.filter((result) => result.ok).length, 1)
      assert.deepEqual((await store.get(ann, id))?.tracks.map((track) => track.position), [0])
    })

    test('lets only the limit through when tracks are added at the same moment, with positions without a gap', async (store, ann) => {
      const id = await filled(store, ann, 'Chill')
      const results = await Promise.all(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'].map((name) => store.addTrack(ann, id, video(name), AT, MAX)))
      assert.equal(results.filter((result) => result.ok).length, MAX)
      const tracks = (await store.get(ann, id))?.tracks ?? []
      assert.deepEqual(tracks.map((track) => track.position), [0, 1, 2])
    })

    test('removes a track and closes up the others', async (store, ann) => {
      const id = await filled(store, ann, 'Chill', 'a1', 'a2', 'a3')
      const before = (await store.get(ann, id))?.tracks ?? []
      assert.equal(await store.removeTrack(ann, id, before[1].id), true)
      const after = (await store.get(ann, id))?.tracks ?? []
      assert.deepEqual(ids(after), [before[0].videoId, before[2].videoId])
      assert.deepEqual(after.map((track) => track.position), [0, 1])
      assert.equal(await store.removeTrack(ann, id, before[1].id), false, 'already gone')
    })

    test('removes only from the member’s own playlist, and only a track of that playlist', async (store, ann, ben) => {
      const mine = await filled(store, ann, 'Mine', 'a1')
      const other = await filled(store, ann, 'Other', 'b1')
      const track = (await store.get(ann, mine))?.tracks[0]
      const stranger = (await store.get(ann, other))?.tracks[0]
      assert.ok(track && stranger)
      if (!track || !stranger) return
      assert.equal(await store.removeTrack(ben, mine, track.id), false)
      assert.equal(await store.removeTrack(ann, mine, stranger.id), false, 'a track of another playlist is not in this one')
      assert.equal(await store.removeTrack(ann, randomUUID(), track.id), false)
      assert.equal((await store.get(ann, mine))?.tracks.length, 1)
      assert.equal((await store.get(ann, other))?.tracks.length, 1)
    })

    test('moves a track forward and back, the others shifting', async (store, ann) => {
      const id = await filled(store, ann, 'Chill', 'a1', 'a2', 'a3', 'a4')
      const tracks = (await store.get(ann, id))?.tracks ?? []
      const names = (list: StoredTrack[] | null) => list?.map((track) => track.title.slice(-2))

      assert.deepEqual(names(await store.moveTrack(ann, id, tracks[0].id, 2)), ['a2', 'a3', 'a1', 'a4'])
      assert.deepEqual(names(await store.moveTrack(ann, id, tracks[3].id, 0)), ['a4', 'a2', 'a3', 'a1'])
      assert.deepEqual(names(await store.moveTrack(ann, id, tracks[3].id, 3)), ['a2', 'a3', 'a1', 'a4'], 'to the end')
      assert.deepEqual((await store.get(ann, id))?.tracks.map((track) => track.position), [0, 1, 2, 3])
    })

    test('keeps a move within the playlist', async (store, ann) => {
      const id = await filled(store, ann, 'Chill', 'a1', 'a2', 'a3')
      const tracks = (await store.get(ann, id))?.tracks ?? []
      const moved = await store.moveTrack(ann, id, tracks[0].id, 99)
      assert.deepEqual(moved?.map((track) => track.title.slice(-2)), ['a2', 'a3', 'a1'])
      assert.deepEqual(moved?.map((track) => track.position), [0, 1, 2])
    })

    test('moves only the member’s own tracks', async (store, ann, ben) => {
      const id = await filled(store, ann, 'Chill', 'a1', 'a2')
      const tracks = (await store.get(ann, id))?.tracks ?? []
      assert.equal(await store.moveTrack(ben, id, tracks[0].id, 1), null)
      assert.equal(await store.moveTrack(ann, id, randomUUID(), 1), null)
      assert.equal(await store.moveTrack(ann, randomUUID(), tracks[0].id, 1), null)
      assert.deepEqual(ids((await store.get(ann, id))?.tracks ?? []), [video('a1').videoId, video('a2').videoId])
    })

    test('keeps the positions without a gap through a run of changes', async (store, ann) => {
      const id = await filled(store, ann, 'Chill', 'a1', 'a2', 'a3', 'a4', 'a5')
      let tracks = (await store.get(ann, id))?.tracks ?? []
      await store.removeTrack(ann, id, tracks[2].id)
      await store.moveTrack(ann, id, tracks[4].id, 0)
      await store.addTrack(ann, id, video('b1'), AT, 20)
      tracks = (await store.get(ann, id))?.tracks ?? []
      assert.deepEqual(tracks.map((track) => track.position), [0, 1, 2, 3, 4])
      assert.deepEqual(tracks.map((track) => track.title.slice(-2)), ['a5', 'a1', 'a2', 'a4', 'b1'])
    })

    test('finds a track of any of the member’s playlists, and nobody else’s', async (store, ann, ben) => {
      const id = await filled(store, ann, 'Chill', 'a1')
      const track = (await store.get(ann, id))?.tracks[0]
      assert.ok(track)
      if (!track) return
      assert.deepEqual(await store.findTrack(ann, track.id), track)
      assert.equal(await store.findTrack(ben, track.id), null)
      assert.equal(await store.findTrack(ann, randomUUID()), null)
    })

    test('applies a refresh to the video in every playlist of everybody, and flags what cannot be read', async (store, ann, ben) => {
      const mine = await filled(store, ann, 'Mine', 'a1', 'a2')
      const his = await filled(store, ben, 'His', 'a1')
      await store.applyRefresh([
        { videoId: video('a1').videoId, video: { ...video('a1'), title: 'New title', durationSec: 123 }, at: LATER },
        { videoId: video('a2').videoId, video: null, at: LATER },
      ])
      const [a1, a2] = (await store.get(ann, mine))?.tracks ?? []
      const theirs = (await store.get(ben, his))?.tracks[0]
      assert.deepEqual([a1.title, a1.durationSec, a1.unavailable, a1.fetchedAt, a1.checkedAt], ['New title', 123, false, LATER, LATER])
      assert.deepEqual([theirs?.title, theirs?.durationSec], ['New title', 123])
      // What could not be read keeps what was read before, and says only that it was looked at.
      assert.deepEqual([a2.title, a2.durationSec, a2.unavailable, a2.fetchedAt, a2.checkedAt], ['Title a2', 200, true, AT, LATER])
    })

    test('clears the flag when a video that could not be read can be again', async (store, ann) => {
      const id = await filled(store, ann, 'Chill', 'a1')
      await store.applyRefresh([{ videoId: video('a1').videoId, video: null, at: LATER }])
      assert.equal((await store.get(ann, id))?.tracks[0].unavailable, true)
      await store.applyRefresh([{ videoId: video('a1').videoId, video: video('a1'), at: LATER }])
      const track = (await store.get(ann, id))?.tracks[0]
      assert.deepEqual([track?.unavailable, track?.fetchedAt], [false, LATER])
    })

    test('drops every playlist and track of a member, and only theirs', async (store, ann, ben) => {
      const annOne = await filled(store, ann, 'Chill', 'a1', 'a2')
      const annTwo = await filled(store, ann, 'Jazz', 'a1')
      const benOne = await filled(store, ben, 'Chill', 'a1', 'b1')
      await store.deleteAll(ann)
      assert.deepEqual(await store.list(ann), [])
      assert.equal(await store.get(ann, annOne), null)
      assert.equal(await store.get(ann, annTwo), null)
      assert.deepEqual(ids((await store.get(ben, benOne))?.tracks ?? []), [video('a1').videoId, video('b1').videoId], 'another member keeps theirs')
      await store.deleteAll(ann) // again: nothing to do, no error
    })

    test('does not touch other videos when it refreshes one', async (store, ann) => {
      const id = await filled(store, ann, 'Chill', 'a1', 'a2')
      await store.applyRefresh([{ videoId: video('a1').videoId, video: { ...video('a1'), title: 'Changed' }, at: LATER }])
      const [a1, a2] = (await store.get(ann, id))?.tracks ?? []
      assert.deepEqual([a1.title, a2.title, a2.fetchedAt], ['Changed', 'Title a2', AT])
    })
  })
}
