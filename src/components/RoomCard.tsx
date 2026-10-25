import { Link } from 'react-router'
import type { RoomRules, RoomStyle, RoomTheme } from '../../shared/protocol'
import { STYLE_LABELS, maxTrackChip, themeAttribute } from '../rooms/roomLabels'
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
  /** The card shown in the form while the room is being made: same look, nothing to click. */
  preview?: boolean
}

/** One room of the list. It wears the accent of its own ambiance, so that the list shows what each room looks like. */
export default function RoomCard({ room, preview = false }: RoomCardProps) {
  const Title = preview ? 'p' : 'h2'
  return (
    <div className="room-card" data-theme={themeAttribute(room.theme)}>
      <Title className="room-card__name">{room.name.trim() === '' ? 'Le nom de ta room' : room.name}</Title>

      <ul className="room-card__chips" aria-label="Styles et règles">
        {room.styles.map((style) => (
          <li key={style} className="room-card__chip room-card__chip--style">
            {STYLE_LABELS[style]}
          </li>
        ))}
        <li className="room-card__chip">{maxTrackChip(room.rules)}</li>
      </ul>

      {room.description !== '' && <p className="room-card__description">{room.description}</p>}

      <p className="room-card__meta">
        {room.online === 0 ? "Vide pour l'instant" : `${room.online} en ligne`}
        {room.host !== null && ` · Hôte : ${room.host}`}
      </p>

      <p className="room-card__playing">
        {room.nowPlaying ? (
          <>
            <span aria-hidden="true">♪ </span>
            <span className="visually-hidden">En ce moment : </span>
            {room.nowPlaying.title} — {room.nowPlaying.artist}
          </>
        ) : (
          "La musique démarre quand quelqu'un entre."
        )}
      </p>

      {/* An older server does not count its DJs: nothing is said rather than something wrong. */}
      {room.maxDjs > 0 &&
        (room.djs < room.maxDjs ? (
          <span className="room-card__badge">Place DJ libre</span>
        ) : (
          <span className="room-card__badge room-card__badge--full">File DJ complète</span>
        ))}

      {preview ? (
        <span className="room-card__join room-card__join--preview" aria-hidden="true">
          Rejoindre
        </span>
      ) : (
        <Link to={`/?room=${room.id}`} className="room-card__join">
          Rejoindre<span className="visually-hidden"> {room.name}</span>
        </Link>
      )}
    </div>
  )
}
