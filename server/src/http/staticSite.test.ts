import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { gunzipSync } from 'node:zlib'
import { createNoctuneServer } from '../createServer'

let base: string
let server: Server
let port: number
let symlinkOk = true
const BIG = 'body{color:red}\n'.repeat(100)

before(async () => {
  base = mkdtempSync(join(tmpdir(), 'noctune-site-'))
  const dist = join(base, 'dist')
  const outside = join(base, 'secret.txt')
  mkdirSync(join(dist, 'assets'), { recursive: true })
  mkdirSync(join(dist, '.git'))
  writeFileSync(outside, 'TOP-SECRET')
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Noctune</title>')
  writeFileSync(join(dist, 'sw.js'), 'self.skipWaiting()')
  writeFileSync(join(dist, 'workbox-abc.js'), 'x')
  writeFileSync(join(dist, 'manifest.webmanifest'), '{}')
  writeFileSync(join(dist, 'icon.svg'), '<svg/>')
  writeFileSync(join(dist, '.env'), 'SECRET=1')
  writeFileSync(join(dist, '.git', 'config'), 'x')
  writeFileSync(join(dist, 'assets', 'index-ab12.js'), 'console.log(1)')
  writeFileSync(join(dist, 'assets', 'index-ab12.css'), BIG)
  writeFileSync(join(dist, 'assets', 'font.woff2'), 'w')
  writeFileSync(join(dist, 'assets', 'pic.webp'), 'w')
  writeFileSync(join(dist, 'assets', 'pre.js'), 'plain')
  writeFileSync(join(dist, 'assets', 'pre.js.br'), 'brotli-bytes')
  try {
    symlinkSync(outside, join(dist, 'link.txt'))
    symlinkSync(base, join(dist, 'linkdir'), 'dir')
  } catch {
    symlinkOk = false
  }
  server = createNoctuneServer({ allowedOrigins: ['http://localhost:5173'], staticDir: dist }).httpServer
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  port = (server.address() as AddressInfo).port
})

after(() => {
  server.close()
  server.closeAllConnections()
  rmSync(base, { recursive: true, force: true })
})

/** A raw request: fetch would normalise `..` before sending, and the point is to send it as is. */
function get(path: string, { method = 'GET', headers = {} as Record<string, string> } = {}, to = () => port) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: to(), path, method, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.end()
  })
}

describe('the static site', () => {
  it('serves files with their MIME type', async () => {
    const cases: Array<[string, string]> = [
      ['/', 'text/html; charset=utf-8'],
      ['/assets/index-ab12.js', 'text/javascript; charset=utf-8'],
      ['/assets/index-ab12.css', 'text/css; charset=utf-8'],
      ['/assets/font.woff2', 'font/woff2'],
      ['/assets/pic.webp', 'image/webp'],
      ['/icon.svg', 'image/svg+xml'],
      ['/manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
    ]
    for (const [path, type] of cases) {
      const res = await get(path)
      assert.equal(res.status, 200, path)
      assert.equal(res.headers['content-type'], type, path)
    }
  })

  it('falls back on index.html for app routes, but 404s a missing file and unknown /api routes', async () => {
    for (const path of ['/rooms', '/rooms/lofi-chill?x=1', '/assets', '/profil/']) {
      const res = await get(path)
      assert.equal(res.status, 200, path)
      assert.match(res.body.toString(), /<title>Noctune/, path)
    }
    for (const path of ['/assets/missing.js', '/nope.png', '/api/nothing', '/api']) {
      assert.equal((await get(path)).status, 404, path)
    }
    assert.doesNotMatch((await get('/api/nothing')).body.toString(), /Noctune/, 'the API 404 is not the app')
  })

  it('sets the cache policy by kind of file', async () => {
    assert.equal((await get('/assets/index-ab12.js')).headers['cache-control'], 'public, max-age=31536000, immutable')
    for (const path of ['/', '/rooms', '/index.html', '/sw.js', '/workbox-abc.js', '/manifest.webmanifest']) {
      assert.equal((await get(path)).headers['cache-control'], 'no-cache', path)
    }
    assert.equal((await get('/icon.svg')).headers['cache-control'], 'public, max-age=3600')
  })

  it('answers 304 to a matching ETag and to a recent If-Modified-Since', async () => {
    const first = await get('/assets/index-ab12.js')
    const again = await get('/assets/index-ab12.js', { headers: { 'If-None-Match': String(first.headers.etag) } })
    assert.equal(again.status, 304)
    assert.equal(again.body.length, 0)
    const dated = await get('/assets/index-ab12.js', { headers: { 'If-Modified-Since': String(first.headers['last-modified']) } })
    assert.equal(dated.status, 304)
    assert.equal((await get('/assets/index-ab12.js', { headers: { 'If-None-Match': 'W/"other"' } })).status, 200)
  })

  it('compresses text in memory, serves a precompressed file, and leaves binary files alone', async () => {
    const gz = await get('/assets/index-ab12.css', { headers: { 'Accept-Encoding': 'gzip' } })
    assert.equal(gz.headers['content-encoding'], 'gzip')
    assert.equal(gunzipSync(gz.body).toString(), BIG)
    assert.ok(gz.body.length < BIG.length, 'smaller than the source')
    assert.equal((await get('/assets/index-ab12.css')).headers['content-encoding'], undefined)
    const br = await get('/assets/pre.js', { headers: { 'Accept-Encoding': 'br, gzip' } })
    assert.equal(br.headers['content-encoding'], 'br')
    assert.equal(br.body.toString(), 'brotli-bytes')
    assert.equal((await get('/assets/pic.webp', { headers: { 'Accept-Encoding': 'gzip' } })).headers['content-encoding'], undefined)
  })

  it('refuses any way out of the folder, hidden files and listings', async () => {
    const paths = [
      '/../secret.txt',
      '/..%2fsecret.txt',
      '/%2e%2e/secret.txt',
      '/%2E%2E%2Fsecret.txt',
      '/assets/../../secret.txt',
      '/assets/%2e%2e/%2e%2e/secret.txt',
      '/assets/..%5csecret.txt',
      '/..\\secret.txt',
      '/assets\\..\\..\\secret.txt',
      '/index.html%00.png',
      '/%00',
      '//etc/passwd',
      '/C:/Windows/win.ini',
      '/%2fetc%2fpasswd',
      '/.env',
      '/%2eenv',
      '/.git/config',
      '/assets/.%2e/secret.txt',
      '/%c0%ae%c0%ae/secret.txt',
      '/%',
    ]
    for (const path of paths) {
      const res = await get(path)
      // An extensionless path may land on the app's index.html (harmless); anything else is refused.
      assert.ok(res.status === 404 || (res.status === 200 && /<title>Noctune/.test(res.body.toString())), `${path} -> ${res.status}`)
      assert.doesNotMatch(res.body.toString(), /TOP-SECRET|SECRET=1|root:/, path)
    }
    if (symlinkOk) {
      for (const path of ['/link.txt', '/linkdir/secret.txt']) {
        const res = await get(path)
        assert.equal(res.status, 404, path)
        assert.doesNotMatch(res.body.toString(), /TOP-SECRET/, path)
      }
    }
  })

  it('allows GET and HEAD only', async () => {
    const head = await get('/assets/index-ab12.js', { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(head.body.length, 0)
    assert.equal(head.headers['content-length'], '14')
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      const res = await get('/', { method })
      assert.equal(res.status, 405, method)
      assert.equal(res.headers.allow, 'GET, HEAD', method)
    }
  })

  it('sets the security headers and does not leak details', async () => {
    for (const path of ['/', '/assets/index-ab12.js', '/missing.js']) {
      const res = await get(path)
      assert.equal(res.headers['x-content-type-options'], 'nosniff', path)
      assert.equal(res.headers['referrer-policy'], 'strict-origin-when-cross-origin', path)
      assert.equal(res.headers['x-frame-options'], 'DENY', path)
      assert.match(String(res.headers['permissions-policy']), /camera=\(\)/, path)
    }
    assert.equal((await get('/missing.js')).body.toString(), 'Introuvable')
  })

  it('answers /healthz', async () => {
    const res = await get('/healthz')
    assert.equal(res.status, 200)
    assert.equal(res.body.toString(), 'ok')
  })

  it('does not take over the realtime path', async () => {
    const res = await get('/socket.io/?EIO=4&transport=polling')
    assert.equal(res.status, 200)
    assert.doesNotMatch(res.body.toString(), /<title>/)
  })
})

describe('without a site folder', () => {
  it('behaves as before: unknown paths are a plain 404', async () => {
    const bare = createNoctuneServer({ allowedOrigins: ['http://localhost:5173'], staticDir: null }).httpServer
    await new Promise<void>((done) => bare.listen(0, '127.0.0.1', done))
    const res = await get('/rooms', {}, () => (bare.address() as AddressInfo).port)
    assert.equal(res.status, 404)
    bare.close()
    bare.closeAllConnections()
  })
})
