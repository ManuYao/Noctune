import { useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { PASSWORD_MAX, PASSWORD_MIN, PSEUDO_MAX, type Account, type AvatarId } from '../../shared/protocol'
import { isAcceptablePassword, normalizePseudo } from '../../shared/validation'
import { fetchExport } from '../auth/accountApi'
import { authMessage } from '../auth/authMessages'
import { useAccount } from '../auth/useAccount'
import Avatar from '../components/Avatar'
import AvatarPicker from '../components/AvatarPicker'
import DeleteAccountDialog from '../components/DeleteAccountDialog'
import PasswordField from '../components/PasswordField'
import SiteHeader from '../components/SiteHeader'
import { AVATARS } from '../data/avatars'
import './ProfilePage.css'

/** A line under a form: what happened, and whether it needs attention. */
interface Feedback {
  kind: 'done' | 'error'
  text: string
}

function FeedbackLine({ feedback, id }: { feedback: Feedback | null; id?: string }) {
  if (!feedback) return <p className="profile__feedback" role="status" id={id} />
  return (
    <p className={`profile__feedback profile__feedback--${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'} id={id}>
      {feedback.text}
    </p>
  )
}

export default function ProfilePage() {
  const { account, status } = useAccount()
  // Set while the page leaves on purpose (account deleted, signed out everywhere): the account then goes away under it,
  // and that is not a visitor who stumbled on the page.
  const leaving = useRef(false)

  if (status === 'ready' && !account && !leaving.current) return <Navigate to="/connexion" replace />
  return (
    <div>
      <SiteHeader />
      {account ? (
        <ProfileContent account={account} leaving={leaving} />
      ) : (
        <main className="profile">
          <p role="status">Chargement…</p>
        </main>
      )}
    </div>
  )
}

function ProfileContent({ account, leaving }: { account: Account; leaving: RefObject<boolean> }) {
  const navigate = useNavigate()
  const { updateProfile, changePassword, logoutEverywhere, deleteAccount } = useAccount()
  const avatar = AVATARS.find((candidate) => candidate.id === account.avatarId)

  // Pseudo and avatar.
  const [pseudo, setPseudo] = useState(account.pseudo)
  const [avatarId, setAvatarId] = useState<AvatarId>(account.avatarId)
  const [profileFeedback, setProfileFeedback] = useState<Feedback | null>(null)
  const [profilePending, setProfilePending] = useState(false)
  const changed = pseudo.trim() !== account.pseudo || avatarId !== account.avatarId

  async function handleProfile(event: FormEvent) {
    event.preventDefault()
    if (profilePending || !changed) return
    const checked = normalizePseudo(pseudo)
    if (!checked) {
      setProfileFeedback({ kind: 'error', text: authMessage({ ok: false, error: 'invalid-pseudo' }) })
      return document.getElementById('profile-pseudo')?.focus()
    }
    setProfileFeedback(null)
    setProfilePending(true)
    // Only what changed is sent.
    const result = await updateProfile({
      ...(checked !== account.pseudo ? { pseudo: checked } : {}),
      ...(avatarId !== account.avatarId ? { avatarId } : {}),
    })
    setProfilePending(false)
    if (result.ok) {
      setPseudo(result.account.pseudo)
      setAvatarId(result.account.avatarId)
      setProfileFeedback({ kind: 'done', text: 'Profil enregistré.' })
    } else {
      setProfileFeedback({ kind: 'error', text: authMessage(result) })
      if (result.error === 'pseudo-taken' || result.error === 'invalid-pseudo') document.getElementById('profile-pseudo')?.focus()
    }
  }

  // Password.
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback | null>(null)
  const [passwordPending, setPasswordPending] = useState(false)

  async function handlePassword(event: FormEvent) {
    event.preventDefault()
    if (passwordPending) return
    const refuse = (text: string, focus: string) => {
      setPasswordFeedback({ kind: 'error', text })
      document.getElementById(focus)?.focus()
    }
    if (currentPassword === '') return refuse('Entre ton mot de passe actuel.', 'current-password')
    // The same rule as the server, to answer at once. The server checks it again.
    if (!isAcceptablePassword(newPassword)) return refuse(authMessage({ ok: false, error: 'weak-password' }), 'new-password')
    if (newPassword !== confirmation) return refuse('Les deux nouveaux mots de passe ne sont pas identiques.', 'confirm-password')

    setPasswordFeedback(null)
    setPasswordPending(true)
    const result = await changePassword({ currentPassword, newPassword })
    setPasswordPending(false)
    if (result.ok) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      setPasswordFeedback({ kind: 'done', text: 'Mot de passe changé. Tes autres appareils ont été déconnectés.' })
    } else {
      refuse(authMessage(result), result.error === 'wrong-password' ? 'current-password' : 'new-password')
    }
  }

  // Every device.
  const [devicesFeedback, setDevicesFeedback] = useState<Feedback | null>(null)
  const [devicesPending, setDevicesPending] = useState(false)

  async function handleSignOutEverywhere() {
    if (devicesPending) return
    setDevicesFeedback(null)
    setDevicesPending(true)
    leaving.current = true
    const result = await logoutEverywhere()
    setDevicesPending(false)
    if (result.ok) return navigate('/', { replace: true, state: { notice: 'Tu as été déconnecté de tous tes appareils.' } })
    leaving.current = false
    setDevicesFeedback({ kind: 'error', text: authMessage(result) })
  }

  // The member's data.
  const [exportFeedback, setExportFeedback] = useState<Feedback | null>(null)
  const [exportPending, setExportPending] = useState(false)

  async function handleExport() {
    if (exportPending) return
    setExportFeedback(null)
    setExportPending(true)
    const result = await fetchExport()
    setExportPending(false)
    if (!result.ok) return setExportFeedback({ kind: 'error', text: authMessage(result) })
    const url = URL.createObjectURL(result.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'noctune-mes-donnees.json'
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setExportFeedback({ kind: 'done', text: 'Ton fichier est téléchargé.' })
  }

  // Deleting the account.
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(password: string) {
    setDeleting(true)
    leaving.current = true
    const result = await deleteAccount(password)
    setDeleting(false)
    if (result.ok) navigate('/', { replace: true, state: { notice: 'Ton compte a été supprimé.' } })
    else leaving.current = false
    return result
  }

  return (
    <main className="profile">
      <header className="profile__hero">
        {avatar && <Avatar avatar={avatar} size={88} />}
        <div>
          <h1>Mon profil</h1>
          <p className="profile__email">
            Connecté avec <strong>{account.email}</strong>
          </p>
        </div>
      </header>

      <div className="profile__grid">
        <form className="profile__card" onSubmit={handleProfile} noValidate aria-labelledby="profile-identity">
          <h2 id="profile-identity">Pseudo et avatar</h2>
          <label htmlFor="profile-pseudo">Pseudo</label>
          <input
            id="profile-pseudo"
            type="text"
            autoComplete="nickname"
            maxLength={PSEUDO_MAX}
            value={pseudo}
            aria-describedby="profile-hint"
            aria-invalid={profileFeedback?.kind === 'error'}
            onChange={(event) => {
              setPseudo(event.target.value)
              setProfileFeedback(null)
            }}
          />
          <AvatarPicker
            value={avatarId}
            onChange={(next) => {
              setAvatarId(next)
              setProfileFeedback(null)
            }}
          />
          <p className="profile__hint" id="profile-hint">
            Le changement s'affiche dans une room la prochaine fois que tu y entres.
          </p>
          <FeedbackLine feedback={profileFeedback} />
          <button type="submit" className="btn-primary" disabled={profilePending || !changed}>
            {profilePending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>

        <form className="profile__card" onSubmit={handlePassword} noValidate aria-labelledby="profile-password">
          <h2 id="profile-password">Mot de passe</h2>
          <label htmlFor="current-password">Mot de passe actuel</label>
          <PasswordField
            id="current-password"
            autoComplete="current-password"
            maxLength={PASSWORD_MAX}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <label htmlFor="new-password">Nouveau mot de passe</label>
          <PasswordField
            id="new-password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            value={newPassword}
            aria-describedby="password-hint"
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <label htmlFor="confirm-password">Confirme le nouveau mot de passe</label>
          <PasswordField
            id="confirm-password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          <p className="profile__hint" id="password-hint">
            {PASSWORD_MIN} caractères au moins. Tes autres appareils seront déconnectés, celui-ci reste connecté.
          </p>
          <FeedbackLine feedback={passwordFeedback} />
          <button type="submit" className="btn-primary" disabled={passwordPending}>
            {passwordPending ? 'Changement…' : 'Changer le mot de passe'}
          </button>
        </form>

        <section className="profile__card" aria-labelledby="profile-things">
          <h2 id="profile-things">Mes playlists et mes rooms</h2>
          <p className="profile__hint">Tes playlists te suivent sur tous tes appareils.</p>
          <div className="profile__links">
            <Link to="/playlist">Gérer mes playlists</Link>
            <Link to="/rooms/new">Créer une room</Link>
          </div>
        </section>

        <section className="profile__card" aria-labelledby="profile-devices">
          <h2 id="profile-devices">Mes appareils</h2>
          <p className="profile__hint">
            Si tu as laissé ta session ouverte quelque part, tu peux la fermer partout. Celle-ci aussi : tu devras te reconnecter.
          </p>
          <FeedbackLine feedback={devicesFeedback} />
          <button type="button" className="profile__secondary" disabled={devicesPending} onClick={handleSignOutEverywhere}>
            {devicesPending ? 'Déconnexion…' : 'Se déconnecter de tous les appareils'}
          </button>
        </section>

        <section className="profile__card" aria-labelledby="profile-data">
          <h2 id="profile-data">Mes données</h2>
          <p className="profile__hint">
            Télécharge une copie de ce que Noctune garde sur toi : ton compte, tes playlists et tes rooms.
          </p>
          <FeedbackLine feedback={exportFeedback} />
          <button type="button" className="profile__secondary" disabled={exportPending} onClick={handleExport}>
            {exportPending ? 'Préparation…' : 'Télécharger mes données'}
          </button>
        </section>

        <section className="profile__card profile__card--danger" aria-labelledby="profile-danger">
          <h2 id="profile-danger">Supprimer mon compte</h2>
          <p className="profile__hint">
            C'est définitif : ton compte, tes playlists et les rooms que tu animes sont supprimés. Il te faudra ton mot de passe.
          </p>
          <button type="button" className="profile__danger" onClick={() => setDeleteOpen(true)}>
            Supprimer mon compte…
          </button>
        </section>
      </div>

      <DeleteAccountDialog open={deleteOpen} busy={deleting} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete} />
    </main>
  )
}
