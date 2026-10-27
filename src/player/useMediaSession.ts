import { useEffect, useRef } from 'react'
import { trackPositionSec } from '../../shared/clock'
import { getConsent } from '../consent/consentStore'
import type { Track } from '../../shared/protocol'

interface MediaSessionOptions {
  /** The track that plays in the room (null: nothing). */
  track: Track | null
  /** Who brought it, for the album line; the room's name when it is the room's own selection. */
  album: string
  /** The player plays and the viewer hears it. */
  playing: boolean
  /** The viewer is in the room with a player (otherwise the session is left alone). */
  active: boolean
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
  /** Lock screen "pause": mutes. The room's timeline goes on, so nobody falls behind. */
  onPause: () => void
  /** Lock screen "play": unmutes and realigns on the server clock. */
  onPlay: () => void
}

const LOCAL_ARTWORK = [
  { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
]

function setHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
  try {
    navigator.mediaSession.setActionHandler(action, handler)
  } catch {
    // An action this browser does not know: nothing to register.
  }
}

/**
 * Tells the system what plays (lock screen, notification, headphones) through the Media Session API.
 * "Pause" means "mute": a room is one shared timeline, so pausing would put the listener behind the others.
 * There is no "next track": the room's only skip is a vote, and a vote is not what a lock-screen button promises.
 */
export function useMediaSession({ track, album, playing, active, clockOffsetMs, onPause, onPlay }: MediaSessionOptions) {
  const handlers = useRef({ onPause, onPlay })
  useEffect(() => {
    handlers.current = { onPause, onPlay }
  })
  const supported = typeof navigator !== 'undefined' && 'mediaSession' in navigator
  const videoId = track?.videoId
  const title = track?.title
  const artist = track?.artist
  const durationSec = track?.durationSec
  const startedAt = track?.startedAt

  // What plays. Without the viewer's consent to YouTube, the lock screen gets the site's own icon: no address of
  // YouTube or Google is ever handed to the system.
  useEffect(() => {
    if (!supported || !active || !videoId || title === undefined) return
    // The thumbnail comes from YouTube's image server, fetched by the system: only for a viewer who accepted YouTube.
    const artwork = getConsent() === 'accepted'
      ? [{ src: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' }, ...LOCAL_ARTWORK]
      : LOCAL_ARTWORK
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist: artist ?? '', album, artwork })
    } catch {
      // Metadata the system refuses: the page keeps playing without a lock screen card.
    }
    return () => {
      try {
        navigator.mediaSession.metadata = null
      } catch {
        // Nothing to clean.
      }
    }
  }, [supported, active, videoId, title, artist, album])

  // Where the track is, so that the lock screen draws its progress line. It is only a picture of the server timeline:
  // there is no seek handler, nobody can move in a shared track.
  useEffect(() => {
    if (!supported || !active || startedAt === undefined || !durationSec) return
    const update = () => {
      if (!track) return
      const position = Math.min(durationSec, Math.max(0, trackPositionSec(track, Date.now() + clockOffsetMs)))
      try {
        navigator.mediaSession.setPositionState({ duration: durationSec, position, playbackRate: 1 })
      } catch {
        // Older engines refuse the call: the card has no progress line.
      }
    }
    update()
    // The card drifts only by the clock error; refreshing when the page comes back (and when the clock offset is
    // measured again) is enough.
    document.addEventListener('visibilitychange', update)
    return () => {
      document.removeEventListener('visibilitychange', update)
      try {
        navigator.mediaSession.setPositionState()
      } catch {
        // Nothing to clean.
      }
    }
    // `track` is described by its fields: a new object with the same content changes nothing.
  }, [supported, active, videoId, startedAt, durationSec, clockOffsetMs])

  useEffect(() => {
    if (!supported || !active) return
    try {
      navigator.mediaSession.playbackState = videoId ? (playing ? 'playing' : 'paused') : 'none'
    } catch {
      // Nothing to say.
    }
  }, [supported, active, videoId, playing])

  useEffect(() => {
    if (!supported || !active) return
    setHandler('play', () => handlers.current.onPlay())
    setHandler('pause', () => handlers.current.onPause())
    return () => {
      setHandler('play', null)
      setHandler('pause', null)
      try {
        navigator.mediaSession.playbackState = 'none'
      } catch {
        // Nothing to clean.
      }
    }
  }, [supported, active])
}
