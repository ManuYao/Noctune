import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useParams } from 'react-router'
import { useAccount } from '../auth/useAccount'
import type { JoinError } from '../../shared/protocol'
import DjBarAction from '../components/DjBarAction'
import DjDialog from '../components/DjDialog'
import DjNotices from '../components/DjNotices'
import ModerationProvider from '../moderation/ModerationProvider'
import ReportsButton from '../moderation/ReportsButton'
import RoomHeader from '../components/RoomHeader'
import RoomRail from '../components/RoomRail'
import RoomSide from '../components/RoomSide'
import RoomStage from '../components/RoomStage'
import SiteHeader from '../components/SiteHeader'
import { useMediaQuery } from '../components/useMediaQuery'
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

// The phone layout of the room (video pinned at the top, tabs under it): the same breakpoint as its CSS.
const PHONE_QUERY = '(max-width: 760px)'

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
  const phone = useMediaQuery(PHONE_QUERY)
  // Who the viewer is in the room, as the server sees this connection: member or visitor can differ for a moment from
  // the account of the page (signed in from another tab: the connection reopens a moment later).
  const self = participants.find((participant) => participant.id === snapshot?.selfId)
  const isMember = self?.member === true
  // "Passer DJ": opened from the bar on a computer, from the queue tab on a phone.
  const [djOpen, setDjOpen] = useState(false)
  // Signed out while the window is open (another tab, a session that ended): nothing left to do in it.
  useEffect(() => {
    if (!isMember) setDjOpen(false)
  }, [isMember])

  // The host deleted the room: the server has already sent everybody out, and the player goes with this screen.
  if (closed) {
    return (
      <div>
        <SiteHeader />
        <main className="room-message">
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
        <main className="room-message">
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
        <main className="room-message">
          <p role="alert">{error === 'pseudo-taken' && account ? PSEUDO_TAKEN_FOR_MEMBER : ERROR_MESSAGES[error]}</p>
          {error === 'excluded' ? <Link to="/rooms">Voir les autres rooms</Link> : <Link to="/">Retour à l'entrée</Link>}
          {error === 'pseudo-reserved' && <Link to="/connexion">Me connecter</Link>}
        </main>
      </div>
    )
  }

  const name = info?.name ?? snapshot?.name ?? 'Connexion…'
  return (
    // The ambiance is the room's alone: the attribute stays on this page, the others keep the default look. The windows
    // of moderation are inside it, so that they take the ambiance too.
    <div className="room-page" data-theme={themeAttribute(info?.theme ?? 'neon')}>
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
        {/* A computer: the rail and the header of mock-ups 3 and 3b. A phone keeps the header of the site, the room's
            title under it (its own layout is still to come). */}
        {!phone && <RoomRail />}
        {phone ? (
          <SiteHeader>
            <h1 className="room__title">{name}</h1>
            {/* The host's inbox of reports, and the settings: the latter opens in a new tab, so that the room and its player keep going. */}
            <ReportsButton />
            {info?.isHost && (
              <Link to={`/rooms/${encodeURIComponent(roomId)}/edit`} target="_blank" rel="noopener noreferrer" className="room__settings">
                Réglages<span className="visually-hidden"> de la room (nouvel onglet)</span>
              </Link>
            )}
          </SiteHeader>
        ) : (
          <RoomHeader
            roomId={roomId}
            name={name}
            styles={info?.styles ?? []}
            online={participants.length}
            host={info?.host ?? null}
            isHost={info?.isHost ?? false}
            self={{ pseudo: self?.pseudo ?? pseudo, avatarId: self?.avatarId ?? avatarId, member: isMember }}
            connecting={status === 'connecting'}
          />
        )}
        <main className="room">
          {phone && status === 'connecting' && (
            <p className="room__status" role="status">
              Connexion à la room en cours…
            </p>
          )}
          <RoomStage
            track={nowPlaying}
            participants={participants}
            selfId={snapshot?.selfId}
            clockOffsetMs={clockOffsetMs}
            reactions={reactions}
            mine={mine}
            likePulse={likePulse}
            queue={queue}
            messages={messages}
            compact={phone}
            djAction={
              !phone && rules ? (
                <DjBarAction
                  rules={rules}
                  queue={queue}
                  selfId={snapshot?.selfId}
                  isMember={isMember}
                  lineup={lineup}
                  nowPlaying={nowPlaying}
                  clockOffsetMs={clockOffsetMs}
                  onOpen={() => setDjOpen(true)}
                  onLeave={leaveQueue}
                  onNote={note}
                />
              ) : null
            }
            onLike={like}
            onSkip={voteSkip}
          />
          <RoomSide
            phone={phone}
            selfId={snapshot?.selfId}
            isMember={isMember}
            participants={participants}
            messages={messages}
            chatDisabledReason={status === 'joined' ? null : 'Connexion en cours… tu pourras écrire dans un instant.'}
            mutedUntil={mutedUntil}
            onSendChat={sendChat}
            rules={rules}
            queue={queue}
            lineupSize={lineup.length}
            nowPlaying={nowPlaying}
            clockOffsetMs={clockOffsetMs}
            onOpenDj={() => setDjOpen(true)}
          />
        </main>
        <DjNotices notices={notices} onDismiss={dismissNotice} />
        {rules && isMember && (
          <DjDialog
            open={djOpen}
            onClose={() => setDjOpen(false)}
            rules={rules}
            queue={queue}
            selfId={snapshot?.selfId}
            lineup={lineup}
            nowPlaying={nowPlaying}
            clockOffsetMs={clockOffsetMs}
            onAdd={addTrack}
            onAddFromPlaylist={addFromPlaylist}
            onPlaylistStatus={playlistStatus}
            onRemove={removeTrack}
            onLeave={leaveQueue}
          />
        )}
      </ModerationProvider>
    </div>
  )
}
