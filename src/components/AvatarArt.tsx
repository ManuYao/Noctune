import type { AvatarDef } from '../data/avatars'

// The outline of every avatar, in every ambiance (the mock-ups' #16142B).
const OUTLINE = '#16142B'

/**
 * The drawing of an avatar, in a 100 x 100 space: the symbols `av-base`, `av-a`, `av-e`, `av-t` and `av-n` of the
 * mock-ups, shape for shape. The antenna and the tuft go a little above the top of that space: whatever draws it lets
 * them overflow (the scene) or frames them out on purpose (the icon of a list).
 */
export default function AvatarArt({ avatar }: { avatar: AvatarDef }) {
  const { shape, body, headphones } = avatar
  return (
    <>
      {/* Ears and tuft stand behind the head. */}
      {shape === 'ears' && (
        <>
          <circle cx="30" cy="32" r="10" fill={body} stroke={OUTLINE} strokeWidth="3" />
          <circle cx="70" cy="32" r="10" fill={body} stroke={OUTLINE} strokeWidth="3" />
        </>
      )}
      {shape === 'tuft' && (
        <path d="M40 34 L43 16 L50 27 L57 12 L60 34 Z" fill={body} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
      )}

      <ellipse cx="38" cy="90" rx="10" ry="5" fill={OUTLINE} />
      <ellipse cx="62" cy="90" rx="10" ry="5" fill={OUTLINE} />
      <rect x="20" y="30" width="60" height="58" rx="28" fill={body} stroke={OUTLINE} strokeWidth="3" />
      <path
        d="M17 52 C17 18 83 18 83 52 L72 52 C72 29 28 29 28 52 Z"
        fill={headphones}
        stroke={OUTLINE}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <rect x="13" y="44" width="12" height="22" rx="6" fill={headphones} stroke={OUTLINE} strokeWidth="3" />
      <rect x="75" y="44" width="12" height="22" rx="6" fill={headphones} stroke={OUTLINE} strokeWidth="3" />
      <circle cx="40" cy="58" r="8" fill="#FFFFFF" stroke={OUTLINE} strokeWidth="2.5" />
      <circle cx="60" cy="58" r="8" fill="#FFFFFF" stroke={OUTLINE} strokeWidth="2.5" />
      <circle cx="42" cy="59" r="3.6" fill={OUTLINE} />
      <circle cx="62" cy="59" r="3.6" fill={OUTLINE} />
      <path d="M43 73 Q50 80 57 73" fill="none" stroke={OUTLINE} strokeWidth="3" strokeLinecap="round" />

      {/* The antenna stands in front. */}
      {shape === 'antenna' && (
        <>
          <line x1="50" y1="27" x2="50" y2="12" stroke={OUTLINE} strokeWidth="3" strokeLinecap="round" />
          <circle cx="50" cy="9" r="5" fill={headphones} stroke={OUTLINE} strokeWidth="3" />
        </>
      )}
    </>
  )
}
