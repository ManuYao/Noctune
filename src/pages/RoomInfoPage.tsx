import { useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import type { RoomSummary } from '../../shared/protocol'
import MobileTabBar from '../components/MobileTabBar'
import RoomCardPhone from '../components/RoomCardPhone'
import RoomCardScene from '../components/RoomCardScene'
import RoomInfoTopBar, { Crumbs } from '../components/RoomInfoTopBar'
import RoomRail from '../components/RoomRail'
import SiteFooter from '../components/SiteFooter'
import SiteHeader from '../components/SiteHeader'
import { useIsPhone } from '../components/useIsPhone'
import { formatSpan } from '../data/duration'
import { useRooms } from '../realtime/useRooms'
import { getRoom } from '../rooms/roomApi'
import { openedSince, roomLink, roomRuleLines, similarRooms } from '../rooms/roomInfo'
import { STYLE_LABELS, djPlace, themeAttribute } from '../rooms/roomLabels'
import './RoomInfoPage.css'

/** The little equaliser of the mock-ups: three bars that dance (still with animations off). */
function Equaliser() {
  return (
    <span className="info-eq" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

const onlineLabel = (online: number) => (online === 0 ? "Vide pour l'instant" : `${online} en ligne`)

/** The page's frame: the ambiance of the room, the rail on a computer, the footer and (on a phone) the tab bar. */
function Frame({ theme, roomId, name, children }: { theme?: string; roomId: string; name: string; children: ReactNode }) {
  const phone = useIsPhone()
  return (
    <div className="app-shell room-info" data-theme={theme}>
      {phone && <SiteHeader />}
      <div className="room-info__body">
        {!phone && <RoomRail roomId={roomId} page="info" />}
        <div className="room-info__col">
          {phone ? <Crumbs roomId={roomId} name={name} /> : <RoomInfoTopBar roomId={roomId} name={name} />}
          {children}
        </div>
      </div>
      <SiteFooter />
      <MobileTabBar />
    </div>
  )
}

/** "Partager": the link to the room goes to the clipboard (or to the phone's own sharing sheet); if both refuse, it is shown to copy by hand. */
function ShareButton({ roomId, name }: { roomId: string; name: string }) {
  const phone = useIsPhone()
  const [note, setNote] = useState<'' | 'copied' | 'manual'>('')
  const hintId = useId()
  const link = roomLink(roomId, window.location.origin)

  // A message that stays for ever would be stale; the viewer who shares again gets it again.
  useEffect(() => {
    if (note !== 'copied') return
    const timer = window.setTimeout(() => setNote(''), 4000)
    return () => window.clearTimeout(timer)
  }, [note])

  async function share() {
    setNote('')
    if (phone && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: name, text: `Écoute « ${name} » avec nous sur Noctune`, url: link })
        return
      } catch (error) {
        // The viewer closed the sheet: nothing to say. Anything else falls back to the clipboard.
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(link)
      setNote('copied')
    } catch {
      setNote('manual')
    }
  }

  return (
    <>
      <button type="button" className="info-share" onClick={() => void share()} aria-describedby={note === 'manual' ? hintId : undefined}>
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="4" cy="9" r="2.4" />
          <circle cx="14" cy="4" r="2.4" />
          <circle cx="14" cy="14" r="2.4" />
          <path d="M6.2 7.9 L11.8 5.1 M6.2 10.1 L11.8 12.9" />
        </svg>
        Partager
      </button>
      {/* Always in the page, so that a screen reader hears it when it fills. */}
      <p className="info-share__note" role="status">
        {note === 'copied' ? 'Lien copié' : ''}
      </p>
      {note === 'manual' && (
        <div className="info-share__manual">
          <p id={hintId}>La copie automatique est refusée par le navigateur : copie le lien ci-dessous.</p>
          <input
            readOnly
            value={link}
            aria-label="Lien de la room"
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
    </>
  )
}

function Banner({ room, openedAt }: { room: RoomSummary; openedAt: number | null }) {
  return (
    <section className="info-banner" aria-label="Présentation de la room">
      <div className="info-banner__scene" aria-hidden="true">
        <RoomCardScene roomId={room.id} styles={room.styles} theme={room.theme} />
      </div>
      <div className="info-banner__text">
        <h1>{room.name}</h1>
        <div className="info-banner__chips">
          {room.styles.length > 0 && (
            <ul aria-label="Styles">
              {room.styles.map((style) => (
                <li key={style}>{STYLE_LABELS[style]}</li>
              ))}
            </ul>
          )}
          <span className="info-banner__online">
            <Equaliser />
            {onlineLabel(room.online)}
          </span>
        </div>
        <p className="info-banner__host">
          {room.host === null ? (
            "Room de l'équipe Noctune"
          ) : (
            <>
              Hôte : <strong>{room.host}</strong>
              {openedAt !== null && <> · Ouverte depuis {openedSince(openedAt)}</>}
            </>
          )}
        </p>
        <div className="info-banner__actions">
          <Link to={`/?room=${encodeURIComponent(room.id)}`} className="info-enter">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M3 2 L13 8 L3 14 Z" fill="currentColor" />
            </svg>
            Entrer dans la room
          </Link>
          <ShareButton roomId={room.id} name={room.name} />
        </div>
      </div>
    </section>
  )
}

function About({ room }: { room: RoomSummary }) {
  return (
    <section className="info-panel info-about" aria-labelledby="info-about-title">
      <h2 id="info-about-title">À propos</h2>
      {room.description !== '' && <p className="info-about__text">{room.description}</p>}
      <dl className="info-stats">
        <div>
          <dt>en ligne</dt>
          <dd>{room.online}</dd>
        </div>
        <div>
          <dt>DJ dans la file</dt>
          <dd>
            {room.djs}/{room.maxDjs}
          </dd>
        </div>
        <div>
          <dt>par morceau</dt>
          <dd className={room.rules.maxTrackSec === null ? 'info-stats__text' : undefined}>{room.rules.maxTrackSec === null ? 'Sans limite' : formatSpan(room.rules.maxTrackSec)}</dd>
        </div>
      </dl>
      <div className="info-team">
        <h3>Équipe de la room</h3>
        {room.host === null ? (
          <p className="info-team__member">
            <svg className="info-team__logo" viewBox="0 0 38 38" width="36" height="36" aria-hidden="true" focusable="false">
              <rect width="38" height="38" rx="12" />
              <rect x="8" y="15" width="4" height="12" rx="2" />
              <rect x="14.5" y="9" width="4" height="20" rx="2" />
              <rect x="21" y="12" width="4" height="15" rx="2" />
              <rect x="27.5" y="17" width="4" height="9" rx="2" />
            </svg>
            <span>
              <strong>Noctune</strong>
              <span>Équipe</span>
            </span>
          </p>
        ) : (
          <p className="info-team__member">
            <span className="info-team__initial" aria-hidden="true">
              {Array.from(room.host)[0]?.toUpperCase()}
            </span>
            <span>
              <strong>{room.host}</strong>
              <span>Hôte</span>
            </span>
          </p>
        )}
      </div>
    </section>
  )
}

function Rules({ room }: { room: RoomSummary }) {
  return (
    <section className="info-panel info-rules" aria-labelledby="info-rules-title">
      <h2 id="info-rules-title">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" strokeWidth="2.4" strokeLinejoin="round">
          <path d="M12 3 L20 6 V12 C20 16.5 16.5 20 12 21 C7.5 20 4 16.5 4 12 V6 Z" />
        </svg>
        Règles de la room
      </h2>
      <ol>
        {roomRuleLines(room.rules).map((rule, index) => (
          <li key={rule.title}>
            <span className="info-rules__n" aria-hidden="true">
              {index + 1}
            </span>
            <span>
              <strong>{rule.title}</strong>
              <span>{rule.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="info-rules__sanctions">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2 L14.5 13.5 H1.5 Z" />
          <path d="M8 6.5 V9.5" />
          <circle cx="8" cy="11.7" r="0.4" />
        </svg>
        <span>
          <Link to="/regles" title="Règles de la communauté">
            Sanctions
          </Link>{' '}
          : avertissement, mute 10 min, exclusion.
        </span>
      </p>
    </section>
  )
}

/** What happens right now, from the live list: the track, and whether a DJ can still join. Not in the mock-up (its third panel is a monthly ranking, which nothing counts yet). */
function Live({ room }: { room: RoomSummary }) {
  const place = djPlace(room.djs, room.maxDjs)
  return (
    <section className="info-panel info-live" aria-labelledby="info-live-title">
      <h2 id="info-live-title">En ce moment</h2>
      <div className="info-live__block">
        <h3>Au son</h3>
        {room.nowPlaying ? (
          <p className="info-live__track">
            <Equaliser />
            <span>
              <strong>{room.nowPlaying.title}</strong>
              <span>{room.nowPlaying.artist}</span>
            </span>
          </p>
        ) : (
          <p className="info-live__quiet">La musique démarre quand quelqu'un entre.</p>
        )}
      </div>
      <div className="info-live__block">
        <h3>File des DJ</h3>
        <p className="info-live__quiet">
          {place === null
            ? `${room.maxDjs} places`
            : place.kind === 'free'
              ? 'Une place de DJ est libre : passe ton morceau.'
              : place.kind === 'full'
                ? 'La file est complète pour l’instant.'
                : `${place.waiting} DJ en attente derrière celui qui joue.`}
        </p>
      </div>
    </section>
  )
}

/** A neighbour room, wide card of mock-up 4: its scene on the left, then the name, the styles, what plays, the people and "Rejoindre". */
function SimilarCard({ room }: { room: RoomSummary }) {
  return (
    <article className="info-similar__card">
      <div className="info-similar__scene" aria-hidden="true">
        <RoomCardScene roomId={room.id} styles={room.styles} theme={room.theme} />
      </div>
      <div className="info-similar__body">
        <div>
          <h3>{room.name}</h3>
          {room.styles.length > 0 && (
            <ul aria-label="Styles">
              {room.styles.slice(0, 2).map((style) => (
                <li key={style}>{STYLE_LABELS[style]}</li>
              ))}
            </ul>
          )}
        </div>
        <p className="info-similar__now">
          {room.nowPlaying ? (
            <>
              <Equaliser />
              <span>
                <span className="visually-hidden">En ce moment : </span>
                {room.nowPlaying.title} — {room.nowPlaying.artist}
              </span>
            </>
          ) : (
            <span>La musique démarre quand quelqu'un entre.</span>
          )}
        </p>
        <div className="info-similar__foot">
          <span>{room.online === 0 ? 'Vide' : `${room.online} en ligne`}</span>
          <Link to={`/?room=${encodeURIComponent(room.id)}`}>
            Rejoindre<span className="visually-hidden"> {room.name}</span>
          </Link>
        </div>
      </div>
    </article>
  )
}

/** The details of a room (mock-up 4), drawn from what the server tells: the live list, and for a member's room its opening date. */
export default function RoomInfoPage() {
  const { roomId = '' } = useParams()
  const phone = useIsPhone()
  const { rooms, status } = useRooms()
  const room = rooms?.find((candidate) => candidate.id === roomId) ?? null
  const hasHost = room !== null && room.host !== null
  const [openedAt, setOpenedAt] = useState<number | null>(null)

  // "Ouverte depuis …" exists for the rooms of members only: the date of the rooms of the team would be that of a migration.
  useEffect(() => {
    setOpenedAt(null)
    if (!hasHost) return
    let active = true
    getRoom(roomId).then((reply) => {
      if (active && reply.ok) setOpenedAt(reply.room.createdAt ?? null)
    })
    return () => {
      active = false
    }
  }, [roomId, hasHost])

  useEffect(() => {
    if (!room) return
    const before = document.title
    document.title = `${room.name} · Infos · Noctune`
    return () => {
      document.title = before
    }
  }, [room?.name])

  if (!room) {
    const settled = status === 'ready'
    return (
      <Frame roomId={roomId} name="La room">
        <main className="info-message">
          {settled ? (
            <>
              <h1>Cette room n'existe pas</h1>
              <p>Elle a été fermée par son hôte, ou le lien est incorrect.</p>
              <Link to="/rooms" className="info-enter">
                Voir les rooms
              </Link>
            </>
          ) : (
            <p role="status">
              {status === 'offline' ? "Le serveur ne répond pas pour l'instant. Nouvelle tentative en cours…" : 'Chargement de la room…'}
            </p>
          )}
        </main>
      </Frame>
    )
  }

  const { rooms: others, similar } = similarRooms(rooms ?? [], room)
  return (
    <Frame theme={themeAttribute(room.theme)} roomId={room.id} name={room.name}>
      <main className="info-main">
        {status === 'offline' && (
          <p className="info-notice" role="status">
            Connexion perdue : les chiffres ne sont plus à jour. Nouvelle tentative en cours…
          </p>
        )}
        <Banner room={room} openedAt={openedAt} />
        <div className="info-panels">
          <About room={room} />
          <Rules room={room} />
          <Live room={room} />
        </div>
        {others.length > 0 && (
          <section className="info-similar" aria-labelledby="info-similar-title">
            <div className="info-similar__head">
              <h2 id="info-similar-title">{similar ? 'Rooms similaires' : "D'autres rooms"}</h2>
              <Link to="/rooms">Voir toutes les rooms</Link>
            </div>
            {phone ? (
              <ul className="info-similar__phone">
                {others.map((other) => (
                  <li key={other.id}>
                    <RoomCardPhone room={other} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="info-similar__list">
                {others.map((other) => (
                  <li key={other.id}>
                    <SimilarCard room={other} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </Frame>
  )
}
