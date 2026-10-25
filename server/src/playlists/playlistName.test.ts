import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PLAYLIST_NAME_MAX } from '../../../shared/protocol'
import { normalizePlaylistName } from '../../../shared/validation'

// Built from code points: typed as escapes in a file, some tools turn them into the invisible characters themselves.
const chars = (...codePoints: number[]) => String.fromCodePoint(...codePoints)
const HEART = chars(0x2764, 0xfe0f) // the red heart: a heart and a variation selector
const SUN = chars(0x2600, 0xfe0f)
const SINGER = chars(0x1f468, 0x200d, 0x1f3a4) // a man, a joiner, a microphone

describe('the name of a playlist', () => {
  it('accepts the emoji people put in names, joiners and variation selectors included', () => {
    assert.equal(normalizePlaylistName(`Soir ${HEART}`), `Soir ${HEART}`)
    assert.equal(normalizePlaylistName(`Chill ${SUN}`), `Chill ${SUN}`)
    assert.equal(normalizePlaylistName(`${SINGER} Rock`), `${SINGER} Rock`)
  })

  it('refuses a name that is only joiners: nothing to see', () => {
    assert.equal(normalizePlaylistName(chars(0x200d)), null)
    assert.equal(normalizePlaylistName(chars(0xfe0f, 0x200d, 0xfe0f)), null)
    assert.equal(normalizePlaylistName(` ${chars(0x200d)} `), null)
  })

  it('still refuses the characters that pass for nothing or turn the text round', () => {
    assert.equal(normalizePlaylistName(`Jazz${chars(0x200b)}`), null, 'zero-width space')
    assert.equal(normalizePlaylistName(`Jazz${chars(0x202e)}`), null, 'right-to-left override')
    assert.equal(normalizePlaylistName(`Jazz${chars(0x2800)}`), null, 'braille blank')
    assert.equal(normalizePlaylistName(`Jazz${chars(0x0007)}`), null, 'control character')
    assert.equal(normalizePlaylistName(`Jazz${chars(0x200d, 0x200b)}`), null, 'a joiner does not excuse the one next to it')
  })

  it('counts characters, not units, and keeps the limit', () => {
    // A heart is two code points (the heart and its selector): twenty of them make exactly the forty allowed.
    assert.equal(normalizePlaylistName(HEART.repeat(PLAYLIST_NAME_MAX / 2)) !== null, true, 'at the limit')
    assert.equal(normalizePlaylistName('a'.repeat(PLAYLIST_NAME_MAX + 1)), null, 'one over')
    assert.equal(normalizePlaylistName(5), null)
  })
})
