import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { DjQueueEntry, Participant } from '../../shared/protocol'
import { findAvatar, type AvatarDef } from '../data/avatars'
import AvatarArt from './AvatarArt'
import type { DecorKind } from './decor/decorKind'
import { assignSlots } from './stageSlots'
import { useHearts } from './useHearts'
import './Scene.css'
import './MobileScene.css'

interface MobileSceneProps {
  participants: Participant[]
  selfId: string | undefined
  /** The DJ on the decks: they stand behind a small console in the middle. Null while nobody is. */
  dj: DjQueueEntry | null
  /** Goes up at each like anyone gives: a heart rises from the floor. */
  likePulse: number
  /** The genre of the room: its two neon accents (the walls and the floor keep the night blue). */
  decor: DecorKind | null
  /** The video screen: it covers the scene's screen exactly, nothing is ever drawn over it. */
  children: ReactNode
}

/** The box the drawing is laid out in, in pixels of the scene. The video screen is the CSS box `.scene__screen`. */
interface Geometry {
  width: number
  height: number
  screen: { x: number; y: number; width: number; height: number }
}

// The outline colour of every drawing of the mock-ups.
const OUT = '#16142B'
// Where the neon frame stands off the screen, and the gap between the frame and the stage.
const FRAME_GAP = 5
const STAGE_GAP = 4
// The stage of the mock-ups (mock-up M3): a thin top face and a front with its cyan neon line.
const STAGE_TOP_H = 7
const STAGE_FRONT_H = 11
// The crowd on the floor, as the mock-up M3 places it (fractions of the width), outermost first: six people at most.
const CROWD_X = [0.082, 0.21, 0.346, 0.654, 0.79, 0.918]
// How big each is next to the base size, and how far up the floor (further from the front) its feet stand.
const CROWD_SIZE = [1.05, 0.95, 0.9, 0.9, 0.95, 1.05]
const CROWD_DEPTH = [0.3, 0.14, 0, 0, 0.14, 0.3]
// Where the viewer stands when the DJ has the middle: the place of the crowd's third slot.
const SELF_ASIDE = 2
// Under this much floor (a short window) the crowd would not fit in front of the stage: only the drawing remains.
const MIN_FLOOR_FOR_PEOPLE = 36
const HEART_X = [0.2, 0.36, 0.5, 0.64, 0.8]

/**
 * Reads where the video screen is in the scene, and how big the scene is: the drawing is laid out around it, in pixels, so
 * that the neon frame always hugs the video whatever its CSS size is.
 */
function useGeometry(sceneRef: RefObject<HTMLDivElement | null>, screenRef: RefObject<HTMLDivElement | null>): Geometry | null {
  const [geometry, setGeometry] = useState<Geometry | null>(null)
  useLayoutEffect(() => {
    const scene = sceneRef.current
    const screen = screenRef.current
    if (!scene || !screen) return
    const update = () => {
      const next: Geometry = {
        width: scene.clientWidth,
        height: scene.clientHeight,
        screen: { x: screen.offsetLeft, y: screen.offsetTop, width: screen.offsetWidth, height: screen.offsetHeight },
      }
      setGeometry((previous) =>
        previous &&
        previous.width === next.width &&
        previous.height === next.height &&
        previous.screen.x === next.screen.x &&
        previous.screen.y === next.screen.y &&
        previous.screen.width === next.screen.width &&
        previous.screen.height === next.screen.height
          ? previous
          : next,
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(scene)
    observer.observe(screen)
    return () => observer.disconnect()
  }, [sceneRef, screenRef])
  return geometry
}

/** Somebody on the floor: their shadow, and the avatar that bounces. `x` is the middle of their feet. */
function Person({ avatar, x, feetY, size, delay }: { avatar: AvatarDef; x: number; feetY: number; size: number; delay: number }) {
  return (
    <g>
      <ellipse cx={x} cy={feetY - size * 0.02} rx={size * 0.26} ry={size * 0.05} fill="#000000" opacity="0.4" />
      <g className="mw-bob" style={{ animationDelay: `${delay}s` }}>
        <svg x={x - size / 2} y={feetY - size} width={size} height={size} viewBox="0 0 100 100" overflow="visible">
          <AvatarArt avatar={avatar} />
        </svg>
      </g>
    </g>
  )
}

/** One speaker, as the mock-ups draw them: a box, a small tweeter and a big woofer. */
function Speaker({ x, top, bottom }: { x: number; top: number; bottom: number }) {
  const width = 32
  const height = bottom - top
  const cx = x + width / 2
  const woofer = Math.min(11, (height - 18) / 2)
  return (
    <g>
      <rect x={x} y={top} width={width} height={height} rx="7" className="sc-stage" stroke={OUT} strokeWidth="2.5" />
      <circle cx={cx} cy={top + 8} r="3" fill={OUT} />
      {woofer >= 5 && (
        <>
          <circle cx={cx} cy={top + 12 + (height - 12) / 2} r={woofer} fill={OUT} />
          <circle cx={cx} cy={top + 12 + (height - 12) / 2} r={woofer * 0.45} className="sc-stage-top" />
        </>
      )}
    </g>
  )
}

/** A small DJ console: two turntables and the mixer, hiding the feet of whoever stands behind it. */
function Console({ cx, y, width }: { cx: number; y: number; width: number }) {
  return (
    <g>
      <rect x={cx - width / 2} y={y} width={width} height="12" rx="4" className="sc-stage" stroke={OUT} strokeWidth="2.2" />
      <ellipse cx={cx - width * 0.28} cy={y} rx={width * 0.15} ry="2.6" fill={OUT} />
      <ellipse cx={cx - width * 0.28} cy={y} rx={width * 0.04} ry="0.8" className="sc-accent" />
      <ellipse cx={cx + width * 0.28} cy={y} rx={width * 0.15} ry="2.6" fill={OUT} />
      <ellipse cx={cx + width * 0.28} cy={y} rx={width * 0.04} ry="0.8" className="sc-accent" />
      <rect x={cx - width * 0.09} y={y - 3} width={width * 0.18} height="6" rx="2" fill={OUT} />
      <circle cx={cx} cy={y} r="1.5" className="sc-accent2" />
    </g>
  )
}

/**
 * The illustrated club of mock-up M3 for a phone: the neon-framed screen with the video in it, the two speakers, the stage
 * with its cyan neon line, the floor in perspective and a few people on it. The video is never smaller than YouTube allows
 * (200 x 200 px, see MobileScene.css), so it takes the width of the phone and the stage and the crowd are squeezed under it.
 * All of it is decoration: the tabs under the scene list the same people, readable by everybody.
 */
export default function MobileScene({ participants, selfId, dj, likePulse, decor, children }: MobileSceneProps) {
  const sceneRef = useRef<HTMLDivElement>(null)
  const screenRef = useRef<HTMLDivElement>(null)
  const geometry = useGeometry(sceneRef, screenRef)

  const deckPerson = dj?.participantId ? participants.find((p) => p.id === dj.participantId) : undefined
  const deckAvatar = deckPerson && findAvatar(deckPerson.avatarId)
  const self = participants.find((p) => p.id === selfId)
  const selfAvatar = self && findAvatar(self.avatarId)
  const selfAtDecks = deckPerson !== undefined && self !== undefined && deckPerson.id === self.id
  const others = useMemo(
    () => participants.filter((p) => p.id !== selfId && p.id !== deckPerson?.id),
    [participants, selfId, deckPerson?.id],
  )
  // The viewer takes the middle, unless somebody else is on the decks: then they stand aside, in the crowd's third place.
  const asideSelf = selfAvatar !== undefined && deckAvatar !== undefined && !selfAtDecks
  const slots = useMemo(() => assignSlots(others.map((p) => p.id), CROWD_X.length - (asideSelf ? 1 : 0)), [others, asideSelf])

  const hearts = useHearts(likePulse, HEART_X.length)

  let art: ReactNode = null
  let hiddenCount = 0
  if (geometry) {
    const { width: W, height: H, screen } = geometry
    const frameBottom = screen.y + screen.height + FRAME_GAP
    const stageTop = frameBottom + STAGE_GAP
    const horizon = stageTop + STAGE_TOP_H + STAGE_FRONT_H
    const floor = Math.max(0, H - horizon)
    const showPeople = floor >= MIN_FLOOR_FOR_PEOPLE
    const base = Math.min(44, Math.max(30, floor * 0.8))
    const middle = W / 2
    const stageWidth = W * 0.6
    const stageLeft = (W - stageWidth) / 2

    // The crowd's slots, in the order they are drawn (further ones first). The viewer's third place is not the crowd's.
    const slotX = CROWD_X.map((fraction) => fraction * W)
    const crowdSlots = CROWD_X.map((_, index) => index).filter((index) => !(asideSelf && index === SELF_ASIDE))
    const crowdIndex = (slot: number) => crowdSlots[slot] ?? slot
    const crowd = others
      .map((person) => ({ person, slot: slots.get(person.id) }))
      .filter((entry): entry is { person: Participant; slot: number } => entry.slot !== undefined)
      .sort((a, b) => CROWD_DEPTH[crowdIndex(b.slot)] - CROWD_DEPTH[crowdIndex(a.slot)])

    const selfSize = Math.min(62, base * 1.4)
    const deckSize = Math.min(52, base * 1.2)
    const deckFeet = horizon + floor * 0.52
    const shownPeople = (showPeople ? crowd.length : 0) + (showPeople && selfAvatar ? 1 : 0) + (showPeople && deckAvatar ? 1 : 0)
    hiddenCount = showPeople ? Math.max(0, participants.length - shownPeople) : 0

    const ringRy = selfSize * 0.12
    const ringCy = H - ringRy - 3
    const selfX = asideSelf ? slotX[SELF_ASIDE] : middle
    // The people who are not at the decks stand in front of the console, but it is the viewer's ring that is the lowest.
    const speakerTop = frameBottom + 3
    const speakerBottom = H - 4

    art = (
      <svg className="scene__art" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
        <defs>
          <pattern id="m-slats" width="56" height="10" patternUnits="userSpaceOnUse">
            <rect width="4" height="10" className="sc-wall2" />
          </pattern>
          <radialGradient id="m-halo" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" className="sc-stop-accent" stopOpacity="0.34" />
            <stop offset="1" className="sc-stop-accent" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="m-beam-a" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="sc-stop-accent" stopOpacity="0.42" />
            <stop offset="1" className="sc-stop-accent" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="m-beam-b" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="sc-stop-accent2" stopOpacity="0.38" />
            <stop offset="1" className="sc-stop-accent2" stopOpacity="0" />
          </linearGradient>
          <filter id="m-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width={W} height={H} className="sc-bg" />
        <rect width={W} height={horizon} className="sc-wall" />
        <rect width={W} height={horizon} fill="url(#m-slats)" opacity="0.7" />
        <circle cx={middle} cy={screen.y + screen.height / 2} r={W * 0.55} fill="url(#m-halo)" />
        <polygon
          className="mw-sway scene__beam"
          style={{ transformOrigin: `${W * 0.2}px 0px` }}
          points={`${W * 0.2},0 ${W * 0.08},${horizon} ${W * 0.32},${horizon}`}
          fill="url(#m-beam-a)"
        />
        <polygon
          className="mw-sway2 scene__beam"
          style={{ transformOrigin: `${W * 0.8}px 0px` }}
          points={`${W * 0.8},0 ${W * 0.68},${horizon} ${W * 0.92},${horizon}`}
          fill="url(#m-beam-b)"
        />

        {/* The neon frame and the dark screen: the video covers the screen exactly. */}
        <rect
          className="mw-neon sc-stroke-accent"
          x={screen.x - FRAME_GAP}
          y={screen.y - FRAME_GAP}
          width={screen.width + 2 * FRAME_GAP}
          height={screen.height + 2 * FRAME_GAP}
          rx="12"
          fill="none"
          strokeWidth="3"
          filter="url(#m-glow)"
        />
        <rect x={screen.x} y={screen.y} width={screen.width} height={screen.height} rx="8" className="sc-screen" />

        {/* The floor, in perspective, with the glow of the stage on it. */}
        <rect y={horizon} width={W} height={floor} className="sc-floor" />
        <ellipse cx={middle} cy={horizon} rx={W * 0.45} ry="12" className="sc-accent" opacity="0.16" />
        <g className="sc-stroke-accent2" strokeWidth="1.2" opacity="0.22" fill="none">
          {Array.from({ length: 15 }, (_, index) => {
            const x2 = middle + (index - 7) * W * 0.23
            return <line key={index} x1={middle} y1={horizon} x2={x2} y2={H} />
          })}
          {[0.1, 0.27, 0.52, 0.83].map((fraction) => (
            <line key={fraction} x1="0" y1={horizon + floor * fraction} x2={W} y2={horizon + floor * fraction} />
          ))}
        </g>

        <Speaker x={8} top={speakerTop} bottom={speakerBottom} />
        <Speaker x={W - 40} top={speakerTop} bottom={speakerBottom} />

        {/* The stage under the screen: its top face, its front and the cyan line. */}
        <polygon
          points={`${stageLeft + 12},${stageTop} ${stageLeft + stageWidth - 12},${stageTop} ${stageLeft + stageWidth},${stageTop + STAGE_TOP_H} ${stageLeft},${stageTop + STAGE_TOP_H}`}
          className="sc-stage-top"
          stroke={OUT}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <rect x={stageLeft} y={stageTop + STAGE_TOP_H} width={stageWidth} height={STAGE_FRONT_H} className="sc-stage" stroke={OUT} strokeWidth="2.2" />
        <rect className="mw-neon sc-accent2" x={stageLeft + 6} y={stageTop + STAGE_TOP_H + 4} width={stageWidth - 12} height="3" rx="1.5" filter="url(#m-glow)" />

        {showPeople &&
          crowd
            .filter((entry) => CROWD_DEPTH[crowdIndex(entry.slot)] > 0)
            .map(({ person, slot }) => {
              const avatar = findAvatar(person.avatarId)
              const index = crowdIndex(slot)
              return avatar ? (
                <Person
                  key={person.id}
                  avatar={avatar}
                  x={slotX[index]}
                  feetY={H - 6 - floor * CROWD_DEPTH[index]}
                  size={base * CROWD_SIZE[index]}
                  delay={-0.2 * ((index * 3) % 5)}
                />
              ) : null
            })}

        {/* Somebody else on the decks. The viewer on the decks is drawn once, with their ring, further down. */}
        {showPeople && deckAvatar && !selfAtDecks && (
          <>
            <Person avatar={deckAvatar} x={middle} feetY={deckFeet} size={deckSize} delay={-0.1} />
            <Console cx={middle} y={deckFeet - 10} width={Math.min(86, W * 0.22)} />
          </>
        )}

        {showPeople &&
          crowd
            .filter((entry) => CROWD_DEPTH[crowdIndex(entry.slot)] === 0)
            .map(({ person, slot }) => {
              const avatar = findAvatar(person.avatarId)
              const index = crowdIndex(slot)
              return avatar ? (
                <Person
                  key={person.id}
                  avatar={avatar}
                  x={slotX[index]}
                  feetY={H - 6}
                  size={base * CROWD_SIZE[index]}
                  delay={-0.2 * ((index * 3) % 5)}
                />
              ) : null
            })}

        {/* The viewer: in front, on a ring of the accent colour; behind the console if they are the DJ. */}
        {showPeople && selfAvatar && !selfAtDecks && (
          <>
            <ellipse cx={selfX} cy={ringCy} rx={selfSize * 0.7} ry={ringRy} className="sc-accent sc-stroke-accent scene__ring" strokeWidth="2.5" />
            <Person avatar={selfAvatar} x={selfX} feetY={H - 4} size={selfSize} delay={0} />
          </>
        )}
        {showPeople && selfAvatar && selfAtDecks && (
          <>
            <ellipse cx={middle} cy={deckFeet + 4} rx={deckSize * 0.8} ry={deckSize * 0.12} className="sc-accent sc-stroke-accent scene__ring" strokeWidth="2.5" />
            <Person avatar={selfAvatar} x={middle} feetY={deckFeet} size={deckSize} delay={0} />
            <Console cx={middle} y={deckFeet - 10} width={Math.min(86, W * 0.22)} />
          </>
        )}

        {floor >= 60 &&
          hearts.map((heart) => {
            const width = 18
            return (
              <g key={heart.id} className="scene__heart">
                <svg x={HEART_X[heart.spot] * W - width / 2} y={H - 22} width={width} height={(width * 22) / 24} viewBox="0 0 24 22" overflow="visible">
                  <path
                    d="M12 21 C2 13 0 8 0 5.5 C0 2.4 2.4 0 5.5 0 C8 0 10.6 1.4 12 4 C13.4 1.4 16 0 18.5 0 C21.6 0 24 2.4 24 5.5 C24 8 22 13 12 21 Z"
                    className="sc-accent"
                    stroke={OUT}
                    strokeWidth="1.5"
                  />
                </svg>
              </g>
            )
          })}
      </svg>
    )
  }

  return (
    <div ref={sceneRef} className="scene scene--art scene--phone" data-decor={decor ?? undefined}>
      {art}
      <div ref={screenRef} className="scene__screen">
        {children}
      </div>
      {hiddenCount > 0 && (
        <span className="scene__more" aria-hidden="true">
          +{hiddenCount}
        </span>
      )}
    </div>
  )
}
