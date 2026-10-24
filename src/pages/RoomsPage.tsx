import { useState } from 'react'
import { Link } from 'react-router'
import SiteHeader from '../components/SiteHeader'
import { useRooms } from '../realtime/useRooms'
import './RoomsPage.css'

export default function RoomsPage() {
  const { rooms, status } = useRooms()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const visible = (rooms ?? []).filter(
    (room) => room.name.toLowerCase().includes(needle) || room.genre.toLowerCase().includes(needle),
  )

  return (
    <div>
      <SiteHeader />
      <main className="rooms">
        <h1>Les rooms</h1>
        <p className="rooms__count">{rooms ? `${rooms.length} rooms ouvertes` : ' '}</p>

        {status === 'offline' && (
          <p className="rooms__notice" role="status">
            {rooms
              ? 'Connexion perdue : les chiffres ne sont plus à jour. Nouvelle tentative en cours…'
              : 'Le serveur ne répond pas pour l\'instant. Nouvelle tentative en cours…'}
          </p>
        )}

        <label htmlFor="room-search" className="rooms__label">
          Rechercher une room
        </label>
        <input
          id="room-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {rooms === null ? (
          status === 'loading' && (
            <p className="rooms__empty" role="status">
              Chargement des rooms…
            </p>
          )
        ) : visible.length === 0 ? (
          <p className="rooms__empty">Aucune room ne correspond à « {query} ».</p>
        ) : (
          <ul className="rooms__grid">
            {visible.map((room) => (
              <li key={room.id} className="rooms__card">
                <h2>{room.name}</h2>
                <p>
                  {room.genre} · {room.online === 0 ? 'Vide pour l\'instant' : `${room.online} en ligne`}
                </p>
                <p className="rooms__playing">
                  {room.nowPlaying ? (
                    <>
                      <span aria-hidden="true">♪ </span>
                      <span className="visually-hidden">En ce moment : </span>
                      {room.nowPlaying.title} — {room.nowPlaying.artist}
                    </>
                  ) : (
                    'La musique démarre quand quelqu\'un entre.'
                  )}
                </p>
                {/* An older server does not count its DJs: nothing is said rather than something wrong. */}
                {room.maxDjs > 0 &&
                  (room.djs < room.maxDjs ? (
                    <span className="rooms__badge">Place DJ libre</span>
                  ) : (
                    <span className="rooms__badge rooms__badge--full">File DJ complète</span>
                  ))}
                <Link to={`/?room=${room.id}`} className="rooms__join">
                  Rejoindre
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
