import type { RoomRules, RoomSummary } from '../../shared/protocol'
import { formatSpan } from '../data/duration'

export interface RuleLine {
  title: string
  text: string
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`

/** "7 minutes", "2 heures", else the short span ("7 min 30 s"). */
function longSpan(seconds: number): string {
  if (seconds % 3600 === 0) return plural(seconds / 3600, 'heure')
  if (seconds % 60 === 0) return plural(seconds / 60, 'minute')
  return formatSpan(seconds)
}

/**
 * What the page "Infos de la room" says of the room's rules, as the server applies them: a track longer than the limit is
 * refused (when it is added, and again before it plays), one that played recently waits, the queue holds so many DJs. Then
 * the two rules every room shares.
 */
export function roomRuleLines(rules: RoomRules): RuleLine[] {
  return [
    rules.maxTrackSec === null
      ? { title: 'Pas de limite de durée', text: 'Les morceaux de toute durée sont acceptés.' }
      : { title: `${longSpan(rules.maxTrackSec)} maximum`, text: 'Les morceaux plus longs sont refusés.' },
    {
      title: 'Pas de doublon',
      text: rules.repeatDelaySec === null ? 'Un morceau joué ne revient plus dans cette room.' : `Un morceau ne revient pas avant ${longSpan(rules.repeatDelaySec)}.`,
    },
    { title: `${rules.maxDjs} DJ au plus`, text: 'Au-delà, la file est complète.' },
    { title: 'Sois bienveillant', text: "Pas de spam, pas d'insultes, pas de liens dans le chat." },
    { title: 'Un passage à la fois', text: 'Ensuite, retour en bout de file.' },
  ]
}

/**
 * Up to three other rooms for the foot of the page: the ones that share a style with this room (most shared first, then the
 * busiest). When none does, the busiest ones, and `similar` is false so that the page does not call them similar.
 */
export function similarRooms(rooms: readonly RoomSummary[], current: RoomSummary): { rooms: RoomSummary[]; similar: boolean } {
  const others = rooms.filter((room) => room.id !== current.id)
  const shared = (room: RoomSummary) => room.styles.filter((style) => current.styles.includes(style)).length
  const rank = (a: RoomSummary, b: RoomSummary) => shared(b) - shared(a) || b.online - a.online
  const alike = others.filter((room) => shared(room) > 0).sort(rank)
  if (alike.length > 0) return { rooms: alike.slice(0, 3), similar: true }
  return { rooms: [...others].sort((a, b) => b.online - a.online).slice(0, 3), similar: false }
}

/** "mars 2026": when a member opened the room. */
export const openedSince = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

/** The link that leads into a room (the entry screen with the room proposed: the first click starts the player). */
export const roomLink = (roomId: string, origin: string) => `${origin}/?room=${encodeURIComponent(roomId)}`
