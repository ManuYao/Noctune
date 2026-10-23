import { createServer, type Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import { createApiHandler } from './http/apiHandler'
import { originAllowed } from './http/origin'
import { registerRoomHandlers, type HandlerOptions, type IoServer, type Realtime } from './registerRoomHandlers'

export interface ServerOptions extends HandlerOptions {
  /** The addresses the site is served from. Requests that say they come from elsewhere are refused. */
  allowedOrigins: readonly string[]
  /** `Secure` on the session cookie: set it whenever the site is served over HTTPS. */
  secureCookies?: boolean
  /** How many reverse proxies stand in front of the server (0: none): the visitor's address comes from X-Forwarded-For. */
  trustedProxies?: number
}

/** The whole server, not yet listening: the accounts API on /api and the realtime connection on /socket.io. */
export function createNoctuneServer(options: ServerOptions): { httpServer: HttpServer; io: IoServer; realtime: Realtime } {
  // The API ends sessions, the realtime side holds the connections they opened: each needs the other, one comes first.
  const sessionEnded: { handler?: (token: string) => void } = {}
  const api = createApiHandler(options.accounts ?? null, {
    allowedOrigins: options.allowedOrigins,
    secureCookies: options.secureCookies ?? false,
    trustedProxies: options.trustedProxies ?? 0,
    onSessionEnded: (token) => sessionEnded.handler?.(token),
  })
  const httpServer = createServer((req, res) => {
    if (api(req, res)) return
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Introuvable')
  })
  const io: IoServer = new Server(httpServer, {
    cors: { origin: [...options.allowedOrigins], credentials: true },
    // The connection carries the session cookie, and browsers do not restrict WebSockets to the site by themselves:
    // without this check, any page on the web could open one as the visitor.
    allowRequest: (req, callback) => {
      if (originAllowed(req.headers, options.allowedOrigins)) callback(null, true)
      else callback('origin not allowed', false)
    },
    // Every payload is tiny (a pseudo, a chat line): refuse anything bigger before parsing it.
    maxHttpBufferSize: 10_000,
  })
  const realtime = registerRoomHandlers(io, options)
  sessionEnded.handler = realtime.endSession
  return { httpServer, io, realtime }
}
