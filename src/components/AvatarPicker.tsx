import type { AvatarId } from '../../shared/protocol'
import { AVATARS } from '../data/avatars'
import Avatar from './Avatar'
import './AvatarPicker.css'

interface AvatarPickerProps {
  value: AvatarId
  onChange: (avatarId: AvatarId) => void
}

/** The eight starting avatars, as a group of toggle buttons: one is pressed, with a check on its corner (mock-up 1). */
export default function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  return (
    <fieldset className="avatar-picker">
      <legend>Avatar</legend>
      {AVATARS.map((avatar) => (
        <button
          key={avatar.id}
          type="button"
          aria-pressed={avatar.id === value}
          aria-label={avatar.name}
          onClick={() => onChange(avatar.id)}
        >
          {/* The button says the name already. */}
          <Avatar avatar={avatar} size={56} decorative />
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
