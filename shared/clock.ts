// How the client reads the server's timeline. Pure functions, shared so both sides agree on the maths.
import type { Track } from './protocol'

/**
 * Milliseconds to add to the local clock to get the server clock.
 * Assumes the answer took as long to come back as the request took to go.
 */
export function estimateClockOffset(sentAt: number, receivedAt: number, serverTime: number): number {
  return serverTime + (receivedAt - sentAt) / 2 - receivedAt
}

/** Seconds into the track at the given server time. Never negative, may exceed the duration once it is over. */
export function trackPositionSec(track: Pick<Track, 'startedAt'>, serverNow: number): number {
  return Math.max(0, (serverNow - track.startedAt) / 1000)
}

export function isTrackOver(track: Pick<Track, 'startedAt' | 'durationSec'>, serverNow: number): boolean {
  return trackPositionSec(track, serverNow) >= track.durationSec
}

/** A player is out of sync when it is further from the server timeline than the tolerance, ahead or behind. */
export function isOutOfSync(playerSec: number, expectedSec: number, toleranceSec: number): boolean {
  return Math.abs(playerSec - expectedSec) > toleranceSec
}
