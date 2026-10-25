import { Link, Navigate, useLocation, useParams } from 'react-router'
import { useAccount } from '../auth/useAccount'
import type { JoinError } from '../../shared/protocol'
import DjNotices from '../components/DjNotices'
import RoomSide from '../components/RoomSide'
import RoomStage from '../components/RoomStage'
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
  'pseudo-reserved': 'Ce pseudo appartient à un membre. Connecte-toi pour l\'utiliser, ou choisis-en un autre.',
  'already-in-room': 'Tu es déjà dans cette room (dans un autre onglet ou sur un autre appareil ?).',
  'server-error': 'Le serveur a eu un souci. Réessaie dans un instant.',
  'rate-limited': "Trop de tentatives d'entrée d'un coup. Réessaie dans un instant.",
}

// A member cannot "choose another pseudo": the message says what is really going on.
const PSEUDO_TAKEN_FOR_MEMBER =
  "Un visiteur utilise ton pseudo dans cette room pour l'instant. Réessaie dans un moment, ou choisis une autre room."

export default function RoomPage() {
  const { roomId = '' } = useParams()
  const entry = useLocation().state as EntryState | null

  // Visitors must go through the entry screen first: its click starts the player.
  if (!entry || !AVATARS.some((avatar) => avatar.id === entry.avatarId)) return <Navigate to="/" replace />
  return <JoinedRoom roomId={roomId} pseudo={entry.pseudo} avatarId={entry.avatarId} />
}

function JoinedRoom({ roomId, pseudo, avatarId }: EntryState & { roomId: string }) {
  const {
    status,
    error,
    snapshot,
    participants,
    nowPlaying,
    messages,
    clockOffsetMs,
    reactions,
    mine,
    likePulse,
    rules,
    queue,
    lineup,
    notices,
    sendChat,
    like,
    voteSkip,
    addTrack,
    addFromPlaylist,
    playlistStatus,
    removeTrack,
    leaveQueue,
    dismissNotice,
  } = useRoom({ roomId, pseudo, avatarId })
  const { account } = useAccount()
  // Member or visitor as the room's server sees this connection, which can differ for a moment from the account of
  // the page (signed in from another tab: the connection reopens a moment later).
  const isMember = participants.find((participant) => participant.id === snapshot?.selfId)?.member === true

  if (status === 'error' && error) {
    return (
      <div>
        <SiteHeader />
        <main className="room">
          <p role="alert">{error === 'pseudo-taken' && account ? PSEUDO_TAKEN_FOR_MEMBER : ERROR_MESSAGES[error]}</p>
          <Link to="/">Retour à l'entrée</Link>
          {error === 'pseudo-reserved' && <Link to="/connexion">Me connecter</Link>}
        </main>
      </div>
    )
  }

  return (
    <div className="room-page">
      <SiteHeader>
        <h1 className="room__title">{snapshot?.name ?? 'Connexion…'}</h1>
      </SiteHeader>
      <main className="room">
        {status === 'connecting' && (
          <p className="room__status" role="status">
            Connexion à la room en cours…
          </p>
        )}
        <div className="room__layout">
          <div className="room__stage">
            <RoomStage
              track={nowPlaying}
              participants={participants}
              selfId={snapshot?.selfId}
              clockOffsetMs={clockOffsetMs}
              reactions={reactions}
              mine={mine}
              likePulse={likePulse}
              queue={queue}
              onLike={like}
              onSkip={voteSkip}
            />
          </div>
          <RoomSide
            selfId={snapshot?.selfId}
            isMember={isMember}
            participants={participants}
            messages={messages}
            chatDisabledReason={status === 'joined' ? null : 'Connexion en cours… tu pourras écrire dans un instant.'}
            onSendChat={sendChat}
            rules={rules}
            queue={queue}
            lineup={lineup}
            nowPlaying={nowPlaying}
            clockOffsetMs={clockOffsetMs}
            onAddTrack={addTrack}
            onAddFromPlaylist={addFromPlaylist}
            onPlaylistStatus={playlistStatus}
            onRemoveTrack={removeTrack}
            onLeaveQueue={leaveQueue}
          />
        </div>
      </main>
      <DjNotices notices={notices} onDismiss={dismissNotice} />
    </div>
  )
}
