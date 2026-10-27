import PendingLink from './PendingLink'
import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import type { AuthCallResult } from '../auth/authApi'
import { authField, authMessage } from '../auth/authMessages'
import { useAccount } from '../auth/useAccount'
import { PASSWORD_MAX, PASSWORD_MIN, type AvatarId } from '../../shared/protocol'
import { isAcceptablePassword, normalizeEmail, normalizePseudo } from '../../shared/validation'
import PasswordField from './PasswordField'
import '../pages/PageKit.css'
import './SignUpForm.css'

export type SignUpField = 'email' | 'password' | 'pseudo' | 'avatar'
type Refusal = Extract<AuthCallResult, { ok: false }>

/** What the pseudo and avatar fields need to say they are the problem. */
export interface IdentityA11y {
  invalid: (field: SignUpField) => boolean
  describedBy: (field: SignUpField) => string | undefined
}

interface SignUpFormProps {
  /** The pseudo and the avatar the account will have: typed in this form, or in another card of the page. */
  pseudo: string
  avatarId: AvatarId
  /** The id of the pseudo's input, wherever it is: a refusal about the pseudo puts the cursor there. */
  pseudoInputId: string
  /** The pseudo and avatar fields, when they belong in this form (the sign-up page). */
  renderIdentity?: (a11y: IdentityA11y) => ReactNode
  /** Told which field a refusal is about (null when none), so that a field elsewhere in the page can be marked. */
  onProblem?: (field: SignUpField | null) => void
  /** The account exists and is signed in. */
  onDone: () => void
  /** Under the button: the way to sign in instead, and so on. */
  children?: ReactNode
}

/**
 * Creating an account: the e-mail, the password, the button and the sentence that accepts the rules. The same rules as
 * the server are checked first, to answer at once (the server checks them again). Used by the sign-up page and by the
 * visitor's profile (mock-up 5, "Débloque tout avec un compte").
 */
export default function SignUpForm({ pseudo, avatarId, pseudoInputId, renderIdentity, onProblem, onDone, children }: SignUpFormProps) {
  const { register } = useAccount()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<{ field: SignUpField | null; message: string } | null>(null)
  const [pending, setPending] = useState(false)

  function report(next: { field: SignUpField | null; message: string } | null) {
    setProblem(next)
    onProblem?.(next?.field ?? null)
  }

  function refuse(refusal: Refusal) {
    const field = authField(refusal.error)
    report({ field, message: authMessage(refusal) })
    // The cursor goes where the problem is.
    if (field === 'pseudo') document.getElementById(pseudoInputId)?.focus()
    else if (field && field !== 'avatar') document.getElementById(field)?.focus()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    if (!normalizeEmail(email)) return refuse({ ok: false, error: 'invalid-email' })
    if (!isAcceptablePassword(password)) return refuse({ ok: false, error: 'weak-password' })
    if (!normalizePseudo(pseudo)) return refuse({ ok: false, error: 'invalid-pseudo' })

    report(null)
    setPending(true)
    const result = await register({ email, password, pseudo, avatarId })
    setPending(false)
    if (result.ok) onDone()
    else refuse(result)
  }

  const invalid = (field: SignUpField) => problem?.field === field
  const describedBy = (field: SignUpField) => (invalid(field) ? 'signup-error' : undefined)

  return (
    <form className="signup" onSubmit={handleSubmit} noValidate>
      <div className="kit-field">
        <label htmlFor="email">Adresse e-mail</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="toi@exemple.fr"
          value={email}
          aria-invalid={invalid('email')}
          aria-describedby={describedBy('email') ?? 'email-hint'}
          onChange={(event) => setEmail(event.target.value)}
        />
        <p className="kit-hint" id="email-hint">
          Elle sert uniquement à te connecter.
        </p>
      </div>

      <div className="kit-field">
        <label htmlFor="password">Mot de passe</label>
        <PasswordField
          id="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          placeholder={`${PASSWORD_MIN} caractères minimum`}
          value={password}
          aria-invalid={invalid('password')}
          aria-describedby={describedBy('password') ?? 'password-hint'}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="kit-hint" id="password-hint">
          {PASSWORD_MIN} caractères au moins. Une phrase fait très bien l'affaire.
        </p>
      </div>

      {renderIdentity?.({ invalid, describedBy })}

      <p id="signup-error" className="kit-feedback kit-feedback--error" role="alert">
        {problem?.message ?? ''}
      </p>

      <div className="signup__go">
        <button type="submit" className="kit-btn kit-btn--tall signup__submit" disabled={pending}>
          {pending ? 'Création…' : 'Créer mon compte'}
        </button>
        {/* New tabs: what was typed in the form is not lost. */}
        <p className="kit-hint signup__terms">
          En créant un compte, tu acceptes les{' '}
          <Link to="/regles" target="_blank" rel="noopener noreferrer">
            règles de la communauté<span className="visually-hidden"> (nouvel onglet)</span>
          </Link>{' '}
          et tu as lu la{' '}
          <PendingLink page="confidentialite" newTab>
            politique de confidentialité<span className="visually-hidden"> (nouvel onglet)</span>
          </PendingLink>
          .
        </p>
      </div>

      {children}
    </form>
  )
}
