import assert from 'node:assert/strict'
import type { IncomingMessage } from 'node:http'
import { describe, it } from 'node:test'
import { clientIp, ipKey, originAllowed, parseAllowedOrigins } from './origin'

const ALLOWED = ['http://localhost:5173']

describe('where a request comes from', () => {
  it('is allowed from an allowed origin and refused from any other', () => {
    assert.equal(originAllowed({ origin: 'http://localhost:5173' }, ALLOWED), true)
    for (const origin of ['http://localhost:5174', 'https://localhost:5173', 'http://localhost:5173.evil.example', 'null', '']) {
      assert.equal(originAllowed({ origin }, ALLOWED), false, origin)
    }
  })

  it('falls back on Sec-Fetch-Site when there is no Origin, and lets a client that says nothing through', () => {
    assert.equal(originAllowed({}, ALLOWED), true)
    assert.equal(originAllowed({ 'sec-fetch-site': 'same-origin' }, ALLOWED), true)
    assert.equal(originAllowed({ 'sec-fetch-site': 'none' }, ALLOWED), true)
    assert.equal(originAllowed({ 'sec-fetch-site': 'cross-site' }, ALLOWED), false)
    assert.equal(originAllowed({ 'sec-fetch-site': 'same-site' }, ALLOWED), false)
  })
})

describe('the list of allowed origins', () => {
  it('reduces each address to what a browser sends, whatever the way it was written', () => {
    assert.deepEqual(parseAllowedOrigins('https://noctune.example/', ''), ['https://noctune.example'])
    assert.deepEqual(parseAllowedOrigins(' http://localhost:5173 , https://noctune.example/app/ ', ''), ['http://localhost:5173', 'https://noctune.example'])
    assert.deepEqual(parseAllowedOrigins('HTTPS://Noctune.Example:443', ''), ['https://noctune.example'])
  })

  it('uses the fallback when nothing is set', () => {
    assert.deepEqual(parseAllowedOrigins(undefined, 'http://localhost:5173'), ['http://localhost:5173'])
  })

  it('stops the server on something that is not an address, instead of refusing every request later', () => {
    for (const bad of ['noctune.example', 'localhost:5173', 'ftp://noctune.example', 'not an address']) {
      assert.throws(() => parseAllowedOrigins(bad, ''), /APP_ORIGIN/, bad)
    }
  })
})

describe('what the limits count by', () => {
  it('is the address itself for IPv4, without the port some proxies add', () => {
    assert.equal(ipKey('1.2.3.4'), '1.2.3.4')
    assert.equal(ipKey('1.2.3.4:56789'), '1.2.3.4')
    assert.equal(ipKey(' 1.2.3.4 '), '1.2.3.4')
  })

  it('sees an IPv4 address through its IPv6 form as the same address', () => {
    assert.equal(ipKey('::ffff:1.2.3.4'), '1.2.3.4')
    assert.equal(ipKey('::FFFF:1.2.3.4'), '1.2.3.4')
  })

  it('is the /64 for IPv6: the 2^64 addresses of one connection are one visitor', () => {
    const a = ipKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd')
    assert.equal(a, 'v6:2001:0db8:0001:0002')
    assert.equal(ipKey('2001:db8:1:2::1'), a)
    assert.equal(ipKey('2001:DB8:1:2:ffff:ffff:ffff:ffff'), a)
    assert.equal(ipKey('[2001:db8:1:2::1]:443'), a, 'with a port')
    assert.equal(ipKey('2001:db8:1:2::1%eth0'), a, 'with a zone')
    assert.notEqual(ipKey('2001:db8:1:3::1'), a, 'the next /64 is somebody else')
  })

  it('understands the compressed forms', () => {
    assert.equal(ipKey('::1'), 'v6:0000:0000:0000:0000')
    assert.equal(ipKey('fe80::1'), 'v6:fe80:0000:0000:0000')
    assert.equal(ipKey('2001:db8::'), 'v6:2001:0db8:0000:0000')
    assert.equal(ipKey('2001:0:0:0:1:2:3:4'), 'v6:2001:0000:0000:0000')
  })

  it('leaves anything it does not understand alone, in lower case', () => {
    assert.equal(ipKey('unknown'), 'unknown')
    assert.equal(ipKey('UNKNOWN'), 'unknown')
  })
})

function request(remoteAddress: string, forwarded?: string | string[]): IncomingMessage {
  return { socket: { remoteAddress }, headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded } } as unknown as IncomingMessage
}

describe('the address of the visitor', () => {
  it('is the connection, and the header is ignored, when there is no proxy', () => {
    assert.equal(clientIp(request('1.1.1.1', '9.9.9.9'), 0), '1.1.1.1')
    assert.equal(clientIp(request('::ffff:1.1.1.1'), 0), '1.1.1.1')
  })

  it('is the last value of the header behind one proxy: the one the proxy wrote', () => {
    assert.equal(clientIp(request('10.0.0.1', '1.1.1.1'), 1), '1.1.1.1')
    assert.equal(clientIp(request('10.0.0.1', '9.9.9.9, 1.1.1.1'), 1), '1.1.1.1', 'what the visitor put in front changes nothing')
  })

  it('is the second value from the right behind two proxies (a CDN, then a server)', () => {
    assert.equal(clientIp(request('10.0.0.1', '9.9.9.9, 1.1.1.1, 172.16.0.5'), 2), '1.1.1.1')
    assert.equal(clientIp(request('10.0.0.1', ['9.9.9.9', '1.1.1.1, 172.16.0.5']), 2), '1.1.1.1', 'a header sent in several lines')
  })

  it('falls back on the connection when the header has fewer values than there are proxies', () => {
    assert.equal(clientIp(request('10.0.0.1', '1.1.1.1'), 2), '10.0.0.1')
    assert.equal(clientIp(request('10.0.0.1'), 1), '10.0.0.1')
  })

  it('keys an IPv6 visitor by their /64, and drops the port a proxy may have added', () => {
    assert.equal(clientIp(request('10.0.0.1', '2001:db8:1:2::77'), 1), 'v6:2001:0db8:0001:0002')
    assert.equal(clientIp(request('10.0.0.1', '1.1.1.1:50000'), 1), '1.1.1.1')
  })
})
