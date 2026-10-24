import { trackPositionSec } from '../../shared/clock'
import type { DjQueue, DjQueueEntry, Track } from '../../shared/protocol'

export const EMPTY_QUEUE: DjQueue = { current: null, waiting: [] }

/** Where the viewer stands in the queue. */
export interface MyPlace {
  entry: DjQueueEntry
  /** On the decks right now. */
  onDecks: boolean
  /** Place among the waiting DJs, 0 for the next one to play. Null on the decks. */
  position: number | null
}

export function findMyPlace(queue: DjQueue, selfId: string | undefined): MyPlace | null {
  if (!selfId) return null
  if (queue.current?.participantId === selfId) return { entry: queue.current, onDecks: true, position: null }
  const position = queue.waiting.findIndex((entry) => entry.participantId === selfId)
  return position === -1 ? null : { entry: queue.waiting[position], onDecks: false, position }
}

/** DJs in the queue, the one on the decks included: what the room's `maxDjs` counts. */
export function djCount(queue: DjQueue): number {
  return queue.waiting.length + (queue.current ? 1 : 0)
}

/**
 * A rough time before the DJs ahead have played: what is left of the track on the decks, then the next track of each
 * waiting DJ in front who is here and has one (the others are skipped at their turn). `ahead` is how many waiting DJs
 * stand in front: all of them for someone who is not in the queue yet.
 */
export function estimateWaitSec(queue: DjQueue, nowPlaying: Track | null, serverNow: number, ahead: number): number {
  const remaining =
    queue.current && nowPlaying ? Math.max(0, nowPlaying.durationSec - trackPositionSec(nowPlaying, serverNow)) : 0
  const tracks = queue.waiting
    .slice(0, ahead)
    .reduce((sum, entry) => sum + (entry.participantId !== null && entry.next ? entry.next.durationSec : 0), 0)
  return remaining + tracks
}
