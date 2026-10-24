import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import type { DjQueueEntry, Participant } from '../../shared/protocol'
import { AVATARS } from '../data/avatars'
import Avatar from './Avatar'
import { assignSlots } from './stageSlots'
import './Scene.css'

interface SceneProps {
  participants: Participant[]
  selfId: string | undefined
  /** The DJ on the decks: they stand at the DJ stand instead of on the floor. Null while nobody is. */
  dj: DjQueueEntry | null
  /** Goes up at each like anyone gives: a heart rises from the floor. */
  likePulse: number
  /** The video screen: it sits in the scene, nothing is ever drawn over it. */
  children: ReactNode
}

const HEART_LIFETIME_MS = 2200
// Below this width the screen cannot sit inside the scene: YouTube needs its player at least 200 x 200 px.
const NARROW_BELOW_PX = 700
// On a narrow scene the crowd is one short row: fewer avatars to draw, and the pinned block stays low.
const NARROW_MAX_PEOPLE = 7

function useIsNarrow(ref: RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = useState(false)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => setNarrow(element.clientWidth < NARROW_BELOW_PX)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return narrow
}

// Decoration only: the video stays above, hearts rise on the floor below it.
export default function Scene({ participants, selfId, dj, likePulse, children }: SceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null)
  const narrow = useIsNarrow(sceneRef)

  // The DJ on the decks stands at the DJ stand, and so is not on the floor as well. A narrow scene has no wall, so no
  // stand: there they stay in the row with everybody. A DJ who is away (their track plays on) is not drawn at all.
  const deckPerson = dj?.participantId ? participants.find((p) => p.id === dj.participantId) : undefined
  const deckAvatar = deckPerson && AVATARS.find((candidate) => candidate.id === deckPerson.avatarId)
  const atDecks = !narrow && deckPerson !== undefined && deckAvatar !== undefined
  const crowd = useMemo(
    () => (atDecks ? participants.filter((p) => p.id !== deckPerson?.id) : participants),
    [atDecks, participants, deckPerson?.id],
  )

  // The visitor is always on the stage, however crowded it gets.
  const ordered = useMemo(
    () => [...crowd.filter((p) => p.id === selfId), ...crowd.filter((p) => p.id !== selfId)],
    [crowd, selfId],
  )
  const slots = useMemo(() => assignSlots(ordered.map((participant) => participant.id)), [ordered])
  const shown = narrow ? ordered.slice(0, NARROW_MAX_PEOPLE) : ordered.filter((p) => slots.has(p.id))
  const hidden = crowd.length - shown.length

  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([])
  const lastPulse = useRef(likePulse)
  useEffect(() => {
    if (likePulse === lastPulse.current) return
    lastPulse.current = likePulse
    const id = likePulse
    setHearts((current) => [...current.slice(-5), { id, x: 15 + Math.random() * 70 }])
    const timer = setTimeout(() => setHearts((current) => current.filter((heart) => heart.id !== id)), HEART_LIFETIME_MS)
    return () => clearTimeout(timer)
  }, [likePulse])

  return (
    <div ref={sceneRef} className={narrow ? 'scene scene--narrow' : 'scene'}>
      <div className="scene__wall" aria-hidden="true">
        <span className="scene__beam scene__beam--a" />
        <span className="scene__beam scene__beam--b" />
        <span className="scene__beam scene__beam--c" />
        <span className="scene__beam scene__beam--d" />
        <span className="scene__speaker scene__speaker--left" />
        <span className="scene__speaker scene__speaker--right" />
        <span className="scene__booth" />
      </div>

      <div className="scene__screen">{children}</div>

      {/* The same people are listed, readable, in "Public": the crowd here is only to look at. */}
      <div className="scene__floor" aria-hidden="true">
        <ul className="scene__crowd">
          {shown.map((participant, index) => {
            const slot = slots.get(participant.id)
            const avatar = AVATARS.find((candidate) => candidate.id === participant.avatarId)
            if (!avatar) return null
            return (
              <li
                key={participant.id}
                className={participant.id === selfId ? 'scene__person scene__person--self' : 'scene__person'}
                style={
                  {
                    '--x': slot?.x,
                    '--y': slot?.y,
                    '--size': slot?.size,
                    '--delay': `${(index % 5) * -0.18}s`,
                    // In front of the rows behind it.
                    '--z': slot ? Math.round(slot.y) : undefined,
                  } as CSSProperties
                }
              >
                <span className="scene__name">{participant.pseudo}</span>
                <Avatar avatar={avatar} size={100} />
              </li>
            )
          })}
        </ul>
        {hidden > 0 && <span className="scene__more">+{hidden}</span>}
        <div className="scene__hearts">
          {hearts.map((heart) => (
            <span key={heart.id} className="scene__heart" style={{ left: `${heart.x}%` }}>
              ♥
            </span>
          ))}
        </div>
      </div>

      {/* The DJ on the decks, in front of the booth with their feet on the edge of the floor. A child of the scene, not
          of the floor: the floor clips what rises above it. Same as the crowd: decoration, listed in the queue panel. */}
      {atDecks && deckPerson && deckAvatar && (
        <div className="scene__dj" aria-hidden="true">
          <Avatar avatar={deckAvatar} size={100} />
          <span className={deckPerson.id === selfId ? 'scene__dj-name scene__dj-name--self' : 'scene__dj-name'}>
            {deckPerson.pseudo}
          </span>
        </div>
      )}
    </div>
  )
}
