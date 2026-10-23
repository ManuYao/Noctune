import { randomUUID } from 'node:crypto'
import type { Server } from 'socket.io'
import {
  AVATAR_IDS,
  PSEUDO_MAX,
  PSEUDO_MIN,
  type AvatarId,
  type ClientToServerEvents,
  type JoinResult,
  type ReactResult,
  type ServerToClientEvents,
} from '../../shared/protocol'
import { ROOM_DEFS } from './catalog'
import { Lobby, LOBBY_CHANNEL, summarize } from './Lobby'
import { Room, type RoomOptions } from './Room'

export interface HandlerOptions extends RoomOptions {
  /** How long changes to the list of rooms are gathered before it is sent (tests make it short). */
  lobbyDelayMs?: number
}

interface SocketData {
  roomId?: string
  participantId?: string
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

function isAvatarId(value: unknown): value is AvatarId {
  return (AVATAR_IDS as readonly unknown[]).includes(value)
}

export function registerRoomHandlers(io: IoServer, options: HandlerOptions = {}) {
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

  io.on('connection', (socket) => {
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
      const reply = (result: JoinResult) => ack(result)

      // Never trust the client: the payload shape and every value are checked here.
      const room = typeof payload?.roomId === 'string' ? rooms.get(payload.roomId) : undefined
      if (!room) return reply({ ok: false, error: 'unknown-room' })

      const pseudo = typeof payload.pseudo === 'string' ? payload.pseudo.trim() : ''
      if (pseudo.length < PSEUDO_MIN || pseudo.length > PSEUDO_MAX) return reply({ ok: false, error: 'invalid-pseudo' })
      if (!isAvatarId(payload.avatarId)) return reply({ ok: false, error: 'invalid-avatar' })

      leave()
      if (room.isPseudoTaken(pseudo)) return reply({ ok: false, error: 'pseudo-taken' })

      const participant = { id: randomUUID(), pseudo, avatarId: payload.avatarId }
      room.add(participant)
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

    socket.on('room:leave', leave)
    socket.on('disconnect', leave)
  })
}
