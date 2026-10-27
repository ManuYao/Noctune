import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { authMessage } from '../auth/authMessages'
import { useAccount } from '../auth/useAccount'
import AccountPerks from '../components/AccountPerks'
import PasswordField from '../components/PasswordField'
import SiteHeader from '../components/SiteHeader'
import { normalizeEmail } from '../../shared/validation'
import './PageKit.css'
import './AuthPage.css'

/** `/connexion` (no mock-up of its own: in the style of "Débloque tout avec un compte" of mock-up 5). */
export default function LoginPage() {
  const navigate = useNavigate()
  const { account, status, login } = useAccount()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  // Somebody who is already signed in has nothing to do here.
  if (status === 'ready' && account) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    if (!normalizeEmail(email)) return setError('Écris ton adresse e-mail.')
    if (password === '') return setError('Écris ton mot de passe.')

    setError('')
    setPending(true)
    const result = await login({ email, password })
    setPending(false)
    if (result.ok) navigate('/')
    else setError(authMessage(result))
  }

  return (
    <div>
      <SiteHeader />
      <main className="kit-page auth">
        <div className="kit-intro">
          <h1>Se connecter</h1>
          <p>Retrouve tes playlists, passe DJ et anime tes rooms.</p>
        </div>

        <div className="auth__columns">
          <form className="kit-panel kit-panel--accent auth__form" onSubmit={handleSubmit} noValidate aria-labelledby="login-title">
            <h2 className="kit-panel__title" id="login-title">
              Content de te revoir
            </h2>

            <div className="kit-field">
              <label htmlFor="email">Adresse e-mail</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="toi@exemple.fr"
                value={email}
                aria-invalid={error !== ''}
                aria-describedby={error ? 'auth-error' : undefined}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="kit-field">
              <label htmlFor="password">Mot de passe</label>
              <PasswordField
                id="password"
                autoComplete="current-password"
                value={password}
                aria-invalid={error !== ''}
                aria-describedby={error ? 'auth-error' : undefined}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <p id="auth-error" className="kit-feedback kit-feedback--error" role="alert">
              {error}
            </p>

            <button type="submit" className="kit-btn kit-btn--tall auth__submit" disabled={pending}>
              {pending ? 'Connexion…' : 'Se connecter'}
            </button>
            <div className="auth__links">
              <p>
                Pas encore de compte ?{' '}
                <Link to="/inscription" className="kit-inline-link">
                  Créer un compte
                </Link>
              </p>
              <p>
                Tu peux aussi{' '}
                <Link to="/" className="kit-inline-link">
                  écouter sans compte
                </Link>
                .
              </p>
            </div>
          </form>

          <section className="kit-panel auth__side" aria-labelledby="login-join-title">
            <div className="auth__head">
              <h2 className="kit-panel__title" id="login-join-title">
                Pas encore de compte ?
              </h2>
              <span className="kit-badge">Gratuit</span>
            </div>
            <AccountPerks />
            <Link to="/inscription" className="kit-btn kit-btn--tall kit-btn--ghost auth__side-action">
              Créer un compte
            </Link>
          </section>
        </div>
      </main>
    </div>
  )
}
