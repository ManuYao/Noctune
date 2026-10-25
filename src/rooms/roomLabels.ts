import type { RoomRules, RoomStyle, RoomTheme } from '../../shared/protocol'
import { formatSpan } from '../data/duration'

export const STYLE_LABELS: Record<RoomStyle, string> = {
  lofi: 'Lo-fi',
  rap: 'Rap',
  electro: 'Électro',
  rock: 'Rock',
  jazz: 'Jazz',
  afro: 'Afro',
  pop: 'Pop',
  classique: 'Classique',
}

export const THEME_LABELS: Record<RoomTheme, string> = {
  neon: 'Néon nuit',
  sunset: 'Sunset club',
  vinyl: 'Vinyle clair',
  jungle: 'Jungle',
}

/** The `data-theme` that gives a room its look. The default look is the one with none. */
export const themeAttribute = (theme: RoomTheme): string | undefined => (theme === 'neon' ? undefined : theme)

/** A choice for the longest track, the way the form and the cards say it. */
export const maxTrackLabel = (seconds: number | null) => (seconds === null ? 'Sans limite' : formatSpan(seconds))

/** A choice for the delay before a track may come back. */
export const repeatLabel = (seconds: number | null) => (seconds === null ? 'Jamais' : formatSpan(seconds))

/** The short chip of a card: "15 min max". */
export const maxTrackChip = (rules: RoomRules) =>
  rules.maxTrackSec === null ? 'Sans limite de durée' : `${formatSpan(rules.maxTrackSec)} max`

/** What lets somebody search a room by its styles: "Électro" is found by "electro". */
export const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
