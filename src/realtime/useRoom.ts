import { useCallback, useEffect, useState } from 'react'
import type {
  ChatMessage,
  ChatResult,
  JoinError,
  Participant,
  RoomSnapshot,
  Track,
} from '../../shared/protocol'
import { socket } from './socket'

interface RoomEntry {
  roomId: string
  pseudo: string
  avatarId: string
}

export type RoomStatus = 'connecting' | 'joined' | 'error'

/** The server answer, or a failure that never reached the server. */
export type SendChatResult = ChatResult | { ok: false; error: 'network' }

interface RoomState {
  status: RoomStatus
  error: JoinError | null
  snapshot: RoomSnapshot | null
  participants: Participant[]
  nowPlaying: Track | null
  messages: ChatMessage[]
}

const INITIAL_STATE: RoomState = {
  status: 'connecting',
  error: null,
  snapshot: null,
  participants: [],
  nowPlaying: null,
  messages: [],
}

const CHAT_ACK_TIMEOUT_MS = 5000
// The server sends the last 50 messages on join; the screen keeps a few more while the room goes on.
const MAX_MESSAGES_KEPT = 200

/** Joins a room over the realtime connection and keeps its live state. Rejoins after a reconnection. */
export function useRoom({ roomId, pseudo, avatarId }: RoomEntry): RoomState & {
  sendChat: (text: string) => Promise<SendChatResult>
} {
  const [state, setState] = useState<RoomState>(INITIAL_STATE)

  useEffect(() => {
    let active = true
    setState(INITIAL_STATE)

    function join() {
      socket.emit('room:join', { roomId, pseudo, avatarId }, (result) => {
        if (!active) return
        if (result.ok) {
          const { snapshot } = result
          setState({
            status: 'joined',
            error: null,
            snapshot,
            participants: snapshot.participants,
            nowPlaying: snapshot.nowPlaying,
            messages: snapshot.chat,
          })
        } else {
          setState({ ...INITIAL_STATE, status: 'error', error: result.error })
        }
      })
    }

    const onConnect = () => join()
    const onDisconnect = () => setState((prev) => (prev.status === 'error' ? prev : { ...prev, status: 'connecting' }))
    const onParticipantJoined = (participant: Participant) =>
      setState((prev) =>
        prev.participants.some((known) => known.id === participant.id)
          ? prev
          : { ...prev, participants: [...prev.participants, participant] },
      )
    const onParticipantLeft = (participantId: string) =>
      setState((prev) => ({ ...prev, participants: prev.participants.filter((known) => known.id !== participantId) }))
    const onTrack = (track: Track | null) => setState((prev) => ({ ...prev, nowPlaying: track }))
    const onChatMessage = (message: ChatMessage) =>
      setState((prev) =>
        prev.messages.some((known) => known.id === message.id)
          ? prev
          : { ...prev, messages: [...prev.messages, message].slice(-MAX_MESSAGES_KEPT) },
      )

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('room:participant-joined', onParticipantJoined)
    socket.on('room:participant-left', onParticipantLeft)
    socket.on('room:track', onTrack)
    socket.on('chat:message', onChatMessage)

    if (socket.connected) join()
    else socket.connect()

    return () => {
      active = false
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room:participant-joined', onParticipantJoined)
      socket.off('room:participant-left', onParticipantLeft)
      socket.off('room:track', onTrack)
      socket.off('chat:message', onChatMessage)
      socket.emit('room:leave')
      socket.disconnect()
    }
  }, [roomId, pseudo, avatarId])

  const sendChat = useCallback(async (text: string): Promise<SendChatResult> => {
    // Offline, the socket would keep the message and send it later, out of context.
    if (!socket.connected) return { ok: false, error: 'network' }
    try {
      // With a timeout, emitWithAck loses its typing: the answer is always a ChatResult.
      const result: ChatResult = await socket.timeout(CHAT_ACK_TIMEOUT_MS).emitWithAck('chat:send', { text })
      return result
    } catch {
      return { ok: false, error: 'network' }
    }
  }, [])

  return { ...state, sendChat }
}
