import type { AvatarId } from '../../shared/protocol'
import { AVATARS } from '../data/avatars'
import Avatar from './Avatar'
import './AvatarPicker.css'

interface AvatarPickerProps {
  value: AvatarId
  onChange: (avatarId: AvatarId) => void
}

/** The eight starting avatars, as a group of toggle buttons: one is pressed. */
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
          <Avatar avatar={avatar} size={56} />
        </button>
      ))}
    </fieldset>
  )
}
