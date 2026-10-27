import { Link } from 'react-router'
import type { RoomRules, RoomStyle, RoomTheme } from '../../shared/protocol'
import { STYLE_LABELS, djPlace, maxTrackChip } from '../rooms/roomLabels'
import RoomCardScene from './RoomCardScene'
import './RoomCard.css'

/** What a card needs: a summary from the list, or what the form would make. */
export interface RoomCardData {
  id: string
  name: string
  description: string
  styles: RoomStyle[]
  theme: RoomTheme
  /** Pseudo of the host; null for the rooms of the team. */
  host: string | null
  rules: RoomRules
  online: number
  nowPlaying: { title: string; artist: string } | null
  djs: number
  maxDjs: number
}

interface RoomCardProps {
  room: RoomCardData
  /** The card shown in the form while the room is being made: everything in view, nothing to click. */
  preview?: boolean
}

/** The little equaliser of the mock-ups: three bars that dance (still with reduced motion). */
function Equaliser() {
  return (
    <span className="room-card__eq" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

/**
 * One room of the list (mock-up 2): its scene, what plays, who is in it and whether a DJ can join. With a mouse, the
 * card lights up under the pointer (or the keyboard's focus) and shows its description, its host and "Rejoindre", as the
 * second card of the mock-up; without hover (a phone, a tablet) and in the form's preview, all of that is always shown.
 * The card keeps the default look of the page: only its scene wears colours of its own.
 */
export default function RoomCard({ room, preview = false }: RoomCardProps) {
  const Title = preview ? 'p' : 'h2'
  const name = room.name.trim() === '' ? 'Le nom de ta room' : room.name
  const place = djPlace(room.djs, room.maxDjs)

  const join = (
    <>
      Rejoindre
      <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false">
        <path d="M3 9 H14 M9.5 4.5 L14 9 L9.5 13.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </>
  )

  return (
    // The article holds still under the pointer; its frame is what lifts on hover (no flicker at the bottom edge).
    <article className={preview ? 'room-card room-card--open' : 'room-card'}>
      <div className="room-card__frame">
        {/* The form's preview shows the stage of mock-up 2b, which wears the ambiance being picked. */}
        <RoomCardScene styles={room.styles} theme={room.theme} stageOnly={preview} />

        <div className="room-card__body">
          <Title className="room-card__name">{name}</Title>
          <p className="room-card__line">
            <span className="room-card__styles">{room.styles.map((style) => STYLE_LABELS[style]).join(' · ')}</span>
            {place && (
              <span className={place.kind === 'free' ? 'room-card__dj room-card__dj--free' : 'room-card__dj'}>
                {place.kind === 'free' ? 'Place DJ libre' : place.kind === 'full' ? 'File complète' : `${place.waiting} DJ en attente`}
              </span>
            )}
          </p>
          <p className="room-card__playing">
            {room.nowPlaying ? (
              <>
                <Equaliser />
                <span className="room-card__track">
                  <span className="visually-hidden">En ce moment : </span>
                  {room.nowPlaying.title} — {room.nowPlaying.artist}
                </span>
              </>
            ) : (
              <span className="room-card__quiet">La musique démarre quand quelqu'un entre.</span>
            )}
          </p>
        </div>

        {/* Over the scene, as in the mock-up. After the name in the page, so that a screen reader hears the name first. */}
        <p className="room-card__pills">
          {room.nowPlaying && (
            <span className="room-card__pill">
              <Equaliser />
              En direct
            </span>
          )}
          <span className="room-card__pill room-card__pill--online">{room.online === 0 ? "Vide pour l'instant" : `${room.online} en ligne`}</span>
        </p>

        <div className="room-card__more">
          {/* The panel that slides over the scene repeats the name and the styles: screen readers have them already. */}
          <p className="room-card__more-name" aria-hidden="true">
            {name}
          </p>
          {room.description !== '' && <p className="room-card__description">{room.description}</p>}
          <p className="room-card__host-row">
            <span className="room-card__host">
              {room.host !== null && (
                <>
                  Hôte : <strong>{room.host}</strong> ·{' '}
                </>
              )}
              {maxTrackChip(room.rules)}
            </span>
            {room.styles.length > 0 && (
              <span className="room-card__chips" aria-hidden="true">
                {room.styles.map((style) => (
                  <span key={style} className="room-card__chip">
                    {STYLE_LABELS[style]}
                  </span>
                ))}
              </span>
            )}
          </p>
          {preview ? (
            <span className="room-card__join" aria-hidden="true">
              {join}
            </span>
          ) : (
            // The whole card leads into the room (see RoomCard.css): this link is the one a keyboard and a screen reader find.
            <Link to={`/?room=${room.id}`} className="room-card__join">
              {join}
              <span className="visually-hidden"> {room.name}</span>
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}
