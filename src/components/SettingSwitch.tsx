import { useId } from 'react'
import './SettingSwitch.css'

interface SettingSwitchProps {
  label: string
  hint: string
  checked: boolean
  onChange: (next: boolean) => void
}

/** A row of the account settings of mock-up 5b: a title, a hint, and a switch (a 44 px target around the 48 x 28 track). */
export default function SettingSwitch({ label, hint, checked, onChange }: SettingSwitchProps) {
  const id = useId()
  return (
    <div className="setting-switch">
      <span className="setting-switch__text">
        <span className="setting-switch__label" id={`${id}-label`}>
          {label}
        </span>
        <span className="setting-switch__hint" id={`${id}-hint`}>
          {hint}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        className="setting-switch__button"
        onClick={() => onChange(!checked)}
      >
        <span className="setting-switch__track" aria-hidden="true">
          <span className="setting-switch__knob" />
        </span>
      </button>
    </div>
  )
}
