import { Link, Navigate, useLocation, useParams } from 'react-router'
import type { JoinError } from '../../shared/protocol'
import Chat from '../components/Chat'
import ParticipantList from '../components/ParticipantList'
import SiteHeader from '../components/SiteHeader'
import { AVATARS } from '../data/avatars'
import { useRoom } from '../realtime/useRoom'
import './RoomPage.css'

interface EntryState {
  pseudo: string
  avatarId: string
}

const ERROR_MESSAGES: Record<JoinError, string> = {
  'pseudo-taken': 'Ce pseudo est déjà pris dans cette room. Choisis-en un autre.',
  'invalid-pseudo': 'Ce pseudo n\'est pas valide.',
  'invalid-avatar': 'Cet avatar n\'est pas valide.',
  'unknown-room': 'Cette room n\'existe pas.',
}

// The room screen proper (stage, DJ queue, chat, player) comes in the next steps.
export default function RoomPage() {
  const { roomId = '' } = useParams()
  const entry = useLocation().state as EntryState | null

  // Visitors must go through the entry screen first: its click starts the player.
  if (!entry || !AVATARS.some((avatar) => avatar.id === entry.avatarId)) return <Navigate to="/" replace />
  return <JoinedRoom roomId={roomId} pseudo={entry.pseudo} avatarId={entry.avatarId} />
}

function JoinedRoom({ roomId, pseudo, avatarId }: EntryState & { roomId: string }) {
  const { status, error, snapshot, participants, nowPlaying, messages, sendChat } = useRoom({ roomId, pseudo, avatarId })

  if (status === 'error' && error) {
    return (
      <div>
        <SiteHeader />
        <main className="room">
          <p role="alert">{ERROR_MESSAGES[error]}</p>
          <Link to="/">Retour à l'entrée</Link>
        </main>
      </div>
    )
  }

  return (
    <div>
      <SiteHeader />
      <main className="room">
        <h1>{snapshot?.name ?? 'Connexion…'}</h1>
        {status === 'connecting' && (
          <p className="room__status" role="status">
            Connexion à la room en cours…
          </p>
        )}
        {nowPlaying && (
          <p className="room__track">
            En lecture : <strong>{nowPlaying.title}</strong> · {nowPlaying.artist}
          </p>
        )}
        <div className="room__columns">
          <ParticipantList participants={participants} selfId={snapshot?.selfId} />
          <div className="room__chat">
            <Chat
              messages={messages}
              selfId={snapshot?.selfId}
              disabledReason={status === 'joined' ? null : 'Connexion en cours… tu pourras écrire dans un instant.'}
              onSend={sendChat}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
