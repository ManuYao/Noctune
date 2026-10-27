import { useState } from 'react'
import { Link } from 'react-router'
import { ROOM_STYLES, type RoomStyle, type RoomSummary } from '../../shared/protocol'
import { useAccount } from '../auth/useAccount'
import RoomCard from '../components/RoomCard'
import RoomCardPhone from '../components/RoomCardPhone'
import SiteHeader from '../components/SiteHeader'
import InstallNudge from '../pwa/InstallNudge'
import { useIsPhone } from '../components/useIsPhone'
import { useRooms } from '../realtime/useRooms'
import { STYLE_LABELS, djPlace, fold } from '../rooms/roomLabels'
import './RoomsPage.css'

type SortOrder = 'active' | 'calm' | 'az'

// The three orders of mock-up 2. "A → Z" is spelt out for screen readers.
const SORTS: { id: SortOrder; label: string; spoken?: string }[] = [
  { id: 'active', label: 'Plus actives' },
  { id: 'calm', label: 'Plus calmes' },
  { id: 'az', label: 'A → Z', spoken: 'De A à Z' },
]

/** The name, the description, the styles (by their label), the host and what plays: what somebody may type to find a room. */
function matches(room: RoomSummary, needle: string): boolean {
  if (needle === '') return true
  const text = [
    room.name,
    room.description,
    room.host ?? '',
    ...room.styles.map((style) => STYLE_LABELS[style]),
    room.nowPlaying?.title ?? '',
    room.nowPlaying?.artist ?? '',
  ]
  return text.some((part) => fold(part).includes(needle))
}

/** Busiest or quietest first, or by name. Rooms that tie keep the order of the server (the sort is stable). */
function sorted(rooms: RoomSummary[], order: SortOrder): RoomSummary[] {
  const list = [...rooms]
  if (order === 'active') list.sort((a, b) => b.online - a.online)
  else if (order === 'calm') list.sort((a, b) => a.online - b.online)
  else list.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
  return list
}

const hasFreeDjPlace = (room: RoomSummary) => djPlace(room.djs, room.maxDjs)?.kind === 'free'

/** Why the list is empty, in the words of the filters that emptied it. */
function emptyMessage(query: string, style: RoomStyle | null, freeOnly: boolean): string {
  if (query !== '') return `Aucune room ne correspond à « ${query} ».`
  if (freeOnly) return style ? "Aucune room de ce style n'a de place DJ libre pour l'instant." : "Aucune room n'a de place DJ libre pour l'instant."
  return 'Aucune room ne correspond à ce style.'
}

const openRooms = (count: number) =>
  count === 0 ? 'Aucune room ouverte' : count === 1 ? '1 room ouverte' : `${count} rooms ouvertes`

/**
 * The list of rooms (mock-up 2): search, a free place for a DJ, the order, the styles, then a card per room. On a phone
 * (mock-up M2) the free place and the order sit at the end of the row of styles, as chips, and the cards are vertical.
 */
export default function RoomsPage() {
  const phone = useIsPhone()
  const { rooms, status } = useRooms()
  const { account, status: accountStatus } = useAccount()
  const [query, setQuery] = useState('')
  const [style, setStyle] = useState<RoomStyle | null>(null)
  const [freeOnly, setFreeOnly] = useState(false)
  const [order, setOrder] = useState<SortOrder>('active')
  const needle = fold(query.trim())
  const visible = sorted(
    (rooms ?? []).filter(
      (room) => matches(room, needle) && (style === null || room.styles.includes(style)) && (!freeOnly || hasFreeDjPlace(room)),
    ),
    order,
  )

  return (
    <div className="rooms-page">
      <SiteHeader />
      {phone && <InstallNudge />}
      <main className="rooms">
        <div className="rooms__head">
          <div className="rooms__intro">
            <h1>Les rooms</h1>
            <p>
              Chaque room a sa propre scène.{' '}
              <span className="rooms__hint-pointer">Passe la souris sur une carte pour entrer dans l'ambiance.</span>
              <span className="rooms__hint-touch">Choisis une carte pour entrer dans l'ambiance.</span>
            </p>
          </div>
          {/* Not in the mock-up: the way to make a room. Nothing until the server has said who is signed in (no flash). */}
          {accountStatus === 'ready' &&
            (account ? (
              <Link to="/rooms/new" className="rooms__create">
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M8 3 V13 M3 8 H13" />
                </svg>
                Créer une room
              </Link>
            ) : (
              <Link to="/connexion" className="rooms__create">
                Se connecter pour créer une room
              </Link>
            ))}
        </div>

        <div className="rooms__toolbar">
          <div className="rooms__search">
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
              <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M13 13 L17 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              id="room-search"
              type="search"
              aria-label="Rechercher une room"
              placeholder={phone ? 'Une room, un genre, un titre…' : 'Cherche une room, un genre, un titre…'}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {!phone && (
            <div className="rooms__tools">
              <button type="button" className="rooms__switch" aria-pressed={freeOnly} onClick={() => setFreeOnly(!freeOnly)}>
                <span className="rooms__switch-track" aria-hidden="true">
                  <span className="rooms__switch-knob" />
                </span>
                Place DJ libre
              </button>
              <div className="rooms__sort" role="group" aria-label="Trier les rooms">
                {SORTS.map((sort) => (
                  <button key={sort.id} type="button" aria-pressed={order === sort.id} onClick={() => setOrder(sort.id)}>
                    {sort.spoken ? (
                      <>
                        <span aria-hidden="true">{sort.label}</span>
                        <span className="visually-hidden">{sort.spoken}</span>
                      </>
                    ) : (
                      sort.label
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rooms__filters">
          <div className="rooms__scroll">
            <div className="rooms__styles" role="group" aria-label="Filtrer par genre">
              <button type="button" aria-pressed={style === null} onClick={() => setStyle(null)}>
                Tous
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
            {phone && (
              <div className="rooms__extras" role="group" aria-label="Affiner la liste">
                <button type="button" className="rooms__free" aria-pressed={freeOnly} onClick={() => setFreeOnly(!freeOnly)}>
                  Place DJ libre
                </button>
                <label className="rooms__order">
                  <span className="visually-hidden">Trier les rooms</span>
                  <select value={order} onChange={(event) => setOrder(event.target.value as SortOrder)}>
                    {SORTS.map((sort) => (
                      <option key={sort.id} value={sort.id}>
                        {sort.spoken ?? sort.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
          <p className="rooms__count">{rooms ? openRooms(rooms.length) : ' '}</p>
        </div>

        {status === 'offline' && (
          <p className="rooms__notice" role="status">
            {rooms
              ? 'Connexion perdue : les chiffres ne sont plus à jour. Nouvelle tentative en cours…'
              : "Le serveur ne répond pas pour l'instant. Nouvelle tentative en cours…"}
          </p>
        )}

        {rooms === null ? (
          status === 'loading' && (
            <p className="rooms__empty" role="status">
              Chargement des rooms…
            </p>
          )
        ) : visible.length === 0 ? (
          <p className="rooms__empty">{emptyMessage(query.trim(), style, freeOnly)}</p>
        ) : (
          <ul className="rooms__grid">
            {visible.map((room) => (
              <li key={room.id}>
                {phone ? <RoomCardPhone room={room} /> : <RoomCard room={room} />}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
