import type { AvatarDef } from '../data/avatars'
import AvatarArt from './AvatarArt'

interface AvatarProps {
  avatar: AvatarDef
  size?: number
  /**
   * `full`: the whole character, antenna and tuft overflowing a little (a picker, a profile).
   * `icon`: framed tighter, as the mock-ups draw it next to a name in a list (viewBox 6 4 88 92).
   */
  framing?: 'full' | 'icon'
  /** Next to the person's name already: hidden from screen readers, which would only hear the name twice. */
  decorative?: boolean
}

export default function Avatar({ avatar, size = 64, framing = 'full', decorative = false }: AvatarProps) {
  return (
    <svg
      viewBox={framing === 'icon' ? '6 4 88 92' : '0 0 100 100'}
      width={size}
      height={size}
      overflow={framing === 'full' ? 'visible' : undefined}
      focusable="false"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': `Avatar ${avatar.name}` })}
    >
      <AvatarArt avatar={avatar} />
    </svg>
  )
}
