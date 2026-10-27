import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { FormEvent, RefObject } from 'react'
import { useNavigate } from 'react-router'
import { computeBadges } from '../../shared/badges'
import { PASSWORD_MAX, PASSWORD_MIN, PSEUDO_MAX, PSEUDO_MIN, type Account, type AvatarId } from '../../shared/protocol'
import { isAcceptablePassword, normalizePseudo } from '../../shared/validation'
import { fetchExport } from '../auth/accountApi'
import { authMessage } from '../auth/authMessages'
import { useAccount } from '../auth/useAccount'
import AvatarPicker from '../components/AvatarPicker'
import DeleteAccountDialog from '../components/DeleteAccountDialog'
import PasswordField from '../components/PasswordField'
import ProfileBand from '../components/ProfileBand'
import ProfileBadges from '../components/ProfileBadges'
import ProfilePlaylists from '../components/ProfilePlaylists'
import ProfileScene from '../components/ProfileScene'
import ProfileVisitor from '../components/ProfileVisitor'
import SettingSwitch from '../components/SettingSwitch'
import SiteHeader from '../components/SiteHeader'
import { AVATARS, findAvatar } from '../data/avatars'
import { usePlaylists } from '../playlists/usePlaylists'
import { useProfile } from '../profile/useProfile'
import { readCalmMotion, subscribeCalmMotion, writeCalmMotion } from '../settings/calmMotion'
import './PageKit.css'
import './ProfilePage.css'

/** A line under a form: what happened, and whether it needs attention. */
interface Feedback {
  kind: 'done' | 'error'
  text: string
}

function FeedbackLine({ feedback }: { feedback: Feedback | null }) {
  return (
    <p className={`kit-feedback kit-feedback--${feedback?.kind ?? 'done'}`} role={feedback?.kind === 'error' ? 'alert' : 'status'}>
      {feedback?.text ?? ''}
    </p>
  )
}

/** `/profil`: the member's profile (mock-up 5b), or the visitor's (mock-up 5). */
export default function ProfilePage() {
  const { account, status } = useAccount()
  // Set while the page leaves on purpose (signed out, account deleted): the account then goes away under it, and the
  // visitor's profile must not flash before the page has left.
  const leaving = useRef(false)
  // The visitor has just created their account from this page.
  const [welcome, setWelcome] = useState(false)

  return (
    <div>
      <SiteHeader />
      {account ? (
        <MemberProfile account={account} leaving={leaving} welcome={welcome} />
      ) : status === 'ready' && !leaving.current ? (
        <ProfileVisitor onRegistered={() => setWelcome(true)} />
      ) : (
        <main className="kit-page">
          <p role="status">Chargement…</p>
        </main>
      )}
    </div>
  )
}

function MemberProfile({ account, leaving, welcome }: { account: Account; leaving: RefObject<boolean>; welcome: boolean }) {
  const navigate = useNavigate()
  const { updateProfile, changePassword, logout, logoutEverywhere, deleteAccount } = useAccount()
  const lists = usePlaylists()
  const savedAvatar = findAvatar(account.avatarId) ?? AVATARS[0]
  const activity = useProfile()
  const profile = activity.status === 'loading' ? null : activity.profile
  const badges = useMemo(() => (profile ? computeBadges(profile.stats) : null), [profile])
  const calmMotion = useSyncExternalStore(subscribeCalmMotion, readCalmMotion, () => false)

  // The avatar ("Mon avatar") and the pseudo ("Réglages du compte") are saved apart, each by its own button.
  const [avatarId, setAvatarId] = useState<AvatarId>(account.avatarId)
  const [avatarFeedback, setAvatarFeedback] = useState<Feedback | null>(null)
  const [avatarPending, setAvatarPending] = useState(false)
  const chosenAvatar = findAvatar(avatarId) ?? AVATARS[0]

  async function handleAvatar(event: FormEvent) {
    event.preventDefault()
    if (avatarPending || avatarId === account.avatarId) return
    setAvatarFeedback(null)
    setAvatarPending(true)
    const result = await updateProfile({ avatarId })
    setAvatarPending(false)
    if (result.ok) {
      setAvatarId(result.account.avatarId)
      setAvatarFeedback({ kind: 'done', text: 'Avatar enregistré.' })
    } else {
      setAvatarFeedback({ kind: 'error', text: authMessage(result) })
    }
  }

  const [pseudo, setPseudo] = useState(account.pseudo)
  const [pseudoFeedback, setPseudoFeedback] = useState<Feedback | null>(null)
  const [pseudoPending, setPseudoPending] = useState(false)
  const pseudoChanged = pseudo.trim() !== account.pseudo

  async function handlePseudo(event: FormEvent) {
    event.preventDefault()
    if (pseudoPending || !pseudoChanged) return
    const checked = normalizePseudo(pseudo)
    if (!checked) {
      setPseudoFeedback({ kind: 'error', text: authMessage({ ok: false, error: 'invalid-pseudo' }) })
      return document.getElementById('profile-pseudo')?.focus()
    }
    setPseudoFeedback(null)
    setPseudoPending(true)
    const result = await updateProfile({ pseudo: checked })
    setPseudoPending(false)
    if (result.ok) {
      setPseudo(result.account.pseudo)
      setPseudoFeedback({ kind: 'done', text: 'Pseudo enregistré.' })
    } else {
      setPseudoFeedback({ kind: 'error', text: authMessage(result) })
      if (result.error === 'pseudo-taken' || result.error === 'invalid-pseudo') document.getElementById('profile-pseudo')?.focus()
    }
  }

  // Signing out, here as in the header: only when the server has ended the session.
  const [logoutPending, setLogoutPending] = useState(false)

  async function handleLogout() {
    if (logoutPending) return
    setPseudoFeedback(null)
    setLogoutPending(true)
    leaving.current = true
    const done = await logout()
    setLogoutPending(false)
    if (done) return navigate('/')
    leaving.current = false
    setPseudoFeedback({ kind: 'error', text: "Déconnexion impossible pour l'instant : vérifie ta connexion et réessaie. Tu es toujours connecté." })
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
    <main className="kit-page profile">
      <ProfileBand pseudo={account.pseudo} avatar={savedAvatar} activity={activity} welcome={welcome} />

      <div className="profile__columns">
        <ProfilePlaylists lists={lists} />

        {/* "Mon avatar": the mock-up chooses a shape and two colours, which the site does not have (the server keeps one
            of the eight avatars): the eight are offered here. */}
        <form className="kit-panel profile__avatar" onSubmit={handleAvatar} noValidate aria-labelledby="profile-avatar-title">
          <h2 className="kit-panel__title" id="profile-avatar-title">
            Mon avatar
          </h2>
          <div className="profile__avatar-scene">
            <ProfileScene variant="preview" avatar={chosenAvatar} />
          </div>
          <AvatarPicker
            value={avatarId}
            onChange={(next) => {
              setAvatarId(next)
              setAvatarFeedback(null)
            }}
            variant="compact"
            legend={
              <>
                Choisis ton avatar · <span className="profile__accent">{chosenAvatar.name}</span>
              </>
            }
          />
          <p className="kit-hint">Le changement s'affiche dans une room la prochaine fois que tu y entres.</p>
          <FeedbackLine feedback={avatarFeedback} />
          <button type="submit" className="kit-btn profile__push" disabled={avatarPending || avatarId === account.avatarId}>
            {avatarPending ? 'Enregistrement…' : "Enregistrer l'avatar"}
          </button>
        </form>

        <section className="kit-panel profile__settings" aria-labelledby="profile-settings-title">
          <h2 className="kit-panel__title" id="profile-settings-title">
            Réglages du compte
          </h2>
          <form className="profile__settings-form" onSubmit={handlePseudo} noValidate>
            <div className="kit-field">
              <label htmlFor="profile-pseudo">Pseudo</label>
              <input
                id="profile-pseudo"
                type="text"
                autoComplete="nickname"
                maxLength={PSEUDO_MAX}
                value={pseudo}
                aria-describedby="profile-pseudo-hint"
                aria-invalid={pseudoFeedback?.kind === 'error'}
                onChange={(event) => {
                  setPseudo(event.target.value)
                  setPseudoFeedback(null)
                }}
              />
              <p className="kit-hint" id="profile-pseudo-hint">
                {PSEUDO_MIN} à {PSEUDO_MAX} caractères. Une room l'affiche la prochaine fois que tu y entres.
              </p>
            </div>
            <div className="kit-field">
              <label htmlFor="profile-email">Adresse e-mail</label>
              <input id="profile-email" type="email" value={account.email} readOnly aria-describedby="profile-email-hint" />
              <p className="kit-hint" id="profile-email-hint">
                Elle sert uniquement à te connecter.
              </p>
            </div>
            <SettingSwitch
              label="Réduire les animations"
              hint="Scènes et avatars plus calmes, sur cet appareil"
              checked={calmMotion}
              onChange={writeCalmMotion}
            />
            <FeedbackLine feedback={pseudoFeedback} />
            <div className="profile__buttons">
              <button type="submit" className="kit-btn kit-btn--tall" disabled={pseudoPending || !pseudoChanged}>
                {pseudoPending ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button type="button" className="kit-btn kit-btn--tall kit-btn--ghost" disabled={logoutPending} onClick={handleLogout}>
                {logoutPending ? 'Déconnexion…' : 'Se déconnecter'}
              </button>
            </div>
          </form>

          <div className="profile__danger">
            <p className="kit-hint">
              C'est définitif : ton compte, tes playlists, tes statistiques et les rooms que tu animes sont supprimés. Il te faudra ton mot de passe.
            </p>
            <button type="button" className="kit-danger-link" onClick={() => setDeleteOpen(true)}>
              Supprimer mon compte
            </button>
          </div>
        </section>
      </div>

      <ProfileBadges badges={badges} failed={activity.status === 'error'} />

      {/* Not drawn in the mock-up: what the site has besides, in the same panels, under the three columns. */}
      <section className="profile__more" aria-labelledby="profile-more-title">
        <h2 className="profile__more-title" id="profile-more-title">
          Sécurité et données
        </h2>
        <div className="profile__more-grid">
          <form className="kit-panel" onSubmit={handlePassword} noValidate aria-labelledby="profile-password">
            <h3 className="kit-panel__title" id="profile-password">
              Mot de passe
            </h3>
            <div className="kit-field">
              <label htmlFor="current-password">Mot de passe actuel</label>
              <PasswordField
                id="current-password"
                autoComplete="current-password"
                maxLength={PASSWORD_MAX}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="kit-field">
              <label htmlFor="new-password">Nouveau mot de passe</label>
              <PasswordField
                id="new-password"
                autoComplete="new-password"
                maxLength={PASSWORD_MAX}
                value={newPassword}
                aria-describedby="password-hint"
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="kit-field">
              <label htmlFor="confirm-password">Confirme le nouveau mot de passe</label>
              <PasswordField
                id="confirm-password"
                autoComplete="new-password"
                maxLength={PASSWORD_MAX}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
            <p className="kit-hint" id="password-hint">
              {PASSWORD_MIN} caractères au moins. Tes autres appareils seront déconnectés, celui-ci reste connecté.
            </p>
            <FeedbackLine feedback={passwordFeedback} />
            <button type="submit" className="kit-btn profile__push" disabled={passwordPending}>
              {passwordPending ? 'Changement…' : 'Changer le mot de passe'}
            </button>
          </form>

          <section className="kit-panel" aria-labelledby="profile-devices">
            <h3 className="kit-panel__title" id="profile-devices">
              Mes appareils
            </h3>
            <p className="kit-hint">
              Si tu as laissé ta session ouverte quelque part, tu peux la fermer partout. Celle-ci aussi : tu devras te reconnecter.
            </p>
            <FeedbackLine feedback={devicesFeedback} />
            <button type="button" className="kit-btn kit-btn--ghost profile__push" disabled={devicesPending} onClick={handleSignOutEverywhere}>
              {devicesPending ? 'Déconnexion…' : 'Se déconnecter de tous les appareils'}
            </button>
          </section>

          <section className="kit-panel" aria-labelledby="profile-data">
            <h3 className="kit-panel__title" id="profile-data">
              Mes données
            </h3>
            <p className="kit-hint">Télécharge une copie de ce que Noctune garde sur toi : ton compte, tes playlists, tes rooms et tes statistiques.</p>
            <FeedbackLine feedback={exportFeedback} />
            <button type="button" className="kit-btn kit-btn--ghost profile__push" disabled={exportPending} onClick={handleExport}>
              {exportPending ? 'Préparation…' : 'Télécharger mes données'}
            </button>
          </section>
        </div>
      </section>

      <DeleteAccountDialog open={deleteOpen} busy={deleting} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete} />
    </main>
  )
}
