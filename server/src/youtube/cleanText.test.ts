import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cleanText } from './cleanText'

describe('cleanText', () => {
  it('keeps ordinary text, accents, symbols and emoji as they are', () => {
    assert.equal(cleanText('Different Heaven & EH!DE - My Heart | Drumstep', 100), 'Different Heaven & EH!DE - My Heart | Drumstep')
    assert.equal(cleanText('Cartoon, Jéja - On & On (feat. Daniel Levi)', 100), 'Cartoon, Jéja - On & On (feat. Daniel Levi)')
    assert.equal(cleanText('lofi hip hop radio 📚 beats to relax/study to', 100), 'lofi hip hop radio 📚 beats to relax/study to')
    assert.equal(cleanText('日本語のタイトル', 100), '日本語のタイトル')
    assert.equal(cleanText('<b>not markup</b> "quoted" \'text\'', 100), '<b>not markup</b> "quoted" \'text\'')
  })

  it('keeps an emoji sequence joined', () => {
    assert.equal(cleanText('Family 👨\u200D👩\u200D👧', 100), 'Family 👨\u200D👩\u200D👧')
  })

  it('turns spaces of every kind and line breaks into one plain space', () => {
    assert.equal(cleanText('a\nb\r\nc\td\u00A0e\u2003f\u2028g\u3000h', 100), 'a b c d e f g h')
    assert.equal(cleanText('  a    b  ', 100), 'a b')
  })

  it('removes control characters and characters that show nothing', () => {
    assert.equal(cleanText('a\u0000b\u0007c\u001bd\u007fe', 100), 'abcde')
    assert.equal(cleanText('a\u200Bb\u200Cc\u2060d\uFEFFe\u00ADf', 100), 'abcdef')
    assert.equal(cleanText('a\uE000b', 100), 'ab') // private use
    assert.equal(cleanText('a\u0378b', 100), 'ab') // unassigned
  })

  it('removes the characters that reorder the text around them', () => {
    assert.equal(cleanText('safe\u202Eexe.txt', 100), 'safeexe.txt')
    assert.equal(cleanText('a\u202Ab\u202Bc\u202Cd\u202De', 100), 'abcde')
    assert.equal(cleanText('a\u2066b\u2067c\u2068d\u2069e\u200Ef\u200Fg\u061Ch', 100), 'abcdefgh')
  })

  it('treats blank-looking letters as spaces', () => {
    assert.equal(cleanText('a\u2800b\u3164c\uFFA0d\u115Fe\u1160f', 100), 'a b c d e f')
  })

  it('removes a lone surrogate but not a pair', () => {
    assert.equal(cleanText('a\ud800b', 100), 'ab')
    assert.equal(cleanText('a\udc00b', 100), 'ab')
    assert.equal(cleanText('a😀b', 100), 'a😀b')
  })

  it('cuts by whole characters, with an ellipsis, to at most the size asked', () => {
    assert.equal(cleanText('abcdefgh', 5), 'abcd…')
    assert.equal(cleanText('abcde', 5), 'abcde')
    assert.equal(cleanText('😀😀😀😀😀😀', 4), '😀😀😀…')
    assert.equal(cleanText('hello world', 7), 'hello…') // no space left dangling before the ellipsis
    assert.ok(Array.from(cleanText('x'.repeat(5000), 100)).length <= 100, 'never longer than asked')
  })

  it('answers an empty string when nothing visible is left', () => {
    for (const text of ['', '   ', '\n\t', '\u200B\u200B', '\u200D', '\u202E', '\u2800\u3164', '\u0000\u0001', '\ud800']) {
      assert.equal(cleanText(text, 100), '', JSON.stringify(text))
    }
  })

  it('answers an empty string for what is not a string', () => {
    for (const value of [undefined, null, 42, {}, [], ['a'], true]) assert.equal(cleanText(value, 100), '')
  })
})
