import type { ProfileStats } from './protocol'

/** Accounts created in [FOUNDER_FROM, FOUNDER_UNTIL) earn "Fondateur": one year from 3 Nov 2026 (the owner's decision, 27/10/2026). */
export const FOUNDER_FROM = '2026-11-03T00:00:00Z'
export const FOUNDER_UNTIL = '2027-11-03T00:00:00Z'

export const BADGE_IDS = [
  'premier-son',
  'bienvenue',
  'veteran',
  'fondateur',
  'dj-experimente',
  'denicheur',
  'melomane',
  'crowd-pleaser',
  'bon-public',
  'hote',
  'chef-de-salon',
  'explorateur',
  'habitue',
  'curateur',
  'oiseau-de-nuit',
] as const
export type BadgeId = (typeof BADGE_IDS)[number]

/**
 * `tiered`: levels 1 to 3 (bronze, silver, gold); `unique`: earned once; `rare`: earned once, for few people;
 * `hidden`: earned once, and not shown (not even its name) until it is earned.
 */
export type BadgeKind = 'tiered' | 'unique' | 'rare' | 'hidden'

interface BadgeDef {
  id: BadgeId
  name: string
  /** One sentence, with the real numbers. */
  description: string
  kind: BadgeKind
  /** Thresholds of each level, in the unit of `value`. One entry for a unique, rare or hidden badge. */
  tiers: readonly number[]
  /** Short label under each level icon (mock-up 9): "1 mois", "50"... Same length as `tiers`; unique badges have none. */
  tierLabels: readonly string[]
  value: (stats: ProfileStats, now: Date) => number
}

/** Whole months between two instants (never negative). */
function monthsBetween(from: Date, to: Date): number {
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
  return Math.max(0, to.getUTCDate() < from.getUTCDate() ? months - 1 : months)
}

const unique = (
  id: BadgeId,
  name: string,
  description: string,
  value: BadgeDef['value'],
  kind: Exclude<BadgeKind, 'tiered'> = 'unique',
): BadgeDef => ({ id, name, description, kind, tiers: [1], tierLabels: [], value })

/** The catalogue, in the order of mock-up 9. */
export const BADGES: readonly BadgeDef[] = [
  unique('premier-son', 'Premier son', 'Passer ton premier morceau en DJ.', (s) => s.tracksPlayed),
  unique('bienvenue', 'Bienvenue', 'Écrire ton premier message dans une room.', (s) => s.messagesSent),
  {
    id: 'veteran',
    name: 'Vétéran',
    description: 'Ancienneté du compte : 1, 6 et 12 mois.',
    kind: 'tiered',
    tiers: [1, 6, 12],
    tierLabels: ['1 mois', '6 mois', '12 mois'],
    value: (s, now) => monthsBetween(new Date(s.memberSince), now),
  },
  unique(
    'fondateur',
    'Fondateur',
    'Un des premiers comptes, créé entre le 3 novembre 2026 et le 3 novembre 2027. Gagné une seule fois.',
    (s) => {
      const created = new Date(s.memberSince).getTime()
      return created >= new Date(FOUNDER_FROM).getTime() && created < new Date(FOUNDER_UNTIL).getTime() ? 1 : 0
    },
    'rare',
  ),
  {
    id: 'dj-experimente',
    name: 'DJ expérimenté',
    description: 'Morceaux passés en DJ : 5, 20 et 100.',
    kind: 'tiered',
    tiers: [5, 20, 100],
    tierLabels: ['5', '20', '100'],
    value: (s) => s.tracksPlayed,
  },
  unique('denicheur', 'Dénicheur', 'Un de tes morceaux a été aimé par au moins 10 auditeurs.', (s) => (s.bestTrackLikes >= 10 ? 1 : 0)),
  unique('melomane', 'Mélomane', 'Morceaux passés dans 5 genres différents.', (s) => (s.stylesPlayed >= 5 ? 1 : 0)),
  {
    id: 'crowd-pleaser',
    name: 'Crowd pleaser',
    description: 'Likes reçus sur tes morceaux : 10, 50 et 100.',
    kind: 'tiered',
    tiers: [10, 50, 100],
    tierLabels: ['10', '50', '100'],
    value: (s) => s.likesReceived,
  },
  {
    id: 'bon-public',
    name: 'Bon public',
    description: 'Likes donnés aux morceaux des autres : 10, 50 et 100.',
    kind: 'tiered',
    tiers: [10, 50, 100],
    tierLabels: ['10', '50', '100'],
    value: (s) => s.likesGiven,
  },
  unique('hote', 'Hôte', 'Avoir créé une room.', (s) => (s.roomsHosted > 0 || s.membersInBestRoom > 0 ? 1 : 0)),
  unique('chef-de-salon', 'Chef de salon', 'Une de tes rooms a accueilli 10 membres différents.', (s) => (s.membersInBestRoom >= 10 ? 1 : 0)),
  unique('explorateur', 'Explorateur', 'Rooms de 5 genres différents visitées.', (s) => (s.stylesVisited >= 5 ? 1 : 0)),
  unique('habitue', 'Habitué', 'Revenu sur 7 jours différents.', (s) => (s.daysActive >= 7 ? 1 : 0)),
  unique('curateur', 'Curateur', '50 morceaux dans tes playlists.', (s) => (s.playlistTracks >= 50 ? 1 : 0)),
  unique('oiseau-de-nuit', 'Oiseau de nuit', 'Badge caché : connexion entre 2 h et 5 h du matin.', (s) => (s.nightOwl ? 1 : 0), 'hidden'),
]

/** What a badge looks like for one member. */
export interface BadgeState {
  id: BadgeId
  name: string
  description: string
  kind: BadgeKind
  /** 0: locked. 1 to `tiers.length`: the level earned (a unique, rare or hidden badge is level 1 when earned). */
  level: number
  tiers: { threshold: number; label: string }[]
  /** Progress towards the next level, in the unit of the tiers (e.g. likes). For a unique badge it is 0 or 1. */
  value: number
  /** Threshold of the next level; null when the top level is earned. */
  next: number | null
  /** Locked and hidden: show a mystery badge, not its name nor its description. */
  secret: boolean
}

/** Derives every badge from the counters. Pure: the same stats and date always give the same badges. */
export function computeBadges(stats: ProfileStats, now: Date = new Date()): BadgeState[] {
  return BADGES.map((def) => {
    const value = Math.max(0, def.value(stats, now))
    const level = def.tiers.filter((threshold) => value >= threshold).length
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      kind: def.kind,
      level,
      tiers: def.tiers.map((threshold, i) => ({ threshold, label: def.tierLabels[i] ?? '' })),
      value,
      next: level < def.tiers.length ? def.tiers[level] : null,
      secret: def.kind === 'hidden' && level === 0,
    }
  })
}

/** The earned badges ranked by prestige (hidden and rare first, then higher levels), for scene and chat later. */
export function topBadges(states: readonly BadgeState[], count: number): BadgeState[] {
  const weight = (b: BadgeState) => (b.kind === 'hidden' ? 4 : b.kind === 'rare' ? 3.5 : b.kind === 'unique' ? 2 : b.level)
  return states
    .filter((b) => b.level > 0)
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, count)
}
