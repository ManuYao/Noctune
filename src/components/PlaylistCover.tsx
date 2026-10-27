import type { CSSProperties } from 'react'
import './PlaylistCover.css'

// The pairs of colours of the covers of mock-ups 5b and 3c (`var(...)`: the ambiance's own accents).
const GRADIENTS: [string, string][] = [
  ['var(--accent-2)', 'var(--accent)'],
  ['#FFB347', '#FF7A59'],
  ['#7BD88F', 'var(--accent-2)'],
  ['#A98BFF', '#5CC8FF'],
  ['#F2E55C', '#FFB347'],
  ['#FF6B9A', '#A98BFF'],
]

/** A colour pair for a cover, the same every time for the same text. */
function gradientOf(seed: string): [string, string] {
  let sum = 0
  for (const character of seed) sum = (sum * 31 + character.charCodeAt(0)) % 9973
  return GRADIENTS[sum % GRADIENTS.length]
}

/** The square cover of a playlist or a track (mock-ups 5b and 3c): a gradient with a note. Decoration only. */
export default function PlaylistCover({ seed, size = 52, dimmed = false }: { seed: string; size?: number; dimmed?: boolean }) {
  const [from, to] = gradientOf(seed)
  return (
    <span
      className={dimmed ? 'playlist-cover playlist-cover--dimmed' : 'playlist-cover'}
      aria-hidden="true"
      style={{ '--pl-cover-from': from, '--pl-cover-to': to, '--pl-cover-size': `${size}px` } as CSSProperties}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" focusable="false" fill="none" stroke="#16142B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 15 V4 L16 2.5 V13" />
        <circle cx="5.8" cy="15" r="2.4" fill="#16142B" />
        <circle cx="13.8" cy="13" r="2.4" fill="#16142B" />
      </svg>
    </span>
  )
}
