import { createServer } from 'node:http'
import { Server } from 'socket.io'

const PORT = Number(process.env.PORT ?? 3001)

const httpServer = createServer()
const io = new Server(httpServer, { cors: { origin: 'http://localhost:5173' } })

io.on('connection', (socket) => {
  console.log('connecté', socket.id)
  socket.on('disconnect', () => console.log('déconnecté', socket.id))
})

httpServer.listen(PORT, () => console.log(`Serveur temps réel sur :${PORT}`))
