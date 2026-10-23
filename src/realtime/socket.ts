import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol'

export type NoctuneSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// One connection per tab. It is opened by the screens that show live data (the rooms, the room) and only the
// room screen closes it when leaving. The entry screen and the list leave it open, so entering a room reuses it.
// In dev, Vite proxies /socket.io to the realtime server (see vite.config.ts).
export const socket: NoctuneSocket = io({ autoConnect: false })
