import type { CSSProperties } from 'react'
import './TrackCover.css'

// The gradients of the covers of mock-up 3c. The site never loads a picture from YouTube: a track gets one of these,
// always the same for the same video.
const PAIRS: [string, string][] = [
  ['var(--accent-2)', 'var(--accent)'],
  ['#ffb347', '#ff7a59'],
  ['#7bd88f', 'var(--accent-2)'],
  ['#a98bff', 'var(--accent)'],
  ['#5cc8ff', '#a98bff'],
]

function pairOf(seed: string): [string, string] {
  let sum = 0
  for (const character of seed) sum = (sum * 31 + character.charCodeAt(0)) % 9973
  return PAIRS[sum % PAIRS.length]
}

interface TrackCoverProps {
  /** The video id: the same video always gets the same colours. Null: the colours of "Ton morceau" in mock-up 3c. */
  seed: string | null
  size?: 40 | 44 | 48
}

/** The square cover of a track in "Passer DJ", with its note. Decoration only. */
export default function TrackCover({ seed, size = 48 }: TrackCoverProps) {
  const [from, to] = seed === null ? PAIRS[0] : pairOf(seed)
  return (
    <span className={`track-cover track-cover--${size}`} aria-hidden="true" style={{ '--from': from, '--to': to } as CSSProperties}>
      <svg viewBox="0 0 20 20" width="20" height="20" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 15 V4 L16 2.5 V13" />
        <circle cx="5.8" cy="15" r="2.4" fill="currentColor" />
        <circle cx="13.8" cy="13" r="2.4" fill="currentColor" />
      </svg>
    </span>
  )
}
