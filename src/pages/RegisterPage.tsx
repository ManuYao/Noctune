import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import type { AuthCallResult } from '../auth/authApi'
import { authField, authMessage } from '../auth/authMessages'
import { useAccount } from '../auth/useAccount'
import AvatarPicker from '../components/AvatarPicker'
import SiteHeader from '../components/SiteHeader'
import { readEntryDraft } from '../data/entryDraft'
import { PASSWORD_MAX, PASSWORD_MIN, PSEUDO_MAX, type AvatarId } from '../../shared/protocol'
import { isAcceptablePassword, normalizeEmail, normalizePseudo } from '../../shared/validation'
import './AuthPage.css'

type Field = 'email' | 'password' | 'pseudo' | 'avatar'
type Refusal = Extract<AuthCallResult, { ok: false }>

export default function RegisterPage() {
  const navigate = useNavigate()
  const { account, status, register } = useAccount()
  // What the visitor already typed on the entry screen is a good start: the same pseudo and avatar.
  const [draft] = useState(readEntryDraft)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pseudo, setPseudo] = useState(draft.pseudo)
  const [avatarId, setAvatarId] = useState<AvatarId>(draft.avatarId)
  const [problem, setProblem] = useState<{ field: Field | null; message: string } | null>(null)
  const [pending, setPending] = useState(false)

  if (status === 'ready' && account) return <Navigate to="/" replace />

  function refuse(refusal: Refusal) {
    const field = authField(refusal.error)
    setProblem({ field, message: authMessage(refusal) })
    // The cursor goes where the problem is.
    if (field && field !== 'avatar') document.getElementById(field)?.focus()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    // The same rules as the server, to answer at once. The server checks them again.
    if (!normalizeEmail(email)) return refuse({ ok: false, error: 'invalid-email' })
    if (!isAcceptablePassword(password)) return refuse({ ok: false, error: 'weak-password' })
    if (!normalizePseudo(pseudo)) return refuse({ ok: false, error: 'invalid-pseudo' })

    setProblem(null)
    setPending(true)
    const result = await register({ email, password, pseudo, avatarId })
    setPending(false)
    if (result.ok) navigate('/')
    else refuse(result)
  }

  const invalid = (field: Field) => problem?.field === field
  const describedBy = (field: Field) => (invalid(field) ? 'auth-error' : undefined)

  return (
    <div>
      <SiteHeader />
      <main className="auth__main">
        <form className="auth__card" onSubmit={handleSubmit} noValidate>
          <h1>Créer un compte</h1>
          <p className="auth__hint">Ton pseudo et ton avatar te suivent sur tous tes appareils, et personne d'autre ne peut prendre ton pseudo.</p>

          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            aria-invalid={invalid('email')}
            aria-describedby={describedBy('email')}
            onChange={(event) => setEmail(event.target.value)}
          />
          <p className="auth__hint">Il sert uniquement à te connecter.</p>

          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            value={password}
            aria-invalid={invalid('password')}
            aria-describedby={describedBy('password')}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="auth__hint">{PASSWORD_MIN} caractères au moins. Une phrase fait très bien l'affaire.</p>

          <label htmlFor="pseudo">Pseudo</label>
          <input
            id="pseudo"
            type="text"
            autoComplete="nickname"
            maxLength={PSEUDO_MAX}
            value={pseudo}
            aria-invalid={invalid('pseudo')}
            aria-describedby={describedBy('pseudo')}
            onChange={(event) => setPseudo(event.target.value)}
          />

          <AvatarPicker value={avatarId} onChange={setAvatarId} />

          {problem && (
            <p id="auth-error" className="auth__error" role="alert">
              {problem.message}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? 'Création…' : 'Créer mon compte'}
          </button>
          <p className="auth__hint">
            Déjà un compte ? <Link to="/connexion">Se connecter</Link>
          </p>
          <p className="auth__hint">
            Tu peux aussi <Link to="/">écouter sans compte</Link>.
          </p>
        </form>
      </main>
    </div>
  )
}
