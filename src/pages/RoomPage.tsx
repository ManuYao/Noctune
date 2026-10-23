import { Navigate, useLocation, useParams } from 'react-router'
import Avatar from '../components/Avatar'
import SiteHeader from '../components/SiteHeader'
import { AVATARS } from '../data/avatars'
import { ROOMS } from '../data/rooms'

interface EntryState {
  pseudo: string
  avatarId: string
}

// Placeholder: the room screen (stage, DJ queue, chat, player) comes with the realtime step.
export default function RoomPage() {
  const { roomId } = useParams()
  const state = useLocation().state as EntryState | null
  const room = ROOMS.find((candidate) => candidate.id === roomId)
  const avatar = AVATARS.find((candidate) => candidate.id === state?.avatarId)

  // Visitors must go through the entry screen first: its click starts the player.
  if (!state || !avatar) return <Navigate to="/" replace />
  if (!room) return <Navigate to="/rooms" replace />

  return (
    <div>
      <SiteHeader />
      <main style={{ padding: '16px clamp(16px, 5vw, 56px)' }}>
        <h1>{room.name}</h1>
        <p>
          <Avatar avatar={avatar} size={48} /> {state.pseudo}, la room arrive bientôt.
        </p>
      </main>
    </div>
  )
}
