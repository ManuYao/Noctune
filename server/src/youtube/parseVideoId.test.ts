import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DJ_INPUT_MAX } from '../../../shared/protocol'
import { parseVideoId } from './parseVideoId'

const ID = 'dQw4w9WgXcQ'
const OTHER = 'aaaaaaaaaaa'

const ACCEPTED: Array<[what: string, input: string]> = [
  ['a bare id', ID],
  ['a bare id with spaces and line breaks around it', `  \n${ID}\r\n `],
  ['a watch link', `https://www.youtube.com/watch?v=${ID}`],
  ['a watch link over plain http', `http://www.youtube.com/watch?v=${ID}`],
  ['the bare domain', `https://youtube.com/watch?v=${ID}`],
  ['the mobile site', `https://m.youtube.com/watch?v=${ID}`],
  ['YouTube Music', `https://music.youtube.com/watch?v=${ID}&list=RDAMVM${ID}`],
  ['a playlist, an index and a time', `https://www.youtube.com/watch?v=${ID}&list=PLabcdefghijklmnopqrstuvwxyz012345&index=3&t=42s`],
  ['v after another parameter', `https://www.youtube.com/watch?feature=share&v=${ID}`],
  ['a fragment', `https://www.youtube.com/watch?v=${ID}#t=10`],
  ['a short link', `https://youtu.be/${ID}`],
  ['a short link with tracking', `https://youtu.be/${ID}?si=AbCdEfGhIjKlMnOp&t=3`],
  ['a short link with a trailing slash', `https://youtu.be/${ID}/`],
  ['an embed link', `https://www.youtube.com/embed/${ID}`],
  ['an embed link with options', `https://www.youtube.com/embed/${ID}?start=3&autoplay=1`],
  ['a privacy-enhanced embed link', `https://www.youtube-nocookie.com/embed/${ID}`],
  ['a shorts link', `https://www.youtube.com/shorts/${ID}`],
  ['a live link', `https://www.youtube.com/live/${ID}`],
  ['an old-style /v/ link', `https://www.youtube.com/v/${ID}`],
  ['upper case scheme and host', `HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`],
  ['a link without its scheme', `www.youtube.com/watch?v=${ID}`],
  ['the bare domain without its scheme', `youtube.com/watch?v=${ID}`],
  ['a short link without its scheme', `youtu.be/${ID}`],
  ['the mobile site without its scheme', `m.youtube.com/watch?v=${ID}`],
]

const REJECTED: Array<[what: string, input: string]> = [
  // Who the link points to
  ['credentials that make the real host another one', `https://youtube.com@evil.com/watch?v=${ID}`],
  ['credentials with www', `https://www.youtube.com@evil.com/watch?v=${ID}`],
  ['credentials in front of a real host', `https://evil.com@www.youtube.com/watch?v=${ID}`],
  ['a user name and password', `https://user:pass@www.youtube.com/watch?v=${ID}`],
  ['a real host used as a sub-domain of another', `https://www.youtube.com.evil.com/watch?v=${ID}`],
  ['a real host used as a path', `https://evil.com/www.youtube.com/watch?v=${ID}`],
  ['a real host used as a query', `https://evil.com/?u=https://www.youtube.com/watch?v=${ID}`],
  ['another site with the same path', `https://evil.com/watch?v=${ID}`],
  ['a host that merely ends like YouTube', `https://notyoutube.com/watch?v=${ID}`],
  ['a host that merely starts like YouTube', `https://youtube.com.au/watch?v=${ID}`],
  ['another YouTube sub-domain', `https://studio.youtube.com/watch?v=${ID}`],
  ['a YouTube sub-domain of a sub-domain', `https://evil.www.youtube.com/watch?v=${ID}`],
  ['www on the short host', `https://www.youtu.be/${ID}`],
  ['a punycode host', `https://xn--youtube-6l1b.com/watch?v=${ID}`],
  ['a Cyrillic "o" in the host', `https://www.y\u043Eutube.com/watch?v=${ID}`],
  ['a full-width host that the URL parser would turn into youtube.com', `https://\uFF59\uFF4F\uFF55\uFF54\uFF55\uFF42\uFF45.com/watch?v=${ID}`],
  ['a trailing dot on the host', `https://youtube.com./watch?v=${ID}`],
  ['a port', `https://www.youtube.com:8080/watch?v=${ID}`],
  ['the default port written out', `https://www.youtube.com:443/watch?v=${ID}`],
  ['an IPv6 host', `https://[::1]/watch?v=${ID}`],
  ['an IPv4 host', `https://127.0.0.1/watch?v=${ID}`],
  ['a numeric host that is not an address', `https://999.999.999.999/watch?v=${ID}`],
  ['a number too big to be an address', `https://4294967296/watch?v=${ID}`],
  ['a host made of dots only', `https://../watch?v=${ID}`],
  ['an address written in hexadecimal', `https://0x7f.0.0.1/watch?v=${ID}`],
  ['a backslash that the URL parser reads as a slash', `https://www.youtube.com\\@evil.com/watch?v=${ID}`],
  ['a backslash before the path', `https://www.youtube.com\\watch?v=${ID}`],
  ['a backslash in the path', `https://www.youtube.com/embed\\${ID}`],
  // The scheme
  ['a javascript: link', `javascript:alert(1)//youtu.be/${ID}`],
  ['a data: link', `data:text/html,https://youtu.be/${ID}`],
  ['a file: link', `file:///etc/passwd#youtu.be/${ID}`],
  ['an ftp link', `ftp://youtu.be/${ID}`],
  ['a blob: link', `blob:https://youtu.be/${ID}`],
  ['view-source:', `view-source:https://youtu.be/${ID}`],
  ['a protocol-relative link', `//youtu.be/${ID}`],
  ['a host with a port and no scheme', `youtube.com:8080/watch?v=${ID}`],
  ['credentials without a scheme', `youtube.com@evil.com/watch?v=${ID}`],
  ['a look-alike host without a scheme', `youtube.com.evil.com/watch?v=${ID}`],
  // The path
  ['a playlist link', 'https://www.youtube.com/playlist?list=PLabcdefghijklmnopqrstuvwxyz012345'],
  ['a watch link without v', 'https://www.youtube.com/watch'],
  ['a watch link with an empty v', 'https://www.youtube.com/watch?v='],
  ['a watch link with only a playlist', 'https://www.youtube.com/watch?list=PLabcdefghijklmnopqrstuvwxyz012345'],
  ['two different v', `https://www.youtube.com/watch?v=${ID}&v=${OTHER}`],
  ['the same v twice', `https://www.youtube.com/watch?v=${ID}&v=${ID}`],
  ['v as part of another parameter name', `https://www.youtube.com/watch?xv=${ID}`],
  ['a channel', 'https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw'],
  ['a handle', 'https://www.youtube.com/@RickAstleyYT'],
  ['a search page', 'https://www.youtube.com/results?search_query=rick+astley'],
  ['the home page', 'https://www.youtube.com/'],
  ['an embed without an id', 'https://www.youtube.com/embed/'],
  ['an embed with more path', `https://www.youtube.com/embed/${ID}/extra`],
  ['an upper-case path', `https://www.youtube.com/WATCH?v=${ID}`],
  ['a double slash before the path', `https://www.youtube.com//watch?v=${ID}`],
  ['watch with a trailing path', `https://www.youtube.com/watch/extra?v=${ID}`],
  ['a short link without an id', 'https://youtu.be/'],
  ['a short link with more path', `https://youtu.be/${ID}/extra`],
  ['the watch path on the short host', `https://youtu.be/watch?v=${ID}`],
  ['the id in the fragment only', `https://www.youtube.com/watch#v=${ID}`],
  ['an encoded slash in the path', `https://www.youtube.com/embed%2F${ID}`],
  // The id
  ['a bare id of 10 characters', ID.slice(0, 10)],
  ['a bare id of 12 characters', `${ID}Q`],
  ['a watch link with 10 characters', `https://www.youtube.com/watch?v=${ID.slice(0, 10)}`],
  ['a watch link with 12 characters', `https://www.youtube.com/watch?v=${ID}Q`],
  ['a short link with 12 characters', `https://youtu.be/${ID}Q`],
  ['an embed link with 10 characters', `https://www.youtube.com/embed/${ID.slice(0, 10)}`],
  ['a bare id with a forbidden character', 'dQw4w9WgXc!'],
  ['a bare id with a dot', 'dQw4w9WgXc.'],
  ['a bare id with a percent sign', 'dQw4w9WgXc%'],
  ['a bare id with an accent', 'dQw4w9WgXcé'],
  ['a bare id with a full-width letter', 'dQw4w9WgXc\uFF31'],
  ['an encoded forbidden character in v', `https://www.youtube.com/watch?v=${ID.slice(0, 10)}%21`],
  ['an encoded NUL in v', `https://www.youtube.com/watch?v=${ID.slice(0, 10)}%00`],
  // What cannot be in a link at all
  ['a second link on another line', `https://www.youtube.com/watch?v=${ID}\nhttps://evil.com`],
  ['a line break inside the host', `https://www.you\ntube.com/watch?v=${ID}`],
  ['a tab inside the host', `https://www.you\ttube.com/watch?v=${ID}`],
  ['a carriage return inside the id', `https://youtu.be/dQw4w9\rWgXcQ`],
  ['a space inside the id', `https://youtu.be/dQw4w9 WgXcQ`],
  ['a NUL byte', `https://youtu.be/${ID}\u0000`],
  ['a no-break space inside', `https://youtu.be/\u00A0${ID}`],
  ['two links separated by a space', `https://youtu.be/${ID} https://youtu.be/${OTHER}`],
  ['text around the link', `listen to https://youtu.be/${ID}`],
  ['just words', 'never gonna give you up'],
]

describe('parseVideoId', () => {
  for (const [what, input] of ACCEPTED) {
    it(`reads ${what}`, () => assert.equal(parseVideoId(input), ID))
  }

  it('reads an id made of hyphens and underscores', () => {
    assert.equal(parseVideoId('-_-_-_-_-_-'), '-_-_-_-_-_-')
    assert.equal(parseVideoId('https://youtu.be/a-b_c-d_e-f'), 'a-b_c-d_e-f')
    assert.equal(parseVideoId('https://www.youtube.com/watch?v=_aaaaaaaaa-'), '_aaaaaaaaa-')
  })

  for (const [what, input] of REJECTED) {
    it(`refuses ${what}`, () => assert.equal(parseVideoId(input), null))
  }

  it('refuses everything that is not a string, without throwing', () => {
    const odd = [undefined, null, 42, true, {}, [], [ID], { toString: () => ID }, Symbol('x'), () => ID, 10n, new String(ID)]
    for (const value of odd) assert.equal(parseVideoId(value), null, String(typeof value))
  })

  it('refuses nothing and spaces', () => {
    for (const input of ['', ' ', '   ', '\n', '\t \r\n']) assert.equal(parseVideoId(input), null, JSON.stringify(input))
  })

  it('accepts a link of exactly the longest size and refuses one character more', () => {
    const head = `https://www.youtube.com/watch?v=${ID}&x=`
    const atLimit = head + 'a'.repeat(DJ_INPUT_MAX - head.length)
    assert.equal(atLimit.length, DJ_INPUT_MAX)
    assert.equal(parseVideoId(atLimit), ID)
    assert.equal(parseVideoId(`${atLimit}a`), null)
  })

  it('refuses a huge input at once', () => {
    assert.equal(parseVideoId(`${ID}${' '.repeat(1_000_000)}`.repeat(2)), null)
    assert.equal(parseVideoId('https://youtu.be/' + 'a'.repeat(1_000_000)), null)
  })

  it('never throws, and only ever answers null or an id found in the text', () => {
    // A deterministic mix of the characters that matter in links, so that the run is the same every time.
    const pieces = ['https://', 'http://', '//', 'youtube.com', 'www.', 'youtu.be', '/watch', '/embed/', '?v=', '&v=', '#', '@', ':', '\\', '%', '.', '-', '_', ID, OTHER, ' ', '\n', 'é', '\u202E', '[', ']', '..', '%2F', '999.999.999.999', '4294967296', '0x7f', '\u0000']
    let seed = 12345
    const next = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648)
    for (let round = 0; round < 3000; round += 1) {
      let text = ''
      for (let count = next() % 8; count >= 0; count -= 1) text += pieces[next() % pieces.length]
      const id = parseVideoId(text)
      if (id !== null) {
        assert.match(id, /^[\w-]{11}$/, JSON.stringify(text))
        assert.ok(text.includes(id), JSON.stringify(text))
      }
    }
  })
})
