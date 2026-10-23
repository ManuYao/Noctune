import { useCallback, useEffect, useRef, useState } from 'react'
import { estimateClockOffset } from '../../shared/clock'
import type {
  ChatMessage,
  ChatResult,
  JoinError,
  MyReactions,
  Participant,
  ReactResult,
  Reactions,
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
export type SendReactionResult = ReactResult | { ok: false; error: 'network' }

interface RoomState {
  status: RoomStatus
  error: JoinError | null
  snapshot: RoomSnapshot | null
  participants: Participant[]
  nowPlaying: Track | null
  messages: ChatMessage[]
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
  reactions: Reactions
  /** What the viewer did on the current track. */
  mine: MyReactions
  /** Goes up each time the like count rises (anyone's like): the screen pulses. */
  likePulse: number
}

const NO_REACTIONS: Reactions = { likes: 0, skipVotes: 0, skipRequired: 1 }
const NOTHING_CAST: MyReactions = { liked: false, votedSkip: false }

const INITIAL_STATE: RoomState = {
  status: 'connecting',
  error: null,
  snapshot: null,
  participants: [],
  nowPlaying: null,
  messages: [],
  clockOffsetMs: 0,
  reactions: NO_REACTIONS,
  mine: NOTHING_CAST,
  likePulse: 0,
}

const ACK_TIMEOUT_MS = 5000
// The server may wait for the database before it lets a visitor in (which is allowed 5 s per query).
const JOIN_ACK_TIMEOUT_MS = 12_000
// A place left behind by a dropped connection is freed within about 45 s: try again every 3 s for a minute.
const JOIN_RETRY_MS = 3000
const MAX_JOIN_RETRIES = 20
// The server sends the last 50 messages on join; the screen keeps a few more while the room goes on.
const MAX_MESSAGES_KEPT = 200

const trackKey = (track: Track | null) => (track ? `${track.id}|${track.startedAt}` : '')

// With a timeout, emitWithAck loses its typing: the answer is always the result type the event declares.
async function emitReaction(event: 'track:like' | 'track:skip', value: boolean): Promise<SendReactionResult> {
  // Offline, the socket would keep the click and send it later, out of context.
  if (!socket.connected) return { ok: false, error: 'network' }
  try {
    const result: ReactResult = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, { value })
    return result
  } catch {
    return { ok: false, error: 'network' }
  }
}

/** Joins a room over the realtime connection and keeps its live state. Rejoins after a reconnection. */
export function useRoom({ roomId, pseudo, avatarId }: RoomEntry): RoomState & {
  sendChat: (text: string) => Promise<SendChatResult>
  like: (value: boolean) => Promise<SendReactionResult>
  voteSkip: (value: boolean) => Promise<SendReactionResult>
} {
  const [state, setState] = useState<RoomState>(INITIAL_STATE)
  const currentTrackKey = useRef('')
  useEffect(() => {
    currentTrackKey.current = trackKey(state.nowPlaying)
  }, [state.nowPlaying])

  useEffect(() => {
    let active = true
    let everJoined = false
    let retries = 0
    let retryTimer: number | undefined
    setState(INITIAL_STATE)

    function join() {
      window.clearTimeout(retryTimer)
      const sentAt = Date.now()
      // No answer in time is an error to show, not a screen that says "connecting" for ever.
      socket.timeout(JOIN_ACK_TIMEOUT_MS).emit('room:join', { roomId, pseudo, avatarId }, (timedOut, result) => {
        if (!active) return
        if (timedOut) {
          setState({ ...INITIAL_STATE, status: 'error', error: 'server-error' })
          return
        }
        if (result.ok) {
          everJoined = true
          retries = 0
          const { snapshot } = result
          setState((prev) => ({
            ...prev,
            status: 'joined',
            error: null,
            snapshot,
            participants: snapshot.participants,
            nowPlaying: snapshot.nowPlaying,
            messages: snapshot.chat,
            clockOffsetMs: estimateClockOffset(sentAt, Date.now(), snapshot.serverTime),
            reactions: snapshot.reactions,
            mine: snapshot.mine,
          }))
          return
        }
        // After a dropped connection (Wi-Fi to 4G, a laptop that slept) the server keeps the old place of the
        // person for up to 45 seconds: coming back at once is told "already here" or "pseudo taken", by themselves.
        // Better to try again for a while than to leave them on an error page.
        const stale = everJoined && (result.error === 'already-in-room' || result.error === 'pseudo-taken')
        if ((stale || result.error === 'rate-limited') && retries < MAX_JOIN_RETRIES) {
          retries += 1
          retryTimer = window.setTimeout(join, JOIN_RETRY_MS)
          return
        }
        setState({ ...INITIAL_STATE, status: 'error', error: result.error })
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
    // A new track starts with no likes and no votes, for everyone.
    const onTrack = (track: Track | null, reactions: Reactions) =>
      setState((prev) => ({ ...prev, nowPlaying: track, reactions, mine: NOTHING_CAST }))
    const onReactions = (reactions: Reactions) =>
      setState((prev) => ({
        ...prev,
        reactions,
        likePulse: reactions.likes > prev.reactions.likes ? prev.likePulse + 1 : prev.likePulse,
      }))
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
    socket.on('track:reactions', onReactions)
    socket.on('chat:message', onChatMessage)

    if (socket.connected) join()
    else socket.connect()

    return () => {
      active = false
      window.clearTimeout(retryTimer)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room:participant-joined', onParticipantJoined)
      socket.off('room:participant-left', onParticipantLeft)
      socket.off('room:track', onTrack)
      socket.off('track:reactions', onReactions)
      socket.off('chat:message', onChatMessage)
      socket.emit('room:leave')
      socket.disconnect()
    }
  }, [roomId, pseudo, avatarId])

  const sendChat = useCallback(async (text: string): Promise<SendChatResult> => {
    // Offline, the socket would keep the message and send it later, out of context.
    if (!socket.connected) return { ok: false, error: 'network' }
    try {
      const result: ChatResult = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('chat:send', { text })
      return result
    } catch {
      return { ok: false, error: 'network' }
    }
  }, [])

  /** The button changes at once; the server confirms, and the change is undone if it refuses. */
  const react = useCallback(async (kind: keyof MyReactions, value: boolean): Promise<SendReactionResult> => {
    const trackAtClick = currentTrackKey.current
    setState((prev) => ({ ...prev, mine: { ...prev.mine, [kind]: value } }))

    const result = await emitReaction(kind === 'liked' ? 'track:like' : 'track:skip', value)
    if (!result.ok) {
      // Unless a new track started meanwhile: its flags were already reset.
      setState((prev) =>
        trackKey(prev.nowPlaying) === trackAtClick ? { ...prev, mine: { ...prev.mine, [kind]: !value } } : prev,
      )
    }
    return result
  }, [])

  const like = useCallback((value: boolean) => react('liked', value), [react])
  const voteSkip = useCallback((value: boolean) => react('votedSkip', value), [react])

  return { ...state, sendChat, like, voteSkip }
}
