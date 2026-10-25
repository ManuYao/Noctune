import { useState } from 'react'
import { Link } from 'react-router'
import { ROOM_STYLES, type RoomStyle, type RoomSummary } from '../../shared/protocol'
import { useAccount } from '../auth/useAccount'
import RoomCard from '../components/RoomCard'
import SiteHeader from '../components/SiteHeader'
import { useRooms } from '../realtime/useRooms'
import { STYLE_LABELS, fold } from '../rooms/roomLabels'
import './RoomsPage.css'

/** The name, the description, the styles (by their label) and the host: what somebody may type to find a room. */
function matches(room: RoomSummary, needle: string): boolean {
  if (needle === '') return true
  const text = [room.name, room.description, room.host ?? '', ...room.styles.map((style) => STYLE_LABELS[style])]
  return text.some((part) => fold(part).includes(needle))
}

export default function RoomsPage() {
  const { rooms, status } = useRooms()
  const { account, status: accountStatus } = useAccount()
  const [query, setQuery] = useState('')
  const [style, setStyle] = useState<RoomStyle | null>(null)
  const needle = fold(query.trim())
  const visible = (rooms ?? []).filter((room) => matches(room, needle) && (style === null || room.styles.includes(style)))

  return (
    <div>
      <SiteHeader />
      <main className="rooms">
        <div className="rooms__top">
          <div>
            <h1>Les rooms</h1>
            <p className="rooms__count">{rooms ? `${rooms.length} rooms ouvertes` : ' '}</p>
          </div>
          {/* Nothing until the server has said who is signed in: no flash of the wrong button. */}
          {accountStatus === 'ready' &&
            (account ? (
              <Link to="/rooms/new" className="rooms__create">
                + Créer une room
              </Link>
            ) : (
              <Link to="/connexion" className="rooms__create rooms__create--locked">
                Se connecter pour créer une room
              </Link>
            ))}
        </div>

        {status === 'offline' && (
          <p className="rooms__notice" role="status">
            {rooms
              ? 'Connexion perdue : les chiffres ne sont plus à jour. Nouvelle tentative en cours…'
              : "Le serveur ne répond pas pour l'instant. Nouvelle tentative en cours…"}
          </p>
        )}

        <label htmlFor="room-search" className="rooms__label">
          Rechercher une room
        </label>
        <input id="room-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />

        <div className="rooms__styles" role="group" aria-label="Filtrer par style">
          <button type="button" aria-pressed={style === null} onClick={() => setStyle(null)}>
            Tous les styles
          </button>
          {ROOM_STYLES.map((candidate) => (
            <button
              key={candidate}
              type="button"
              aria-pressed={style === candidate}
              onClick={() => setStyle(style === candidate ? null : candidate)}
            >
              {STYLE_LABELS[candidate]}
            </button>
          ))}
        </div>

        {rooms === null ? (
          status === 'loading' && (
            <p className="rooms__empty" role="status">
              Chargement des rooms…
            </p>
          )
        ) : visible.length === 0 ? (
          <p className="rooms__empty">
            {needle === '' ? 'Aucune room ne correspond à ce style.' : `Aucune room ne correspond à « ${query} ».`}
          </p>
        ) : (
          <ul className="rooms__grid">
            {visible.map((room) => (
              <li key={room.id}>
                <RoomCard room={room} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
