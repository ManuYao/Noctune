import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol'

export type NoctuneSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// One connection per tab. It is opened by the screens that show live data (the rooms, the room) and only the
// room screen closes it when leaving. The entry screen and the list leave it open, so entering a room reuses it.
// In dev, Vite proxies /socket.io to the realtime server (see vite.config.ts).
export const socket: NoctuneSocket = io({ autoConnect: false })

// The server closes a connection on purpose when the session behind it ends (signed out in another tab, replaced by a
// new sign-in). Socket.IO does not reconnect after that by itself: opening it again gives a fresh connection, with the
// cookie as it is now, and the screens that were using it follow (they listen to "connect").
socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') socket.connect()
})
