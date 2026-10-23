import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import Avatar from '../components/Avatar'
import SiteHeader from '../components/SiteHeader'
import { AVATARS } from '../data/avatars'
import { readEntryDraft, saveEntryDraft } from '../data/entryDraft'
import { ROOMS } from '../data/rooms'
import { PSEUDO_MAX, PSEUDO_MIN, type AvatarId } from '../../shared/protocol'
import './EntryPage.css'

export default function EntryPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [pseudo, setPseudo] = useState(() => readEntryDraft().pseudo)
  const [avatarId, setAvatarId] = useState<AvatarId>(() => readEntryDraft().avatarId)
  const [error, setError] = useState('')
  useEffect(() => saveEntryDraft({ pseudo, avatarId }), [pseudo, avatarId])

  // The list of rooms sends people back here with the room they picked (?room=...); otherwise the first one.
  const suggested = ROOMS.find((room) => room.id === searchParams.get('room')) ?? ROOMS[0]
  const totalOnline = ROOMS.reduce((sum, room) => sum + room.online, 0)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = pseudo.trim()
    if (trimmed.length < PSEUDO_MIN || trimmed.length > PSEUDO_MAX) {
      setError(`Choisis un pseudo de ${PSEUDO_MIN} à ${PSEUDO_MAX} caractères.`)
      return
    }
    // This click is the user gesture that will start the room player (autoplay policy).
    navigate(`/room/${suggested.id}`, { state: { pseudo: trimmed, avatarId } })
  }

  return (
    <div className="entry">
      <SiteHeader />
      <main className="entry__main">
        <section className="entry__hero">
          <h1>Écoute ensemble.</h1>
          <p className="entry__tagline">Partage ta musique.</p>
          <p>
            Rejoins une room, écoute le même morceau que tout le monde, vote, discute. Pas de compte : un pseudo,
            un avatar, et c'est parti.
          </p>
          <p className="entry__stats">
            {ROOMS.length} rooms ouvertes · {totalOnline} en ligne
          </p>
        </section>

        <form className="entry__card" onSubmit={handleSubmit} noValidate>
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

          <fieldset className="entry__avatars">
            <legend>Avatar</legend>
            {AVATARS.map((avatar) => (
              <button
                key={avatar.id}
                type="button"
                aria-pressed={avatar.id === avatarId}
                aria-label={avatar.name}
                onClick={() => setAvatarId(avatar.id)}
              >
                <Avatar avatar={avatar} size={56} />
              </button>
            ))}
          </fieldset>

          <div className="entry__room">
            <div>
              <strong>{suggested.name}</strong>
              <span>{suggested.online} en ligne</span>
            </div>
            <Link to="/rooms">Changer</Link>
          </div>

          <button type="submit" className="btn-primary">
            ▶ Entrer dans la room
          </button>
          <p className="entry__hint">Le son de la room démarre dès que tu entres.</p>
        </form>
      </main>
    </div>
  )
}
