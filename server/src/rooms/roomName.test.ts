import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ROOM_DESCRIPTION_MAX, ROOM_NAME_MAX } from '../../../shared/protocol'
import { normalizePlaylistName, normalizeRoomDescription, normalizeRoomName, roomNameKey } from '../../../shared/validation'

// Built from code points: typed as escapes in a file, some tools turn them into the invisible characters themselves.
const chars = (...codePoints: number[]) => String.fromCodePoint(...codePoints)
const ZWJ = chars(0x200d)
const VS16 = chars(0xfe0f)
const HEART = chars(0x2764, 0xfe0f)
const SINGER = chars(0x1f468, 0x200d, 0x1f3a4)
const RAINBOW_FLAG = chars(0x1f3f3, 0xfe0f, 0x200d, 0x1f308)
const KEYCAP_ONE = chars(0x31, 0xfe0f, 0x20e3)
const CYRILLIC_O = chars(0x043e)

describe('a room name', () => {
  it('accepts ordinary names, accents and real emoji', () => {
    for (const name of ['Lo-fi du soir', 'Jazz café', 'Rock progressif', `Soir ${HEART}`, `${SINGER} Rock`, `${RAINBOW_FLAG} Pride`, `${KEYCAP_ONE} Top`, 'Рок-клуб']) {
      assert.equal(normalizeRoomName(name), name, name)
    }
  })

  it('refuses joiners and selectors that hold no emoji together: invisible padding and look-alikes', () => {
    const copies = [
      `Lo-fi du soir${ZWJ}`,
      `Jazz café${VS16}`,
      `Rock${ZWJ} Fans`,
      `${ZWJ}Rock Fans`,
      `Rock Fans${ZWJ.repeat(20)}`,
      `Rock Fans${HEART}${ZWJ}`,
      `a${VS16}bc`,
    ]
    for (const name of copies) assert.equal(normalizeRoomName(name), null, JSON.stringify(name))
  })

  it('refuses a name that mixes alphabets that look alike, and still takes one in a single alphabet', () => {
    assert.equal(normalizeRoomName(`Lo-fi du s${CYRILLIC_O}ir`), null)
    assert.equal(normalizeRoomName(`Rock ${chars(0x03bf)}ld`), null, 'a Greek omicron')
    assert.equal(normalizeRoomName('Рок и ролл'), 'Рок и ролл')
  })

  it('gives the same key to names that only differ by case, accents or joiners', () => {
    const key = roomNameKey('Jazz café')
    assert.equal(roomNameKey('Jazz cafe'), key)
    assert.equal(roomNameKey('JAZZ CAFÉ'), key)
    assert.equal(roomNameKey(`Jazz café${ZWJ}`), key, 'even if a joiner got that far')
    assert.notEqual(roomNameKey('Jazz café 2'), key)
  })

  it('refuses names that pass for the team: the whole name, or a reserved word anywhere in it', () => {
    for (const name of ['Admin', 'A d m i n', 'Noctune', 'System', 'Noctune Officiel', 'Support Noctune', 'Équipe Noctune', 'N0ctune', 'Jazz @dmin', 'Admin Jazz', 'La salle du modo', 'NOCTUNE']) {
      assert.equal(normalizeRoomName(name), null, name)
    }
  })

  it('does not refuse real music names that only contain a word that is a staff word for a pseudo', () => {
    for (const name of ['System of a Down fans', 'Support your local scene', 'Roots reggae', 'Staff picks']) {
      assert.equal(normalizeRoomName(name), name, name)
    }
  })

  it('keeps the length rules, counted in characters', () => {
    assert.equal(normalizeRoomName('ab'), null)
    assert.equal(normalizeRoomName('abc'), 'abc')
    assert.equal(normalizeRoomName('a'.repeat(ROOM_NAME_MAX)), 'a'.repeat(ROOM_NAME_MAX))
    assert.equal(normalizeRoomName('a'.repeat(ROOM_NAME_MAX + 1)), null)
    assert.equal(normalizeRoomName(5), null)
  })
})

describe('the other texts that took the joiners', () => {
  it('refuses the stray ones in a playlist name and a description too', () => {
    assert.equal(normalizePlaylistName(`Chill${ZWJ}`), null)
    assert.equal(normalizePlaylistName(`Soir ${HEART}`), `Soir ${HEART}`)
    assert.equal(normalizeRoomDescription(`Des guitares${ZWJ.repeat(100)}`), null)
    assert.equal(normalizeRoomDescription(`Des guitares ${SINGER}`), `Des guitares ${SINGER}`)
    assert.equal(normalizeRoomDescription(''), '')
    assert.equal(normalizeRoomDescription('x'.repeat(ROOM_DESCRIPTION_MAX + 1)), null)
  })
})
