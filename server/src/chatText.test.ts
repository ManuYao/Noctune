import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CHAT_MAX_LENGTH } from '../../shared/protocol'
import { cleanChatText, containsLink, validateChatText } from './chatText'

describe('cleanChatText', () => {
  it('collapses whitespace and trims', () => {
    assert.equal(cleanChatText('  salut \t  tout\nle monde  '), 'salut tout le monde')
  })

  it('removes zero-width and bidirectional control characters', () => {
    assert.equal(cleanChatText('sa​lut‮'), 'salut')
  })

  it('keeps the joiner that emoji sequences need', () => {
    const family = '👨‍👩‍👧'
    assert.equal(cleanChatText(family), family)
  })
})

describe('containsLink', () => {
  const links = [
    'https://example.com',
    'HTTP://EXAMPLE.COM/a',
    'ftp://host/file',
    'regarde www.site.fr',
    'www . site',
    'youtube.com/watch?v=abc',
    'youtu.be/abc',
    'bit.ly/xyz',
    'discord.gg/abc',
    'va sur exemple.com !',
    'ｈｔｔｐｓ：／／example．com',
    'exa​mple.com',
    'example。com',
    '192.168.0.1',
  ]
  for (const text of links) {
    it(`flags "${text}"`, () => assert.equal(containsLink(text), true))
  }

  const plain = [
    "Ce morceau, c'est exactement ce qu'il me fallait ce soir",
    "Qui l'a ajouté ? Je note la réf.",
    'Nuit Blanche a sorti un nouvel EP en septembre, foncez',
    'Oui. De rien',
    'oui.de rien',
    'ok.merci',
    'Mr. Brightside',
    'Version 1.2 est top',
    '10.000.000 de vues',
    'U.S.A.',
    'Super 🔥🔥 !!!',
  ]
  for (const text of plain) {
    it(`lets "${text}" through`, () => assert.equal(containsLink(text), false))
  }
})

describe('validateChatText', () => {
  it('returns the cleaned text', () => {
    assert.deepEqual(validateChatText('  salut   à tous '), { ok: true, text: 'salut à tous' })
  })

  it('refuses anything that is not text, or empty', () => {
    for (const raw of [undefined, null, 42, {}, '', '   \n ', '​']) {
      assert.deepEqual(validateChatText(raw), { ok: false, error: 'empty' })
    }
  })

  it('accepts exactly the maximum length and refuses one more', () => {
    assert.equal(validateChatText('a'.repeat(CHAT_MAX_LENGTH)).ok, true)
    assert.deepEqual(validateChatText('a'.repeat(CHAT_MAX_LENGTH + 1)), { ok: false, error: 'too-long' })
  })

  it('counts an emoji as one character', () => {
    assert.equal(validateChatText('😀'.repeat(CHAT_MAX_LENGTH)).ok, true)
    assert.deepEqual(validateChatText('😀'.repeat(CHAT_MAX_LENGTH + 1)), { ok: false, error: 'too-long' })
  })

  it('refuses huge input without cleaning it first', () => {
    assert.deepEqual(validateChatText(' '.repeat(100_000)), { ok: false, error: 'too-long' })
  })

  it('refuses links', () => {
    assert.deepEqual(validateChatText('écoute https://example.com'), { ok: false, error: 'links-not-allowed' })
  })
})
