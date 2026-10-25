import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RoomError, RoomFailure, RoomReply } from '../../../shared/protocol'
import type { AccountService } from '../accounts/AccountService'
import { readSessionToken } from '../accounts/sessionToken'
import type { RoomService } from '../rooms/RoomService'
import { readJson, send } from './apiHandler'
import { originAllowed } from './origin'

const STATUS: Record<RoomError, number> = {
  'not-signed-in': 401,
  forbidden: 403,
  'bad-request': 400,
  'no-database': 503,
  'room-not-found': 404,
  'not-host': 403,
  'invalid-name': 400,
  'name-taken': 409,
  'invalid-description': 400,
  'invalid-styles': 400,
  'invalid-theme': 400,
  'invalid-rules': 400,
  'too-many-rooms': 409,
  'rooms-full': 409,
  'server-error': 500,
}

export interface RoomApiOptions {
  allowedOrigins: readonly string[]
  /** Can rooms be made, changed and deleted? False without a database: reading still works, the rest says why. */
  writable: boolean
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'
type Account = { id: string; pseudo: string }

interface Route {
  /** Needs a signed-in member. A route without it still reads the session, to tell who is asking. */
  member: boolean
  /** Changes something: needs the store to be writable. */
  writes: boolean
  body: boolean
  created?: true
  run: (account: Account | null, params: string[], body: unknown) => Promise<RoomReply<object>>
}

const fail = (error: Exclude<RoomError, never>): RoomFailure => ({ ok: false, error })

/**
 * The rooms API, under /api/rooms (the routes are listed in shared/protocol.ts). Returns a handler that answers the
 * requests for these paths and says whether the request was one of them.
 * Like the accounts and playlists APIs: where the request comes from is checked first, for every method.
 */
export function createRoomHandler(service: RoomService, accounts: AccountService | null, options: RoomApiOptions) {
  const ID = '([^/]+)'
  const routes: { pattern: RegExp; routes: Partial<Record<Method, Route>> }[] = [
    {
      pattern: /^\/api\/rooms$/,
      routes: {
        POST: { member: true, writes: true, body: true, created: true, run: (account, _p, body) => service.create(account!, body) },
      },
    },
    {
      // Before the pattern with an id: "mine" is not the id of a room.
      pattern: /^\/api\/rooms\/mine$/,
      routes: { GET: { member: true, writes: false, body: false, run: (account) => service.mine(account!.id) } },
    },
    {
      pattern: new RegExp(`^/api/rooms/${ID}$`),
      routes: {
        GET: { member: false, writes: false, body: false, run: (account, [id]) => service.get(id, account?.id) },
        PATCH: { member: true, writes: true, body: true, run: (account, [id], body) => service.update(account!.id, id, body) },
        DELETE: { member: true, writes: true, body: false, run: (account, [id]) => service.delete(account!.id, id) },
      },
    },
  ]

  function refused(res: ServerResponse, result: RoomFailure) {
    const headers: Record<string, string> = {}
    if (result.error === 'rate-limited') headers['Retry-After'] = String(result.retryAfterSec)
    send(res, result.error === 'rate-limited' ? 429 : STATUS[result.error], result, headers)
  }

  async function handle(req: IncomingMessage, res: ServerResponse, path: string) {
    // Where the request comes from comes first: nothing else is looked at for a request that does not come from the site.
    if (!originAllowed(req.headers, options.allowedOrigins)) return refused(res, fail('forbidden'))

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
    const route = matched.route
    if (route.writes && !options.writable) return refused(res, fail('no-database'))

    // The session is read for every route: a route that does not need a member still says whether the room is theirs.
    const found = accounts ? await accounts.accountForToken(readSessionToken(req.headers.cookie)) : null
    const account: Account | null = found ? { id: found.id, pseudo: found.pseudo } : null
    if (route.member && !account) return refused(res, fail(accounts ? 'not-signed-in' : 'no-database'))

    let body: unknown = undefined
    if (route.body) {
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

    const result = await route.run(account, matched.params, body)
    if (!result.ok) return refused(res, result)
    send(res, route.created ? 201 : 200, result)
  }

  return function handleRooms(req: IncomingMessage, res: ServerResponse): boolean {
    const url = req.url ?? ''
    const path = url.split('?')[0]
    if (path !== '/api/rooms' && !path.startsWith('/api/rooms/')) return false
    handle(req, res, path).catch((error: Error) => {
      // What went wrong stays in the log; the member only learns that it was not their doing.
      console.error(`[rooms] ${req.method} ${path} : ${error.message}`)
      if (!res.headersSent) send(res, 500, fail('server-error'))
      else res.end()
    })
    return true
  }
}
