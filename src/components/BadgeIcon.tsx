import type { ReactNode } from 'react'
import type { BadgeId } from '../../shared/badges'

export type BadgeTone = 'tier1' | 'tier2' | 'tier3' | 'unique' | 'rare' | 'hidden'
/** `earned`: coloured; `locked`: grey with a padlock; `secret`: a hidden badge not earned yet (dotted outline, a "?"). */
export type BadgeIconState = 'earned' | 'locked' | 'secret'

// The colours of mock-up 9 (the legend of its top right corner).
const TONES: Record<BadgeTone, string> = {
  tier1: '#E8956B',
  tier2: '#C9D2EA',
  tier3: '#FFD166',
  unique: '#FF3D81',
  rare: '#3DE0FF',
  hidden: '#A98BFF',
}
const OUTLINE = '#16142B'
const LOCKED_FILL = '#2F2A5C'
const LOCKED_STROKE = '#7A70B8'
const SECRET_FILL = '#2A2260'

const SHIELD = 'M32 4 L56 14 V34 C56 47 45 57 32 61 C19 57 8 47 8 34 V14 Z'
const SHIELD_INNER = 'M32 9 L51 17 V34 C51 44 43 52 32 56 C21 52 13 44 13 34 V17 Z'

interface PictogramProps {
  color: string
}

const line = { fill: 'none', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

// The pictogram of each badge, as drawn in mock-up 9 (64 x 64, centred on 32, 31).
const PICTOGRAMS: Record<BadgeId, (props: PictogramProps) => ReactNode> = {
  'premier-son': ({ color }) => (
    <>
      <path d="M27 40 V22 L39 19 V37" stroke={color} {...line} />
      <circle cx="24" cy="40" r="4" fill={color} />
      <circle cx="36" cy="37" r="4" fill={color} />
    </>
  ),
  bienvenue: ({ color }) => <path d="M20 22 H44 V38 H35 L28 44 V38 H20 Z" stroke={color} {...line} />,
  veteran: ({ color }) => (
    <>
      <circle cx="32" cy="31" r="12" stroke={color} {...line} />
      <path d="M32 24 V31 L37 34" stroke={color} {...line} />
    </>
  ),
  fondateur: ({ color }) => <path d="M24 46 V18 M24 20 H43 L39 26 L43 32 H24" stroke={color} {...line} />,
  'dj-experimente': ({ color }) => (
    <>
      <circle cx="32" cy="31" r="13" stroke={color} {...line} />
      <circle cx="32" cy="31" r="4" fill={color} />
    </>
  ),
  denicheur: ({ color }) => <path d="M22 26 L27 19 H37 L42 26 L32 43 Z M22 26 H42 M27 19 L32 26 L37 19" stroke={color} {...line} />,
  melomane: ({ color }) => (
    <>
      <path d="M21 34 V31 A11 11 0 0 1 43 31 V34" stroke={color} {...line} />
      <path d="M19 34 H24 V43 H19 Z M40 34 H45 V43 H40 Z" stroke={color} {...line} />
    </>
  ),
  'crowd-pleaser': ({ color }) => (
    <path d="M32 43 C17 34 20 21 27 21 C30 21 32 23 32 26 C32 23 34 21 37 21 C44 21 47 34 32 43 Z" stroke={color} {...line} />
  ),
  'bon-public': ({ color }) => (
    <path d="M32 19 L35.5 27 L44 28 L37.5 34 L39.5 43 L32 38.5 L24.5 43 L26.5 34 L20 28 L28.5 27 Z" stroke={color} {...line} />
  ),
  hote: ({ color }) => <path d="M20 32 L32 21 L44 32 M24 30 V43 H40 V30 M29 43 V36 H35 V43" stroke={color} {...line} />,
  'chef-de-salon': ({ color }) => <path d="M20 41 L22 24 L28 31 L32 21 L36 31 L42 24 L44 41 Z" stroke={color} {...line} />,
  explorateur: ({ color }) => (
    <>
      <circle cx="32" cy="31" r="13" stroke={color} {...line} />
      <path d="M38 25 L34 33 L26 37 L30 29 Z" stroke={color} {...line} />
    </>
  ),
  habitue: ({ color }) => <path d="M32 19 C34 26 41 28 41 36 A9 9 0 0 1 23 36 C23 31 27 29 28 25 C30 27 31 26 32 19 Z" stroke={color} {...line} />,
  curateur: ({ color }) => (
    <>
      <path d="M20 24 H38 M20 31 H38 M20 38 H29 M44 40 V27" stroke={color} {...line} />
      <circle cx="40" cy="41" r="4" fill={color} />
    </>
  ),
  'oiseau-de-nuit': ({ color }) => <path d="M37 20 A12 12 0 1 0 43 39 A10 10 0 0 1 37 20 Z" stroke={color} {...line} />,
}

/** The "?" of a hidden badge that is not earned: its real pictogram stays secret. */
function Mystery({ color }: PictogramProps) {
  return (
    <>
      <path d="M26 26 A6.5 6.5 0 1 1 33 32 Q32 33 32 36" stroke={color} {...line} />
      <circle cx="32" cy="42.5" r="2" fill={color} />
    </>
  )
}

/** A small padlock in the lower right corner of a shield that is not earned. */
function Padlock() {
  return (
    <g>
      <circle cx="48" cy="48" r="10" fill={OUTLINE} stroke={LOCKED_STROKE} strokeWidth="1.5" />
      <path d="M44.5 47 V45 A3.5 3.5 0 0 1 51.5 45 V47" fill="none" stroke="#B4AED6" strokeWidth="2" strokeLinecap="round" />
      <rect x="43" y="47" width="10" height="8" rx="2" fill="#B4AED6" />
    </g>
  )
}

interface BadgeIconProps {
  id: BadgeId
  tone: BadgeTone
  state: BadgeIconState
  /** Side in px (mock-up 9: 56 in a card, 64 on a profile, 32 on a scene, 20 in the chat). */
  size?: number
  /** Gives the icon an accessible name; without it the icon is hidden from screen readers (the name is written beside it). */
  label?: string
}

/** One badge of mock-up 9: a shield with a pictogram, in its level colour, greyed with a padlock, or a dotted mystery. */
export default function BadgeIcon({ id, tone, state, size = 56, label }: BadgeIconProps) {
  const earned = state === 'earned'
  const secret = state === 'secret'
  const color = earned ? TONES[tone] : secret ? TONES.hidden : LOCKED_STROKE
  const Pictogram = PICTOGRAMS[id]
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      focusable="false"
      style={{ display: 'block', flex: 'none' }}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <path
        d={SHIELD}
        fill={earned ? TONES[tone] : secret ? SECRET_FILL : LOCKED_FILL}
        stroke={OUTLINE}
        strokeWidth="3"
        strokeLinejoin="round"
        strokeDasharray={secret ? '4 3' : undefined}
      />
      <path d={SHIELD_INNER} fill="none" stroke="#FFFFFF" strokeOpacity={earned || secret ? 0.35 : 0} strokeWidth="1.5" />
      <circle cx="32" cy="31" r="19" fill="#1B1640" stroke={color} strokeWidth="1.5" strokeOpacity="0.6" />
      {secret ? <Mystery color={color} /> : <Pictogram color={color} />}
      {state !== 'earned' && <Padlock />}
    </svg>
  )
}
