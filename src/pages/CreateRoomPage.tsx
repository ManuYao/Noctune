import type { ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { ROOMS_PER_MEMBER_MAX, type RoomSettings } from '../../shared/protocol'
import { useAccount } from '../auth/useAccount'
import RoomForm from '../components/RoomForm'
import SiteHeader from '../components/SiteHeader'
import { createRoom } from '../rooms/roomApi'
import { useMyRooms } from '../rooms/useMyRooms'
import './RoomFormPage.css'

/** What a new room starts with: nothing chosen that would bias the host, and rules in the middle of the choices. */
const NEW_ROOM: RoomSettings = {
  name: '',
  description: '',
  styles: [],
  theme: 'neon',
  rules: { maxTrackSec: 600, repeatDelaySec: 7200, maxDjs: 10 },
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div>
      <SiteHeader />
      <main className="room-form-page">{children}</main>
    </div>
  )
}

/** Mock-up 2b. Members only: a visitor is sent to sign in. */
export default function CreateRoomPage() {
  const { account, status } = useAccount()

  // The server has said nobody is signed in: rooms belong to members.
  if (status === 'ready' && !account) return <Navigate to="/connexion" replace />
  if (status !== 'ready' || !account) {
    return (
      <Shell>
        <p className="room-form-page__note" role="status">
          Chargement…
        </p>
      </Shell>
    )
  }
  return <MemberCreateRoom pseudo={account.pseudo} avatarId={account.avatarId} />
}

function MemberCreateRoom({ pseudo, avatarId }: { pseudo: string; avatarId: string }) {
  const navigate = useNavigate()
  const mine = useMyRooms()

  if (mine.state === 'loading') {
    return (
      <Shell>
        <p className="room-form-page__note" role="status">
          Chargement…
        </p>
      </Shell>
    )
  }

  if (mine.state === 'refused') {
    return (
      <Shell>
        <div className="room-form-page__head">
          <h1>Créer une room</h1>
        </div>
        <p className="room-form-page__alert" role="alert">
          {mine.message}
        </p>
        <Link to="/rooms" className="room-form-page__back">
          Retour aux rooms
        </Link>
      </Shell>
    )
  }

  // Three rooms is the most one member hosts: say so before they fill in a form that would be refused.
  if (mine.state === 'ready' && mine.rooms.length >= ROOMS_PER_MEMBER_MAX) {
    return (
      <Shell>
        <div className="room-form-page__head">
          <h1>Créer une room</h1>
        </div>
        <section className="room-form-page__limit" aria-labelledby="limit-title">
          <h2 id="limit-title">Tu animes déjà {ROOMS_PER_MEMBER_MAX} rooms</h2>
          <p>C'est le maximum. Supprime-en une pour en créer une autre, ou change les réglages de l'une d'elles.</p>
          <ul>
            {mine.rooms.map((room) => (
              <li key={room.id}>
                <span>{room.name}</span>
                <Link to={`/rooms/${encodeURIComponent(room.id)}/edit`} className="room-form-page__pill">
                  Réglages<span className="visually-hidden"> de {room.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="room-form-page__head">
        <h1>Créer une room</h1>
        <p>Choisis un style, une ambiance et tes règles. Tu seras l'hôte de la room.</p>
      </div>
      <RoomForm
        initial={NEW_ROOM}
        hostPseudo={pseudo}
        hostAvatarId={avatarId}
        hostTitle="Tu seras l'hôte"
        fresh
        submitLabel="Créer la room"
        onCancel={() => navigate('/rooms')}
        onSubmit={async (settings) => {
          const result = await createRoom(settings)
          if (!result.ok) return result
          // The entry screen is where the room's player is started by a click: it proposes the new room.
          navigate(`/?room=${encodeURIComponent(result.room.id)}`)
          return { ok: true }
        }}
      />
    </Shell>
  )
}
