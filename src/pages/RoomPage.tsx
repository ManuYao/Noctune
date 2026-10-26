import { Link, Navigate, useLocation, useParams } from 'react-router'
import { useAccount } from '../auth/useAccount'
import type { JoinError } from '../../shared/protocol'
import DjNotices from '../components/DjNotices'
import ModerationProvider from '../moderation/ModerationProvider'
import ReportsButton from '../moderation/ReportsButton'
import RoomSide from '../components/RoomSide'
import RoomStage from '../components/RoomStage'
import SiteHeader from '../components/SiteHeader'
import { AVATARS } from '../data/avatars'
import { useRoom } from '../realtime/useRoom'
import { themeAttribute } from '../rooms/roomLabels'
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
  excluded: "L'hôte de cette room a décidé de t'en exclure pendant 24 h. Tu peux écouter dans une autre room en attendant.",
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
    info,
    closed,
    excluded,
    reports,
    mutedUntil,
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
    report,
    moderate,
    moderateTrack,
    dismissReport,
    note,
  } = useRoom({ roomId, pseudo, avatarId })
  const { account } = useAccount()
  // Member or visitor as the room's server sees this connection, which can differ for a moment from the account of
  // the page (signed in from another tab: the connection reopens a moment later).
  const isMember = participants.find((participant) => participant.id === snapshot?.selfId)?.member === true

  // The host deleted the room: the server has already sent everybody out, and the player goes with this screen.
  if (closed) {
    return (
      <div>
        <SiteHeader />
        <main className="room">
          <h1>Cette room a été fermée</h1>
          <p role="status">Son hôte l'a supprimée : tout le monde en est sorti.</p>
          <Link to="/rooms">Voir les autres rooms</Link>
        </main>
      </div>
    )
  }

  // The host excluded the viewer: the server has taken them out, and the player goes with this screen.
  if (excluded) {
    return (
      <div>
        <SiteHeader />
        <main className="room">
          <h1>Tu as été exclu de cette room</h1>
          <p role="status">
            L'hôte a décidé de t'exclure de cette room pendant 24 h. Tu peux écouter dans une autre room en attendant, et relire les{' '}
            <Link to="/regles">règles de la communauté</Link>.
          </p>
          <Link to="/rooms">Voir les autres rooms</Link>
        </main>
      </div>
    )
  }

  if (status === 'error' && error) {
    return (
      <div>
        <SiteHeader />
        <main className="room">
          <p role="alert">{error === 'pseudo-taken' && account ? PSEUDO_TAKEN_FOR_MEMBER : ERROR_MESSAGES[error]}</p>
          {error === 'excluded' ? <Link to="/rooms">Voir les autres rooms</Link> : <Link to="/">Retour à l'entrée</Link>}
          {error === 'pseudo-reserved' && <Link to="/connexion">Me connecter</Link>}
        </main>
      </div>
    )
  }

  return (
    <ModerationProvider
      isHost={info?.isHost ?? false}
      hasHost={(info?.host ?? null) !== null}
      selfId={snapshot?.selfId}
      participants={participants}
      queue={queue}
      nowPlaying={nowPlaying}
      reports={reports}
      clockOffsetMs={clockOffsetMs}
      report={report}
      moderate={moderate}
      moderateTrack={moderateTrack}
      dismissReport={dismissReport}
      note={note}
    >
      {/* The ambiance is the room's alone: the attribute stays on this page, the others keep the default look. */}
      <div className="room-page" data-theme={themeAttribute(info?.theme ?? 'neon')}>
        <SiteHeader>
          <h1 className="room__title">{info?.name ?? snapshot?.name ?? 'Connexion…'}</h1>
          {/* The host's inbox of reports, and the settings: the latter opens in a new tab, so that the room and its player keep going. */}
          <ReportsButton />
          {info?.isHost && (
            <Link to={`/rooms/${encodeURIComponent(roomId)}/edit`} target="_blank" rel="noopener noreferrer" className="room__settings">
              Réglages<span className="visually-hidden"> de la room (nouvel onglet)</span>
            </Link>
          )}
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
              mutedUntil={mutedUntil}
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
    </ModerationProvider>
  )
}
