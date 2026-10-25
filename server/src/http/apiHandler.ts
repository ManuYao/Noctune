import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Account, AuthError, AuthResult, SessionResult } from '../../../shared/protocol'
import type { AccountService, Granted, Refusal } from '../accounts/AccountService'
import { clearedSessionCookie, readSessionToken, sessionCookie } from '../accounts/sessionToken'
import { clientIp, originAllowed } from './origin'

// An e-mail, a password, a pseudo and an avatar fit in a small fraction of this.
const MAX_BODY_BYTES = 4096
const BODY_TIMEOUT_MS = 10_000

const STATUS: Record<AuthError, number> = {
  'invalid-email': 400,
  'weak-password': 400,
  'invalid-pseudo': 400,
  'invalid-avatar': 400,
  'email-taken': 409,
  'pseudo-taken': 409,
  'bad-credentials': 401,
  'rate-limited': 429,
  'bad-request': 400,
  forbidden: 403,
  unavailable: 503,
  busy: 503,
  'server-error': 500,
}

export interface ApiOptions {
  allowedOrigins: readonly string[]
  /** `Secure` on the session cookie: set it whenever the site is served over HTTPS. */
  secureCookies: boolean
  /** How many reverse proxies stand in front of the server (0: none): see clientIp. */
  trustedProxies: number
  /**
   * Told when a session ends, by a sign-out or because a new sign-in replaced it: the realtime connections that session
   * opened must not outlive it.
   */
  onSessionEnded?: (token: string) => void
}

export type ReadResult = { ok: true; value: unknown } | { ok: false; status: 400 | 408 | 413 | 415 }

export function readJson(req: IncomingMessage): Promise<ReadResult> {
  if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) return Promise.resolve({ ok: false, status: 415 })
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    let finished = false
    const finish = (result: ReadResult) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve(result)
    }
    const timer = setTimeout(() => finish({ ok: false, status: 408 }), BODY_TIMEOUT_MS)
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) finish({ ok: false, status: 413 })
      else chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        finish({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
      } catch {
        finish({ ok: false, status: 400 })
      }
    })
    req.on('error', () => finish({ ok: false, status: 400 }))
  })
}

export function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    // Who is signed in is never to be kept by a cache.
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  })
  res.end(text)
}

const fail = (error: Exclude<AuthError, 'rate-limited'>): Extract<AuthResult, { ok: false }> => ({ ok: false, error })

/**
 * The accounts API: POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me.
 * Returns a handler that answers the requests under /api/ and says whether the request was one of those.
 * Without a database (`service` is null) visitors keep working: only registering and signing in are unavailable.
 */
export function createApiHandler(service: AccountService | null, options: ApiOptions) {
  const cookieOptions = { secure: options.secureCookies }

  function granted(res: ServerResponse, status: number, result: Granted) {
    const body: AuthResult = { ok: true, account: result.account }
    send(res, status, body, { 'Set-Cookie': sessionCookie(result.token, result.maxAgeSec, cookieOptions) })
  }

  function refused(res: ServerResponse, result: Refusal | Extract<AuthResult, { ok: false }>) {
    const headers: Record<string, string> = {}
    if (result.error === 'rate-limited') headers['Retry-After'] = String(result.retryAfterSec)
    send(res, STATUS[result.error], result, headers)
  }

  async function handleRegisterOrLogin(req: IncomingMessage, res: ServerResponse, action: 'register' | 'login') {
    if (!service) return refused(res, fail('unavailable'))
    const body = await readJson(req)
    if (!body.ok) {
      const headers: Record<string, string> = body.status === 413 ? { Connection: 'close' } : {}
      send(res, body.status, fail('bad-request'), headers)
      // A body that is too big is not read to the end.
      if (body.status === 413) res.once('finish', () => req.destroy())
      return
    }
    const result = await service[action](body.value, clientIp(req, options.trustedProxies))
    if (!result.ok) return refused(res, result)
    // Signing in over a session that is still open replaces it: it is not left behind, valid, for 30 days.
    const previous = readSessionToken(req.headers.cookie)
    if (previous) {
      await service.logout(previous)
      options.onSessionEnded?.(previous)
    }
    granted(res, action === 'register' ? 201 : 200, result)
  }

  async function handleLogout(req: IncomingMessage, res: ServerResponse) {
    const token = readSessionToken(req.headers.cookie)
    await service?.logout(token)
    if (token) options.onSessionEnded?.(token)
    // Idempotent: signing out when nobody is signed in is not an error.
    send(res, 200, { ok: true }, { 'Set-Cookie': clearedSessionCookie(cookieOptions) })
  }

  async function handleMe(req: IncomingMessage, res: ServerResponse) {
    const token = readSessionToken(req.headers.cookie)
    const stored = service ? await service.accountForToken(token) : null
    const account: Account | null = stored && { email: stored.email, pseudo: stored.pseudo, avatarId: stored.avatarId }
    const body: SessionResult = { ok: true, account }
    // A cookie that no longer opens anything (expired, signed out elsewhere) is removed from the browser. Not when the
    // server has no accounts: it then knows nothing, and the cookie may well be good once the database is back.
    send(res, 200, body, token && service && !account ? { 'Set-Cookie': clearedSessionCookie(cookieOptions) } : {})
  }

  const routes: Record<string, { method: 'GET' | 'POST'; run: (req: IncomingMessage, res: ServerResponse) => Promise<void> }> = {
    '/api/auth/register': { method: 'POST', run: (req, res) => handleRegisterOrLogin(req, res, 'register') },
    '/api/auth/login': { method: 'POST', run: (req, res) => handleRegisterOrLogin(req, res, 'login') },
    '/api/auth/logout': { method: 'POST', run: handleLogout },
    '/api/auth/me': { method: 'GET', run: handleMe },
  }

  async function handle(req: IncomingMessage, res: ServerResponse, path: string) {
    const route = Object.hasOwn(routes, path) ? routes[path] : undefined
    if (!route) return send(res, 404, fail('bad-request'))
    if (req.method !== route.method) return send(res, 405, fail('bad-request'), { Allow: route.method })
    if (!originAllowed(req.headers, options.allowedOrigins)) return send(res, 403, fail('forbidden'))
    await route.run(req, res)
  }

  return function handleApi(req: IncomingMessage, res: ServerResponse): boolean {
    const url = req.url ?? ''
    if (!url.startsWith('/api/')) return false
    handle(req, res, url.split('?')[0]).catch((error: Error) => {
      // What went wrong stays in the log; the visitor only learns that it was not their doing.
      console.error(`[api] ${req.method} ${url.split('?')[0]} : ${error.message}`)
      if (!res.headersSent) send(res, 500, fail('server-error'))
      else res.end()
    })
    return true
  }
}
