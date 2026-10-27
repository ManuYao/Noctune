import { Link } from 'react-router'
import type { AvatarDef } from '../data/avatars'
import { authMessage } from '../auth/authMessages'
import { STYLE_LABELS } from '../rooms/roomLabels'
import { formatCount, formatListen, memberSinceLabel } from '../profile/profileFormat'
import type { ProfileState } from '../profile/useProfile'
import ProfileScene from './ProfileScene'
import '../pages/PageKit.css'
import './ProfileBand.css'

interface ProfileBandProps {
  pseudo: string
  avatar: AvatarDef
  activity: ProfileState & { reload: () => void }
  /** The visitor has just created their account from this page. */
  welcome: boolean
}

/** The band of mock-up 5b: the little stage, the member's name, since when, genres and rooms, and four tiles of activity. */
export default function ProfileBand({ pseudo, avatar, activity, welcome }: ProfileBandProps) {
  const profile = activity.status === 'loading' ? null : activity.profile
  const stats = profile?.stats
  // A "…" while the first answer is on its way, a dash when there is nothing to show because it failed.
  const placeholder = activity.status === 'loading' ? '…' : '–'
  const count = (value: number | undefined, text: (v: number) => string) => (value === undefined ? placeholder : text(value))
  const plural = (value: number | undefined, one: string, many: string) => (value === undefined || value > 1 ? many : one)

  const tiles = [
    { big: count(stats?.tracksPlayed, formatCount), label: plural(stats?.tracksPlayed, 'morceau joué', 'morceaux joués') },
    { big: count(stats?.likesReceived, formatCount), label: plural(stats?.likesReceived, "J'aime reçu", "J'aime reçus") },
    { big: count(stats?.roomsVisited, formatCount), label: plural(stats?.roomsVisited, 'room visitée', 'rooms visitées') },
    { big: count(stats?.listenSeconds, formatListen), label: "d'écoute" },
  ]
  const hasHabits = !!profile && (profile.topStyles.length > 0 || profile.topRooms.length > 0)

  return (
    <section className="kit-panel profile-band" aria-labelledby="profile-title">
      <div className="profile-band__scene">
        <ProfileScene variant="band" avatar={avatar} />
      </div>
      <div className="profile-band__who">
        <h1 id="profile-title">
          <span className="visually-hidden">Mon profil : </span>
          {pseudo}
        </h1>
        <p className="profile-band__line">{stats ? `Membre depuis ${memberSinceLabel(stats.memberSince)}` : 'Membre depuis …'}</p>
        {profile && profile.topStyles.length > 0 && (
          <ul className="profile-band__chips" aria-label="Genres les plus écoutés">
            {profile.topStyles.map((style) => (
              <li key={style}>{STYLE_LABELS[style]}</li>
            ))}
          </ul>
        )}
        {profile && profile.topRooms.length > 0 && (
          <p className="profile-band__line profile-band__rooms">
            <svg width="14" height="13" viewBox="0 0 24 22" aria-hidden="true" focusable="false">
              <path d="M12 21 C2 13 0 8 0 5.5 C0 2.4 2.4 0 5.5 0 C8 0 10.6 1.4 12 4 C13.4 1.4 16 0 18.5 0 C21.6 0 24 2.4 24 5.5 C24 8 22 13 12 21 Z" />
            </svg>
            <span>
              Rooms les plus écoutées :{' '}
              {profile.topRooms.map((room, index) => (
                <span key={room.id}>
                  {index > 0 && ', '}
                  <Link to={`/?room=${encodeURIComponent(room.id)}`} className="profile-band__room">
                    {room.name}
                  </Link>
                </span>
              ))}
            </span>
          </p>
        )}
        {profile && !hasHabits && (
          <p className="profile-band__line">Écoute quelques rooms : tes genres et tes rooms préférés apparaîtront ici.</p>
        )}
        {activity.status === 'error' && (
          <p className="profile-band__line profile-band__error" role="status">
            {activity.failure.error === 'unavailable' ? "Les statistiques ne sont pas disponibles pour l'instant." : authMessage(activity.failure)}
            <button type="button" className="profile-band__retry" onClick={activity.reload}>
              Réessayer
            </button>
          </p>
        )}
        {welcome && (
          <p className="profile-band__welcome" role="status">
            Bienvenue ! Ton compte est créé.
          </p>
        )}
      </div>
      <div className="profile-band__tiles">
        {tiles.map((tile) => (
          <div className="profile-band__tile" key={tile.label}>
            <span className="profile-band__tile-big">{tile.big}</span>
            <span className="profile-band__tile-label">{tile.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
