import { useEffect, useRef, useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import './PasswordField.css'

/**
 * A password input with a button to show or hide what was typed. The field goes back to hidden when its form is sent,
 * and when the page changes (the state goes with the component).
 */
export default function PasswordField({ className, ...inputProps }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const form = wrapper.current?.closest('form')
    if (!form) return
    const hide = () => setShown(false)
    form.addEventListener('submit', hide)
    return () => form.removeEventListener('submit', hide)
  }, [])

  return (
    <div className="password-field" ref={wrapper}>
      <input {...inputProps} className={className ? `password-field__input ${className}` : 'password-field__input'} type={shown ? 'text' : 'password'} />
      <button
        type="button"
        className="password-field__toggle"
        aria-pressed={shown}
        aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        onClick={() => setShown((value) => !value)}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {shown && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  )
}
