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

/**
 * What a card of the list says about the queue of DJs (mock-up 2), and what the filter "Place DJ libre" keeps: a free
 * place is one where a DJ who joins plays right away or next (nobody waiting); `waiting` counts those behind the one at
 * the decks. Null for an older server, which does not count its DJs: nothing said rather than something wrong.
 */
export function djPlace(djs: number, maxDjs: number): { kind: 'free' | 'waiting' | 'full'; waiting: number } | null {
  if (maxDjs <= 0) return null
  if (djs >= maxDjs) return { kind: 'full', waiting: Math.max(0, djs - 1) }
  const waiting = Math.max(0, djs - 1)
  return { kind: waiting === 0 ? 'free' : 'waiting', waiting }
}

/** What lets somebody search a room by its styles: "Électro" is found by "electro". */
export const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
