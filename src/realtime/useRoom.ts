import { useEffect, useState } from 'react'
import type { JoinError, Participant, RoomSnapshot, Track } from '../../shared/protocol'
import { socket } from './socket'

interface RoomEntry {
  roomId: string
  pseudo: string
  avatarId: string
}

export type RoomStatus = 'connecting' | 'joined' | 'error'

interface RoomState {
  status: RoomStatus
  error: JoinError | null
  snapshot: RoomSnapshot | null
  participants: Participant[]
  nowPlaying: Track | null
}

const INITIAL_STATE: RoomState = { status: 'connecting', error: null, snapshot: null, participants: [], nowPlaying: null }

/** Joins a room over the realtime connection and keeps its live state. Rejoins after a reconnection. */
export function useRoom({ roomId, pseudo, avatarId }: RoomEntry): RoomState {
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

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('room:participant-joined', onParticipantJoined)
    socket.on('room:participant-left', onParticipantLeft)
    socket.on('room:track', onTrack)

    if (socket.connected) join()
    else socket.connect()

    return () => {
      active = false
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room:participant-joined', onParticipantJoined)
      socket.off('room:participant-left', onParticipantLeft)
      socket.off('room:track', onTrack)
      socket.emit('room:leave')
      socket.disconnect()
    }
  }, [roomId, pseudo, avatarId])

  return state
}
