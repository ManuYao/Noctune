import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import Avatar from '../components/Avatar'
import AvatarPicker from '../components/AvatarPicker'
import EntryScene from '../components/EntryScene'
import SiteHeader from '../components/SiteHeader'
import { AVATARS, findAvatar } from '../data/avatars'
import { readEntryDraft, saveEntryDraft } from '../data/entryDraft'
import { useAccount } from '../auth/useAccount'
import { useConsentDialog } from '../consent/consentContext'
import { useYouTubeConsent } from '../consent/useYouTubeConsent'
import { useRooms } from '../realtime/useRooms'
import { PSEUDO_MAX, PSEUDO_MIN, type AvatarId } from '../../shared/protocol'
import { normalizePseudo } from '../../shared/validation'
import './EntryPage.css'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

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
  const memberAvatar = account ? findAvatar(account.avatarId) : undefined

  // The rooms come from the server. The list sends people back here with the room they picked (?room=...);
  // otherwise the first one. Until the list arrives there is no room to propose and the button waits.
  const { rooms, status } = useRooms()
  const suggested = rooms?.find((room) => room.id === searchParams.get('room')) ?? rooms?.[0] ?? null
  const totalOnline = rooms?.reduce((sum, room) => sum + room.online, 0) ?? 0

  // Nothing is asked of YouTube before the visitor says yes to its player: the first time (and once a year), entering a
  // room opens the consent window, and its two buttons are what enters. A refusal still enters, without the player.
  const { choice } = useYouTubeConsent()
  const { ask } = useConsentDialog()

  // Who stands in front of the crowd: the member as they are, or the visitor as they type and pick.
  const sceneAvatar = (account ? memberAvatar : findAvatar(avatarId)) ?? AVATARS[0]
  const scenePseudo = account ? account.pseudo : pseudo

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
      <EntryScene avatar={sceneAvatar} pseudo={scenePseudo} nowPlaying={suggested?.nowPlaying ?? null} />
      <SiteHeader />
      <main className="entry__main">
        <section className="entry__hero">
          {typeof notice === 'string' && (
            <p className="entry__notice" role="status">
              {notice}
            </p>
          )}
          <h1>
            Écoute
            <br />
            ensemble.
          </h1>
          <p className="entry__tagline">Partage ta musique.</p>
          <p className="entry__pitch">
            Rejoins une room, écoute le même morceau que tout le monde, vote, discute. Pas de compte : un pseudo, un
            avatar, et c'est parti.
          </p>
          <p className="entry__stats">
            <span className="entry__eq" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {rooms
              ? `${plural(rooms.length, 'room ouverte', 'rooms ouvertes')} · ${totalOnline} en ligne`
              : status === 'offline'
                ? "Serveur injoignable pour l'instant"
                : 'Connexion…'}
          </p>
        </section>

        <form className="entry__card" onSubmit={handleSubmit} noValidate aria-labelledby="entry-card-title">
          {account ? (
            <>
              <div className="entry__heading">
                <h2 id="entry-card-title">Content de te revoir</h2>
                <p>Tu entres avec ton pseudo et ton avatar de membre.</p>
              </div>
              <div className="entry__member">
                {memberAvatar && <Avatar avatar={memberAvatar} size={48} framing="icon" decorative />}
                <span>
                  <strong>{account.pseudo}</strong>
                  <span>Membre</span>
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="entry__heading">
                <h2 id="entry-card-title">Prépare ton entrée</h2>
                <p>Un pseudo, un avatar, et tu entres.</p>
              </div>

              <div className="entry__field">
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
              </div>

              <AvatarPicker value={avatarId} onChange={setAvatarId} />
            </>
          )}

          <div className="entry__field">
            <span className="entry__label" id="entry-room-label">
              Room
            </span>
            <div className="entry__room" role="group" aria-labelledby="entry-room-label">
              <svg className="entry__vinyl" width="36" height="36" viewBox="0 0 56 56" aria-hidden="true" focusable="false">
                <circle cx="28" cy="28" r="27" fill="#16142B" />
                <circle cx="28" cy="28" r="20" fill="none" stroke="#3A3562" strokeWidth="1.5" />
                <circle cx="28" cy="28" r="11" fill="#5CC8FF" />
                <circle cx="28" cy="28" r="2.5" fill="#16142B" />
              </svg>
              <span className="entry__room-text">
                {suggested ? (
                  <>
                    <strong>{suggested.name}</strong>
                    <span>{suggested.online === 0 ? "Vide pour l'instant" : `${suggested.online} en ligne`}</span>
                  </>
                ) : (
                  <>
                    <strong>Recherche d'une room…</strong>
                    <span role="status">
                      {status === 'offline' ? "Le serveur ne répond pas pour l'instant." : 'Connexion au serveur…'}
                    </span>
                  </>
                )}
              </span>
              <Link to="/rooms" className="entry__change">
                Changer<span className="visually-hidden"> de room</span>
              </Link>
            </div>
          </div>

          <div className="entry__go">
            <button type="submit" className="entry__enter" disabled={!suggested || accountStatus === 'loading'}>
              <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
                <path d="M6 3.5 L18 11 L6 18.5 Z" />
              </svg>
              Entrer dans la room
            </button>
            {choice === 'refused' ? (
              <p className="entry__note">
                Le lecteur YouTube est désactivé : tu entres sans la musique.{' '}
                <button type="button" className="entry__linklike" onClick={() => ask({ intent: 'manage' })}>
                  Changer ce choix
                </button>
              </p>
            ) : choice === null ? (
              // The consent window comes first: it is said here, before the click.
              <p className="entry__note">Le son démarre dès que tu entres (après ton accord).</p>
            ) : (
              <p className="entry__note">Le son de la room démarre dès que tu entres.</p>
            )}
            <p className="entry__note entry__legal">
              Musique jouée par YouTube ·{' '}
              <Link to="/regles" target="_blank" rel="noopener noreferrer">
                Règles<span className="visually-hidden"> de la communauté (nouvel onglet)</span>
              </Link>{' '}
              ·{' '}
              <Link to="/confidentialite" target="_blank" rel="noopener noreferrer">
                Confidentialité<span className="visually-hidden"> (nouvel onglet)</span>
              </Link>
            </p>
          </div>

          {!account && (
            <p className="entry__account">
              Tu as un compte ? <Link to="/connexion">Se connecter</Link> pour ajouter tes vidéos.
            </p>
          )}
        </form>
      </main>
    </div>
  )
}
