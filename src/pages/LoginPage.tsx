import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { authMessage } from '../auth/authMessages'
import { useAccount } from '../auth/useAccount'
import PasswordField from '../components/PasswordField'
import SiteHeader from '../components/SiteHeader'
import { normalizeEmail } from '../../shared/validation'
import './AuthPage.css'

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
      <main className="auth__main">
        <form className="auth__card" onSubmit={handleSubmit} noValidate>
          <h1>Se connecter</h1>

          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            aria-invalid={error !== ''}
            aria-describedby={error ? 'auth-error' : undefined}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="password">Mot de passe</label>
          <PasswordField
            id="password"
            autoComplete="current-password"
            value={password}
            aria-invalid={error !== ''}
            aria-describedby={error ? 'auth-error' : undefined}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error && (
            <p id="auth-error" className="auth__error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? 'Connexion…' : 'Se connecter'}
          </button>
          <p className="auth__hint">
            Pas encore de compte ? <Link to="/inscription">Créer un compte</Link>
          </p>
          <p className="auth__hint">
            Tu peux aussi <Link to="/">écouter sans compte</Link>.
          </p>
        </form>
      </main>
    </div>
  )
}
