import { createServer, type Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import type { AccountLifecycle } from './accounts/AccountLifecycle'
import { createApiHandler } from './http/apiHandler'
import { originAllowed } from './http/origin'
import { createPlaylistHandler } from './http/playlistApi'
import { createRoomHandler } from './http/roomApi'
import { PlaylistService, type PlaylistServiceOptions } from './playlists/PlaylistService'
import type { PlaylistStore } from './playlists/PlaylistStore'
import { MemoryRoomStore } from './rooms/MemoryRoomStore'
import { RoomService, type RoomListener, type RoomServiceOptions } from './rooms/RoomService'
import type { RoomStore } from './rooms/RoomStore'
import { registerRoomHandlers, type HandlerOptions, type IoServer, type Realtime } from './registerRoomHandlers'
import { LookupBudget } from './youtube/LookupBudget'

export interface ServerOptions extends HandlerOptions {
  /** The addresses the site is served from. Requests that say they come from elsewhere are refused. */
  allowedOrigins: readonly string[]
  /** `Secure` on the session cookie: set it whenever the site is served over HTTPS. */
  secureCookies?: boolean
  /** How many reverse proxies stand in front of the server (0: none): the visitor's address comes from X-Forwarded-For. */
  trustedProxies?: number
  /** Where members' playlists are kept. Without it (no database) the playlist routes say so. */
  playlistStore?: PlaylistStore | null
  /** Limits and clock of the playlists (tests). */
  playlistOptions?: PlaylistServiceOptions
  /**
   * Where the rooms of members are kept. Without it (no database) only the rooms of the team exist, served from memory,
   * and nobody can make, change or delete a room.
   */
  roomStore?: RoomStore | null
  /** Limits and clock of the rooms (tests). */
  roomOptions?: RoomServiceOptions
}

/**
 * The whole server, not yet listening: the accounts, playlists and rooms APIs on /api and the realtime connection on
 * /socket.io. `playlists` is null without a playlist store.
 */
export function createNoctuneServer(options: ServerOptions): {
  httpServer: HttpServer
  io: IoServer
  realtime: Realtime
  playlists: PlaylistService | null
  rooms: RoomService
} {
  // One budget of YouTube lookups per account, for every door a lookup comes through (a link pasted by a DJ, a playlist
  // being filled): the quota is the whole site's.
  const lookupBudget = new LookupBudget(options.accountLookupBudget)
  const playlists = options.playlistStore
    ? new PlaylistService(options.playlistStore, options.resolver ?? null, lookupBudget, options.playlistOptions)
    : null
  const playlistApi = createPlaylistHandler(playlists, options.accounts ?? null, { allowedOrigins: options.allowedOrigins })

  // The rooms API changes the store, the realtime side holds the live rooms: the listener is filled in once both exist.
  const roomListener: RoomListener = {}
  const roomStore = options.roomStore ?? new MemoryRoomStore()
  const rooms = new RoomService(roomStore, roomListener, options.roomOptions)
  const roomApi = createRoomHandler(rooms, options.accounts ?? null, {
    allowedOrigins: options.allowedOrigins,
    writable: Boolean(options.roomStore) && Boolean(options.accounts),
  })

  // The API ends sessions, the realtime side holds the connections they opened: each needs the other, one comes first.
  const sessionEnded: { handler?: (token: string) => void } = {}
  const live: { realtime?: Realtime } = {}
  // What a change of the member's account means for what lives elsewhere: the rooms and playlists they own, and the live
  // rooms. In the database the deletion of the account takes the rows with it; the memory stores must do the same.
  const lifecycle: AccountLifecycle = {
    hostedRoomIds: async (accountId) => (await roomStore.listByHost(accountId)).map((room) => room.id),
    exportData: async (accountId) => ({
      playlists: playlists ? await playlists.exportOf(accountId) : [],
      rooms: (await roomStore.listByHost(accountId)).map(({ name, description, styles, theme, rules }) => ({
        name,
        description,
        styles: [...styles],
        theme,
        rules: { ...rules },
      })),
    }),
    accountDeleted: async (accountId, hostedRoomIds) => {
      try {
        await roomStore.deleteByHost(accountId)
        await options.playlistStore?.deleteAll(accountId)
      } finally {
        // Whatever the stores did, nothing of the account may stay alive: a store that fails must not leave its rooms
        // open, its connections up and its DJ places taken until the process restarts.
        for (const roomId of hostedRoomIds) live.realtime?.roomDeleted(roomId)
        live.realtime?.endAccount(accountId, { forget: true })
      }
    },
    sessionsEnded: (accountId, exceptSessionKey) => live.realtime?.endAccount(accountId, { exceptSessionKey }),
    profileChanged: async (accountId, pseudo) => {
      await roomStore.renameHost(accountId, pseudo)
      for (const room of await roomStore.listByHost(accountId)) live.realtime?.roomUpdated(room)
    },
  }
  const api = createApiHandler(options.accounts ?? null, {
    allowedOrigins: options.allowedOrigins,
    secureCookies: options.secureCookies ?? false,
    trustedProxies: options.trustedProxies ?? 0,
    onSessionEnded: (token) => sessionEnded.handler?.(token),
    lifecycle,
  })
  const httpServer = createServer((req, res) => {
    if (playlistApi(req, res)) return
    if (roomApi(req, res)) return
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
  const realtime = registerRoomHandlers(io, { ...options, lookupBudget, playlists })
  live.realtime = realtime
  sessionEnded.handler = realtime.endSession
  roomListener.created = realtime.roomCreated
  roomListener.updated = realtime.roomUpdated
  roomListener.deleted = realtime.roomDeleted
  return { httpServer, io, realtime, playlists, rooms }
}
