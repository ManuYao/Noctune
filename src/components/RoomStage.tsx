import { useRef } from 'react'
import type { DjQueue, MyReactions, Participant, Reactions, Track } from '../../shared/protocol'
import { useVolume } from '../player/useVolume'
import { UNAVAILABLE_TEXT } from '../player/unavailable'
import { useYouTubePlayer, type PlayerStatus } from '../player/useYouTubePlayer'
import { ownSkipHint } from '../realtime/djMessages'
import { findMyPlace } from '../realtime/djQueue'
import type { SendReactionResult } from '../realtime/useRoom'
import NowPlayingBar from './NowPlayingBar'
import ReactionButtons from './ReactionButtons'
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
  onLike: (value: boolean) => Promise<SendReactionResult>
  onSkip: (value: boolean) => Promise<SendReactionResult>
}

// Only for states where there is no video to look at: a message never covers a video that plays.
const SCREEN_MESSAGES: Partial<Record<PlayerStatus, string>> = {
  idle: 'En attente du prochain morceau…',
  'player-failed':
    "Le lecteur vidéo n'a pas pu se charger. Désactive ton bloqueur de publicités ou recharge la page.",
}

export default function RoomStage({
  track,
  participants,
  selfId,
  clockOffsetMs,
  reactions,
  mine,
  likePulse,
  queue,
  onLike,
  onSkip,
}: RoomStageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const { volume, muted, setVolume, toggleMute } = useVolume()
  const { status, unavailableReason, enableSound } = useYouTubePlayer(hostRef, { track, clockOffsetMs, volume, muted })
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

  return (
    <section aria-label="Lecteur" className="room-stage">
      <Scene participants={participants} selfId={selfId} dj={queue.current} likePulse={likePulse}>
        <VideoScreen
          hostRef={hostRef}
          boomKey={track?.startedAt}
          pulseKey={likePulse}
          message={unavailable ? unavailable.text : (SCREEN_MESSAGES[status] ?? null)}
          messageTitle={unavailable?.title}
          announce={unavailable !== null}
          interactive={status === 'tap-needed'}
        />
      </Scene>
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
        actions={
          <ReactionButtons
            track={track}
            reactions={reactions}
            mine={mine}
            clockOffsetMs={clockOffsetMs}
            onDecks={onDecks}
            ownSkipHint={skipHint}
            onLike={onLike}
            onSkip={onSkip}
          />
        }
      />
    </section>
  )
}
