import type { RoomDetail, RoomReply, RoomSettings } from '../../shared/protocol'

/** What the server answered, or a failure that never got an answer (offline, server down). */
export type RoomCall<T = object> = RoomReply<T> | { ok: false; error: 'network' }
export type RoomCallFailure = Exclude<RoomCall, { ok: true }>

// The session lives in a cookie the page cannot read: the browser sends it by itself, to this site only.
// In development Vite forwards /api to the realtime server (see vite.config.ts).
async function call<T = object>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<RoomCall<T>> {
  try {
    const response = await fetch(
      path,
      // Every method that changes something carries a JSON body, even an empty one: the server only reads JSON.
      method === 'GET' ? undefined : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) },
    )
    return (await response.json()) as RoomReply<T>
  } catch {
    // No connection, or something that is not our server answering (a proxy error page): not a refusal of ours.
    return { ok: false, error: 'network' }
  }
}

const roomPath = (roomId: string) => `/api/rooms/${encodeURIComponent(roomId)}`

/** The rooms the signed-in member hosts. */
export const myRooms = () => call<{ rooms: RoomDetail[] }>('GET', '/api/rooms/mine')

export const getRoom = (roomId: string) => call<{ room: RoomDetail }>('GET', roomPath(roomId))

export const createRoom = (settings: RoomSettings) => call<{ room: RoomDetail }>('POST', '/api/rooms', settings)

export const updateRoom = (roomId: string, settings: RoomSettings) => call<{ room: RoomDetail }>('PATCH', roomPath(roomId), settings)

export const deleteRoom = (roomId: string) => call('DELETE', roomPath(roomId))
