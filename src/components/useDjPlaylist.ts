import { useEffect, useState } from 'react'
import type { PlaylistTrack, RoomRules, TrackStatus } from '../../shared/protocol'
import { formatSpan } from '../data/duration'
import { verdictText } from '../playlists/playlistMessages'
import { usePlaylists, usePlaylistTracks } from '../playlists/usePlaylists'
import { djErrorMessage } from '../realtime/djMessages'
import type { SendPlaylistStatusResult } from '../realtime/useRoom'

/** Why the room would not take a playlist track now: a few words for its row, a sentence when it is pressed anyway. */
export interface Verdict {
  short: string
  full: string
}

/**
 * What the room says about a playlist track, or null when it would take it. "Joué il y a 41 min" as in mock-up 3c: how
 * long ago is the room's delay minus the time left before the track may come back.
 */
export function trackVerdict(track: PlaylistTrack, status: TrackStatus | undefined, rules: RoomRules): Verdict | null {
  if (track.unavailable || status?.state === 'unavailable') {
    return { short: 'Indisponible', full: 'Cette vidéo ne peut plus être lue ici (retirée, privée ou plus intégrable).' }
  }
  if (!status || status.state === 'ok') return null
  switch (status.state) {
    case 'too-long':
      return { short: verdictText(status) ?? '', full: djErrorMessage({ ok: false, error: 'too-long', maxSec: status.maxSec }) }
    case 'recently-played': {
      const full = djErrorMessage({ ok: false, error: 'recently-played', retryAfterSec: status.retryAfterSec })
      if (status.retryAfterSec === null || rules.repeatDelaySec === null) return { short: 'Déjà joué ici', full }
      const agoMin = Math.max(1, Math.round((rules.repeatDelaySec - status.retryAfterSec) / 60))
      return { short: `Joué il y a ${formatSpan(agoMin * 60)}`, full }
    }
    case 'not-music':
      return { short: 'Pas de la musique', full: djErrorMessage({ ok: false, error: 'not-music' }) }
    case 'queued':
      return { short: 'Déjà dans la file', full: djErrorMessage({ ok: false, error: 'already-queued' }) }
  }
}

/**
 * The member's playlists in "Passer DJ": the list, the tracks of the active one, and what the room says about each.
 * `refreshKey` changes when that answer may have changed (what plays, the member's own line-up); `keptVersion` goes up
 * when a track was kept in a playlist from elsewhere in the dialog.
 */
export function useDjPlaylist(
  onPlaylistStatus: (playlistId: string) => Promise<SendPlaylistStatusResult>,
  refreshKey: string,
  keptVersion: number,
) {
  const lists = usePlaylists()
  const { activeId } = lists
  const tracks = usePlaylistTracks(activeId, keptVersion)
  const [statuses, setStatuses] = useState<Record<string, TrackStatus>>({})

  // Asked again when the playlist, its tracks, what plays or the member's own line-up change; a moment after, so that a
  // burst of changes is one question.
  const trackIds = tracks.tracks.map((track) => track.id).join(',')
  useEffect(() => {
    if (!activeId || tracks.status !== 'ready' || trackIds === '') return
    let cancelled = false
    let timer: number | undefined
    const ask = async () => {
      const result = await onPlaylistStatus(activeId)
      if (cancelled) return
      if (result.ok) setStatuses(result.statuses)
      // Too many questions at once: once more when the server says it is fine. Any other failure leaves the tracks
      // without a verdict, and the server still says why when one of them is refused.
      else if (result.error === 'rate-limited') timer = window.setTimeout(ask, result.retryAfterMs + 50)
    }
    timer = window.setTimeout(ask, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [activeId, tracks.status, trackIds, refreshKey, onPlaylistStatus])

  return { lists, tracks, statuses }
}

export type DjPlaylist = ReturnType<typeof useDjPlaylist>
