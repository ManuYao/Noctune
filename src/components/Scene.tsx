import { useMemo, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { ChatMessage, DjQueueEntry, Participant } from '../../shared/protocol'
import { findAvatar, type AvatarDef } from '../data/avatars'
import Avatar from './Avatar'
import AvatarArt from './AvatarArt'
import type { DecorKind } from './decor/decorKind'
import SceneBackdrop from './SceneBackdrop'
import { boxesMeet, layoutBubble, type BubbleAnchor, type BubbleLayout, type Box } from './bubbleGeometry'
import SceneBubble from './SceneBubble'
import SceneConsole from './SceneConsole'
import { approxTextWidth, cutText } from './sceneText'
import { CENTER_FIRST, DJ_SLOT, SELF_SLOT, STAGE_SLOTS, assignSlots, type StageSlot } from './stageSlots'
import { useBoxSize } from './useBoxSize'
import { useHearts } from './useHearts'
import { useSceneBubbles } from './useSceneBubbles'
import './Scene.css'

interface SceneProps {
  participants: Participant[]
  selfId: string | undefined
  /** The DJ on the decks: they stand behind the console instead of on the floor. Null while nobody is. */
  dj: DjQueueEntry | null
  /** The viewer's place among the waiting DJs (0: next to play), null when they are not waiting. */
  queuePosition: number | null
  /** Goes up at each like anyone gives: a heart rises from the floor. */
  likePulse: number
  /** The chat: who just wrote gets a bubble over their head for a moment. */
  messages: ChatMessage[]
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
  /** The genre of the room: the decor and the colours of the scene. Null: the generic club in the room's ambiance. */
  decor: DecorKind | null
  /** The video screen: it covers the scene's screen exactly, nothing is ever drawn over it. */
  children: ReactNode
}

// The scene of the mock-ups is drawn on 940 x 704, its screen at (230, 20), 480 x 270.
const VIEW_W = 940
const VIEW_H = 704
const SCREEN = { x: 230, y: 20, width: 480, height: 270, radius: 12 }
// YouTube needs its player at least 200 x 200 px: below this scale the screen leaves the drawing (the narrow scene).
const MIN_SCALE = 200 / SCREEN.height
// A narrow scene has no room for the crowd: one short row of it.
const NARROW_MAX_PEOPLE = 7
// The hearts of the mock-ups, where they float up from (x, y, width of a heart 24 x 22).
const HEART_SPOTS = [
  { x: 215, y: 428, width: 22 },
  { x: 338, y: 448, width: 26 },
  { x: 440, y: 500, width: 22 },
  { x: 736, y: 428, width: 24 },
  { x: 560, y: 456, width: 20 },
]

/** Somebody of the crowd in their slot: their shadow on the floor, and the avatar that bounces. */
function renderPerson(key: string, avatar: AvatarDef, slot: Pick<StageSlot, 'x' | 'y' | 'size' | 'delay'> & { shadow?: StageSlot['shadow'] }) {
  return (
    <g key={key}>
      {slot.shadow && (
        <ellipse cx={slot.shadow.cx} cy={slot.shadow.cy} rx={slot.shadow.rx} ry={slot.shadow.ry} fill="#000000" opacity={slot.shadow.opacity} />
      )}
      <g className="mw-bob" style={{ animationDelay: `${slot.delay}s` }}>
        <svg x={slot.x} y={slot.y} width={slot.size} height={slot.size} viewBox="0 0 100 100" overflow="visible">
          <AvatarArt avatar={avatar} />
        </svg>
      </g>
    </g>
  )
}

/** Where a bubble goes for somebody in a slot: over the head on the floor, beside it on the stage (under the screen). */
function bubbleAnchor(slot: StageSlot): BubbleAnchor {
  if (slot.bubbleSide === 'left') return { side: 'left', x: slot.x + slot.size * 0.12, y: slot.y + slot.size * 0.55 }
  if (slot.bubbleSide === 'right') return { side: 'right', x: slot.x + slot.size * 0.88, y: slot.y + slot.size * 0.55 }
  return { side: 'above', x: slot.x + slot.size / 2, y: slot.y }
}

const ordinal = (rank: number) => (rank === 1 ? '1er' : `${rank}e`)

/**
 * The illustrated club of the mock-ups, with the room's real people in it: the DJ behind the console, the crowd on the
 * floor, the viewer in front on their ring, hearts at each like and a bubble over whoever just wrote. It is drawn in the
 * 940 x 704 space of the mock-ups and scaled to fit its box ("meet"); the wall and the floor go on past it so that a box
 * of another shape has no empty bands. The YouTube video is laid exactly over the screen of the drawing.
 * All of it is decoration: the panels beside it list the same people and the same messages, readable by everybody.
 */
export default function Scene({
  participants,
  selfId,
  dj,
  queuePosition,
  likePulse,
  messages,
  clockOffsetMs,
  decor,
  children,
}: SceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null)
  const size = useBoxSize(sceneRef)
  const scale = size ? Math.min(size.width / VIEW_W, size.height / VIEW_H) : 1
  const narrow = size !== null && scale < MIN_SCALE

  // The DJ on the decks stands behind the console, and so is not on the floor as well. A narrow scene has no console:
  // there they stay in the row with everybody. A DJ who is away (their track plays on) is not drawn at all.
  const deckPerson = dj?.participantId ? participants.find((p) => p.id === dj.participantId) : undefined
  const deckAvatar = deckPerson && findAvatar(deckPerson.avatarId)
  const atDecks = !narrow && deckPerson !== undefined && deckAvatar !== undefined
  const self = participants.find((p) => p.id === selfId)
  const others = useMemo(
    () => participants.filter((p) => p.id !== selfId && !(atDecks && p.id === deckPerson?.id)),
    [participants, selfId, atDecks, deckPerson?.id],
  )
  const slots = useMemo(() => assignSlots(others.map((participant) => participant.id), STAGE_SLOTS.length, CENTER_FIRST), [others])

  const hearts = useHearts(likePulse, HEART_SPOTS.length)
  const bubbles = useSceneBubbles(messages, clockOffsetMs)

  const selfAtDecks = atDecks && self !== undefined && self.id === deckPerson?.id
  const selfOnFloor = self !== undefined && !selfAtDecks
  // The viewer is always in the narrow row too, first.
  const row = narrow ? [...(self ? [self] : []), ...others].slice(0, NARROW_MAX_PEOPLE) : []
  const shownCount = narrow ? row.length : slots.size + (selfOnFloor ? 1 : 0) + (atDecks ? 1 : 0)
  const hidden = Math.max(0, participants.length - shownCount)

  // The box is laid over the drawing's screen, in pixels of the scene.
  let viewBox = `0 0 ${VIEW_W} ${VIEW_H}`
  let screenStyle: CSSProperties | undefined
  if (!narrow && size) {
    const boxW = size.width / scale
    const boxH = size.height / scale
    const originX = (boxW - VIEW_W) / 2
    const originY = (boxH - VIEW_H) / 2
    viewBox = `${-originX} ${-originY} ${boxW} ${boxH}`
    screenStyle = {
      left: (SCREEN.x + originX) * scale,
      top: (SCREEN.y + originY) * scale,
      width: SCREEN.width * scale,
      height: SCREEN.height * scale,
      '--screen-radius': `${SCREEN.radius * scale}px`,
    } as CSSProperties
  }

  const selfAvatar = self && findAvatar(self.avatarId)
  const cx = SELF_SLOT.x + SELF_SLOT.size / 2
  const pillText = self ? cutText(self.pseudo, 20) : ''
  const pillWidth = approxTextWidth(pillText, 14) + 36
  const chipText = queuePosition === null ? null : `${ordinal(queuePosition + 1)} dans la file`
  const chipWidth = chipText ? approxTextWidth(chipText, 12) + 20 : 0

  const stagePeople = others.filter((p) => (slots.get(p.id) ?? 99) < 2)
  const floorPeople = others.filter((p) => (slots.get(p.id) ?? -1) >= 2).sort((a, b) => (slots.get(a.id) ?? 0) - (slots.get(b.id) ?? 0))

  /** Where somebody who just wrote has their bubble, and whether a tag names them (the viewer and the DJ need none). */
  function bubbleSpot(authorId: string): { anchor: BubbleAnchor; name: string | null } | null {
    if (selfOnFloor && authorId === self?.id) return { anchor: { side: 'above', x: cx, y: chipText ? 480 : 508 }, name: null }
    // The plate on the console names the DJ already.
    if (atDecks && authorId === deckPerson?.id) {
      return { anchor: { side: 'right', x: DJ_SLOT.x + DJ_SLOT.size * 0.88, y: DJ_SLOT.y + DJ_SLOT.size * 0.5 }, name: null }
    }
    const index = slots.get(authorId)
    const person = others.find((p) => p.id === authorId)
    if (index === undefined || !person) return null
    return { anchor: bubbleAnchor(STAGE_SLOTS[index]), name: person.pseudo }
  }

  // The newest bubbles first: one that would cover another (or the viewer's pill) waits for the next message. The chat
  // says it all anyway.
  const taken: Box[] = selfOnFloor
    ? [{ left: cx - Math.max(pillWidth, chipWidth) / 2, top: chipText ? 486 : 514, right: cx + Math.max(pillWidth, chipWidth) / 2, bottom: 552 }]
    : []
  const placedBubbles: { id: string; text: string; layout: BubbleLayout }[] = []
  for (const bubble of [...bubbles].reverse()) {
    const spot = bubbleSpot(bubble.authorId)
    if (!spot) continue
    const layout = layoutBubble(bubble.text, spot.name, spot.anchor)
    if (taken.some((box) => boxesMeet(box, layout.bounds))) continue
    taken.push(layout.bounds)
    placedBubbles.unshift({ id: bubble.id, text: bubble.text, layout })
  }

  return (
    <div ref={sceneRef} className={narrow ? 'scene scene--narrow' : 'scene scene--art'} data-decor={decor ?? undefined}>
      {!narrow && (
        <svg className="scene__art" viewBox={viewBox} aria-hidden="true" focusable="false">
          <SceneBackdrop kind={decor} />

          {stagePeople.map((person) => {
            const avatar = findAvatar(person.avatarId)
            const index = slots.get(person.id)
            return avatar && index !== undefined ? renderPerson(person.id, avatar, STAGE_SLOTS[index]) : null
          })}
          {atDecks && deckAvatar && renderPerson('dj', deckAvatar, DJ_SLOT)}
          <SceneConsole djName={dj ? dj.pseudo : null} />

          {floorPeople.map((person) => {
            const avatar = findAvatar(person.avatarId)
            const index = slots.get(person.id)
            return avatar && index !== undefined ? renderPerson(person.id, avatar, STAGE_SLOTS[index]) : null
          })}

          {selfOnFloor && selfAvatar && (
            <>
              <ellipse cx={cx} cy={SELF_SLOT.shadow.cy} rx="100" ry="20" className="sc-accent sc-stroke-accent scene__ring" strokeWidth="3" />
              {renderPerson('self', selfAvatar, SELF_SLOT)}
            </>
          )}

          {hearts.map((heart) => {
            const spot = HEART_SPOTS[heart.spot]
            return (
              <g key={heart.id} className="scene__heart">
                <svg x={spot.x} y={spot.y} width={spot.width} height={(spot.width * 22) / 24} viewBox="0 0 24 22" overflow="visible">
                  <path
                    d="M12 21 C2 13 0 8 0 5.5 C0 2.4 2.4 0 5.5 0 C8 0 10.6 1.4 12 4 C13.4 1.4 16 0 18.5 0 C21.6 0 24 2.4 24 5.5 C24 8 22 13 12 21 Z"
                    className="sc-accent"
                    stroke="#16142B"
                    strokeWidth="1.5"
                  />
                </svg>
              </g>
            )
          })}

          {placedBubbles.map((bubble) => (
            <SceneBubble key={bubble.id} text={bubble.text} layout={bubble.layout} />
          ))}

          {selfOnFloor && (
            <g>
              {chipText && (
                <>
                  <rect x={cx - chipWidth / 2} y="486" width={chipWidth} height="22" rx="11" className="sc-accent2" />
                  <text x={cx} y="501" textAnchor="middle" className="scene__text scene__text--chip">
                    {chipText}
                  </text>
                </>
              )}
              <rect x={cx - pillWidth / 2} y="514" width={pillWidth} height="30" rx="15" className="sc-accent" />
              <polygon points={`${cx - 8},543 ${cx + 8},543 ${cx},552`} className="sc-accent" />
              <text x={cx} y="534" textAnchor="middle" className="scene__text scene__text--self">
                {pillText}
              </text>
            </g>
          )}
        </svg>
      )}

      <div className="scene__screen" style={screenStyle}>
        {children}
      </div>

      {narrow ? (
        // The same people are listed, readable, in the panels: this row is only to look at.
        <div className="scene__floor" aria-hidden="true">
          <ul className="scene__crowd">
            {row.map((participant, index) => {
              const avatar = findAvatar(participant.avatarId)
              if (!avatar) return null
              return (
                <li
                  key={participant.id}
                  className={participant.id === selfId ? 'scene__person scene__person--self' : 'scene__person'}
                  style={{ '--delay': `${(index % 5) * -0.18}s` } as CSSProperties}
                >
                  <span className="scene__name">{participant.pseudo}</span>
                  <Avatar avatar={avatar} size={36} decorative />
                </li>
              )
            })}
          </ul>
          {hidden > 0 && <span className="scene__more">+{hidden}</span>}
        </div>
      ) : (
        hidden > 0 && (
          <span className="scene__more" aria-hidden="true">
            +{hidden}
          </span>
        )
      )}
    </div>
  )
}
