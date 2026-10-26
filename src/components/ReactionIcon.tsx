interface ReactionIconProps {
  kind: 'heart' | 'skip' | 'plus'
  filled?: boolean
}

// The icons of the mock-ups' bar: their heart (24 x 22), their skip and plus (18 x 18).
const HEART =
  'M12 21 C2 13 0 8 0 5.5 C0 2.4 2.4 0 5.5 0 C8 0 10.6 1.4 12 4 C13.4 1.4 16 0 18.5 0 C21.6 0 24 2.4 24 5.5 C24 8 22 13 12 21 Z'

export default function ReactionIcon({ kind, filled = false }: ReactionIconProps) {
  if (kind === 'heart') {
    // Outlined until the viewer likes the track: the stroke stays inside the 20 x 18 box.
    return (
      <svg viewBox="-1.5 -1.5 27 25" width="20" height="18" aria-hidden="true" focusable="false">
        <path
          d={HEART}
          fill={filled ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={filled ? 0 : 2.4}
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 18 18"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'plus' ? (
        <path d="M9 3 V15 M3 9 H15" />
      ) : (
        <>
          <path d="M3 3 L11 9 L3 15 Z" fill="currentColor" strokeWidth="1.5" />
          <path d="M14 3 V15" />
        </>
      )}
    </svg>
  )
}
