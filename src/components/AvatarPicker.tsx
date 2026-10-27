import type { ReactNode } from 'react'
import type { AvatarId } from '../../shared/protocol'
import { AVATARS } from '../data/avatars'
import Avatar from './Avatar'
import './AvatarPicker.css'

interface AvatarPickerProps {
  value: AvatarId
  onChange: (avatarId: AvatarId) => void
  /** What the group is called on screen ("Avatar" unless said otherwise). */
  legend?: ReactNode
  /**
   * `grid`: four square tiles to a row (mock-up 1, the entry).
   * `row`: 64 px tiles, the eight on one line when there is room (mock-up 5, "Ton avatar").
   * `compact`: four to a row, 64 px tall (the narrower "Mon avatar" of mock-up 5b).
   */
  variant?: 'grid' | 'row' | 'compact'
  /** `icon`: the avatars framed tight, as the phone entry (mock-up M1) draws them; `full` (default): the whole character. */
  framing?: 'full' | 'icon'
}

/** The eight starting avatars, as a group of toggle buttons: one is pressed, with a check on its corner (mock-up 1). */
export default function AvatarPicker({ value, onChange, legend = 'Avatar', variant = 'grid', framing = 'full' }: AvatarPickerProps) {
  return (
    <fieldset className={variant === 'grid' ? 'avatar-picker' : `avatar-picker avatar-picker--${variant}`}>
      <legend>{legend}</legend>
      {AVATARS.map((avatar) => (
        <button
          key={avatar.id}
          type="button"
          aria-pressed={avatar.id === value}
          aria-label={avatar.name}
          onClick={() => onChange(avatar.id)}
        >
          {/* The button says the name already. */}
          <Avatar avatar={avatar} size={56} framing={framing} decorative />
          {avatar.id === value && (
            <span className="avatar-picker__check" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12" focusable="false">
                <path d="M2.5 6.4 L5 8.8 L9.6 3.6" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </button>
      ))}
    </fieldset>
  )
}
