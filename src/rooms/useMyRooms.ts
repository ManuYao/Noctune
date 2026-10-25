import { useEffect, useState } from 'react'
import type { RoomDetail } from '../../shared/protocol'
import { myRooms } from './roomApi'
import { roomErrorMessage } from './roomMessages'

export type MyRooms =
  | { state: 'loading' }
  | { state: 'ready'; rooms: RoomDetail[] }
  /** The server said it cannot (no database, not signed in): the reason is in words. */
  | { state: 'refused'; message: string }
  /** No answer: the form can still be tried, the server will say. */
  | { state: 'offline' }

/** The rooms the signed-in member hosts, read once when the page opens. */
export function useMyRooms(): MyRooms {
  const [result, setResult] = useState<MyRooms>({ state: 'loading' })

  useEffect(() => {
    let active = true
    myRooms().then((reply) => {
      if (!active) return
      if (reply.ok) setResult({ state: 'ready', rooms: reply.rooms })
      else if (reply.error === 'network') setResult({ state: 'offline' })
      else setResult({ state: 'refused', message: roomErrorMessage(reply) })
    })
    return () => {
      active = false
    }
  }, [])

  return result
}
