import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import type { QueuedTrack } from '../../shared/protocol'
import { DjBooth, MAX_MISSES, type DjEntry, type DropReason, type TurnContext } from './DjBooth'

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
    dj('Ann')
    assert.equal(booth.nextTurn(context).play, null)
    assert.equal(booth.current, null)
  })

  it('skips a DJ who is away and sends them to the back', () => {
    const ann = dj('Ann', ['a1'], false)
    dj('Ben', ['b1'])
    const turn = booth.nextTurn(context)
    assert.equal(played(turn), 'b1')
    assert.deepEqual(turn.events, [{ kind: 'skipped', accountId: ann.accountId }])
    assert.equal(ann.misses, 1)
    assert.deepEqual(names(booth.waiting), ['Ann'])
    assert.deepEqual(ann.lineup.map((queued) => queued.title), ['a1'], 'what they lined up is kept for when they are back')
  })

  it('skips a DJ who is here but has nothing to play', () => {
    const ann = dj('Ann')
    dj('Ben', ['b1'])
    const turn = booth.nextTurn(context)
    assert.equal(played(turn), 'b1')
    assert.deepEqual(turn.events, [{ kind: 'skipped', accountId: ann.accountId }])
    assert.equal(ann.misses, 1)
  })

  it('does not count a miss against the DJ who has just played: their turn has not come round yet', () => {
    const ann = dj('Ann', ['a1'])
    booth.nextTurn(context) // Ann plays her only track
    const turn = booth.nextTurn(context) // it is over; nothing else to play
    assert.equal(turn.play, null)
    assert.deepEqual(turn.events, [], 'no miss and no notice')
    assert.equal(ann.misses, 0)
    assert.deepEqual(names(booth.waiting), ['Ann'], 'and she keeps her place')
  })

  it('judges that DJ from their next turn on: skipped once, then out', () => {
    const ann = dj('Ann', ['a1'])
    booth.nextTurn(context)
    booth.nextTurn(context)
    assert.deepEqual(booth.nextTurn(context).events, [{ kind: 'skipped', accountId: ann.accountId }])
    assert.deepEqual(booth.nextTurn(context).events, [{ kind: 'removed', accountId: ann.accountId }])
    assert.equal(booth.size, 0)
  })

  it('does not count a miss against the DJ who has just played if they left the room meanwhile either', () => {
    const ann = dj('Ann', ['a1'])
    booth.nextTurn(context)
    present.delete(ann.accountId)
    const turn = booth.nextTurn(context)
    assert.deepEqual(turn.events, [])
    assert.equal(ann.misses, 0)
  })

  it('still plays the DJ who has just played again when they have another track', () => {
    dj('Ann', ['a1', 'a2'])
    booth.nextTurn(context)
    assert.equal(played(booth.nextTurn(context)), 'a2')
  })

  it('takes a DJ out after their turn was skipped twice in a row', () => {
    assert.equal(MAX_MISSES, 2)
    const ann = dj('Ann')
    dj('Ben', ['b1', 'b2'])
    booth.nextTurn(context) // Ann: 1st miss, Ben plays b1
    const turn = booth.nextTurn(context) // Ann: 2nd miss, Ben plays b2
    assert.equal(played(turn), 'b2')
    assert.deepEqual(turn.events, [{ kind: 'removed', accountId: ann.accountId }])
    assert.equal(booth.find(ann.accountId), undefined)
    assert.equal(booth.size, 1)
  })

  it('counts only turns in a row: playing in between starts the count again', () => {
    const ann = dj('Ann', [], false)
    dj('Ben', ['b1', 'b2', 'b3'])
    booth.nextTurn(context) // Ann misses (1st), Ben plays b1
    assert.equal(ann.misses, 1)

    present.add(ann.accountId)
    ann.lineup.push(track('a1'))
    assert.equal(played(booth.nextTurn(context)), 'a1', 'Ann is first in line when Ben’s track ends')
    assert.equal(ann.misses, 0, 'playing starts the count again')

    assert.equal(played(booth.nextTurn(context)), 'b2')
    present.delete(ann.accountId)
    const turn = booth.nextTurn(context) // Ann is first in line again, and away: her 1st miss, not her 2nd
    assert.equal(played(turn), 'b3')
    assert.equal(ann.misses, 1)
    assert.ok(booth.find(ann.accountId), 'still in the queue')
  })

  it('walks the queue once, giving every DJ who could not play exactly one miss, order unchanged', () => {
    const ann = dj('Ann')
    const ben = dj('Ben', [], false)
    const cat = dj('Cat')
    const turn = booth.nextTurn(context)
    assert.equal(turn.play, null)
    assert.deepEqual(names(booth.waiting), ['Ann', 'Ben', 'Cat'])
    assert.deepEqual([ann.misses, ben.misses, cat.misses], [1, 1, 1])
    assert.deepEqual(
      turn.events.map((event) => event.kind),
      ['skipped', 'skipped', 'skipped'],
    )
  })

  it('puts the skipped DJs behind the ones who did not have to wait', () => {
    dj('Ann', ['a1'], false)
    dj('Ben', ['b1'])
    dj('Cat', ['c1'])
    booth.nextTurn(context) // Ann skipped, Ben plays
    assert.deepEqual(names(booth.waiting), ['Cat', 'Ann'])
    booth.nextTurn(context) // Ben goes to the back: Cat, Ann, Ben
    assert.deepEqual(names(booth.waiting), ['Ann', 'Ben'])
    assert.equal(booth.current?.pseudo, 'Cat')
  })

  it('drops a track that no longer fits the rules, tells the DJ, and plays their next one', () => {
    const ann = dj('Ann', ['too long', 'fine'])
    refused.set(ann.lineup[0].videoId, 'too-long')
    const turn = booth.nextTurn(context)
    assert.equal(played(turn), 'fine')
    assert.deepEqual(turn.events, [{ kind: 'dropped', accountId: ann.accountId, title: 'too long', reason: 'too-long' }])
    assert.equal(ann.misses, 0)
  })

  it('skips a DJ whose every track was dropped, and says why and that they were skipped', () => {
    const ann = dj('Ann', ['one', 'two'])
    for (const queued of ann.lineup) refused.set(queued.videoId, 'recently-played')
    dj('Ben', ['b1'])
    const turn = booth.nextTurn(context)
    assert.equal(played(turn), 'b1')
    assert.deepEqual(
      turn.events.map((event) => event.kind),
      ['dropped', 'dropped', 'skipped'],
    )
    assert.deepEqual(ann.lineup, [])
    assert.equal(ann.misses, 1)
  })

  it('does not look at the tracks of a DJ who is away', () => {
    const ann = dj('Ann', ['a1'], false)
    refused.set(ann.lineup[0].videoId, 'too-long')
    const turn = booth.nextTurn(context)
    assert.deepEqual(turn.events, [{ kind: 'skipped', accountId: ann.accountId }])
    assert.equal(ann.lineup.length, 1)
  })
})

describe('the room’s own selection playing, and a DJ arriving', () => {
  it('gives the decks to the first DJ in line who is here and can play, passing nobody’s turn', () => {
    const ann = dj('Ann') // here, nothing to play
    const ben = dj('Ben', ['b1'], false) // away
    const cat = dj('Cat', ['c1', 'c2'])
    const dan = dj('Dan', ['d1'])
    const turn = booth.takeOver(context)
    assert.equal(played(turn), 'c1')
    assert.equal(booth.current, cat)
    assert.deepEqual(names(booth.waiting), ['Ann', 'Ben', 'Dan'], 'the others keep their order')
    assert.deepEqual([ann.misses, ben.misses, dan.misses, cat.misses], [0, 0, 0, 0], 'and nobody is penalised')
    assert.deepEqual(turn.events, [])
  })

  it('changes nothing when nobody can take over', () => {
    const ann = dj('Ann')
    dj('Ben', ['b1'], false)
    const turn = booth.takeOver(context)
    assert.deepEqual(turn, { play: null, events: [] })
    assert.deepEqual(names(booth.waiting), ['Ann', 'Ben'])
    assert.equal(ann.misses, 0)
  })

  it('drops a track that does not fit, and passes to the next DJ without a miss when that was the last one', () => {
    const ann = dj('Ann', ['a1'])
    refused.set(ann.lineup[0].videoId, 'recently-played')
    const ben = dj('Ben', ['b1'])
    const turn = booth.takeOver(context)
    assert.equal(played(turn), 'b1')
    assert.deepEqual(turn.events, [{ kind: 'dropped', accountId: ann.accountId, title: 'a1', reason: 'recently-played' }])
    assert.equal(ann.misses, 0)
    assert.equal(booth.current, ben)
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
  it('sends the DJ on the decks to the back, as if their track had ended', () => {
    dj('Ann', ['a1'])
    dj('Ben', ['b1'])
    booth.nextTurn(context)
    booth.endCurrent()
    assert.equal(booth.current, null)
    assert.deepEqual(names(booth.waiting), ['Ben', 'Ann'])
    booth.endCurrent() // nobody on the decks: nothing happens
    assert.deepEqual(names(booth.waiting), ['Ben', 'Ann'])
  })
})
