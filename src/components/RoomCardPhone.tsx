import { Link } from 'react-router'
import { STYLE_LABELS, djPlace } from '../rooms/roomLabels'
import type { RoomCardData } from './RoomCard'
import RoomCardScene from './RoomCardScene'
import './RoomCardPhone.css'

/**
 * One room of the list on a phone (mock-up M2): its scene on top with "N en ligne" and the DJ place laid over it, then
 * the name, the styles and what plays on the left and a big "Rejoindre" on the right. Nothing depends on hover; the whole
 * card is a way into the room (the link stretches over it, as on the big card).
 */
export default function RoomCardPhone({ room }: { room: RoomCardData }) {
  const place = djPlace(room.djs, room.maxDjs)
  return (
    <article className="room-card-phone">
      <RoomCardScene roomId={room.id} styles={room.styles} theme={room.theme} />

      <div className="room-card-phone__body">
        <div className="room-card-phone__info">
          <h2 className="room-card-phone__name">{room.name}</h2>
          {room.styles.length > 0 && (
            <p className="room-card-phone__styles">
              {room.styles.map((style) => (
                <span key={style} className="room-card-phone__chip">
                  {STYLE_LABELS[style]}
                </span>
              ))}
            </p>
          )}
          <p className="room-card-phone__playing">
            {room.nowPlaying ? (
              <>
                <span className="visually-hidden">En ce moment : </span>
                {room.nowPlaying.title} — {room.nowPlaying.artist}
              </>
            ) : (
              "Musique dès ton arrivée."
            )}
          </p>
        </div>
        <Link to={`/?room=${room.id}`} className="room-card-phone__join">
          Rejoindre<span className="visually-hidden"> {room.name}</span>
        </Link>
      </div>

      {/* Over the scene, as in the mock-up. After the name in the page, so that a screen reader hears the name first. */}
      <p className="room-card-phone__pills">
        <span className="room-card-phone__pill room-card-phone__pill--online">
          <span className="room-card-phone__eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {room.online === 0 ? "Vide pour l'instant" : `${room.online} en ligne`}
        </span>
        {place && (
          <span className={place.kind === 'free' ? 'room-card-phone__pill room-card-phone__pill--free' : 'room-card-phone__pill'}>
            {place.kind === 'free' ? 'Place DJ libre' : place.kind === 'full' ? 'File complète' : `${place.waiting} DJ en attente`}
          </span>
        )}
      </p>
    </article>
  )
}
