import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAcceptablePassword, isStaffLookalike, normalizeEmail, normalizePseudo, pseudoKey } from '../../shared/validation'

describe('pseudo', () => {
  it('keeps a plain pseudo, accents and emoji included', () => {
    assert.equal(normalizePseudo('Nina_B'), 'Nina_B')
    assert.equal(normalizePseudo('Zoé 🎧'), 'Zoé 🎧')
  })

  it('trims and folds runs of spaces into one', () => {
    assert.equal(normalizePseudo('  Nina    B  '), 'Nina B')
  })

  it('treats look-alike characters as the plain ones, so that nobody passes for somebody else with them', () => {
    assert.equal(normalizePseudo('Ｎｉｎａ'), 'Nina', 'full-width letters')
    assert.equal(normalizePseudo('Nina B'), 'Nina B', 'non-breaking space')
  })

  it('refuses invisible and direction-changing characters', () => {
    assert.equal(normalizePseudo('Ni​na'), null, 'zero-width space')
    assert.equal(normalizePseudo('‮anin'), null, 'right-to-left override')
    assert.equal(normalizePseudo('Ni\u0000na'), null, 'control character')
  })

  it('refuses the characters that are drawn as a blank, so that nobody can be a blank in the list', () => {
    assert.equal(normalizePseudo('⠀⠀'), null, 'Braille blank')
    assert.equal(normalizePseudo('ㅤㅤ'), null, 'Hangul filler')
    assert.equal(normalizePseudo('Aㅤ'), null, 'a letter and a filler')
    assert.equal(normalizePseudo('ﾠﾠ'), null, 'half-width Hangul filler')
    assert.equal(normalizePseudo('ᅟᅠ'), null, 'Hangul choseong and jungseong fillers')
    assert.equal(normalizePseudo('Ni͏na'), null, 'combining grapheme joiner')
    assert.equal(normalizePseudo('Ni᠋na'), null, 'Mongolian free variation selector')
    assert.equal(normalizePseudo('Ni឴na'), null, 'Khmer inherent vowel')
  })

  it('refuses a word that mixes Latin letters with Cyrillic or Greek ones, which look alike', () => {
    assert.equal(normalizePseudo('Аdmin'), null, 'Cyrillic А then Latin dmin')
    assert.equal(normalizePseudo('Ninа'), null, 'Latin Nin then Cyrillic а')
    assert.equal(normalizePseudo('Δelta'), null, 'Greek Δ then Latin elta')
  })

  it('still allows a pseudo that is entirely in another alphabet, or made of emoji', () => {
    assert.equal(normalizePseudo('Админ'), 'Админ')
    assert.equal(normalizePseudo('Δέλτα'), 'Δέλτα')
    assert.equal(normalizePseudo('日本語の名前'), '日本語の名前')
    assert.equal(normalizePseudo('🎧🎧'), '🎧🎧')
  })

  it('counts the length after normalising, and keeps 2 to 20', () => {
    assert.equal(normalizePseudo('a'), null)
    assert.equal(normalizePseudo('ab'), 'ab')
    assert.equal(normalizePseudo('a'.repeat(20)), 'a'.repeat(20))
    assert.equal(normalizePseudo('a'.repeat(21)), null)
    assert.equal(normalizePseudo('   a   '), null, 'spaces do not count')
  })

  it('refuses what is not text', () => {
    for (const value of [undefined, null, 12, {}, ['Nina']]) assert.equal(normalizePseudo(value), null)
  })

  it('compares pseudos without looking at the case', () => {
    assert.equal(pseudoKey('NINA'), pseudoKey('nina'))
    assert.notEqual(pseudoKey('nina'), pseudoKey('nino'))
  })

  it('compares pseudos the way a reader would: "ß" is "ss", a final sigma is a sigma', () => {
    assert.equal(pseudoKey('Straße'), pseudoKey('STRASSE'))
    assert.equal(pseudoKey('ΟΔΟΣ'), pseudoKey('οδοσ'))
  })
})

describe('names that would pass for the team', () => {
  it('are recognised whatever the case, the accents, the separators and the digits', () => {
    for (const pseudo of ['Admin', 'ADMIN', 'admin_', 'admin2', 'A d m i n', 'a.d.m.i.n', 'Modérateur', 'MODO', 'Noctune', 'noctune 2', 'Support', 'Système', 'ROOT']) {
      assert.equal(isStaffLookalike(pseudo), true, pseudo)
    }
  })

  it('leave every other pseudo alone', () => {
    for (const pseudo of ['Nina_B', 'Karim', 'Adminette', 'Rooster', 'Modonna', 'Supporter', 'DJ Nocturne', '🎧🎧']) {
      assert.equal(isStaffLookalike(pseudo), false, pseudo)
    }
  })
})

describe('e-mail', () => {
  it('trims and lower-cases', () => {
    assert.equal(normalizeEmail('  Nina@Example.COM '), 'nina@example.com')
  })

  it('accepts the usual shapes', () => {
    for (const email of ['a@b.co', 'first.last+tag@sub.example.org', 'x_y@exemple.fr']) assert.equal(normalizeEmail(email), email)
  })

  it('refuses what cannot be an address', () => {
    for (const email of ['', 'nina', 'nina@', '@example.com', 'nina@example', 'nina@@example.com', 'ni na@example.com', 'nina@.com', 'nina@example..com', 'nina@example.com.']) {
      assert.equal(normalizeEmail(email), null, email)
    }
  })

  it('refuses an address longer than 254 characters', () => {
    const long = `${'a'.repeat(250)}@b.co`
    assert.equal(normalizeEmail(long), null)
    assert.equal(normalizeEmail(`${'a'.repeat(249)}@b.co`)?.length, 254)
  })

  it('refuses what is not text', () => {
    for (const value of [undefined, null, 12, {}, ['a@b.co']]) assert.equal(normalizeEmail(value), null)
  })

  it('refuses control and invisible characters: a NUL would make the database fail, the others hide what is there', () => {
    for (const email of ['a\u0000b@example.com', 'ab@exa\u0000mple.com', 'a​b@example.com', '‮a@example.com', 'a\u0007@example.com', 'aㅤb@example.com']) {
      assert.equal(normalizeEmail(email), null, JSON.stringify(email))
    }
  })
})

describe('password', () => {
  it('asks for 10 characters at least and 128 at most, and nothing else', () => {
    assert.equal(isAcceptablePassword('a'.repeat(9)), false)
    assert.equal(isAcceptablePassword('a'.repeat(10)), true)
    assert.equal(isAcceptablePassword('a'.repeat(128)), true)
    assert.equal(isAcceptablePassword('a'.repeat(129)), false)
    assert.equal(isAcceptablePassword('un long mot de passe sans majuscule ni chiffre'), true)
  })

  it('counts characters, not bytes: ten emoji are ten characters', () => {
    assert.equal(isAcceptablePassword('🎧'.repeat(10)), true)
    assert.equal(isAcceptablePassword('🎧'.repeat(9)), false)
  })

  it('refuses what is not text', () => {
    for (const value of [undefined, null, 1234567890, {}, ['a'.repeat(12)]]) assert.equal(isAcceptablePassword(value), false)
  })
})
