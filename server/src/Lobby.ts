import type { RoomSummary } from '../../shared/protocol'
import type { Room } from './Room'
import type { StoredRoom } from './rooms/RoomStore'

/** Socket.IO channel of the people looking at the list of rooms. Not a valid room id, so it cannot clash with one. */
export const LOBBY_CHANNEL = '#lobby'

// However many people come and go, the list is sent at most twice a second.
export const LOBBY_BROADCAST_MS = 500

export function summarize(def: StoredRoom, room: Room): RoomSummary {
  const track = room.nowPlaying
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    styles: [...def.styles],
    theme: def.theme,
    host: def.hostPseudo,
    rules: { ...room.rules },
    online: room.size,
    nowPlaying: track ? { title: track.title, artist: track.artist } : null,
    djs: room.djCount,
    maxDjs: room.rules.maxDjs,
  }
}

/**
 * The list of rooms and the people who follow it. Changes are announced in batches: a crowd arriving is a few
 * messages, not one per person. Each message carries the whole list as it is when it is sent.
 */
export class Lobby {
  private timer: NodeJS.Timeout | undefined

  constructor(
    private readonly summaries: () => RoomSummary[],
    private readonly broadcast: (rooms: RoomSummary[]) => void,
    private readonly delayMs: number = LOBBY_BROADCAST_MS,
  ) {}

  snapshot(): RoomSummary[] {
    return this.summaries()
  }

  /** Something the list shows has changed (people, track). The followers hear about it shortly, once for any number of changes. */
  changed() {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.broadcast(this.summaries())
    }, this.delayMs)
  }
}
