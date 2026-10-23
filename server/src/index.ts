import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { registerRoomHandlers, type IoServer } from './registerRoomHandlers'

const PORT = Number(process.env.PORT ?? 3001)

const httpServer = createServer()
const io: IoServer = new Server(httpServer, {
  cors: { origin: 'http://localhost:5173' },
  // Every payload is tiny (a pseudo, a chat line): refuse anything bigger before parsing it.
  maxHttpBufferSize: 10_000,
})

registerRoomHandlers(io)

httpServer.listen(PORT, () => console.log(`Serveur temps réel sur :${PORT}`))
