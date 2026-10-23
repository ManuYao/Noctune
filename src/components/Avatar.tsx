import type { AvatarDef } from '../data/avatars'

interface AvatarProps {
  avatar: AvatarDef
  size?: number
}

export default function Avatar({ avatar, size = 64 }: AvatarProps) {
  const { shape, body, headphones } = avatar
  const stroke = 'var(--outline)'

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`Avatar ${avatar.name}`}
    >
      {shape === 'antenna' && (
        <>
          <line x1="50" y1="26" x2="50" y2="13" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
          <circle cx="50" cy="12" r="4.5" fill={headphones} stroke={stroke} strokeWidth="2.5" />
        </>
      )}
      {shape === 'ears' && (
        <>
          <circle cx="31" cy="28" r="8" fill={body} stroke={stroke} strokeWidth="3" />
          <circle cx="69" cy="28" r="8" fill={body} stroke={stroke} strokeWidth="3" />
        </>
      )}
      {shape === 'tuft' && (
        <>
          <polygon points="42,28 46,14 51,28" fill={body} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
          <polygon points="50,28 56,12 60,28" fill={body} stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" />
        </>
      )}

      <ellipse cx="50" cy="90" rx="22" ry="5" fill={stroke} opacity="0.35" />
      <circle cx="50" cy="56" r="28" fill={body} stroke={stroke} strokeWidth="3" />

      <path d="M19 56A31 31 0 0 1 81 56" fill="none" stroke={stroke} strokeWidth="8" strokeLinecap="round" />
      <path d="M19 56A31 31 0 0 1 81 56" fill="none" stroke={headphones} strokeWidth="4" strokeLinecap="round" />
      <rect x="13" y="47" width="10" height="20" rx="5" fill={headphones} stroke={stroke} strokeWidth="2.5" />
      <rect x="77" y="47" width="10" height="20" rx="5" fill={headphones} stroke={stroke} strokeWidth="2.5" />

      <circle cx="40" cy="54" r="7" fill="#fff" stroke={stroke} strokeWidth="2" />
      <circle cx="60" cy="54" r="7" fill="#fff" stroke={stroke} strokeWidth="2" />
      <circle cx="41.5" cy="55" r="3" fill={stroke} />
      <circle cx="61.5" cy="55" r="3" fill={stroke} />
      <path d="M43 68Q50 74 57 68" fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
