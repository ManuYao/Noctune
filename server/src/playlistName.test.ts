import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PLAYLIST_NAME_MAX } from '../../shared/protocol'
import { normalizePlaylistName, playlistNameKey } from '../../shared/validation'

// The characters that cannot be seen are written by their number: typed as escapes, an editor turns them into the
// real characters, and the test becomes unreadable.
const char = (code: number) => String.fromCodePoint(code)
const NO_BREAK_SPACE = char(0xa0)
const NUL = char(0)
const ZERO_WIDTH_SPACE = char(0x200b)
const RIGHT_TO_LEFT_OVERRIDE = char(0x202e)
const BRAILLE_BLANK = char(0x2800)
const SOFT_HYPHEN = char(0xad)
const BYTE_ORDER_MARK = char(0xfeff)
const LEFT_TO_RIGHT_ISOLATE = char(0x2066)

describe('normalizePlaylistName', () => {
  it('keeps a plain name as it is, accents and emoji included', () => {
    assert.equal(normalizePlaylistName('Chill du soir'), 'Chill du soir')
    assert.equal(normalizePlaylistName('Été à Montréal 🎧'), 'Été à Montréal 🎧')
  })

  it('trims, and folds runs of spaces and line breaks into one space', () => {
    assert.equal(normalizePlaylistName('  Chill   du\n\tsoir  '), 'Chill du soir')
  })

  it('turns full-width and non-breaking characters into plain ones', () => {
    assert.equal(normalizePlaylistName(`Ｃｈｉｌｌ${NO_BREAK_SPACE}soir`), 'Chill soir')
  })

  it('refuses what is empty once trimmed', () => {
    for (const name of ['', '   ', '\n\t', NO_BREAK_SPACE]) assert.equal(normalizePlaylistName(name), null, JSON.stringify(name))
  })

  it('refuses what is longer than the limit, counted in characters', () => {
    assert.equal(normalizePlaylistName('a'.repeat(PLAYLIST_NAME_MAX)), 'a'.repeat(PLAYLIST_NAME_MAX))
    assert.equal(normalizePlaylistName('a'.repeat(PLAYLIST_NAME_MAX + 1)), null)
    // An emoji is two UTF-16 units but one character: forty of them fit.
    assert.equal(normalizePlaylistName('🎧'.repeat(PLAYLIST_NAME_MAX)), '🎧'.repeat(PLAYLIST_NAME_MAX))
    assert.equal(normalizePlaylistName('🎧'.repeat(PLAYLIST_NAME_MAX + 1)), null)
  })

  it('refuses control characters and what cannot be seen', () => {
    const names = [
      `Chill${NUL}`,
      `Chi${ZERO_WIDTH_SPACE}ll`,
      `Chill${RIGHT_TO_LEFT_OVERRIDE}`,
      BRAILLE_BLANK,
      `a${SOFT_HYPHEN}b`,
      `Chill${LEFT_TO_RIGHT_ISOLATE}`,
    ]
    for (const name of names) assert.equal(normalizePlaylistName(name), null, JSON.stringify(name))
  })

  it('treats a byte order mark as the space it counts for in JavaScript: trimmed at the ends, a plain space inside', () => {
    assert.equal(normalizePlaylistName(`${BYTE_ORDER_MARK}Chill${BYTE_ORDER_MARK}`), 'Chill')
    assert.equal(normalizePlaylistName(`Chi${BYTE_ORDER_MARK}ll`), 'Chi ll')
  })

  it('refuses what is not text', () => {
    for (const value of [undefined, null, 5, {}, [], ['Chill'], true]) assert.equal(normalizePlaylistName(value), null)
  })
})

describe('playlistNameKey', () => {
  it('is the same for names that differ only by case', () => {
    assert.equal(playlistNameKey('Chill'), playlistNameKey('CHILL'))
    assert.equal(playlistNameKey('Straße'), playlistNameKey('STRASSE'))
  })

  it('differs for names that differ in anything else', () => {
    assert.notEqual(playlistNameKey('Chill'), playlistNameKey('Chill 2'))
    assert.notEqual(playlistNameKey('é'), playlistNameKey('e'))
  })
})
