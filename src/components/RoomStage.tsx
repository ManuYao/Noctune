import { useRef } from 'react'
import type { Track } from '../../shared/protocol'
import { useVolume } from '../player/useVolume'
import { useYouTubePlayer, type PlayerStatus } from '../player/useYouTubePlayer'
import NowPlayingBar from './NowPlayingBar'
import VideoScreen from './VideoScreen'

interface RoomStageProps {
  track: Track | null
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
}

// Only for states where there is no video to look at: a message never covers a video that plays.
const SCREEN_MESSAGES: Partial<Record<PlayerStatus, string>> = {
  idle: 'En attente du prochain morceau…',
  'player-failed':
    "Le lecteur vidéo n'a pas pu se charger. Désactive ton bloqueur de publicités ou recharge la page.",
}

export default function RoomStage({ track, clockOffsetMs }: RoomStageProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const { volume, muted, setVolume, toggleMute } = useVolume()
  const { status, enableSound } = useYouTubePlayer(hostRef, { track, clockOffsetMs, volume, muted })

  return (
    <section aria-label="Lecteur">
      <VideoScreen
        hostRef={hostRef}
        boomKey={track?.startedAt}
        message={SCREEN_MESSAGES[status] ?? null}
        interactive={status === 'tap-needed'}
      />
      <NowPlayingBar
        track={track}
        clockOffsetMs={clockOffsetMs}
        status={status}
        volume={volume}
        muted={muted}
        onVolumeChange={setVolume}
        onToggleMute={toggleMute}
        onEnableSound={enableSound}
      />
    </section>
  )
}
