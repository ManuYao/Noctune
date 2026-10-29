import type { RoomStyle } from '../../../shared/protocol'

/** The genres that have a decor of their own, in the room, on the entry screen and on the card of the list. */
export type DecorKind = 'lofi' | 'rock' | 'electro' | 'jazz' | 'rap' | 'afro' | 'french'

const KIND_OF_STYLE: Partial<Record<RoomStyle, DecorKind>> = {
  lofi: 'lofi',
  rock: 'rock',
  electro: 'electro',
  jazz: 'jazz',
  rap: 'rap',
  afro: 'afro',
}

// The room of the team that has its own scene (Paris at sunset) although its style is "rap": today "Rap français", whose id
// stayed the one of the French touch it replaced.
const FRENCH_TOUCH_ID = 'french-touch'

/**
 * Which decor a room wears: its first style decides, and the French touch of the team has its own. Pop, classical and a
 * room that has no style yet get none (null): the generic club, in the colours of the room's ambiance.
 */
export function decorKind(room: { id?: string; styles: readonly RoomStyle[] }): DecorKind | null {
  if (room.id === FRENCH_TOUCH_ID) return 'french'
  const first = room.styles[0]
  return first ? (KIND_OF_STYLE[first] ?? null) : null
}
