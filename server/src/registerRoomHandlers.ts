import { randomUUID } from 'node:crypto'
import type { Server } from 'socket.io'
import {
  AVATAR_IDS,
  type AvatarId,
  type ClientToServerEvents,
  type JoinResult,
  type Participant,
  type ReactResult,
  type ServerToClientEvents,
} from '../../shared/protocol'
import { isStaffLookalike, normalizePseudo } from '../../shared/validation'
import type { AccountService } from './accounts/AccountService'
import { hashToken, readSessionToken } from './accounts/sessionToken'
import { ROOM_DEFS } from './catalog'
import { Lobby, LOBBY_CHANNEL, summarize } from './Lobby'
import { MinInterval } from './MinInterval'
import { Room, type RoomOptions } from './Room'

export interface HandlerOptions extends RoomOptions {
  /** How long changes to the list of rooms are gathered before it is sent (tests make it short). */
  lobbyDelayMs?: number
  /** Without it, everybody is a visitor: the server runs without a database. */
  accounts?: AccountService | null
  /** How long knowing who a connection is may take before it comes in as a visitor (tests shorten it). */
  sessionLookupTimeoutMs?: number
}

interface SocketData {
  /** The member behind the session cookie the connection was opened with. Absent for a visitor. */
  account?: { id: string; pseudo: string; avatarId: AvatarId }
  /** Which session that was (a hash of its token), to close the connection when the session ends. */
  sessionKey?: string
  roomId?: string
  participantId?: string
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

/** What the rest of the server may ask of the realtime side. */
export interface Realtime {
  /** Closes the connections opened with this session. The page opens new ones, as a visitor. */
  endSession: (token: string) => void
}

// A connection that asks to join more often than this is a script: each join may cost a database round trip.
const JOIN_MIN_INTERVAL_MS = 300
// Knowing who a connection is must not hold it up for longer than this: past it, it comes in as a visitor.
const SESSION_LOOKUP_TIMEOUT_MS = 3000

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`pas de réponse en ${ms} ms`)), ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function isAvatarId(value: unknown): value is AvatarId {
  return (AVATAR_IDS as readonly unknown[]).includes(value)
}

export function registerRoomHandlers(io: IoServer, options: HandlerOptions = {}): Realtime {
  const rooms = new Map<string, Room>()
  // The list shows how many people are in each room and what plays: both are read from the rooms when sent.
  const lobby = new Lobby(
    () =>
      ROOM_DEFS.flatMap((def) => {
        const room = rooms.get(def.id)
        return room ? [summarize(def, room)] : []
      }),
    (list) => io.to(LOBBY_CHANNEL).emit('lobby:rooms', list),
    options.lobbyDelayMs,
  )

  for (const def of ROOM_DEFS) {
    rooms.set(
      def.id,
      new Room(
        def.id,
        def.name,
        {
          onTrackChange: (track, reactions) => {
            io.to(def.id).emit('room:track', track, reactions)
            lobby.changed()
          },
          onReactionsChange: (reactions) => io.to(def.id).emit('track:reactions', reactions),
        },
        options,
      ),
    )
  }

  const accounts = options.accounts ?? null

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

    function leave() {
      const { roomId, participantId } = socket.data
      if (!roomId || !participantId) return
      socket.leave(roomId)
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

          leave()
          if (account && room.hasAccount(account.id)) return reply({ ok: false, error: 'already-in-room' })
          if (room.isPseudoTaken(pseudo)) return reply({ ok: false, error: 'pseudo-taken' })

          const participant: Participant = { id: randomUUID(), pseudo, avatarId, member: account !== undefined }
          room.add(participant, account?.id)
          socket.data.roomId = room.id
          socket.data.participantId = participant.id
          socket.join(room.id)
          socket.to(room.id).emit('room:participant-joined', participant)
          lobby.changed()

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

    socket.on('chat:send', (payload, ack) => {
      if (typeof ack !== 'function') return

      const { roomId, participantId } = socket.data
      const room = roomId ? rooms.get(roomId) : undefined
      const author = participantId ? room?.get(participantId) : undefined
      if (!room || !author) return ack({ ok: false, error: 'not-in-room' })

      const result = room.chat.post(author, payload?.text)
      if (!result.ok) return ack(result)

      io.to(room.id).emit('chat:message', result.message)
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
  }
}
