// The part of the YouTube IFrame Player API that a room uses, typed by hand to avoid a dependency.
// https://developers.google.com/youtube/iframe_api_reference
import { getConsent } from '../consent/consentStore'

export const PLAYER_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const

export interface YouTubePlayer {
  loadVideoById(options: { videoId: string; startSeconds?: number }): void
  stopVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
  mute(): void
  unMute(): void
  setVolume(volume: number): void
  getCurrentTime(): number
  getPlayerState(): number
  destroy(): void
}

interface PlayerOptions {
  width: string
  height: string
  host: string
  playerVars: Record<string, string | number>
  events: {
    onReady: () => void
    onStateChange: (event: { data: number }) => void
    onError: (event: { data: number }) => void
  }
}

interface YouTubeNamespace {
  Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayer
}

interface YouTubeWindow {
  YT?: YouTubeNamespace
  onYouTubeIframeAPIReady?: () => void
}

let apiPromise: Promise<YouTubeNamespace> | undefined

/**
 * Loads the YouTube script once. It is only called when a room opens, never at startup, and only for a visitor who
 * accepted the player: until then nothing is requested from YouTube or Google. (The room's player hook already waits for the
 * consent; this is the second lock, so that no caller can load the script without it.)
 */
export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (getConsent() !== 'accepted') return Promise.reject(new Error('The visitor has not accepted the YouTube player'))
  const win = window as unknown as YouTubeWindow
  if (win.YT?.Player) return Promise.resolve(win.YT)

  apiPromise ??= new Promise<YouTubeNamespace>((resolve, reject) => {
    const previous = win.onYouTubeIframeAPIReady
    win.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(win.YT as YouTubeNamespace)
    }

    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => {
      apiPromise = undefined
      script.remove()
      reject(new Error('The YouTube player script could not be loaded'))
    }
    document.head.append(script)
  })
  return apiPromise
}
