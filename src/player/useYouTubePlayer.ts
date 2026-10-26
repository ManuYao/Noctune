import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { isOutOfSync, isTrackOver, trackPositionSec } from '../../shared/clock'
import type { Track } from '../../shared/protocol'
import { unavailableReason, type UnavailableReason } from './unavailable'
import { loadYouTubeApi, PLAYER_STATE, type YouTubePlayer } from './youtubeApi'

export type PlayerStatus =
  | 'loading' // the video is being fetched
  | 'idle' // nothing to play right now
  | 'playing'
  | 'sound-blocked' // playing muted: the browser wants a tap before it allows sound
  | 'tap-needed' // the browser refused to start at all before a tap
  | 'video-unavailable' // YouTube refuses this video in an embedded player
  | 'player-failed' // the player itself could not load (offline, blocked script)
  | 'consent-needed' // the visitor has not accepted the YouTube player: nothing is requested from YouTube

interface PlayerOptions {
  /** The visitor accepted the YouTube player. Without it the script and the player are not loaded at all. */
  enabled: boolean
  track: Track | null
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
  /** 0 to 1. */
  volume: number
  muted: boolean
}

// Right after a video starts, a small gap is worth fixing; during playback every seek costs a stutter.
const FIRST_SYNC_TOLERANCE_SEC = 0.8
const DRIFT_TOLERANCE_SEC = 1.5
const DRIFT_CHECK_MS = 5000
// How long a browser gets to start playing before we assume it blocked autoplay.
const AUTOPLAY_WAIT_MS = 3000
const PLAYER_LOAD_TIMEOUT_MS = 15000
const MAX_RESUME_ATTEMPTS = 3

function isActive(player: YouTubePlayer): boolean {
  const state = player.getPlayerState()
  return state === PLAYER_STATE.PLAYING || state === PLAYER_STATE.BUFFERING
}

/** Seeks only when the player has drifted away from the server timeline. */
function correctDrift(player: YouTubePlayer, track: Track, clockOffsetMs: number, toleranceSec: number) {
  const serverNow = Date.now() + clockOffsetMs
  if (isTrackOver(track, serverNow)) return // the server is about to send the next track
  const expected = trackPositionSec(track, serverNow)
  if (isOutOfSync(player.getCurrentTime(), expected, toleranceSec)) player.seekTo(expected, true)
}

/**
 * Plays the room's current track in the official YouTube player and keeps it on the server timeline.
 * The server only says which video started when; this hook does the rest: seek to the right second,
 * correct drift, and cope with browsers that refuse to start a video with sound.
 */
export function useYouTubePlayer(hostRef: RefObject<HTMLDivElement | null>, options: PlayerOptions) {
  const { track, volume, muted, enabled } = options
  const [status, setStatus] = useState<PlayerStatus>(enabled ? 'loading' : 'consent-needed')
  // Why the player refused the track, while the status says it did. Only this viewer's player knows it.
  const [reason, setReason] = useState<UnavailableReason | null>(null)
  const [ready, setReady] = useState(false)

  const playerRef = useRef<YouTubePlayer | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const firstSyncDone = useRef(false)
  const resumeAttempts = useRef(0)
  // The browser refused sound: the video plays muted until the visitor taps. Kept from one track to the next.
  const soundBlocked = useRef(false)
  // Latest values for callbacks that outlive a render.
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })

  // Create the player once the visitor accepted it, and destroy it with the screen (or when they take the consent back
  // in another tab). Without the consent nothing is loaded: no script, no iframe, no request to YouTube or Google.
  useEffect(() => {
    if (!enabled) {
      setStatus('consent-needed')
      return
    }
    setStatus((previous) => (previous === 'consent-needed' ? 'loading' : previous))
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    let player: YouTubePlayer | undefined
    // The YouTube script swaps this element for its iframe, so React must not own it.
    const mount = document.createElement('div')
    host.append(mount)

    const loadTimeout = window.setTimeout(() => {
      if (!playerRef.current) setStatus('player-failed')
    }, PLAYER_LOAD_TIMEOUT_MS)

    function onStateChange(state: number) {
      const current = playerRef.current
      if (!current) return
      const { track: playing, clockOffsetMs } = latest.current

      if (state === PLAYER_STATE.PLAYING) {
        window.clearTimeout(timer.current)
        resumeAttempts.current = 0
        setStatus(soundBlocked.current ? 'sound-blocked' : 'playing')
        if (!firstSyncDone.current && playing) {
          firstSyncDone.current = true
          correctDrift(current, playing, clockOffsetMs, FIRST_SYNC_TOLERANCE_SEC)
        }
      } else if (state === PLAYER_STATE.ENDED) {
        setStatus('idle')
      } else if (
        state === PLAYER_STATE.PAUSED &&
        playing &&
        !isTrackOver(playing, Date.now() + clockOffsetMs) &&
        resumeAttempts.current < MAX_RESUME_ATTEMPTS
      ) {
        // Nobody can pause here, but a phone may pause the video in the background: resume it.
        resumeAttempts.current += 1
        current.playVideo()
      }
    }

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return
        player = new YT.Player(mount, {
          width: '100%',
          height: '100%',
          // Privacy-enhanced mode: no tracking cookie before the visitor plays something.
          host: 'https://www.youtube-nocookie.com',
          // No controls: everyone hears the same thing at the same time, nobody seeks or pauses.
          playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, origin: window.location.origin },
          events: {
            onReady: () => {
              if (cancelled) return
              window.clearTimeout(loadTimeout)
              playerRef.current = player ?? null
              setReady(true)
            },
            onStateChange: (event) => onStateChange(event.data),
            onError: (event) => {
              // The start-up watchdog of the track must not run on: it would read a video that cannot play as a browser
              // that blocks autoplay, put the player in "sound blocked" for every track after it, and hide the message.
              window.clearTimeout(timer.current)
              setReason(unavailableReason(event.data))
              setStatus('video-unavailable')
            },
          },
        })
      })
      .catch(() => {
        if (!cancelled) setStatus('player-failed')
      })

    return () => {
      cancelled = true
      window.clearTimeout(loadTimeout)
      window.clearTimeout(timer.current)
      playerRef.current = null
      setReady(false)
      player?.destroy()
      mount.remove()
    }
  }, [hostRef, enabled])

  // Volume and mute. Declared before the track effect so they are set when a video starts.
  useEffect(() => {
    const player = playerRef.current
    if (!ready || !player) return
    player.setVolume(Math.round(volume * 100))
    if (muted || soundBlocked.current) player.mute()
    else player.unMute()
  }, [ready, volume, muted])

  // Load the video when the server starts a track, at the second the server timeline says it is at.
  const trackKey = track ? `${track.id}|${track.videoId}|${track.startedAt}` : ''
  useEffect(() => {
    const player = playerRef.current
    if (!ready || !player) return
    window.clearTimeout(timer.current)
    firstSyncDone.current = false
    resumeAttempts.current = 0

    // A new track (or none): whatever the player said about the previous one is over.
    setReason(null)
    const serverNow = Date.now() + latest.current.clockOffsetMs
    if (!track || isTrackOver(track, serverNow)) {
      player.stopVideo()
      setStatus('idle')
      return
    }

    setStatus('loading')
    player.loadVideoById({ videoId: track.videoId, startSeconds: trackPositionSec(track, serverNow) })

    // Browsers refuse to start a video with sound before the visitor has interacted with the page, and
    // phones are stricter. Muted playback is always allowed: keep the video moving, ask for one tap.
    timer.current = window.setTimeout(() => {
      if (isActive(player)) return
      if (soundBlocked.current) {
        setStatus('tap-needed')
        return
      }
      soundBlocked.current = true
      player.mute()
      player.playVideo()
      timer.current = window.setTimeout(() => {
        if (!isActive(player)) setStatus('tap-needed')
      }, AUTOPLAY_WAIT_MS)
    }, AUTOPLAY_WAIT_MS)

    return () => window.clearTimeout(timer.current)
    // `track` is tracked through trackKey: a new object with the same content must not reload the video.
  }, [ready, trackKey])

  // Drift correction while playing, and realignment when the page comes back from the background.
  useEffect(() => {
    if (!ready) return

    function realign(toleranceSec: number) {
      const player = playerRef.current
      const { track: playing, clockOffsetMs } = latest.current
      if (player && playing && player.getPlayerState() === PLAYER_STATE.PLAYING) {
        correctDrift(player, playing, clockOffsetMs, toleranceSec)
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      const player = playerRef.current
      if (player && latest.current.track && player.getPlayerState() === PLAYER_STATE.PAUSED) {
        resumeAttempts.current = 0
        player.playVideo()
      }
      realign(FIRST_SYNC_TOLERANCE_SEC)
    }

    const interval = window.setInterval(() => realign(DRIFT_TOLERANCE_SEC), DRIFT_CHECK_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [ready])

  /** To call from a tap or click: that gesture is what lets the browser play with sound. */
  const enableSound = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    const { track: playing, clockOffsetMs, volume: wantedVolume, muted: wantMuted } = latest.current

    soundBlocked.current = false
    player.setVolume(Math.round(wantedVolume * 100))
    if (!wantMuted) player.unMute()
    player.playVideo()
    if (playing) correctDrift(player, playing, clockOffsetMs, FIRST_SYNC_TOLERANCE_SEC)

    setStatus(player.getPlayerState() === PLAYER_STATE.PLAYING ? 'playing' : 'loading')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      if (!isActive(player)) setStatus('tap-needed')
    }, AUTOPLAY_WAIT_MS)
  }, [])

  return { status, unavailableReason: reason, enableSound }
}
