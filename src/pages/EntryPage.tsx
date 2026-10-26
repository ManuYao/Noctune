import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import Avatar from '../components/Avatar'
import AvatarPicker from '../components/AvatarPicker'
import SiteHeader from '../components/SiteHeader'
import { AVATARS } from '../data/avatars'
import { readEntryDraft, saveEntryDraft } from '../data/entryDraft'
import { useAccount } from '../auth/useAccount'
import { useConsentDialog } from '../consent/consentContext'
import { useYouTubeConsent } from '../consent/useYouTubeConsent'
import { useRooms } from '../realtime/useRooms'
import { STYLE_LABELS } from '../rooms/roomLabels'
import { PSEUDO_MAX, PSEUDO_MIN, type AvatarId } from '../../shared/protocol'
import { normalizePseudo } from '../../shared/validation'
import './EntryPage.css'

export default function EntryPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // A short message from the page that sent us here ("Ton compte a été supprimé.").
  const notice = (useLocation().state as { notice?: unknown } | null)?.notice
  const [pseudo, setPseudo] = useState(() => readEntryDraft().pseudo)
  const [avatarId, setAvatarId] = useState<AvatarId>(() => readEntryDraft().avatarId)
  const [error, setError] = useState('')
  useEffect(() => saveEntryDraft({ pseudo, avatarId }), [pseudo, avatarId])

  // A member comes in as themself. Until the server has said whether somebody is signed in, nobody enters.
  const { account, status: accountStatus } = useAccount()
  const memberAvatar = account && AVATARS.find((candidate) => candidate.id === account.avatarId)

  // The rooms come from the server. The list sends people back here with the room they picked (?room=...);
  // otherwise the first one. Until the list arrives there is no room to propose and the button waits.
  const { rooms, status } = useRooms()
  const suggested = rooms?.find((room) => room.id === searchParams.get('room')) ?? rooms?.[0] ?? null
  const totalOnline = rooms?.reduce((sum, room) => sum + room.online, 0) ?? 0

  // Nothing is asked of YouTube before the visitor says yes to its player: the first time (and once a year), entering a
  // room opens the consent window, and its two buttons are what enters. A refusal still enters, without the player.
  const { choice } = useYouTubeConsent()
  const { ask } = useConsentDialog()

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!suggested || accountStatus === 'loading') return
    let identity: { pseudo: string; avatarId: AvatarId }
    if (account) {
      identity = { pseudo: account.pseudo, avatarId: account.avatarId }
    } else {
      const chosen = normalizePseudo(pseudo)
      if (!chosen) {
        setError(`Choisis un pseudo de ${PSEUDO_MIN} à ${PSEUDO_MAX} caractères, sans caractère invisible.`)
        return
      }
      identity = { pseudo: chosen, avatarId }
    }
    // The click that enters is the user gesture that will start the room player (autoplay policy): when the consent
    // window is in between, it is the click on one of its buttons that enters, from the same handler.
    const roomId = suggested.id
    const enter = () => navigate(`/room/${roomId}`, { state: identity })
    if (choice === null) ask({ intent: 'enter', then: enter })
    else enter()
  }

  return (
    <div className="entry">
      <SiteHeader />
      <main className="entry__main">
        {typeof notice === 'string' && (
          <p className="entry__notice" role="status">
            {notice}
          </p>
        )}
        <section className="entry__hero">
          <h1>Écoute ensemble.</h1>
          <p className="entry__tagline">Partage ta musique.</p>
          <p>
            Rejoins une room, écoute le même morceau que tout le monde, vote, discute. Pas de compte obligatoire : un
            pseudo, un avatar, et c'est parti.
          </p>
          <p className="entry__stats">
            {rooms
              ? `${rooms.length} rooms ouvertes · ${totalOnline} en ligne`
              : status === 'offline'
                ? 'Serveur injoignable pour l\'instant'
                : 'Connexion…'}
          </p>
        </section>

        <form className="entry__card" onSubmit={handleSubmit} noValidate>
          {account ? (
            <>
              <h2>Content de te revoir</h2>
              <div className="entry__member">
                {memberAvatar && <Avatar avatar={memberAvatar} size={56} />}
                <div>
                  <strong>{account.pseudo}</strong>
                  <span>Membre : tu entres avec ton pseudo et ton avatar.</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <h2>Prépare ton entrée</h2>
              <p className="entry__hint">Un pseudo, un avatar, et tu entres.</p>

              <label htmlFor="pseudo">Pseudo</label>
              <input
                id="pseudo"
                type="text"
                value={pseudo}
                maxLength={PSEUDO_MAX}
                autoComplete="nickname"
                aria-invalid={error !== ''}
                aria-describedby={error ? 'pseudo-error' : undefined}
                onChange={(event) => {
                  setPseudo(event.target.value)
                  setError('')
                }}
              />
              {error && (
                <p id="pseudo-error" className="entry__error" role="alert">
                  {error}
                </p>
              )}

              <AvatarPicker value={avatarId} onChange={setAvatarId} />
            </>
          )}

          <div className="entry__room">
            <div>
              {suggested ? (
                <>
                  <strong>{suggested.name}</strong>
                  <span>
                    {suggested.styles.map((style) => STYLE_LABELS[style]).join(' · ')}
                    {suggested.styles.length > 0 && ' · '}
                    {suggested.online === 0 ? "Vide pour l'instant" : `${suggested.online} en ligne`}
                  </span>
                </>
              ) : (
                <>
                  <strong>Recherche d'une room…</strong>
                  <span role="status">
                    {status === 'offline' ? 'Le serveur ne répond pas pour l\'instant.' : 'Connexion au serveur…'}
                  </span>
                </>
              )}
            </div>
            <Link to="/rooms">Changer</Link>
          </div>

          <button type="submit" className="btn-primary" disabled={!suggested || accountStatus === 'loading'}>
            ▶ Entrer dans la room
          </button>
          {choice === 'refused' ? (
            <p className="entry__hint">
              Le lecteur YouTube est désactivé : tu entres sans la musique.{' '}
              <button type="button" className="entry__linklike" onClick={() => ask({ intent: 'manage' })}>
                Changer ce choix
              </button>
            </p>
          ) : choice === null ? (
            <p className="entry__hint">
              Avant d'entrer, on te demande ton accord pour le lecteur YouTube : c'est lui qui joue la musique.
            </p>
          ) : (
            <p className="entry__hint">Le son de la room démarre dès que tu entres.</p>
          )}
          <p className="entry__hint entry__legal">
            La vidéo est lue par le lecteur de YouTube.{' '}
            <Link to="/regles" target="_blank" rel="noopener noreferrer">
              Règles de la communauté<span className="visually-hidden"> (nouvel onglet)</span>
            </Link>{' '}
            ·{' '}
            <Link to="/confidentialite" target="_blank" rel="noopener noreferrer">
              Confidentialité<span className="visually-hidden"> (nouvel onglet)</span>
            </Link>
          </p>

          {!account && (
            <p className="entry__hint entry__account-links">
              Un compte garde ton pseudo et ton avatar partout. <Link to="/connexion">Se connecter</Link> ·{' '}
              <Link to="/inscription">Créer un compte</Link>
            </p>
          )}
        </form>
      </main>
    </div>
  )
}
