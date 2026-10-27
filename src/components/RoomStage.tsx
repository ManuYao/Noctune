import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ChatMessage, DjQueue, MyReactions, Participant, Reactions, Track } from '../../shared/protocol'
import type { DecorKind } from './decor/decorKind'
import { useConsentDialog } from '../consent/consentContext'
import { useYouTubeConsent } from '../consent/useYouTubeConsent'
import { UNAVAILABLE_TEXT } from '../player/unavailable'
import { useMediaSession } from '../player/useMediaSession'
import { useYouTubePlayer, type PlayerStatus } from '../player/useYouTubePlayer'
import { ownSkipHint } from '../realtime/djMessages'
import { findMyPlace } from '../realtime/djQueue'
import type { SendReactionResult } from '../realtime/useRoom'
import MobileScene from './MobileScene'
import NowPlayingBar from './NowPlayingBar'
import ReactionButtons, { type ReactionMessageKind } from './ReactionButtons'
import './RoomStage.css'
import Scene from './Scene'
import VideoScreen from './VideoScreen'

interface RoomStageProps {
  track: Track | null
  participants: Participant[]
  selfId: string | undefined
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
  reactions: Reactions
  mine: MyReactions
  likePulse: number
  /** Who is on the decks and who waits. */
  queue: DjQueue
  /** The chat, for the bubbles of the scene. */
  messages: ChatMessage[]
  /** A phone: the scene of mock-up M3 with a bar of its own under it. */
  compact: boolean
  /** The genre of the room, for the decor and the colours of the scene. */
  decor: DecorKind | null
  /** "Passer DJ", at the right end of the bar; null where it is elsewhere (the queue tab of a phone). */
  djAction: ReactNode
  /** The listening volume: kept by the room page, whose phone header has the mute button. */
  sound: Sound
  onLike: (value: boolean) => Promise<SendReactionResult>
  onSkip: (value: boolean) => Promise<SendReactionResult>
}

/** The listening volume and its mute switch (see useVolume). */
export interface Sound {
  volume: number
  muted: boolean
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void
  toggleMute: () => void
}

// Only for states where there is no video to look at: a message never covers a video that plays.
const SCREEN_MESSAGES: Partial<Record<PlayerStatus, string>> = {
  idle: 'En attente du prochain morceau…',
  'player-failed':
    "Le lecteur vidéo n'a pas pu se charger. Désactive ton bloqueur de publicités ou recharge la page.",
}

// The viewer did not accept the YouTube player (or took the answer back): the room goes on without it, and says so calmly.
const PLAYER_OFF = {
  title: 'Le lecteur YouTube est désactivé',
  text: "Tu n'entends pas la musique tant que le lecteur est désactivé. Tu peux toujours discuter, voter et passer DJ.",
}

/**
 * The player of the room: the illustrated scene with the YouTube video on its screen, and the bar of the track under
 * it. On a computer both are laid out by the room's grid (the wrapper adds no box of its own); on a phone they stay
 * pinned together at the top while the chat scrolls.
 */
export default function RoomStage({
  track,
  participants,
  selfId,
  clockOffsetMs,
  reactions,
  mine,
  likePulse,
  queue,
  messages,
  compact,
  decor,
  djAction,
  sound,
  onLike,
  onSkip,
}: RoomStageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const { volume, muted, setVolume, setMuted, toggleMute } = sound
  // Nothing is requested from YouTube until the viewer accepted its player (the choice is asked on the entry screen).
  const { choice } = useYouTubeConsent()
  const { ask } = useConsentDialog()
  const { status, unavailableReason, enableSound } = useYouTubePlayer(hostRef, {
    track,
    clockOffsetMs,
    volume,
    muted,
    enabled: choice === 'accepted',
  })
  const playerOff = status === 'consent-needed'

  // The lock screen and the headphones: "pause" mutes (the room's timeline goes on, nobody falls behind), "play" unmutes
  // and realigns. Only with the player on: without it there is nothing to control.
  useMediaSession({
    track,
    album: queue.current ? `Passé par ${queue.current.pseudo}` : 'Sélection de la room',
    playing: (status === 'playing' || status === 'sound-blocked') && !muted && volume > 0,
    active: choice === 'accepted',
    clockOffsetMs,
    onPause: () => setMuted(true),
    onPlay: () => {
      setMuted(false)
      enableSound()
    },
  })
  // This viewer's player could not play the track (blocked in their country, forbidden by its owner, removed): they are
  // told on the screen, which has nothing else to show. The room does not skip the track for one person: the others
  // hear it, and this one goes on with the next.
  const unavailable = status === 'video-unavailable' ? UNAVAILABLE_TEXT[unavailableReason ?? 'other'] : null

  // The DJ on the decks does not like or vote on their own track; skipping it hands the decks over, and the button
  // says to whom (the next DJ who can play, or their own next track).
  const place = findMyPlace(queue, selfId)
  const onDecks = place?.onDecks === true
  const othersCanPlay = queue.waiting.some((entry) => entry.participantId !== null && entry.next !== null)
  const skipHint = place?.onDecks ? ownSkipHint(othersCanPlay, place.entry.next !== null) : null

  // A refusal of a reaction, or a track kept in a playlist: said for a moment over the bar.
  const [message, setMessage] = useState<{ kind: ReactionMessageKind; text: string } | null>(null)
  const messageTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(messageTimer.current), [])
  const showMessage = useCallback((kind: ReactionMessageKind, text: string, forMs: number) => {
    setMessage({ kind, text })
    window.clearTimeout(messageTimer.current)
    messageTimer.current = window.setTimeout(() => setMessage(null), forMs)
  }, [])

  const video = (
    <VideoScreen
      hostRef={hostRef}
      boomKey={track?.startedAt}
      pulseKey={likePulse}
      message={playerOff ? PLAYER_OFF.text : unavailable ? unavailable.text : (SCREEN_MESSAGES[status] ?? null)}
      messageTitle={playerOff ? PLAYER_OFF.title : unavailable?.title}
      announce={unavailable !== null || playerOff}
      interactive={status === 'tap-needed'}
      action={playerOff ? { label: 'Activer le lecteur', onClick: () => ask({ intent: 'enable' }) } : null}
    />
  )

  return (
    <div className="room__player">
      {compact ? (
        <MobileScene participants={participants} selfId={selfId} dj={queue.current} likePulse={likePulse} decor={decor}>
          {video}
        </MobileScene>
      ) : (
        <Scene
          participants={participants}
          selfId={selfId}
          dj={queue.current}
          queuePosition={place && !place.onDecks ? place.position : null}
          likePulse={likePulse}
          messages={messages}
          clockOffsetMs={clockOffsetMs}
          decor={decor}
        >
          {video}
        </Scene>
      )}
      <NowPlayingBar
        track={track}
        dj={queue.current}
        ownTurn={onDecks}
        clockOffsetMs={clockOffsetMs}
        status={status}
        unavailableReason={unavailableReason}
        volume={volume}
        muted={muted}
        onVolumeChange={setVolume}
        onToggleMute={toggleMute}
        onEnableSound={enableSound}
        djAction={djAction}
        compact={compact}
        message={message}
        actions={
          <ReactionButtons
            track={track}
            reactions={reactions}
            mine={mine}
            clockOffsetMs={clockOffsetMs}
            onDecks={onDecks}
            compact={compact}
            ownSkipHint={skipHint}
            onLike={onLike}
            onSkip={onSkip}
            onMessage={showMessage}
          />
        }
      />
    </div>
  )
}
