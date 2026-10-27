import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useAccount } from '../auth/useAccount'
import AccountPerks from '../components/AccountPerks'
import AvatarPicker from '../components/AvatarPicker'
import SignUpForm from '../components/SignUpForm'
import SiteHeader from '../components/SiteHeader'
import { AVATARS, findAvatar } from '../data/avatars'
import { readEntryDraft } from '../data/entryDraft'
import { PSEUDO_MAX, PSEUDO_MIN, type AvatarId } from '../../shared/protocol'
import './PageKit.css'
import './AuthPage.css'

/** `/inscription` (no mock-up of its own: in the style of "Débloque tout avec un compte" of mock-up 5). */
export default function RegisterPage() {
  const navigate = useNavigate()
  const { account, status } = useAccount()
  // What the visitor already typed on the entry screen is a good start: the same pseudo and avatar.
  const [draft] = useState(readEntryDraft)
  const [pseudo, setPseudo] = useState(draft.pseudo)
  const [avatarId, setAvatarId] = useState<AvatarId>(draft.avatarId)
  const avatarName = (findAvatar(avatarId) ?? AVATARS[0]).name

  if (status === 'ready' && account) return <Navigate to="/" replace />

  return (
    <div>
      <SiteHeader />
      <main className="kit-page auth">
        <div className="kit-intro">
          <h1>Créer un compte</h1>
          <p>Ton pseudo et ton avatar te suivent sur tous tes appareils, et personne d'autre ne peut prendre ton pseudo.</p>
        </div>

        <div className="auth__columns">
          <section className="kit-panel kit-panel--accent auth__form" aria-labelledby="register-title">
            <div className="auth__head">
              <h2 className="kit-panel__title" id="register-title">
                Ton compte
              </h2>
              <span className="kit-badge">Gratuit</span>
            </div>
            <SignUpForm
              pseudo={pseudo}
              avatarId={avatarId}
              pseudoInputId="pseudo"
              onDone={() => navigate('/')}
              renderIdentity={({ invalid, describedBy }) => (
                <>
                  <div className="kit-field">
                    <label htmlFor="pseudo">Pseudo</label>
                    <input
                      id="pseudo"
                      type="text"
                      autoComplete="nickname"
                      maxLength={PSEUDO_MAX}
                      value={pseudo}
                      aria-invalid={invalid('pseudo')}
                      aria-describedby={describedBy('pseudo') ?? 'register-pseudo-hint'}
                      onChange={(event) => setPseudo(event.target.value)}
                    />
                    <p className="kit-hint" id="register-pseudo-hint">
                      {PSEUDO_MIN} à {PSEUDO_MAX} caractères, visible par tout le monde dans les rooms.
                    </p>
                  </div>
                  <AvatarPicker
                    value={avatarId}
                    onChange={setAvatarId}
                    variant="row"
                    legend={
                      <>
                        Choisis ton avatar · <span className="auth__accent">{avatarName}</span>
                      </>
                    }
                  />
                </>
              )}
            >
              <div className="auth__links">
                <p>
                  Déjà un compte ?{' '}
                  <Link to="/connexion" className="kit-inline-link">
                    Se connecter
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
            </SignUpForm>
          </section>

          <section className="kit-panel auth__side" aria-labelledby="register-perks-title">
            <h2 className="kit-panel__title" id="register-perks-title">
              Ce que ton compte débloque
            </h2>
            <AccountPerks />
          </section>
        </div>
      </main>
    </div>
  )
}
