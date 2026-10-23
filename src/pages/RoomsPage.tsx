import { useState } from 'react'
import { Link } from 'react-router'
import SiteHeader from '../components/SiteHeader'
import { ROOMS } from '../data/rooms'
import './RoomsPage.css'

export default function RoomsPage() {
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const visible = ROOMS.filter(
    (room) => room.name.toLowerCase().includes(needle) || room.genre.toLowerCase().includes(needle),
  )

  return (
    <div>
      <SiteHeader />
      <main className="rooms">
        <h1>Les rooms</h1>
        <p className="rooms__count">{ROOMS.length} rooms ouvertes</p>

        <label htmlFor="room-search" className="rooms__label">
          Rechercher une room
        </label>
        <input
          id="room-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {visible.length === 0 ? (
          <p className="rooms__empty">Aucune room ne correspond à « {query} ».</p>
        ) : (
          <ul className="rooms__grid">
            {visible.map((room) => (
              <li key={room.id} className="rooms__card">
                <h2>{room.name}</h2>
                <p>
                  {room.genre} · {room.online} en ligne
                </p>
                {room.djSlotFree && <span className="rooms__badge">Place DJ libre</span>}
                <Link to="/" className="rooms__join">
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
