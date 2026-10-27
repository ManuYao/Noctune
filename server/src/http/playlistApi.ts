import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PlaylistError, PlaylistFailure, PlaylistReply } from '../../../shared/protocol'
import type { AccountService } from '../accounts/AccountService'
import { readSessionToken } from '../accounts/sessionToken'
import type { PlaylistService } from '../playlists/PlaylistService'
import { readJson, send } from './apiHandler'
import { originAllowed } from './origin'

const STATUS: Record<PlaylistError, number> = {
  'not-signed-in': 401,
  forbidden: 403,
  'bad-request': 400,
  'no-database': 503,
  'playlist-not-found': 404,
  'track-not-found': 404,
  'invalid-name': 400,
  'name-taken': 409,
  'playlists-full': 409,
  'playlist-full': 409,
  'already-in-playlist': 409,
  'invalid-link': 400,
  // The link is fine, the video is not: not a mistake in the request.
  'not-found': 422,
  'not-embeddable': 422,
  unavailable: 422,
  'not-music': 422,
  'service-unavailable': 503,
  'server-error': 500,
}

export interface PlaylistApiOptions {
  allowedOrigins: readonly string[]
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

interface Route {
  method: Method
  /** Does the request carry a JSON body? */
  body: boolean
  /** Answers 201 instead of 200: something was created. */
  created?: true
  run: (accountId: string, params: string[], body: unknown) => Promise<PlaylistReply<object>>
}

const fail = (error: PlaylistError): PlaylistFailure => ({ ok: false, error })

/**
 * The playlists API, under /api/playlists (the routes are listed in shared/protocol.ts). Returns a handler that answers
 * the requests for these paths and says whether the request was one of them.
 * Every method is checked for where it comes from, as for the accounts API: a page on another site must not be able to
 * use the member's cookie. Without a database (`service` or `accounts` null) every route says so.
 */
export function createPlaylistHandler(service: PlaylistService | null, accounts: AccountService | null, options: PlaylistApiOptions) {
  const ID = '([^/]+)'
  const routes: { pattern: RegExp; routes: Partial<Record<Method, Route>> }[] = service
    ? [
        {
          pattern: /^\/api\/playlists$/,
          routes: {
            GET: { method: 'GET', body: false, run: (account) => service.listPlaylists(account) },
            POST: { method: 'POST', body: true, created: true, run: (account, _p, body) => service.createPlaylist(account, body) },
          },
        },
        {
          pattern: new RegExp(`^/api/playlists/${ID}$`),
          routes: {
            GET: { method: 'GET', body: false, run: (account, [id]) => service.getPlaylist(account, id) },
            PATCH: { method: 'PATCH', body: true, run: (account, [id], body) => service.renamePlaylist(account, id, body) },
            DELETE: { method: 'DELETE', body: false, run: (account, [id]) => service.deletePlaylist(account, id) },
          },
        },
        {
          pattern: new RegExp(`^/api/playlists/${ID}/tracks$`),
          routes: { POST: { method: 'POST', body: true, created: true, run: (account, [id], body) => service.addTrack(account, id, body) } },
        },
        {
          pattern: new RegExp(`^/api/playlists/${ID}/tracks/${ID}$`),
          routes: { DELETE: { method: 'DELETE', body: false, run: (account, [id, track]) => service.removeTrack(account, id, track) } },
        },
        {
          pattern: new RegExp(`^/api/playlists/${ID}/tracks/${ID}/move$`),
          routes: { POST: { method: 'POST', body: true, run: (account, [id, track], body) => service.moveTrack(account, id, track, body) } },
        },
      ]
    : []

  function refused(res: ServerResponse, result: PlaylistFailure) {
    const headers: Record<string, string> = {}
    if (result.error === 'rate-limited') headers['Retry-After'] = String(result.retryAfterSec)
    send(res, result.error === 'rate-limited' ? 429 : STATUS[result.error], result, headers)
  }

  async function handle(req: IncomingMessage, res: ServerResponse, path: string) {
    // Where the request comes from comes first: nothing else is looked at for a request that does not come from the site.
    if (!originAllowed(req.headers, options.allowedOrigins)) return refused(res, fail('forbidden'))
    if (!service || !accounts) return refused(res, fail('no-database'))

    let matched: { route: Route | undefined; params: string[]; allowed: string[] } | undefined
    for (const candidate of routes) {
      const found = candidate.pattern.exec(path)
      if (!found) continue
      // Ids in the path are percent-decoded by hand: a malformed escape is an id that matches nothing, not an error.
      const params = found.slice(1).map((part) => {
        try {
          return decodeURIComponent(part)
        } catch {
          return ''
        }
      })
      matched = { route: candidate.routes[req.method as Method], params, allowed: Object.keys(candidate.routes) }
      break
    }
    if (!matched) {
      send(res, 404, fail('bad-request'))
      return
    }
    if (!matched.route) {
      send(res, 405, fail('bad-request'), { Allow: matched.allowed.join(', ') })
      return
    }

    const account = await accounts.accountForToken(readSessionToken(req.headers.cookie))
    if (!account) return refused(res, fail('not-signed-in'))

    let body: unknown = undefined
    if (matched.route.body) {
      const read = await readJson(req)
      if (!read.ok) {
        const headers: Record<string, string> = read.status === 413 ? { Connection: 'close' } : {}
        send(res, read.status, fail('bad-request'), headers)
        // A body that is too big is not read to the end.
        if (read.status === 413) res.once('finish', () => req.destroy())
        return
      }
      body = read.value
    }

    const result = await matched.route.run(account.id, matched.params, body)
    if (!result.ok) return refused(res, result)
    send(res, matched.route.created ? 201 : 200, result)
  }

  return function handlePlaylists(req: IncomingMessage, res: ServerResponse): boolean {
    const url = req.url ?? ''
    const path = url.split('?')[0]
    if (path !== '/api/playlists' && !path.startsWith('/api/playlists/')) return false
    handle(req, res, path).catch((error: Error) => {
      // What went wrong stays in the log; the member only learns that it was not their doing.
      console.error(`[playlists] ${req.method} ${path} : ${error.message}`)
      if (!res.headersSent) send(res, 500, fail('server-error'))
      else res.end()
    })
    return true
  }
}
