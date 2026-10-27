import { randomUUID } from 'node:crypto'
import type { Server } from 'socket.io'
import {
  AVATAR_IDS,
  DJ_INPUT_MAX,
  REPORT_REASONS,
  type AddTrackResult,
  type AvatarId,
  type ClientToServerEvents,
  type DjFailure,
  type DjResult,
  type JoinResult,
  type ModResult,
  type Participant,
  type ReactResult,
  type Report,
  type ReportReason,
  type ReportResult,
  type ServerToClientEvents,
  type TrackStatus,
  type VideoInfo,
} from '../../shared/protocol'
import { isStaffLookalike, normalizePseudo } from '../../shared/validation'
import type { AccountService } from './accounts/AccountService'
import { hashToken, readSessionToken } from './accounts/sessionToken'
import type { ActivityRecorder } from './activity/ActivityRecorder'
import { clientIp } from './http/origin'
import { Lobby, LOBBY_CHANNEL, summarize } from './Lobby'
import { MinInterval } from './MinInterval'
import { excerpt } from './moderation/Moderation'
import { SanctionKeys } from './moderation/SanctionKeys'
import { Room, type RoomOptions } from './Room'
import type { PlaylistService } from './playlists/PlaylistService'
import { seedRooms, type StoredRoom } from './rooms/RoomStore'
import { withTimeout } from './withTimeout'
import { LookupBudget } from './youtube/LookupBudget'
import type { TrackResolver } from './youtube/TrackResolver'

export interface HandlerOptions extends RoomOptions {
  /** How long changes to the list of rooms are gathered before it is sent (tests make it short). */
  lobbyDelayMs?: number
  /** Without it, everybody is a visitor: the server runs without a database. */
  accounts?: AccountService | null
  /** How long knowing who a connection is may take before it comes in as a visitor (tests shorten it). */
  sessionLookupTimeoutMs?: number
  /** Reads the videos DJs paste. Without it, DJs cannot line tracks up: YouTube cannot be asked. */
  resolver?: TrackResolver | null
  /** The longest the server waits for the resolver before it answers that YouTube cannot be read (tests shorten it). */
  resolverTimeoutMs?: number
  /** How long a member waits between two lookups of a video (tests shorten it). */
  lookupIntervalMs?: number
  /** How long a member waits between two edits of their line-up or queue place (tests shorten it). */
  editIntervalMs?: number
  /** Lookups of videos an account may make at once, and the time it takes to earn one more (tests widen it). */
  accountLookupBudget?: { burst?: number; refillMs?: number }
  /** The budget the whole server shares (the playlists API draws on it too). Made here when it is not given. */
  lookupBudget?: LookupBudget
  /** Where a member's own playlists are read from, to line one of their tracks up. Null without a database. */
  playlists?: PlaylistService | null
  /** The rooms that exist when the server starts: the rooms of the team and, with a database, those of the members. */
  initialRooms?: StoredRoom[]
  /** How many reverse proxies stand in front of the server: the address of a visitor (what their sanctions stick to) comes from it. */
  trustedProxies?: number
  /** Counts what members do (profile and badges). Null or absent: nothing is counted. */
  activityRecorder?: ActivityRecorder | null
}

interface SocketData {
  /** The member behind the session cookie the connection was opened with. Absent for a visitor. */
  account?: { id: string; pseudo: string; avatarId: AvatarId }
  /** Which session that was (a hash of its token), to close the connection when the session ends. */
  sessionKey?: string
  /** What this connection's sanctions stick to: the account of a member, a keyed hash of the address of a visitor. */
  sanctionKey?: string
  roomId?: string
  participantId?: string
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

/** What the rest of the server may ask of the realtime side. */
export interface Realtime {
  /** Closes the connections opened with this session. The page opens new ones, as a visitor. */
  endSession: (token: string) => void
  /**
   * Cuts the connections of an account: all of them, or all but those opened with the session whose key is given (the one
   * that just changed the password). With `forget`, the account is gone for good: its places are taken out of every DJ queue
   * too, whether it was present or not.
   */
  endAccount: (accountId: string, options?: { exceptSessionKey?: string; forget?: boolean }) => void
  /** A host made a room: it can be joined, and the list shows it. */
  roomCreated: (room: StoredRoom) => void
  /** A host changed a room: the people in it are told, the list is updated, the new rules count from now on. */
  roomUpdated: (room: StoredRoom) => void
  /**
   * A host deleted a room: everybody in it is told and put out, nothing of it is left running.
   * The deletion of an ACCOUNT that hosts rooms takes their rooms out of the database with it (ON DELETE CASCADE): the
   * account lifecycle (createServer.ts) calls this for each of them, or the live rooms would outlive their host.
   */
  roomDeleted: (id: string) => void
  /** The name of a room that is open now, or undefined (never opened, or deleted). */
  openRoomName: (id: string) => string | undefined
}

// A connection that asks to join more often than this is a script: each join may cost a database round trip.
const JOIN_MIN_INTERVAL_MS = 300
// Knowing who a connection is must not hold it up for longer than this: past it, it comes in as a visitor.
const SESSION_LOOKUP_TIMEOUT_MS = 3000
// A member looks up one video a second, one at a time: each lookup can use up some of the YouTube quota.
const DJ_LOOKUP_MIN_INTERVAL_MS = 1000
// The resolver has its own, shorter timeout; this one only keeps a resolver that never answers from blocking a member.
const RESOLVER_TIMEOUT_MS = 8000
// Taking a track out or leaving the queue costs nothing, but every change is something the room is told about.
const DJ_EDIT_MIN_INTERVAL_MS = 300
// Track ids are UUIDs: anything much longer is not one.
const TRACK_ID_MAX_LENGTH = 100
// The YouTube quota is one for the whole site, and a limit per connection does not protect it: each account has a budget
// of its own (see LookupBudget), whatever the number of its connections.

/** A video found for a DJ (read from a link, or from their own playlist), or why it was not. */
type FoundVideo = { ok: true; video: VideoInfo } | DjFailure

function isAvatarId(value: unknown): value is AvatarId {
  return (AVATAR_IDS as readonly unknown[]).includes(value)
}

export function registerRoomHandlers(io: IoServer, options: HandlerOptions = {}): Realtime {
  // The live rooms, and what the store says about each (its texts, its host). The order of arrival is the order of the list.
  const rooms = new Map<string, Room>()
  const stored = new Map<string, StoredRoom>()
  // The list shows how many people are in each room and what plays: both are read from the rooms when sent.
  const lobby = new Lobby(
    () =>
      [...stored.values()].flatMap((def) => {
        const room = rooms.get(def.id)
        return room ? [summarize(def, room)] : []
      }),
    (list) => io.to(LOBBY_CHANNEL).emit('lobby:rooms', list),
    options.lobbyDelayMs,
  )

  function openRoom(def: StoredRoom) {
    stored.set(def.id, def)
    rooms.set(
      def.id,
      new Room(
        def.id,
        def.name,
        {
          onTrackChange: (track, reactions, queue) => {
            io.to(def.id).emit('room:track', track, reactions, queue)
            lobby.changed()
          },
          onReactionsChange: (reactions) => io.to(def.id).emit('track:reactions', reactions),
          onQueueChange: (queue) => {
            io.to(def.id).emit('dj:queue', queue)
            lobby.changed() // the list shows how many DJs there are
          },
          // Private to one DJ: each connection sits in a channel named after its participant id (see the join).
          onLineupChange: (participantId, lineup) => io.to(participantId).emit('dj:lineup', lineup),
          onNotice: (participantId, notice) => io.to(participantId).emit('dj:notice', notice),
        },
        {
          ...options,
          rules: options.rules ?? def.rules,
          // Read from the live record at each event: the host may change the styles of the room while it lives.
          activity: options.activityRecorder?.forRoom({
            id: def.id,
            styles: () => stored.get(def.id)?.styles ?? def.styles,
            hostAccountId: () => stored.get(def.id)?.hostAccountId ?? null,
          }),
        },
      ),
    )
  }

  for (const def of options.initialRooms ?? seedRooms()) openRoom(def)

  const sanctionKeys = new SanctionKeys()
  // The host is told of new reports a few times a second at most, like the other pushes.
  const REPORTS_PUSH_MS = 250
  const reportTimers = new Map<string, NodeJS.Timeout>()

  /** The inbox goes to the host's connection only, once for any number of reports filed just before. */
  function pushReports(room: Room) {
    if (reportTimers.has(room.id)) return
    reportTimers.set(
      room.id,
      setTimeout(() => {
        reportTimers.delete(room.id)
        const hostAccount = stored.get(room.id)?.hostAccountId
        const host = hostAccount ? room.participantIdOf(hostAccount) : undefined
        if (host) io.to(host).emit('mod:reports', room.moderation.list(Date.now()))
      }, REPORTS_PUSH_MS),
    )
  }

  /** The host excluded somebody: they are told, then they are out of the room as if they had left (and their DJ place goes). */
  function evict(room: Room, participantId: string) {
    const accountId = room.accountIdOf(participantId)
    for (const socketId of [...(io.sockets.adapter.rooms.get(participantId) ?? [])]) {
      const socket = io.sockets.sockets.get(socketId)
      if (!socket) continue
      socket.emit('room:excluded')
      socket.leave(room.id)
      socket.leave(participantId)
      // Their connection forgets the room, so that nothing they send afterwards is taken for a word said in it.
      socket.data.roomId = undefined
      socket.data.participantId = undefined
    }
    if (room.remove(participantId)) {
      io.to(room.id).emit('room:participant-left', participantId)
      lobby.changed()
    }
    // An excluded member does not keep a place in the queue (on the decks, their track is cut).
    if (accountId) room.forgetAccount(accountId)
  }

  const accounts = options.accounts ?? null
  const resolver = options.resolver ?? null

  const playlists = options.playlists ?? null
  const lookupBudget = options.lookupBudget ?? new LookupBudget(options.accountLookupBudget)

  // Who is behind a connection is decided once, when it opens, from the session cookie of the handshake.
  // (Signing in or out on the page therefore reopens the connection.)
  io.use(async (socket, next) => {
    try {
      const token = readSessionToken(socket.handshake.headers.cookie)
      const account = token && accounts ? await withTimeout(accounts.accountForToken(token), options.sessionLookupTimeoutMs ?? SESSION_LOOKUP_TIMEOUT_MS) : null
      if (token && account) {
        socket.data.account = { id: account.id, pseudo: account.pseudo, avatarId: account.avatarId }
        socket.data.sessionKey = hashToken(token).toString('hex')
      }
    } catch (error) {
      // A database that does not answer must not keep people out of the rooms: they come in as visitors.
      console.error(`[auth] session non lue : ${(error as Error).message}`)
    }
    next()
  })

  /** Same answer as the database would give, except that a database in trouble means "free": the rooms stay open. */
  async function isReserved(pseudo: string): Promise<boolean> {
    if (!accounts) return false
    try {
      return await accounts.isPseudoReserved(pseudo)
    } catch (error) {
      console.error(`[auth] pseudo non vérifié : ${(error as Error).message}`)
      return false
    }
  }

  io.on('connection', (socket) => {
    const joinLimit = new MinInterval(JOIN_MIN_INTERVAL_MS)
    // Learned once, as the account is: a member is sanctioned by account, a visitor by their address.
    socket.data.sanctionKey = socket.data.account
      ? sanctionKeys.member(socket.data.account.id)
      : sanctionKeys.visitor(clientIp(socket.request, options.trustedProxies ?? 0))

    // Joining may wait for the database. What the same connection asks next (leave, join again, disconnect) waits for
    // its turn, so that a late join can never land after the leave that was meant to cancel it. With nothing waiting,
    // a task runs at once, in the very turn the event arrived: events of one connection keep their order.
    let last: Promise<void> | null = null
    const inOrder = (task: () => void | Promise<void>) => {
      const failed = (error: Error) => console.error(`[salle] ${error.message}`)
      let queued: Promise<void>
      if (last === null) {
        let result: void | Promise<void>
        try {
          result = task()
        } catch (error) {
          return failed(error as Error)
        }
        if (!(result instanceof Promise)) return
        queued = result
      } else {
        queued = last.then(task)
      }
      const mine: Promise<void> = queued.catch(failed).finally(() => {
        if (last === mine) last = null
      })
      last = mine
    }

    /** Like and skip vote share the same checks: in a room, a real boolean, then the room's own rules. */
    function react(
      payload: unknown,
      ack: unknown,
      action: (room: Room, participantId: string, value: boolean) => ReactResult,
    ) {
      if (typeof ack !== 'function') return
      const { roomId, participantId } = socket.data
      const room = roomId ? rooms.get(roomId) : undefined
      if (!room || !participantId) return ack({ ok: false, error: 'not-in-room' })
      const value = (payload as { value?: unknown } | null | undefined)?.value
      if (typeof value !== 'boolean') return ack({ ok: false, error: 'invalid' })
      ack(action(room, participantId, value))
    }

    // Looking a video up can use YouTube quota: one every second, and never two at once.
    const lookupInterval = options.lookupIntervalMs ?? DJ_LOOKUP_MIN_INTERVAL_MS
    const lookupLimit = new MinInterval(lookupInterval)
    let lookupPending = false
    const editLimit = new MinInterval(options.editIntervalMs ?? DJ_EDIT_MIN_INTERVAL_MS)
    // Lining up a track of the member's own playlist, and asking the room's verdict on a playlist, are read from what is
    // kept: no quota used. Each has its own light allowance, so that one does not make the other wait.
    const playlistAddLimit = new MinInterval(options.editIntervalMs ?? DJ_EDIT_MIN_INTERVAL_MS)
    const statusLimit = new MinInterval(options.editIntervalMs ?? DJ_EDIT_MIN_INTERVAL_MS)

    /** The room and participant this connection stands for, or null: a DJ request before (or after) a room. */
    function here(): { room: Room; participantId: string } | null {
      const { roomId, participantId } = socket.data
      const room = roomId ? rooms.get(roomId) : undefined
      return room && participantId ? { room, participantId } : null
    }

    /** Whatever goes wrong in a DJ request is the member's answer, not a crash of the server. */
    function guarded(ack: (failure: DjFailure) => void, work: () => void) {
      try {
        work()
      } catch (error) {
        console.error(`[dj] ${(error as Error).message}`)
        ack({ ok: false, error: 'server-error' })
      }
    }

    function leave() {
      const { roomId, participantId } = socket.data
      if (!roomId || !participantId) return
      socket.leave(roomId)
      socket.leave(participantId)
      socket.data.roomId = undefined
      socket.data.participantId = undefined
      if (rooms.get(roomId)?.remove(participantId)) {
        socket.to(roomId).emit('room:participant-left', participantId)
        lobby.changed()
      }
    }

    // Following the list of rooms needs no pseudo and no room: it is public.
    socket.on('lobby:join', (ack) => {
      if (typeof ack !== 'function') return
      socket.join(LOBBY_CHANNEL)
      ack(lobby.snapshot())
    })
    socket.on('lobby:leave', () => {
      socket.leave(LOBBY_CHANNEL)
    })

    socket.on('room:join', (payload, ack) => {
      if (typeof ack !== 'function') return
      const now = Date.now()
      if (joinLimit.waitTime('join', now) > 0) return ack({ ok: false, error: 'rate-limited' })
      joinLimit.record('join', now)
      inOrder(async () => {
        const reply = (result: JoinResult) => ack(result)

        try {
          // Never trust the client: the payload shape and every value are checked here.
          const room = typeof payload?.roomId === 'string' ? rooms.get(payload.roomId) : undefined
          if (!room) return reply({ ok: false, error: 'unknown-room' })
          // Excluded by the host: before anything that could cost a database round trip.
          const key = socket.data.sanctionKey
          if (key && room.moderation.excludedFor(key, Date.now()) > 0) return reply({ ok: false, error: 'excluded' })

          // A member comes in as themself: the pseudo and the avatar the page sends only matter to a visitor.
          const account = socket.data.account
          let pseudo: string
          let avatarId: AvatarId
          if (account) {
            ;({ pseudo, avatarId } = account)
          } else {
            const chosen = normalizePseudo(payload.pseudo)
            if (!chosen) return reply({ ok: false, error: 'invalid-pseudo' })
            if (!isAvatarId(payload.avatarId)) return reply({ ok: false, error: 'invalid-avatar' })
            pseudo = chosen
            avatarId = payload.avatarId
            // A member's pseudo is theirs alone: nobody else can pass for them. Nor can anybody pass for the team.
            if (isStaffLookalike(pseudo) || (await isReserved(pseudo))) return reply({ ok: false, error: 'pseudo-reserved' })
            // Gone while the database was being asked: there is nobody to let in.
            if (socket.disconnected) return
          }

          // Deleted by its host while the database was being asked (or replaced: never a room that is no longer the live one).
          if (rooms.get(room.id) !== room || room.isClosed) return reply({ ok: false, error: 'unknown-room' })
          // Excluded while the database was being asked (another device of the same member, for instance).
          if (key && room.moderation.excludedFor(key, Date.now()) > 0) return reply({ ok: false, error: 'excluded' })

          leave()
          if (account && room.hasAccount(account.id)) return reply({ ok: false, error: 'already-in-room' })
          if (room.isPseudoTaken(pseudo)) return reply({ ok: false, error: 'pseudo-taken' })

          const participant: Participant = { id: randomUUID(), pseudo, avatarId, member: account !== undefined }
          // Joined before the room hears of the newcomer, so that what is said to them alone while they arrive
          // (a notice about their place in the queue) is not lost. Participant ids are UUIDs: they cannot clash
          // with a room id (a slug) or with the list of rooms (#lobby).
          socket.join(participant.id)
          try {
            room.add(participant, account?.id, key)
          } catch (error) {
            // Half in is worse than out: the account would be "already in the room" until the server restarts.
            socket.leave(participant.id)
            room.remove(participant.id)
            throw error
          }
          socket.data.roomId = room.id
          socket.data.participantId = participant.id
          socket.join(room.id)
          socket.to(room.id).emit('room:participant-joined', participant)
          lobby.changed()

          const def = stored.get(room.id)
          // From the account of the connection and the host of the room, never from what the page says.
          const isHost = account !== undefined && def?.hostAccountId != null && def.hostAccountId === account.id
          reply({
            ok: true,
            snapshot: {
              roomId: room.id,
              name: room.name,
              selfId: participant.id,
              participants: room.list(),
              nowPlaying: room.nowPlaying,
              reactions: room.reactions(),
              mine: room.mine(participant.id),
              rules: room.rules,
              description: def?.description ?? '',
              styles: def ? [...def.styles] : [],
              theme: def?.theme ?? 'neon',
              host: def?.hostPseudo ?? null,
              isHost,
              // Only the host is given the inbox.
              reports: isHost ? room.moderation.list(Date.now()) : [],
              queue: room.queueView(),
              lineup: room.lineupOf(participant.id),
              chat: room.chat.recent(),
              serverTime: Date.now(),
            },
          })
        } catch (error) {
          // Whatever it was, the page must not be left waiting for an answer that will never come.
          console.error(`[salle] entrée impossible : ${(error as Error).message}`)
          reply({ ok: false, error: 'server-error' })
        }
      })
    })

    socket.on('track:like', (payload, ack) => react(payload, ack, (room, id, value) => room.like(id, value)))
    socket.on('track:skip', (payload, ack) => react(payload, ack, (room, id, value) => room.voteSkip(id, value)))

    /** Takes a turn from an allowance of one request every so often. Null: go ahead. */
    function limitedBy(limit: MinInterval): Extract<DjFailure, { error: 'rate-limited' }> | null {
      const now = Date.now()
      const wait = limit.waitTime('edit', now)
      if (wait > 0) return { ok: false, error: 'rate-limited', retryAfterMs: wait }
      limit.record('edit', now)
      return null
    }

    /** Taking a track out or leaving the queue. */
    const editLimited = () => limitedBy(editLimit)

    /**
     * Finds the video, then lines it up. `find` is what differs (a link read at YouTube, or a track of the member's own
     * playlist); what follows is the same: time has passed while it was found, so the member may have left, or moved to
     * another room (as another participant), and the queue, the line-up and the history may have changed. The room checks
     * all of it again, in the same breath as the change, so that the answer lands only where and when it still holds.
     */
    async function lineUp(find: () => Promise<FoundVideo>, room: Room, participantId: string, timeoutMs: number): Promise<AddTrackResult> {
      let found: FoundVideo
      try {
        found = await withTimeout(find(), timeoutMs)
      } catch (error) {
        console.error(`[dj] vidéo non lue : ${(error as Error).message}`)
        found = { ok: false, error: 'service-unavailable' }
      }
      if (!found.ok) return found
      return room.addTrack(participantId, found.video)
    }

    socket.on('dj:add', (payload, ack) => {
      if (typeof ack !== 'function') return
      guarded(ack, () => {
        const where = here()
        if (!where) return ack({ ok: false, error: 'not-in-room' })
        const { room, participantId } = where

        // In this order: who asks (from what the server knows, not from what the page says), what they ask, how often,
        // and what can be refused without asking YouTube at all.
        const notMember = room.memberError(participantId)
        if (notMember) return ack(notMember)

        // Exactly one of the two: a link (or a video id), or a track of the member's own playlist.
        const body = payload as { input?: unknown; playlistTrackId?: unknown } | null | undefined
        const input = body?.input
        const trackId = body?.playlistTrackId
        if ((input === undefined) === (trackId === undefined)) return ack({ ok: false, error: 'invalid' })
        if (input !== undefined && (typeof input !== 'string' || input.length < 1 || input.length > DJ_INPUT_MAX)) {
          return ack({ ok: false, error: 'invalid' })
        }
        if (trackId !== undefined && (typeof trackId !== 'string' || trackId.length < 1 || trackId.length > TRACK_ID_MAX_LENGTH)) {
          return ack({ ok: false, error: 'invalid' })
        }

        const now = Date.now()
        // A link is read at YouTube: one at a time, one a second, because the quota is the whole site's. A track of the
        // member's own playlist is read from what is kept (YouTube is only asked when it is getting old, and the account's
        // budget pays for that): it only has the lighter allowance of the other edits.
        const fromLink = typeof input === 'string'
        if (fromLink) {
          const wait = lookupLimit.waitTime('lookup', now)
          if (lookupPending || wait > 0) {
            // A lookup still being answered: come back in a moment, there is no telling how long it will take.
            const retryAfterMs = lookupPending ? Math.max(wait, DJ_LOOKUP_MIN_INTERVAL_MS) : wait
            return ack({ ok: false, error: 'rate-limited', retryAfterMs })
          }
          // Counted when the request arrives, not when the answer comes: requests cannot pile up behind a slow answer.
          lookupLimit.record('lookup', now)
        } else {
          const limited = limitedBy(playlistAddLimit)
          if (limited) return ack(limited)
        }

        const unplaceable = room.placeError(participantId)
        if (unplaceable) return ack(unplaceable)

        const accountId = socket.data.account?.id
        if (!accountId) return ack({ ok: false, error: 'members-only' })

        let find: () => Promise<FoundVideo>
        let timeoutMs = options.resolverTimeoutMs ?? RESOLVER_TIMEOUT_MS
        if (typeof input === 'string') {
          if (!resolver) return ack({ ok: false, error: 'service-unavailable' })
          // Only a lookup that will really ask YouTube is charged to the account's budget.
          const accountWait = lookupBudget.take(accountId, now)
          if (accountWait > 0) return ack({ ok: false, error: 'rate-limited', retryAfterMs: accountWait })
          find = async () => {
            const read = await resolver.resolve(input)
            return read.ok ? read : { ok: false, error: read.error }
          }
        } else {
          if (!playlists) return ack({ ok: false, error: 'service-unavailable' })
          const wanted = trackId as string
          // From what is kept: nothing to pay at YouTube unless the track is getting old (the service charges the budget then).
          // A little longer than a lookup: the database is read first.
          timeoutMs += 4000
          find = async () => {
            const read = await playlists.videoForDj(accountId, wanted)
            if (read.ok) return read
            return read.error === 'rate-limited' ? { ok: false, error: 'rate-limited', retryAfterMs: read.retryAfterMs } : { ok: false, error: read.error }
          }
        }

        if (fromLink) lookupPending = true
        lineUp(find, room, participantId, timeoutMs)
          .then(
            (result) => ack(result),
            (error: Error) => {
              console.error(`[dj] ${error.message}`)
              ack({ ok: false, error: 'server-error' })
            },
          )
          .finally(() => {
            if (fromLink) lookupPending = false
          })
      })
    })

    // For each track of one of the member's playlists: would the room take it now? From what is kept, no call to YouTube.
    socket.on('dj:playlist-status', (payload, ack) => {
      if (typeof ack !== 'function') return
      guarded(ack, () => {
        const where = here()
        if (!where) return ack({ ok: false, error: 'not-in-room' })
        const { room, participantId } = where
        const notMember = room.memberError(participantId)
        if (notMember) return ack(notMember)

        const playlistId = (payload as { playlistId?: unknown } | null | undefined)?.playlistId
        if (typeof playlistId !== 'string' || playlistId.length < 1 || playlistId.length > TRACK_ID_MAX_LENGTH) {
          return ack({ ok: false, error: 'invalid' })
        }
        const accountId = socket.data.account?.id
        if (!accountId) return ack({ ok: false, error: 'members-only' })
        if (!playlists) return ack({ ok: false, error: 'service-unavailable' })
        const limited = limitedBy(statusLimit)
        if (limited) return ack(limited)

        playlists.tracksOf(accountId, playlistId).then(
          (tracks) => {
            // Not the member's, or not there: the same answer, whichever it was.
            if (!tracks) return ack({ ok: false, error: 'invalid' })
            const now = Date.now()
            const statuses: Record<string, TrackStatus> = {}
            for (const track of tracks) {
              statuses[track.id] =
                track.unavailable
                  ? { state: 'unavailable' }
                  // A length too old to rely on is not judged: the room looks again when the track is lined up.
                  : track.durationSec === null
                    ? { state: 'ok' }
                    : room.statusOf({ videoId: track.videoId, durationSec: track.durationSec }, now)
            }
            ack({ ok: true, statuses })
          },
          (error: Error) => {
            console.error(`[dj] ${error.message}`)
            ack({ ok: false, error: 'server-error' })
          },
        )
      })
    })

    socket.on('dj:remove', (payload, ack) => {
      if (typeof ack !== 'function') return
      guarded(ack, () => {
        const where = here()
        if (!where) return ack({ ok: false, error: 'not-in-room' })
        const { room, participantId } = where
        const notMember = room.memberError(participantId)
        if (notMember) return ack(notMember)

        const trackId = (payload as { trackId?: unknown } | null | undefined)?.trackId
        if (typeof trackId !== 'string' || trackId.length < 1 || trackId.length > TRACK_ID_MAX_LENGTH) {
          return ack({ ok: false, error: 'invalid' })
        }
        const limited = editLimited()
        if (limited) return ack(limited)
        ack(room.removeTrack(participantId, trackId))
      })
    })

    socket.on('dj:leave', (ack) => {
      if (typeof ack !== 'function') return
      guarded(ack, () => {
        const where = here()
        if (!where) return ack({ ok: false, error: 'not-in-room' })
        const { room, participantId } = where
        const notMember = room.memberError(participantId)
        if (notMember) return ack(notMember)

        const limited = editLimited()
        if (limited) return ack(limited)
        ack(room.leaveQueue(participantId))
      })
    })

    // ---- Reports and moderation. Reports and the host's acts share a light allowance of their own.
    const modLimit = new MinInterval(options.editIntervalMs ?? DJ_EDIT_MIN_INTERVAL_MS)
    const isId = (value: unknown): value is string =>
      typeof value === 'string' && value.length >= 1 && value.length <= TRACK_ID_MAX_LENGTH

    socket.on('report:create', (payload, ack) => {
      if (typeof ack !== 'function') return
      const answer = (result: ReportResult) => ack(result)
      try {
        const where = here()
        if (!where || !where.room.get(where.participantId)) return answer({ ok: false, error: 'not-in-room' })
        const { room, participantId } = where

        const body = payload as { target?: unknown; reason?: unknown } | null | undefined
        const reason = body?.reason
        const target = body?.target as { kind?: unknown; messageId?: unknown; entryId?: unknown; trackId?: unknown } | null | undefined
        if (typeof reason !== 'string' || !(REPORT_REASONS as readonly string[]).includes(reason)) return answer({ ok: false, error: 'invalid' })
        if (!target || typeof target !== 'object') return answer({ ok: false, error: 'invalid' })
        const limited = limitedBy(modLimit)
        if (limited) return answer(limited)

        // One person, one allowance, whatever the number of their connections (a member by account, a visitor by address).
        const reporter = socket.data.sanctionKey ?? participantId
        const now = Date.now()
        const wait = room.moderation.reportWait(reporter, now)
        if (wait > 0) return answer({ ok: false, error: 'rate-limited', retryAfterMs: wait })

        // What is reported must be there, in this room, now: found by the server, never taken from the page.
        let info: Report['target']
        let targetKey: string
        if (target.kind === 'chat') {
          if (!isId(target.messageId)) return answer({ ok: false, error: 'invalid' })
          const message = room.chat.recent().find((candidate) => candidate.id === target.messageId)
          if (!message) return answer({ ok: false, error: 'no-such-target' })
          if (message.authorId === participantId) return answer({ ok: false, error: 'own-target' })
          info = { kind: 'chat', messageId: message.id, participantId: message.authorId, pseudo: message.pseudo, text: excerpt(message.text) }
          targetKey = `chat:${message.id}`
        } else if (target.kind === 'track') {
          if (!isId(target.entryId) || !isId(target.trackId)) return answer({ ok: false, error: 'invalid' })
          const found = room.queuedTrack(target.entryId, target.trackId)
          if (!found) return answer({ ok: false, error: 'no-such-target' })
          if (found.accountId === room.accountIdOf(participantId)) return answer({ ok: false, error: 'own-target' })
          info = { kind: 'track', entryId: target.entryId, trackId: target.trackId, pseudo: found.pseudo, title: found.title }
          targetKey = `track:${target.trackId}`
        } else {
          return answer({ ok: false, error: 'invalid' })
        }

        const filed = room.moderation.file(reporter, targetKey, reason as ReportReason, info, now)
        if (!filed.ok) return answer({ ok: false, error: filed.error })

        if (stored.get(room.id)?.hostAccountId == null) {
          // A room of the team has no host: the team reads its log. Never the text of a message, only what it is about.
          if (filed.created) console.log(`[signalement] room=${room.id} motif=${reason} cible=${info.kind} pseudo=${info.pseudo}`)
          return answer({ ok: true, toHost: false })
        }
        pushReports(room)
        answer({ ok: true, toHost: true })
      } catch (error) {
        console.error(`[signalement] ${(error as Error).message}`)
        answer({ ok: false, error: 'server-error' })
      }
    })

    /** The room and participant of a host's request, or the refusal already given: only the host of THIS room acts. */
    function asHost(ack: (result: ModResult) => void): { room: Room; participantId: string } | null {
      const where = here()
      if (!where) {
        ack({ ok: false, error: 'not-in-room' })
        return null
      }
      const account = socket.data.account
      const hostAccount = stored.get(where.room.id)?.hostAccountId
      // From the account of the connection and the host of the room, never from what the page says.
      if (!account || !hostAccount || hostAccount !== account.id || where.room.participantIdOf(account.id) !== where.participantId) {
        ack({ ok: false, error: 'not-host' })
        return null
      }
      return where
    }

    /** What every act of a host goes through: the light allowance, then the host's own, counted once it is taken. */
    function actAllowed(room: Room, participantId: string): Extract<ModResult, { error: 'rate-limited' }> | null {
      const limited = limitedBy(modLimit)
      if (limited) return limited
      const hostKey = socket.data.sanctionKey ?? participantId
      const wait = room.moderation.actionWait(hostKey, Date.now())
      if (wait > 0) return { ok: false, error: 'rate-limited', retryAfterMs: wait }
      return null
    }

    socket.on('mod:act', (payload, ack) => {
      if (typeof ack !== 'function') return
      const answer = (result: ModResult) => ack(result)
      try {
        const host = asHost(answer)
        if (!host) return
        const { room, participantId } = host
        const body = payload as { action?: unknown; participantId?: unknown; reportId?: unknown } | null | undefined
        const action = body?.action
        const targetId = body?.participantId
        const reportId = body?.reportId
        if ((action !== 'warn' && action !== 'mute' && action !== 'exclude') || !isId(targetId) || (reportId !== undefined && !isId(reportId))) {
          return answer({ ok: false, error: 'invalid' })
        }
        const refused = actAllowed(room, participantId)
        if (refused) return answer(refused)

        // The target is found in THIS room, by the server, and is not the host.
        if (targetId === participantId) return answer({ ok: false, error: 'self' })
        if (!room.get(targetId)) return answer({ ok: false, error: 'no-such-person' })
        const targetAccount = room.accountIdOf(targetId)
        if (targetAccount !== undefined && targetAccount === room.accountIdOf(participantId)) return answer({ ok: false, error: 'self' })
        if (reportId !== undefined && !room.moderation.has(reportId)) return answer({ ok: false, error: 'no-such-report' })
        const key = room.sanctionKeyOf(targetId)
        if (!key) return answer({ ok: false, error: 'server-error' })

        const now = Date.now()
        room.moderation.recordAction(socket.data.sanctionKey ?? participantId, now)
        let warnings: number | undefined
        if (action === 'warn') {
          warnings = room.moderation.warn(key, now)
          io.to(targetId).emit('mod:notice', { kind: 'warning' })
        } else if (action === 'mute') {
          const retryAfterMs = room.moderation.mute(key, now)
          io.to(targetId).emit('mod:notice', { kind: 'muted', retryAfterMs })
        } else {
          room.moderation.exclude(key, now)
          evict(room, targetId)
        }
        if (reportId !== undefined) {
          room.moderation.resolve(reportId)
          pushReports(room)
        }
        answer(warnings === undefined ? { ok: true } : { ok: true, warnings })
      } catch (error) {
        console.error(`[modération] ${(error as Error).message}`)
        answer({ ok: false, error: 'server-error' })
      }
    })

    socket.on('mod:remove-track', (payload, ack) => {
      if (typeof ack !== 'function') return
      const answer = (result: ModResult) => ack(result)
      try {
        const host = asHost(answer)
        if (!host) return
        const { room, participantId } = host
        const body = payload as { entryId?: unknown; trackId?: unknown; reportId?: unknown } | null | undefined
        if (!isId(body?.entryId) || !isId(body?.trackId) || (body?.reportId !== undefined && !isId(body.reportId))) {
          return answer({ ok: false, error: 'invalid' })
        }
        const refused = actAllowed(room, participantId)
        if (refused) return answer(refused)
        const reportId = body.reportId as string | undefined
        if (reportId !== undefined && !room.moderation.has(reportId)) return answer({ ok: false, error: 'no-such-report' })

        const removed = room.removeQueuedTrack(body.entryId, body.trackId)
        if (!removed.ok) return answer({ ok: false, error: 'no-such-track' })
        room.moderation.recordAction(socket.data.sanctionKey ?? participantId, Date.now())
        const owner = room.participantIdOf(removed.accountId)
        if (owner) io.to(owner).emit('mod:notice', { kind: 'track-removed', title: removed.title })
        if (reportId !== undefined) {
          room.moderation.resolve(reportId)
          pushReports(room)
        }
        answer({ ok: true })
      } catch (error) {
        console.error(`[modération] ${(error as Error).message}`)
        answer({ ok: false, error: 'server-error' })
      }
    })

    socket.on('mod:dismiss', (payload, ack) => {
      if (typeof ack !== 'function') return
      const answer = (result: ModResult) => ack(result)
      try {
        const host = asHost(answer)
        if (!host) return
        const { room, participantId } = host
        const reportId = (payload as { reportId?: unknown } | null | undefined)?.reportId
        if (!isId(reportId)) return answer({ ok: false, error: 'invalid' })
        const refused = actAllowed(room, participantId)
        if (refused) return answer(refused)
        if (!room.moderation.resolve(reportId)) return answer({ ok: false, error: 'no-such-report' })
        room.moderation.recordAction(socket.data.sanctionKey ?? participantId, Date.now())
        pushReports(room)
        answer({ ok: true })
      } catch (error) {
        console.error(`[modération] ${(error as Error).message}`)
        answer({ ok: false, error: 'server-error' })
      }
    })

    socket.on('chat:send', (payload, ack) => {
      if (typeof ack !== 'function') return

      const { roomId, participantId } = socket.data
      const room = roomId ? rooms.get(roomId) : undefined
      const author = participantId ? room?.get(participantId) : undefined
      if (!room || !author) return ack({ ok: false, error: 'not-in-room' })

      // Muted by the host: refused before anything else, and it does not use up the author's turn.
      const key = socket.data.sanctionKey
      const mutedMs = key ? room.moderation.mutedFor(key, Date.now()) : 0
      if (mutedMs > 0) return ack({ ok: false, error: 'muted', retryAfterMs: mutedMs })

      const result = room.chat.post(author, payload?.text)
      if (!result.ok) return ack(result)

      io.to(room.id).emit('chat:message', result.message)
      room.recordMessage(author.id)
      ack({ ok: true })
    })

    socket.on('room:leave', () => inOrder(leave))
    socket.on('disconnect', () => inOrder(leave))
  })

  return {
    endSession(token) {
      const key = hashToken(token).toString('hex')
      for (const socket of io.sockets.sockets.values()) {
        if (socket.data.sessionKey === key) socket.disconnect(true)
      }
    },

    endAccount(accountId, { exceptSessionKey, forget = false } = {}) {
      // The account of a connection was learned from its cookie when it opened: it is what says whose it is.
      for (const socket of [...io.sockets.sockets.values()]) {
        if (socket.data.account?.id !== accountId) continue
        if (exceptSessionKey !== undefined && socket.data.sessionKey === exceptSessionKey) continue
        socket.disconnect(true)
      }
      if (forget) for (const room of rooms.values()) room.forgetAccount(accountId)
    },

    roomCreated(def) {
      if (rooms.has(def.id)) return
      openRoom(def)
      lobby.changed()
    },

    roomUpdated(def) {
      const room = rooms.get(def.id)
      if (!room) return
      // Set on a key that exists: the room keeps its place in the list.
      stored.set(def.id, def)
      room.name = def.name
      room.setRules(options.rules ?? def.rules)
      io.to(def.id).emit('room:settings', {
        name: def.name,
        description: def.description,
        styles: [...def.styles],
        theme: def.theme,
        rules: room.rules,
      })
      lobby.changed()
    },

    openRoomName(id) {
      return stored.get(id)?.name
    },

    roomDeleted(id) {
      const room = rooms.get(id)
      if (!room) return
      // Gone from the registry first: nothing can join it from this moment, whatever is still waiting on the database.
      rooms.delete(id)
      stored.delete(id)
      clearTimeout(reportTimers.get(id))
      reportTimers.delete(id)
      io.to(id).emit('room:closed')
      // Everybody in it is put out: out of its channel and of their own, and their connection forgets the room, so that
      // nothing they send afterwards is taken for a word said in it.
      for (const socketId of [...(io.sockets.adapter.rooms.get(id) ?? [])]) {
        const socket = io.sockets.sockets.get(socketId)
        if (!socket) continue
        socket.leave(id)
        if (socket.data.participantId) socket.leave(socket.data.participantId)
        socket.data.roomId = undefined
        socket.data.participantId = undefined
      }
      room.close()
      lobby.changed()
    },
  }
}
