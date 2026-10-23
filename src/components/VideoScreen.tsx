import type { RefObject } from 'react'
import './VideoScreen.css'

interface VideoScreenProps {
  /** Where the YouTube player is mounted. */
  hostRef: RefObject<HTMLDivElement | null>
  /** Changes at each moment worth a "boom": the ring around the screen pulses again. */
  boomKey: number | undefined
  /** Goes up at each like: a smaller ring. Zero means no like yet. */
  pulseKey: number
  /** Replaces the video when there is none to show. Never laid over a video that is playing. */
  message: string | null
  /** Lets taps reach the YouTube player, for browsers that only start a video when it is touched. */
  interactive: boolean
}

export default function VideoScreen({ hostRef, boomKey, pulseKey, message, interactive }: VideoScreenProps) {
  return (
    <div className={interactive ? 'screen screen--interactive' : 'screen'}>
      {boomKey !== undefined && <span key={boomKey} className="screen__boom" aria-hidden="true" />}
      {pulseKey > 0 && <span key={pulseKey} className="screen__pulse" aria-hidden="true" />}
      <div className="screen__video">
        <div ref={hostRef} className="screen__host" />
        {message && <p className="screen__message">{message}</p>}
      </div>
    </div>
  )
}
