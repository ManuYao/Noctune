import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { PSEUDO_MAX, PSEUDO_MIN, type AvatarId } from '../../shared/protocol'
import { normalizePseudo } from '../../shared/validation'
import { AVATARS, findAvatar } from '../data/avatars'
import { readEntryDraft, saveEntryDraft } from '../data/entryDraft'
import AccountPerks from './AccountPerks'
import AvatarPicker from './AvatarPicker'
import ProfileScene from './ProfileScene'
import SignUpForm from './SignUpForm'
import '../pages/PageKit.css'
import './ProfileVisitor.css'

/**
 * The profile of a visitor (mock-up 5): the pseudo and the avatar they enter the rooms with, kept for their next entry
 * (as the entry screen keeps them), and next to it what an account adds, with the form that creates one.
 * `onRegistered`: the account exists; the page then shows the member's profile.
 */
export default function ProfileVisitor({ onRegistered }: { onRegistered: () => void }) {
  const [draft] = useState(readEntryDraft)
  const [pseudo, setPseudo] = useState(draft.pseudo)
  const [avatarId, setAvatarId] = useState<AvatarId>(draft.avatarId)
  const [feedback, setFeedback] = useState<{ kind: 'done' | 'error'; text: string } | null>(null)
  // The sign-up form found something wrong with the pseudo, which is typed in this card.
  const [pseudoRefused, setPseudoRefused] = useState(false)
  const avatar = findAvatar(avatarId) ?? AVATARS[0]

  function handleSave(event: FormEvent) {
    event.preventDefault()
    const chosen = normalizePseudo(pseudo)
    if (!chosen) {
      setFeedback({ kind: 'error', text: `Choisis un pseudo de ${PSEUDO_MIN} à ${PSEUDO_MAX} caractères, sans caractère invisible.` })
      document.getElementById('pseudo')?.focus()
      return
    }
    setPseudo(chosen)
    saveEntryDraft({ pseudo: chosen, avatarId })
    setFeedback({ kind: 'done', text: "C'est noté : tu entreras dans les rooms avec ce pseudo et cet avatar." })
  }

  const pseudoInvalid = feedback?.kind === 'error' || pseudoRefused

  return (
    <main className="kit-page profile-visitor">
      <div className="kit-intro">
        <h1>Ton profil</h1>
        <p>Un pseudo et un avatar suffisent pour écouter, voter et discuter. Un compte te permet en plus de passer DJ.</p>
      </div>

      <div className="profile-visitor__columns">
        <form className="kit-panel profile-visitor__me" onSubmit={handleSave} noValidate aria-labelledby="visitor-avatar-title">
          <h2 className="kit-panel__title" id="visitor-avatar-title">
            Ton avatar
          </h2>
          <div className="profile-visitor__scene">
            <ProfileScene variant="stage" avatar={avatar} pseudo={pseudo} />
          </div>

          <div className="kit-field">
            <label htmlFor="pseudo">Pseudo</label>
            <input
              id="pseudo"
              type="text"
              autoComplete="nickname"
              maxLength={PSEUDO_MAX}
              value={pseudo}
              aria-invalid={pseudoInvalid}
              aria-describedby="pseudo-hint"
              onChange={(event) => {
                setPseudo(event.target.value)
                setFeedback(null)
                setPseudoRefused(false)
              }}
            />
            <p className="kit-hint" id="pseudo-hint">
              {PSEUDO_MIN} à {PSEUDO_MAX} caractères, visible par tout le monde dans les rooms.
            </p>
          </div>

          <AvatarPicker
            value={avatarId}
            onChange={(next) => {
              setAvatarId(next)
              setFeedback(null)
            }}
            variant="row"
            legend={
              <>
                Choisis ton avatar · <span className="profile-visitor__avatar-name">{avatar.name}</span>
              </>
            }
          />

          <p className={`kit-feedback kit-feedback--${feedback?.kind ?? 'done'}`} role={feedback?.kind === 'error' ? 'alert' : 'status'}>
            {feedback?.text ?? ''}
          </p>

          <div className="profile-visitor__save">
            <button type="submit" className="kit-btn kit-btn--tall">
              Enregistrer mon profil
            </button>
            <p className="kit-hint">Aucune inscription nécessaire.</p>
          </div>
        </form>

        <section className="kit-panel kit-panel--accent profile-visitor__join" aria-labelledby="visitor-join-title">
          <div className="profile-visitor__join-head">
            <h2 className="kit-panel__title" id="visitor-join-title">
              Débloque tout avec un compte
            </h2>
            <span className="kit-badge">Gratuit</span>
          </div>

          <AccountPerks />

          <SignUpForm
            pseudo={pseudo}
            avatarId={avatarId}
            pseudoInputId="pseudo"
            onProblem={(field) => setPseudoRefused(field === 'pseudo')}
            onDone={onRegistered}
          >
            <div className="profile-visitor__after">
              <p>
                Déjà un compte ?{' '}
                <Link to="/connexion" className="kit-inline-link">
                  Se connecter
                </Link>
              </p>
              <p>Ton pseudo et ton avatar actuels sont conservés.</p>
            </div>
          </SignUpForm>
        </section>
      </div>
    </main>
  )
}
