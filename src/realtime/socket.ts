import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol'

export type NoctuneSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// One connection per tab. It is opened by the room screen and closed when leaving it.
// In dev, Vite proxies /socket.io to the realtime server (see vite.config.ts).
export const socket: NoctuneSocket = io({ autoConnect: false })
