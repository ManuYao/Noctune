import { randomUUID } from 'node:crypto'
import type { Server } from 'socket.io'
import {
  AVATAR_IDS,
  PSEUDO_MAX,
  PSEUDO_MIN,
  type AvatarId,
  type ClientToServerEvents,
  type JoinResult,
  type ServerToClientEvents,
} from '../../shared/protocol'
import { ROOM_DEFS } from './catalog'
import { Room } from './Room'

interface SocketData {
  roomId?: string
  participantId?: string
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>

function isAvatarId(value: unknown): value is AvatarId {
  return (AVATAR_IDS as readonly unknown[]).includes(value)
}

export function registerRoomHandlers(io: IoServer) {
  const rooms = new Map<string, Room>(
    ROOM_DEFS.map((def) => [def.id, new Room(def.id, def.name, (track) => io.to(def.id).emit('room:track', track))]),
  )

  io.on('connection', (socket) => {
    function leave() {
      const { roomId, participantId } = socket.data
      if (!roomId || !participantId) return
      socket.leave(roomId)
      socket.data.roomId = undefined
      socket.data.participantId = undefined
      if (rooms.get(roomId)?.remove(participantId)) {
        socket.to(roomId).emit('room:participant-left', participantId)
      }
    }

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

      reply({
        ok: true,
        snapshot: {
          roomId: room.id,
          name: room.name,
          selfId: participant.id,
          participants: room.list(),
          nowPlaying: room.nowPlaying,
          serverTime: Date.now(),
        },
      })
    })

    socket.on('room:leave', leave)
    socket.on('disconnect', leave)
  })
}
