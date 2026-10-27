// What is counted about a member, as a plain value. The same shape serves as an addition (a delta, where likes may be
// negative) and as the total a store keeps; `combine` is the one place that knows how each field adds up.

export interface StyleActivity {
  /** The member entered a room of this style. */
  visited: boolean
  /** A track of theirs played in a room of this style. */
  played: boolean
  seconds: number
}

export interface RoomVisits {
  visits: number
  seconds: number
}

export interface Activity {
  tracksPlayed: number
  likesReceived: number
  likesGiven: number
  messagesSent: number
  listenSeconds: number
  /** High-water marks: they combine by taking the larger. */
  bestTrackLikes: number
  bestRoomMembers: number
  nightOwl: boolean
  /** Calendar days, `YYYY-MM-DD`, Europe/Paris. */
  days: Set<string>
  styles: Map<string, StyleActivity>
  rooms: Map<string, RoomVisits>
}

export function emptyActivity(): Activity {
  return {
    tracksPlayed: 0,
    likesReceived: 0,
    likesGiven: 0,
    messagesSent: 0,
    listenSeconds: 0,
    bestTrackLikes: 0,
    bestRoomMembers: 0,
    nightOwl: false,
    days: new Set(),
    styles: new Map(),
    rooms: new Map(),
  }
}

/**
 * `a` plus `b`, as a new value. With `clamp`, a counter never goes under zero (a like taken back whose "+1" was never
 * written): that is what a store does; between two pending deltas the plain sum is kept, so that +1 and -1 cancel out.
 */
export function combine(a: Activity, b: Activity, clamp = false): Activity {
  const sum = (x: number, y: number) => (clamp ? Math.max(0, x + y) : x + y)
  const styles = new Map<string, StyleActivity>()
  for (const source of [a.styles, b.styles]) {
    for (const [style, value] of source) {
      const known = styles.get(style)
      styles.set(style, {
        visited: (known?.visited ?? false) || value.visited,
        played: (known?.played ?? false) || value.played,
        seconds: (known?.seconds ?? 0) + value.seconds,
      })
    }
  }
  const rooms = new Map<string, RoomVisits>()
  for (const source of [a.rooms, b.rooms]) {
    for (const [room, value] of source) {
      const known = rooms.get(room)
      rooms.set(room, { visits: (known?.visits ?? 0) + value.visits, seconds: (known?.seconds ?? 0) + value.seconds })
    }
  }
  return {
    tracksPlayed: sum(a.tracksPlayed, b.tracksPlayed),
    likesReceived: sum(a.likesReceived, b.likesReceived),
    likesGiven: sum(a.likesGiven, b.likesGiven),
    messagesSent: sum(a.messagesSent, b.messagesSent),
    listenSeconds: sum(a.listenSeconds, b.listenSeconds),
    bestTrackLikes: Math.max(a.bestTrackLikes, b.bestTrackLikes),
    bestRoomMembers: Math.max(a.bestRoomMembers, b.bestRoomMembers),
    nightOwl: a.nightOwl || b.nightOwl,
    days: new Set([...a.days, ...b.days]),
    styles,
    rooms,
  }
}

const parisParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
})

/** The calendar day (`YYYY-MM-DD`) and hour (0 to 23) at this instant in Paris. */
export function parisDayAndHour(ms: number): { day: string; hour: number } {
  const parts: Record<string, string> = {}
  for (const part of parisParts.formatToParts(new Date(ms))) parts[part.type] = part.value
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) }
}

/** Between 02:00 and 05:00 (Europe/Paris). */
export const isNightOwlHour = (hour: number): boolean => hour >= 2 && hour < 5
