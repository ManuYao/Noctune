// Starts the whole server (accounts API and realtime connection) on a free port, for the tests that go through
// real HTTP and real sockets. Not a test itself: the test files import it.
import { request, type IncomingHttpHeaders, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { io as connect, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/protocol'
import { AccountService, type AccountServiceOptions } from '../accounts/AccountService'
import type { AccountStore } from '../accounts/AccountStore'
import { MemoryAccountStore } from '../accounts/MemoryAccountStore'
import { createNoctuneServer, type ServerOptions } from '../createServer'
import { MemoryPlaylistStore } from '../playlists/MemoryPlaylistStore'
import type { PlaylistService } from '../playlists/PlaylistService'
import type { PlaylistStore } from '../playlists/PlaylistStore'
import type { IoServer } from '../registerRoomHandlers'
import { MemoryRoomStore } from '../rooms/MemoryRoomStore'
import type { RoomService } from '../rooms/RoomService'
import type { RoomStore } from '../rooms/RoomStore'

export const ORIGIN = 'http://localhost:5173'
const CHEAP_COST = { N: 1024, r: 8, p: 1 }

export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export interface StartOptions extends Partial<Omit<ServerOptions, 'accounts'>> {
  /** Where accounts are kept. Memory by default. */
  store?: AccountStore
  service?: AccountServiceOptions
  /** Start without accounts at all, like a server without DATABASE_URL. */
  withoutAccounts?: boolean
}

export interface Started {
  url: string
  store: AccountStore
  service: AccountService | null
  /** Where the playlists are kept: memory by default (null when started without accounts or with `playlistStore: null`). */
  playlistStore: PlaylistStore | null
  playlists: PlaylistService | null
  /** Where the rooms of members are kept: memory by default (null when started without accounts or with `roomStore: null`). */
  roomStore: RoomStore | null
  rooms: RoomService
  io: IoServer
  httpServer: HttpServer
  /** A connection to the realtime server. `cookie` is what the browser would send along. */
  connect: (extra?: { cookie?: string; origin?: string; headers?: Record<string, string> }) => Promise<TestSocket>
  close: () => Promise<void>
}

export async function startServer(options: StartOptions = {}): Promise<Started> {
  const store = options.store ?? new MemoryAccountStore()
  const service = options.withoutAccounts ? null : new AccountService(store, { cost: CHEAP_COST, ...options.service })
  const playlistStore = options.withoutAccounts ? null : 'playlistStore' in options ? (options.playlistStore ?? null) : new MemoryPlaylistStore()
  const roomStore = options.withoutAccounts ? null : 'roomStore' in options ? (options.roomStore ?? null) : new MemoryRoomStore()
  const { httpServer, io, playlists, rooms } = createNoctuneServer({
    skipProtectedSec: 0,
    lobbyDelayMs: 20,
    queueBroadcastMs: 20,
    // Tests line several tracks up in a row: the allowances between two requests are tested on their own.
    lookupIntervalMs: 0,
    editIntervalMs: 0,
    // Wide open: the allowance of an account has its own tests.
    accountLookupBudget: { burst: 1000, refillMs: 1 },
    ownSkipMinSec: 0,
    allowedOrigins: [ORIGIN],
    ...options,
    accounts: service,
    playlistStore,
    roomStore,
  })
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`

  const sockets: TestSocket[] = []
  async function open({ cookie, origin, headers }: { cookie?: string; origin?: string; headers?: Record<string, string> } = {}): Promise<TestSocket> {
    const extraHeaders: Record<string, string> = { ...headers }
    if (cookie) extraHeaders.cookie = cookie
    if (origin) extraHeaders.origin = origin
    const socket: TestSocket = connect(url, { transports: ['websocket'], extraHeaders, reconnection: false })
    sockets.push(socket)
    await new Promise<void>((resolve, reject) => {
      // A server that never lets a connection in must fail the test that waits for it, not hang it.
      const timer = setTimeout(() => reject(new Error('no connection within 3 s')), 3000)
      socket.once('connect', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.once('connect_error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
    return socket
  }

  return {
    url,
    store,
    service,
    playlistStore,
    playlists,
    roomStore,
    rooms,
    io,
    httpServer,
    connect: open,
    close: async () => {
      for (const socket of sockets) socket.disconnect()
      await io.close()
    },
  }
}

export interface ApiReply {
  status: number
  body: any
  headers: IncomingHttpHeaders
  /** The cookie the server set, as `name=value` (what a browser would send back). */
  cookie: string | undefined
  /** The raw `Set-Cookie` lines. */
  setCookies: string[]
}

/**
 * One call to the accounts API, the way a browser would make it (node:http rather than fetch: a test has to be able
 * to set `Origin` and `Sec-Fetch-Site` itself, which fetch forbids).
 */
export function api(
  base: string,
  path: string,
  init: { method?: string; body?: unknown; rawBody?: string; headers?: Record<string, string>; cookie?: string } = {},
): Promise<ApiReply> {
  const headers: Record<string, string> = { ...init.headers }
  const method = init.method ?? (init.body !== undefined || init.rawBody !== undefined ? 'POST' : 'GET')
  if (init.cookie) headers.cookie = init.cookie
  let body: string | undefined
  if (init.rawBody !== undefined) body = init.rawBody
  else if (init.body !== undefined) {
    body = JSON.stringify(init.body)
    headers['content-type'] ??= 'application/json'
  }
  if (body !== undefined) headers['content-length'] = String(Buffer.byteLength(body))
  if (method !== 'GET' && !('origin' in headers)) headers.origin = ORIGIN
  // An empty one means "send none", like a script that is not a browser.
  if (headers.origin === '') delete headers.origin

  return new Promise((resolve, reject) => {
    const req = request(new URL(path, base), { method, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let parsed: unknown = text
        try {
          parsed = JSON.parse(text)
        } catch {
          // Not JSON (a plain 404, for instance): the test reads the text.
        }
        const setCookies = res.headers['set-cookie'] ?? []
        resolve({ status: res.statusCode ?? 0, body: parsed, headers: res.headers, cookie: setCookies[0]?.split(';')[0], setCookies })
      })
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}
