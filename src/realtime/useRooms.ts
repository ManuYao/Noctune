import { useEffect, useState } from 'react'
import type { RoomSummary } from '../../shared/protocol'
import { socket } from './socket'

/** loading: nothing yet. ready: the list is up to date. offline: the connection is down (the last list is kept). */
export type RoomsStatus = 'loading' | 'ready' | 'offline'

const ACK_TIMEOUT_MS = 5000

// The last list seen in this tab: going from one screen to another shows it at once instead of a blank.
let lastKnown: RoomSummary[] | null = null

/**
 * Follows the list of rooms over the realtime connection: the numbers change on screen as people come and go.
 * The connection is left open on purpose: the room screen reuses it, so entering a room does not reconnect.
 */
export function useRooms(): { rooms: RoomSummary[] | null; status: RoomsStatus } {
  const [rooms, setRooms] = useState<RoomSummary[] | null>(lastKnown)
  const [status, setStatus] = useState<RoomsStatus>('loading')

  useEffect(() => {
    let active = true

    function show(list: RoomSummary[]) {
      lastKnown = list
      setRooms(list)
    }

    function follow() {
      socket.timeout(ACK_TIMEOUT_MS).emit('lobby:join', (error, list) => {
        if (!active) return
        // No answer in time: the server is there but does not follow the list (an older version, a fault).
        if (error) return setStatus('offline')
        show(list)
        setStatus('ready')
      })
    }

    const onConnect = () => follow()
    const onDisconnect = () => setStatus('offline')
    // The server cannot be reached (yet): the connection keeps trying by itself.
    const onConnectError = () => setStatus('offline')

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('lobby:rooms', show)

    if (socket.connected) follow()
    else socket.connect()

    return () => {
      active = false
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('lobby:rooms', show)
      // A closed connection has already forgotten the subscription.
      if (socket.connected) socket.emit('lobby:leave')
    }
  }, [])

  return { rooms, status }
}
