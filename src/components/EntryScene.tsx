import { memo } from 'react'
import type { AvatarDef } from '../data/avatars'
import { findAvatar } from '../data/avatars'
import AvatarArt from './AvatarArt'
import { DECORS } from './decor'
import type { DecorKind } from './decor/decorKind'
import { DecorDefs } from './decor/zones'
import { approxTextWidth, cutText } from './sceneText'
import './Scene.css'
import './EntryScene.css'

// The scene of the entry screen is drawn in the 1440 x 900 space of the mock-up (screen 1) and scaled to fit the window.
// When the window has another shape, the wall and the floor go on past that space (sideways for a wider window, the
// floor downwards for a taller one), up to these bounds.
const FAR = 3000
const FLOOR_TOP = 457
const BOTTOM = 900

// The fan of the floor grid: the mock-up's thirteen lines leave the floor's edge every 391/12 units from x = 533 and reach
// the bottom every 220 units from x = -600; carried on below the bottom for a taller window. More of them on both sides
// for a wider window, shown only outside the mock-up's 1440 units (clipped), so that the drawing stays line for line the
// mock-up's inside them.
const fanLine = (i: number) => {
  const top = 533 + (391 / 12) * i
  const bottom = -600 + 220 * i
  return { top, far: top + ((bottom - top) * (BOTTOM + FAR - FLOOR_TOP)) / (BOTTOM - FLOOR_TOP) }
}
const FAN = Array.from({ length: 13 }, (_, i) => fanLine(i))
const FAN_OUTSIDE = [...Array.from({ length: 10 }, (_, i) => fanLine(-1 - i)), ...Array.from({ length: 10 }, (_, i) => fanLine(13 + i))]
// The rows of the grid: the mock-up's eight, then further and further apart below its bottom.
const ROWS = [470, 487, 511, 545, 592, 658, 752, 880, 1060, 1310, 1660, 2150, 2840, 3800]

// The crowd of the mock-up, avatar for avatar. One of them is not among the eight of the site: the classic head in
// Moss's colours.
const avatar = (id: string, shape?: AvatarDef['shape']): AvatarDef => {
  const found = findAvatar(id)
  if (!found) throw new Error(`Unknown avatar ${id}`)
  return shape ? { ...found, shape } : found
}

interface Dancer {
  avatar: AvatarDef
  x: number
  y: number
  size: number
  delay: number
  shadow: { cx: number; cy: number; rx: number; ry: number; opacity: number }
}

// On the stage, behind the console (the DJ in the middle).
const STAGE: Dancer[] = [
  { avatar: avatar('pulse'), x: 535, y: 300, size: 70, delay: -0.4, shadow: { cx: 570, cy: 366, rx: 18, ry: 4, opacity: 0.3 } },
  { avatar: avatar('cloud'), x: 860, y: 300, size: 70, delay: -0.75, shadow: { cx: 895, cy: 366, rx: 18, ry: 4, opacity: 0.3 } },
  { avatar: avatar('mango'), x: 680, y: 262, size: 100, delay: -0.1, shadow: { cx: 730, cy: 360, rx: 26, ry: 5, opacity: 0.3 } },
]

// On the floor, from the back to the front.
const FLOOR: Dancer[] = [
  { avatar: avatar('grape'), x: 590, y: 455, size: 70, delay: -0.2, shadow: { cx: 625, cy: 520, rx: 18, ry: 4, opacity: 0.35 } },
  { avatar: avatar('ember'), x: 860, y: 455, size: 70, delay: -0.5, shadow: { cx: 895, cy: 520, rx: 18, ry: 4, opacity: 0.35 } },
  { avatar: avatar('cloud'), x: 1010, y: 470, size: 74, delay: -0.35, shadow: { cx: 1047, cy: 539, rx: 19, ry: 4, opacity: 0.35 } },
  { avatar: avatar('moss'), x: 300, y: 468, size: 78, delay: -0.8, shadow: { cx: 339, cy: 541, rx: 20, ry: 4.3, opacity: 0.35 } },
  { avatar: avatar('mango'), x: 120, y: 520, size: 96, delay: -0.1, shadow: { cx: 168, cy: 609, rx: 25, ry: 5.3, opacity: 0.4 } },
  { avatar: avatar('mist'), x: 740, y: 520, size: 100, delay: -0.6, shadow: { cx: 790, cy: 613, rx: 26, ry: 5.5, opacity: 0.4 } },
  { avatar: avatar('moss', 'classic'), x: 470, y: 545, size: 100, delay: -0.45, shadow: { cx: 520, cy: 638, rx: 26, ry: 5.5, opacity: 0.4 } },
  { avatar: avatar('lemon'), x: 900, y: 560, size: 100, delay: -0.9, shadow: { cx: 950, cy: 653, rx: 26, ry: 5.5, opacity: 0.4 } },
  { avatar: avatar('grape'), x: 210, y: 650, size: 130, delay: -0.7, shadow: { cx: 275, cy: 771, rx: 34, ry: 7, opacity: 0.45 } },
  { avatar: avatar('mango'), x: 800, y: 665, size: 140, delay: -0.25, shadow: { cx: 870, cy: 795, rx: 36, ry: 7.7, opacity: 0.45 } },
]

// The visitor, in front, on their ring, with their pseudo in a pill above the head.
const SELF = { x: 440, y: 690, size: 170 }
const SELF_CX = SELF.x + SELF.size / 2
const PILL = { top: 642, height: 38, fontSize: 15, padding: 18 }

// The projectors of the entry screen, and their beams: the same four as the room's, laid out for 1440 x 900.
interface Beam {
  points: string
  x: number
  sway: 'mw-sway' | 'mw-sway2'
  gradient: 'a' | 'b'
}
const BEAMS: Beam[] = [
  { points: '470,44 330,470 520,470', x: 470, sway: 'mw-sway', gradient: 'a' },
  { points: '640,44 570,470 770,470', x: 640, sway: 'mw-sway2', gradient: 'b' },
  { points: '820,44 700,470 900,470', x: 820, sway: 'mw-sway', gradient: 'a' },
  { points: '990,44 1030,470 1200,470', x: 990, sway: 'mw-sway2', gradient: 'b' },
]
const PROJECTORS = [
  { x: 470, tone: 'sc-accent' },
  { x: 640, tone: 'sc-accent2' },
  { x: 820, tone: 'sc-accent' },
  { x: 990, tone: 'sc-accent2' },
] as const

function Person({ dancer }: { dancer: Dancer }) {
  const { shadow } = dancer
  return (
    <>
      <ellipse cx={shadow.cx} cy={shadow.cy} rx={shadow.rx} ry={shadow.ry} fill="#000000" opacity={shadow.opacity} />
      <g className="mw-bob" style={{ animationDelay: `${dancer.delay}s` }}>
        <svg x={dancer.x} y={dancer.y} width={dancer.size} height={dancer.size} viewBox="0 0 100 100" overflow="visible">
          <AvatarArt avatar={dancer.avatar} />
        </svg>
      </g>
    </>
  )
}

/**
 * The wall, the beams, the screen with its sunset, the speakers, the floor, the stage and the crowd. The screen names
 * what plays in the proposed room, when something does: drawn here, under the DJ's head, as in the mock-up.
 */
const Club = memo(function Club({ title, artist, kind }: { title: string | null; artist: string | null; kind: DecorKind | null }) {
  const decor = kind ? DECORS[kind] : null
  const Wall = decor?.Wall
  const Back = decor?.Back
  const Floor = decor?.Floor
  // Mock-up 1: the same four pink and cyan beams whatever the genre; it is their light on the wall that makes it violet.
  const beams = BEAMS
  const projectors = PROJECTORS
  return (
    <>
      <DecorDefs />
      <defs>
        <pattern id="entry-slats" width="56" height="10" patternUnits="userSpaceOnUse">
          <rect width="4" height="10" className="sc-wall2" />
        </pattern>
        <radialGradient id="entry-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="sc-stop-accent" stopOpacity="0.34" />
          <stop offset="1" className="sc-stop-accent" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="entry-beam-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="sc-stop-accent" stopOpacity="0.45" />
          <stop offset="1" className="sc-stop-accent" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="entry-beam-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="sc-stop-accent2" stopOpacity="0.4" />
          <stop offset="1" className="sc-stop-accent2" stopOpacity="0" />
        </linearGradient>
        {/* Darkens the wall on the left, under the title. */}
        <linearGradient id="entry-scrim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" className="entry-scene__stop-bg" stopOpacity="0.92" />
          <stop offset="1" className="entry-scene__stop-bg" stopOpacity="0" />
        </linearGradient>
        <clipPath id="entry-screen">
          <rect x="520" y="80" width="420" height="232" rx="14" />
        </clipPath>
        <clipPath id="entry-outside">
          <rect x={-FAR} y={FLOOR_TOP} width={FAR} height={BOTTOM + FAR} />
          <rect x="1440" y={FLOOR_TOP} width={FAR} height={BOTTOM + FAR} />
        </clipPath>
        <filter id="entry-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x={-FAR} width={2 * FAR + 1440} height={BOTTOM + FAR} className="sc-bg" />
      <rect x={-FAR} width={2 * FAR + 1440} height="470" className="sc-wall" />
      {decor?.slats !== false && <rect x={-FAR} width={2 * FAR + 1440} height="470" fill="url(#entry-slats)" opacity="0.7" />}
      {Wall && <Wall frame="entry" />}
      <circle cx="730" cy="200" r="380" fill="url(#entry-halo)" />
      {Back && <Back frame="entry" />}

      <g>
        {beams.map((beam) => (
          <polygon key={beam.points} className={beam.sway} style={{ transformOrigin: `${beam.x}px 44px` }} points={beam.points} fill={beam.gradient === 'a' ? 'url(#entry-beam-a)' : 'url(#entry-beam-b)'} />
        ))}
      </g>
      <rect x="0" y="0" width="640" height="470" fill="url(#entry-scrim)" />
      <rect x={-FAR} y="0" width={FAR} height="470" className="entry-scene__scrim-far" />

      {projectors.length > 0 && (
        <>
          <rect x="400" y="0" width="640" height="20" className="sc-stage" />
          {projectors.map((projector) => (
            <g key={projector.x}>
              <rect x={projector.x - 14} y="20" width="28" height="26" rx="6" fill="#16142B" />
              <circle cx={projector.x} cy="46" r="8" className={projector.tone} filter="url(#entry-glow)" />
            </g>
          ))}
        </>
      )}

      {/* The screen: a drawing here (a sunset over hills), never a video. */}
      <rect className="mw-neon sc-stroke-accent" x="508" y="68" width="444" height="256" rx="22" fill="none" strokeWidth="5" filter="url(#entry-glow)" />
      <rect x="520" y="80" width="420" height="232" rx="14" className="sc-screen" />
      <g clipPath="url(#entry-screen)">
        <circle cx="730" cy="192" r="58" className="sc-accent" />
        <rect x="660" y="206" width="140" height="5" className="sc-screen" />
        <rect x="660" y="219" width="140" height="7" className="sc-screen" />
        <rect x="660" y="234" width="140" height="9" className="sc-screen" />
        <polygon points="520,312 520,252 590,212 650,244 730,204 810,248 870,224 940,258 940,312" className="sc-wall2" />
        {title !== null && (
          <>
            <rect x="520" y="262" width="420" height="50" fill="#000000" opacity="0.55" />
            <polygon points="540,276 540,298 558,287" fill="#FFFFFF" />
            <text x="572" y="283" className="entry-scene__title">
              {cutText(title, 40)}
            </text>
            <text x="572" y="302" className="entry-scene__artist">
              {cutText(artist ?? '', 48)}
            </text>
          </>
        )}
      </g>
      {title !== null && (
        <>
          <rect x="536" y="94" width="86" height="24" rx="12" fill="#16142B" />
          <circle cx="551" cy="106" r="4" className="sc-accent" />
          <text x="561" y="111" className="entry-scene__live">
            EN DIRECT
          </text>
        </>
      )}

      <rect x="440" y="292" width="70" height="168" rx="10" className="sc-stage" stroke="#16142B" strokeWidth="3" />
      <circle cx="475" cy="318" r="7" fill="#16142B" />
      <circle cx="475" cy="372" r="22" fill="#16142B" />
      <circle cx="475" cy="372" r="10" className="sc-stage-top" />
      <circle cx="475" cy="428" r="22" fill="#16142B" />
      <circle cx="475" cy="428" r="10" className="sc-stage-top" />
      <rect x="950" y="292" width="70" height="168" rx="10" className="sc-stage" stroke="#16142B" strokeWidth="3" />
      <circle cx="985" cy="318" r="7" fill="#16142B" />
      <circle cx="985" cy="372" r="22" fill="#16142B" />
      <circle cx="985" cy="372" r="10" className="sc-stage-top" />
      <circle cx="985" cy="428" r="22" fill="#16142B" />
      <circle cx="985" cy="428" r="10" className="sc-stage-top" />

      <rect x={-FAR} y={FLOOR_TOP} width={2 * FAR + 1440} height={BOTTOM + FAR - FLOOR_TOP} className="sc-floor" />
      <ellipse cx="730" cy="482" rx="440" ry="44" className="sc-accent" opacity="0.16" />
      {decor?.grid !== false && (
      <g className="sc-stroke-accent2" strokeWidth="1.5" opacity="0.22" fill="none">
        {FAN.map((line) => (
          <line key={line.top} x1={line.top} y1={FLOOR_TOP} x2={line.far} y2={BOTTOM + FAR} />
        ))}
        <g clipPath="url(#entry-outside)">
          {FAN_OUTSIDE.map((line) => (
            <line key={line.top} x1={line.top} y1={FLOOR_TOP} x2={line.far} y2={BOTTOM + FAR} />
          ))}
        </g>
        {ROWS.map((y) => (
          <line key={y} x1={-FAR} y1={y} x2={FAR + 1440} y2={y} />
        ))}
      </g>
      )}
      {Floor && <Floor frame="entry" />}

      <polygon points="500,372 960,372 990,405 470,405" className="sc-stage-top" stroke="#16142B" strokeWidth="3" strokeLinejoin="round" />
      <rect x="470" y="405" width="520" height="52" className="sc-stage" stroke="#16142B" strokeWidth="3" />
      <rect className="mw-neon sc-accent2" x="478" y="414" width="504" height="5" rx="2.5" filter="url(#entry-glow)" />

      {STAGE.map((dancer) => (
        <Person key={`${dancer.x},${dancer.y}`} dancer={dancer} />
      ))}
      {/* The console, in front of the DJ. */}
      <rect x="625" y="346" width="210" height="44" rx="6" className="sc-stage" stroke="#16142B" strokeWidth="3" />
      <ellipse cx="682" cy="346" rx="30" ry="8" fill="#16142B" />
      <ellipse cx="682" cy="346" rx="8" ry="2" className="sc-accent" />
      <ellipse cx="778" cy="346" rx="30" ry="8" fill="#16142B" />
      <ellipse cx="778" cy="346" rx="8" ry="2" className="sc-accent" />
      <rect x="705" y="338" width="50" height="14" rx="3" fill="#16142B" />
      <circle cx="718" cy="345" r="2.5" className="sc-accent2" />
      <circle cx="730" cy="345" r="2.5" className="sc-accent2" />
      <circle cx="742" cy="345" r="2.5" className="sc-accent2" />

      {FLOOR.map((dancer) => (
        <Person key={`${dancer.x},${dancer.y}`} dancer={dancer} />
      ))}
    </>
  )
})

interface EntrySceneProps {
  /** The avatar the visitor picked (or the member's own): it stands in front, on its ring. */
  avatar: AvatarDef
  /** What the pill over their head says, as they type it. */
  pseudo: string
  /** What plays in the proposed room right now, written on the screen; null: the screen shows its sunset only. */
  nowPlaying: { title: string; artist: string } | null
  /** The genre of the proposed room: its decor and its colours (the same as on its card and inside the room); null: the generic club. */
  decor: DecorKind | null
}

/**
 * The big illustrated club behind the entry screen (mock-up 1), with the visitor in front of the crowd. It fills the
 * window behind the page, scaled to fit it; nothing in it can be read or clicked (the form says it all).
 */
export default function EntryScene({ avatar: selfAvatar, pseudo, nowPlaying, decor }: EntrySceneProps) {
  const pill = cutText(pseudo, 20) || 'Toi'
  const pillWidth = approxTextWidth(pill, PILL.fontSize) + 2 * PILL.padding
  const pillBottom = PILL.top + PILL.height
  return (
    <div className="entry-scene" aria-hidden="true" data-decor={decor ?? undefined}>
      <svg className="entry-scene__art" viewBox="0 0 1440 900" focusable="false">
        <Club title={nowPlaying?.title ?? null} artist={nowPlaying?.artist ?? null} kind={decor} />

        <ellipse cx={SELF_CX} cy="850" rx="92" ry="20" className="sc-accent sc-stroke-accent scene__ring" strokeWidth="3" />
        <ellipse cx={SELF_CX} cy="848" rx="44" ry="9.4" fill="#000000" opacity="0.4" />
        <g className="mw-bob">
          <svg x={SELF.x} y={SELF.y} width={SELF.size} height={SELF.size} viewBox="0 0 100 100" overflow="visible">
            <AvatarArt avatar={selfAvatar} />
          </svg>
        </g>

        <rect x={SELF_CX - pillWidth / 2} y={PILL.top} width={pillWidth} height={PILL.height} rx={PILL.height / 2} className="sc-accent" />
        <polygon points={`${SELF_CX - 8.5},${pillBottom - 1} ${SELF_CX + 8.5},${pillBottom - 1} ${SELF_CX},${pillBottom + 8.5}`} className="sc-accent" />
        <text x={SELF_CX} y={PILL.top + 24.5} textAnchor="middle" className="entry-scene__pill">
          {pill}
        </text>
      </svg>
    </div>
  )
}
