import type { DjError, VideoInfo } from '../../../shared/protocol'

/** Why a link could not become a track that can play. */
export type ResolveError = Extract<
  DjError,
  'invalid-link' | 'not-found' | 'not-embeddable' | 'unavailable' | 'service-unavailable'
>

export type ResolveResult = { ok: true; video: VideoInfo } | { ok: false; error: ResolveError }

/**
 * Turns what a DJ pastes (a link, a video id) into a video that is known to exist and to play in the embedded
 * player. It knows nothing about rooms: the rules (duration, repeats) are the room's job.
 */
export interface TrackResolver {
  /** Never throws: whatever goes wrong on the way (network, quota, malformed answer) is an error value. */
  resolve(input: string): Promise<ResolveResult>
}
