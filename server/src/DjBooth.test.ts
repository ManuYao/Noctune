import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import type { QueuedTrack } from '../../shared/protocol'
import { DjBooth, projectUpcoming, type DjEntry, type DropReason, type TurnContext } from './DjBooth'

let counter = 0
function track(title: string, videoId = `vid${String(++counter).padStart(8, '0')}`): QueuedTrack {
  return { id: `id-${videoId}`, videoId, title, artist: 'Artist', durationSec: 200 }
}

/** The room as the booth sees it: who is here, and which videos no longer fit its rules. */
let present: Set<string>
let refused: Map<string, DropReason>
const context: TurnContext = {
  isPresent: (accountId) => present.has(accountId),
  refusal: (queued) => refused.get(queued.videoId) ?? null,
}

let booth: DjBooth

/** Puts a DJ in the queue with the given tracks, here in the room unless said otherwise. */
function dj(name: string, titles: string[] = [], here = true): DjEntry {
  const entry = booth.join({ accountId: `acc-${name}`, pseudo: name, avatarId: 'pulse' })
  entry.lineup.push(...titles.map((title) => track(title)))
  if (here) present.add(entry.accountId)
  return entry
}

const names = (entries: DjEntry[]) => entries.map((entry) => entry.pseudo)
const played = (turn: { play: { track: QueuedTrack } | null }) => turn.play?.track.title

beforeEach(() => {
  counter = 0
  booth = new DjBooth()
  present = new Set()
  refused = new Map()
})

describe('the places in the queue', () => {
  it('puts newcomers at the end, one place per account', () => {
    const ann = dj('Ann')
    const ben = dj('Ben')
    assert.deepEqual(names(booth.waiting), ['Ann', 'Ben'])
    assert.equal(booth.join({ accountId: ann.accountId, pseudo: 'Other', avatarId: 'mango' }), ann, 'asking again gives the place held')
    assert.equal(booth.size, 2)
    assert.equal(booth.find(ben.accountId), ben)
    assert.equal(booth.find('nobody'), undefined)
  })

  it('gives every place its own public id', () => {
    const ids = [dj('Ann'), dj('Ben'), dj('Cat')].map((entry) => entry.id)
    assert.equal(new Set(ids).size, 3)
  })

  it('counts the DJ on the decks, finds them, and knows which videos are lined up', () => {
    dj('Ann', ['a1'])
    dj('Ben', ['b1'])
    booth.nextTurn(context) // Ann takes the decks
    assert.equal(booth.size, 2)
    assert.equal(booth.find('acc-Ann'), booth.current)
    const lined = booth.waiting[0].lineup[0]
    assert.equal(booth.hasVideo(lined.videoId), true)
    assert.equal(booth.hasVideo('nothing'), false)
  })

  it('sees the videos still lined up by the DJ on the decks too', () => {
    const ann = dj('Ann', ['a1', 'a2'])
    booth.nextTurn(context)
    assert.equal(booth.current, ann)
    assert.equal(booth.hasVideo(ann.lineup[0].videoId), true, 'a2 is still waiting in the line-up of the DJ on the decks')
  })

  it('takes a place out wherever it is', () => {
    const ann = dj('Ann', ['a1'])
    const ben = dj('Ben', ['b1'])
    booth.nextTurn(context)
    booth.remove(ann)
    assert.equal(booth.current, null)
    booth.remove(ben)
    assert.equal(booth.size, 0)
  })
})

describe('a turn', () => {
  it('goes to the first DJ in line who has something to play, and uses up that track', () => {
    const ann = dj('Ann', ['a1', 'a2'])
    dj('Ben', ['b1'])
    const turn = booth.nextTurn(context)
    assert.equal(played(turn), 'a1')
    assert.equal(turn.play?.entry, ann)
    assert.equal(booth.current, ann)
    assert.deepEqual(names(booth.waiting), ['Ben'])
    assert.deepEqual(ann.lineup.map((queued) => queued.title), ['a2'])
    assert.deepEqual(turn.events, [])
  })

  it('sends the DJ who was on the decks to the back, so the others get their turn', () => {
    dj('Ann', ['a1', 'a2'])
    dj('Ben', ['b1'])
    dj('Cat', ['c1'])
    assert.equal(played(booth.nextTurn(context)), 'a1')
    assert.equal(played(booth.nextTurn(context)), 'b1')
    assert.equal(played(booth.nextTurn(context)), 'c1')
    assert.equal(played(booth.nextTurn(context)), 'a2', 'and round again')
  })

  it('lets a DJ who is alone play again', () => {
    dj('Ann', ['a1', 'a2'])
    assert.equal(played(booth.nextTurn(context)), 'a1')
    assert.equal(played(booth.nextTurn(context)), 'a2')
  })

  it('leaves nobody on the decks when nobody can play', () => {
    assert.deepEqual(booth.nextTurn(context), { play: null, events: [] })
    dj('Ann') // here, nothing lined up: not a DJ
    assert.equal(booth.nextTurn(context).play, null)
    assert.equal(booth.current, null)
    assert.equal(booth.size, 0, 'and nobody is left in the queue')
  })

  it('lets the DJ whose last track has just played go: they are out of the queue, without a word', () => {
    dj('Ann', ['a1'])
    booth.nextTurn(context) // Ann plays her only track
    const turn = booth.nextTurn(context) // it is over; nothing else to play
    assert.equal(turn.play, null)
    assert.deepEqual(turn.events, [], 'no notice: she simply is not a DJ any more')
    assert.equal(booth.size, 0)
    assert.deepEqual(names(booth.waiting), [])
  })

  it('gives the decks to the next DJ when the last track of the one on the decks has played', () => {
    dj('Ann', ['a1'])
    dj('Ben', ['b1'])
    booth.nextTurn(context)
    assert.equal(played(booth.nextTurn(context)), 'b1')
    assert.deepEqual(names(booth.waiting), [], 'Ann is out, Ben is on the decks')
  })

  it('passes over a DJ who is away: they keep their place and their tracks, the others play, and nothing is said', () => {
    const ann = dj('Ann', ['a1'], false)
    dj('Ben', ['b1'])
    const turn = booth.nextTurn(context)
    assert.equal(played(turn), 'b1')
    assert.deepEqual(turn.events, [])
    assert.deepEqual(names(booth.waiting), ['Ann'])
    assert.deepEqual(ann.lineup.map((queued) => queued.title), ['a1'], 'what they lined up is kept for when they are back')
  })

  it('never takes an away DJ out, however many turns pass: that is the room’s countdown, not the booth’s', () => {
    const ann = dj('Ann', ['a1'], false)
    dj('Ben', ['b1', 'b2', 'b3'])
    for (let turn = 0; turn < 3; turn += 1) {
      const result = booth.nextTurn(context)
      assert.equal(played(result), `b${turn + 1}`)
      assert.deepEqual(result.events, [])
    }
    assert.equal(booth.find(ann.accountId), ann)
  })

  it('lets a DJ who comes back in time play at their turn, first in line', () => {
    const ann = dj('Ann', ['a1'], false)
    dj('Ben', ['b1', 'b2'])
    assert.equal(played(booth.nextTurn(context)), 'b1')
    present.add(ann.accountId)
    assert.equal(played(booth.nextTurn(context)), 'a1', 'Ann was passed over and kept her place at the front')
    assert.equal(played(booth.nextTurn(context)), 'b2')
  })

  it('keeps the place of the DJ who has just played and left the room with tracks to come', () => {
    const ann = dj('Ann', ['a1', 'a2'])
    booth.nextTurn(context)
    present.delete(ann.accountId)
    const turn = booth.nextTurn(context)
    assert.equal(turn.play, null, 'she is away: nobody plays')
    assert.deepEqual(turn.events, [])
    assert.deepEqual(names(booth.waiting), ['Ann'])
    assert.deepEqual(ann.lineup.map((queued) => queued.title), ['a2'])
  })

  it('still plays the DJ who has just played again when they have another track', () => {
    dj('Ann', ['a1', 'a2'])
    booth.nextTurn(context)
    assert.equal(played(booth.nextTurn(context)), 'a2')
  })

  it('takes out a DJ who is here but has nothing to play, and says so', () => {
    const ann = dj('Ann')
    dj('Ben', ['b1'])
    const turn = booth.nextTurn(context)
    assert.equal(played(turn), 'b1')
    assert.deepEqual(turn.events, [{ kind: 'removed', accountId: ann.accountId }])
    assert.equal(booth.find(ann.accountId), undefined)
  })

  it('walks the queue once: passes over the DJs who are away, takes out the ones here with nothing left, order unchanged', () => {
    const ann = dj('Ann')
    const ben = dj('Ben', ['b1'], false)
    const cat = dj('Cat')
    const turn = booth.nextTurn(context)
    assert.equal(turn.play, null)
    assert.deepEqual(names(booth.waiting), ['Ben'])
    assert.deepEqual(turn.events, [
      { kind: 'removed', accountId: ann.accountId },
      { kind: 'removed', accountId: cat.accountId },
    ])
    assert.deepEqual(ben.lineup.map((queued) => queued.title), ['b1'])
  })

  it('keeps an away DJ where they stand: the others play before them, in their own order', () => {
    dj('Ann', ['a1'], false)
    dj('Ben', ['b1'])
    dj('Cat', ['c1'])
    booth.nextTurn(context) // Ann is passed over, Ben plays
    assert.deepEqual(names(booth.waiting), ['Ann', 'Cat'])
    booth.nextTurn(context) // Ben has no more: out. Ann passed over, Cat plays
    assert.deepEqual(names(booth.waiting), ['Ann'])
    assert.equal(booth.current?.pseudo, 'Cat')
  })

  it('drops a track that no longer fits the rules, tells the DJ, and plays their next one', () => {
    const ann = dj('Ann', ['too long', 'fine'])
    refused.set(ann.lineup[0].videoId, 'too-long')
    const turn = booth.nextTurn(context)
    assert.equal(played(turn), 'fine')
    assert.deepEqual(turn.events, [{ kind: 'dropped', accountId: ann.accountId, title: 'too long', reason: 'too-long' }])
  })

  it('takes out a DJ whose every track was dropped, and says why and that they are out', () => {
    const ann = dj('Ann', ['one', 'two'])
    for (const queued of ann.lineup) refused.set(queued.videoId, 'recently-played')
    dj('Ben', ['b1'])
    const turn = booth.nextTurn(context)
    assert.equal(played(turn), 'b1')
    assert.deepEqual(
      turn.events.map((event) => event.kind),
      ['dropped', 'dropped', 'removed'],
    )
    assert.deepEqual(ann.lineup, [])
    assert.equal(booth.find(ann.accountId), undefined)
  })

  it('does not look at the tracks of a DJ who is away', () => {
    const ann = dj('Ann', ['a1'], false)
    refused.set(ann.lineup[0].videoId, 'too-long')
    const turn = booth.nextTurn(context)
    assert.deepEqual(turn.events, [])
    assert.equal(ann.lineup.length, 1)
    assert.equal(booth.find(ann.accountId), ann)
  })
})

describe('the room’s own selection playing, and a DJ arriving', () => {
  it('gives the decks to the first DJ in line who is here and can play, passing nobody’s turn', () => {
    const ben = dj('Ben', ['b1'], false) // away
    const cat = dj('Cat', ['c1', 'c2'])
    const dan = dj('Dan', ['d1'])
    const turn = booth.takeOver(context)
    assert.equal(played(turn), 'c1')
    assert.equal(booth.current, cat)
    assert.deepEqual(names(booth.waiting), ['Ben', 'Dan'], 'the others keep their order')
    assert.deepEqual(turn.events, [])
    assert.equal(ben.lineup.length, 1)
    assert.equal(dan.lineup.length, 1)
  })

  it('changes nothing when nobody can take over', () => {
    dj('Ben', ['b1'], false)
    const turn = booth.takeOver(context)
    assert.deepEqual(turn, { play: null, events: [] })
    assert.deepEqual(names(booth.waiting), ['Ben'])
  })

  it('drops a track that does not fit, takes out the DJ who had no other, and passes to the next DJ', () => {
    const ann = dj('Ann', ['a1'])
    refused.set(ann.lineup[0].videoId, 'recently-played')
    const ben = dj('Ben', ['b1'])
    const turn = booth.takeOver(context)
    assert.equal(played(turn), 'b1')
    assert.deepEqual(turn.events, [
      { kind: 'dropped', accountId: ann.accountId, title: 'a1', reason: 'recently-played' },
      { kind: 'removed', accountId: ann.accountId },
    ])
    assert.equal(booth.current, ben)
    assert.deepEqual(names(booth.waiting), [])
  })

  it('does nothing while a DJ is already on the decks', () => {
    dj('Ann', ['a1', 'a2'])
    dj('Ben', ['b1'])
    booth.nextTurn(context)
    assert.deepEqual(booth.takeOver(context), { play: null, events: [] })
    assert.equal(booth.current?.pseudo, 'Ann')
  })
})

describe('the decks when the room empties', () => {
  it('sends the DJ on the decks to the back when they have tracks left, as if their track had ended', () => {
    dj('Ann', ['a1', 'a2'])
    dj('Ben', ['b1'])
    booth.nextTurn(context)
    booth.endCurrent()
    assert.equal(booth.current, null)
    assert.deepEqual(names(booth.waiting), ['Ben', 'Ann'])
    booth.endCurrent() // nobody on the decks: nothing happens
    assert.deepEqual(names(booth.waiting), ['Ben', 'Ann'])
  })

  it('lets the DJ on the decks go when theirs was the last track', () => {
    dj('Ann', ['a1'])
    dj('Ben', ['b1'])
    booth.nextTurn(context)
    booth.endCurrent()
    assert.equal(booth.current, null)
    assert.deepEqual(names(booth.waiting), ['Ben'])
  })
})

describe('the projected order of play', () => {
  const titles = (steps: { track: QueuedTrack }[]) => steps.map((step) => step.track.title)
  const project = (max = 20) => projectUpcoming(booth.current, booth.waiting, (id) => present.has(id), max)

  it('is empty with an empty queue, or with nobody having a track', () => {
    assert.deepEqual(project(), [])
    dj('Ann')
    assert.deepEqual(project(), [])
  })

  it('lists one DJ’s tracks in order, the one on the decks excluded', () => {
    dj('Ann', ['a1', 'a2', 'a3'])
    booth.nextTurn(context)
    const steps = project()
    assert.deepEqual(titles(steps), ['a2', 'a3'])
    assert.deepEqual(steps.map((step) => step.position), [1, 2])
  })

  it('interleaves three DJs and skips the one with no track', () => {
    dj('Ann', ['a1', 'a2', 'a3'])
    dj('Ben', ['b1'])
    dj('Cat', [])
    dj('Dan', ['d1', 'd2'])
    assert.deepEqual(titles(project()), ['a1', 'b1', 'd1', 'a2', 'd2', 'a3'])
    booth.nextTurn(context) // Ann plays a1
    assert.deepEqual(titles(project()), ['b1', 'd1', 'a2', 'd2', 'a3'])
  })

  it('matches what the rotation really plays', () => {
    dj('Ann', ['a1', 'a2'])
    dj('Ben', ['b1', 'b2', 'b3'])
    dj('Cat', ['c1'])
    const expected = titles(project())
    const real: (string | undefined)[] = []
    for (let i = 0; i < expected.length; i += 1) real.push(played(booth.nextTurn(context)))
    assert.deepEqual(real, expected)
  })

  it('caps the list, and leaves the DJs who are away out: they will not play', () => {
    dj('Ann', ['a1', 'a2', 'a3', 'a4'])
    dj('Ben', ['b1', 'b2'], false)
    const steps = project(3)
    assert.deepEqual(titles(steps), ['a1', 'a2', 'a3'])
    assert.deepEqual(steps.map((step) => step.position), [1, 2, 3])
  })

  it('leaves out the DJ on the decks too when they are away: they do not come back at the end', () => {
    const ann = dj('Ann', ['a1', 'a2'])
    dj('Ben', ['b1'])
    booth.nextTurn(context) // Ann plays a1, a2 is left
    present.delete(ann.accountId)
    assert.deepEqual(titles(project()), ['b1'])
  })

  it('matches what the rotation really plays with a DJ away: the same order without them', () => {
    dj('Ann', ['a1', 'a2'])
    dj('Ben', ['b1', 'b2'], false)
    dj('Cat', ['c1'])
    const expected = titles(project())
    assert.deepEqual(expected, ['a1', 'c1', 'a2'])
    const real: (string | undefined)[] = []
    for (let i = 0; i < expected.length; i += 1) real.push(played(booth.nextTurn(context)))
    assert.deepEqual(real, expected)
  })
})
