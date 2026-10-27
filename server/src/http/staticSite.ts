import { createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, sep } from 'node:path'
import { promisify } from 'node:util'
import { brotliCompress, constants as zc, gzip } from 'node:zlib'

const brotli = promisify(brotliCompress)
const gzipAsync = promisify(gzip)

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.svg', '.txt', '.map', '.ico'])
const MAX_COMPRESS_BYTES = 2 * 1024 * 1024
const MAX_CACHE_BYTES = 32 * 1024 * 1024

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
}

function cacheControl(urlPath: string): string {
  if (urlPath.startsWith('/assets/')) return 'public, max-age=31536000, immutable'
  const name = urlPath.slice(urlPath.lastIndexOf('/') + 1)
  if (name === 'index.html' || name === 'sw.js' || name === 'registerSW.js' || /^workbox-.*\.js$/.test(name) || name.startsWith('manifest')) {
    return 'no-cache'
  }
  return 'public, max-age=3600'
}

/** Splits a raw URL path into safe, decoded segments; null when anything looks like an escape attempt or a hidden file. */
export function safeSegments(rawPath: string): string[] | null {
  if (!rawPath.startsWith('/') || rawPath.includes('\\') || rawPath.includes('\0')) return null
  const out: string[] = []
  for (const raw of rawPath.split('/').slice(1)) {
    let part: string
    try {
      part = decodeURIComponent(raw)
    } catch {
      return null
    }
    if (part.includes('/') || part.includes('\\') || part.includes('\0')) return null
    if (part.startsWith('.')) return null // '.', '..', .env, .git...
    if (part !== '') out.push(part)
  }
  return out
}

function plain(res: ServerResponse, status: 404 | 500) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS }).end(status === 404 ? 'Introuvable' : 'Erreur')
}

/**
 * Serves the built site (Vite's dist/). The handler answers true when it dealt with the request and leaves /api and
 * /socket.io alone. Compression: `.br`/`.gz` next to a file when they exist, else in memory (cached, bounded; files over
 * 2 MB and binary types are sent as they are).
 */
export function createStaticHandler(rootDir: string): (req: IncomingMessage, res: ServerResponse) => boolean {
  const cache = new Map<string, Buffer>()
  let cacheBytes = 0
  const rootReal = realpath(rootDir)
  rootReal.catch(() => undefined)

  const send = async (req: IncomingMessage, res: ServerResponse, rawPath: string) => {
    const segments = safeSegments(rawPath)
    if (!segments) return plain(res, 404)
    const root = await rootReal
    let urlPath = '/' + segments.join('/')
    let file = join(root, ...segments)
    let info = await stat(file).catch(() => null)
    if (info?.isDirectory()) info = null
    if (!info) {
      // A missing file with an extension is a 404; anything else is a page of the app.
      if (extname(urlPath) !== '') return plain(res, 404)
      urlPath = '/index.html'
      file = join(root, 'index.html')
      info = await stat(file).catch(() => null)
      if (!info) return plain(res, 404)
    }
    const real = await realpath(file).catch(() => null)
    if (!real || !real.startsWith(root + sep)) return plain(res, 404)

    const ext = extname(file).toLowerCase()
    const accept = String(req.headers['accept-encoding'] ?? '')
    const wants = (name: string) =>
      new RegExp(`(^|[\\s,])${name}\\s*(;|,|$)`, 'i').test(accept) && !new RegExp(`${name}\\s*;\\s*q=0(\\.0*)?\\s*(,|$)`, 'i').test(accept)
    let encoding: 'br' | 'gzip' | null = null
    let source = real
    if (COMPRESSIBLE.has(ext)) {
      if (wants('br') && (await stat(real + '.br').catch(() => null))?.isFile()) {
        encoding = 'br'
        source = real + '.br'
      } else if (wants('gzip') && (await stat(real + '.gz').catch(() => null))?.isFile()) {
        encoding = 'gzip'
        source = real + '.gz'
      } else if (info.size <= MAX_COMPRESS_BYTES && info.size > 256) {
        encoding = wants('br') ? 'br' : wants('gzip') ? 'gzip' : null
      }
    }
    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}${encoding ? '-' + encoding : ''}"`
    const headers: Record<string, string | number> = {
      ...SECURITY_HEADERS,
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': cacheControl(urlPath),
      ETag: etag,
      'Last-Modified': info.mtime.toUTCString(),
      Vary: 'Accept-Encoding',
    }
    const noneMatch = req.headers['if-none-match']
    const since = Date.parse(String(req.headers['if-modified-since'] ?? ''))
    if (noneMatch ? noneMatch.split(',').some((tag) => tag.trim() === etag) : since >= Math.floor(info.mtimeMs / 1000) * 1000) {
      res.writeHead(304, headers).end()
      return
    }
    if (encoding) headers['Content-Encoding'] = encoding

    let body: Buffer | null = null
    if (encoding && source === real) {
      const key = `${real}|${etag}`
      body = cache.get(key) ?? null
      if (!body) {
        const raw = await readFile(real)
        body = encoding === 'br' ? await brotli(raw, { params: { [zc.BROTLI_PARAM_QUALITY]: 5 } }) : await gzipAsync(raw)
        if (cacheBytes + body.length <= MAX_CACHE_BYTES) {
          cache.set(key, body)
          cacheBytes += body.length
        }
      }
    }
    if (body) {
      headers['Content-Length'] = body.length
      res.writeHead(200, headers)
      res.end(req.method === 'HEAD' ? undefined : body)
      return
    }
    headers['Content-Length'] = source === real ? info.size : (await stat(source)).size
    res.writeHead(200, headers)
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    createReadStream(source)
      .on('error', () => res.destroy())
      .pipe(res)
  }

  return (req, res) => {
    const rawPath = (req.url ?? '/').split('?')[0].split('#')[0]
    if (rawPath === '/api' || rawPath.startsWith('/api/') || rawPath === '/socket.io' || rawPath.startsWith('/socket.io/')) return false
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS }).end('Méthode non permise')
      return true
    }
    send(req, res, rawPath).catch(() => {
      if (!res.headersSent) plain(res, 500)
      else res.destroy()
    })
    return true
  }
}
