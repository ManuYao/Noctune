import { memo } from 'react'
import type { CSSProperties } from 'react'
import type { DecorKind } from './decor/decorKind'
import { DECORS } from './decor'
import { DecorDefs } from './decor/zones'

// The scene is drawn in the 940 x 704 space of the mock-ups. When the box it fills has another shape, the wall, the floor
// and its grid go on past that space (up to these bounds), so that no empty band shows on the sides.
const FAR = 3000
const HORIZON = 436
const FLOOR_BOTTOM = 704

// The fan of the floor grid: the mock-up's lines meet the horizon every 44.2 units from x = 256, and the bottom of the
// scene every 200 units from x = -500. More of them on both sides, for a wider box.
const FAN = Array.from({ length: 35 }, (_, index) => {
  const i = index - 12
  const top = 256 + 44.2 * i
  const bottom = -500 + 200 * i
  // The same line, carried on to the bottom of the far floor.
  const far = top + ((bottom - top) * (FAR - HORIZON)) / (FLOOR_BOTTOM - HORIZON)
  return { top, far }
})
// The rows of the grid: the mock-up's seven, then further apart, for a taller box.
const ROWS = [446, 463, 487, 521, 568, 630, 700, 790, 905, 1050, 1235, 1470, 1770, 2150]

// The beams of the generic club, as the mock-ups draw them: the polygon, the sway, the origin of the sway (the projector).
interface Beam {
  points: string
  sway: 'mw-sway' | 'mw-sway2'
  gradient: 'a' | 'b'
  projector: 0 | 1 | 2 | 3
  style: CSSProperties
}
const BEAMS: Beam[] = [
  { points: '120,34 40,436 200,436', sway: 'mw-sway', gradient: 'a', projector: 0, style: { transformOrigin: '50% 0%' } },
  { points: '190,34 250,436 380,436', sway: 'mw-sway2', gradient: 'b', projector: 1, style: { transformOrigin: '0% 0%' } },
  { points: '750,34 700,436 830,436', sway: 'mw-sway', gradient: 'b', projector: 2, style: { transformOrigin: '38.46% 0%' } },
  { points: '820,34 740,436 900,436', sway: 'mw-sway2', gradient: 'a', projector: 3, style: { transformOrigin: '50% 0%' } },
]
// A rock gig: the beams of the four projectors cross over the stage.
const CROSSED_BEAMS: Beam[] = [
  { points: '120,34 260,436 400,436', sway: 'mw-sway', gradient: 'a', projector: 0, style: { transformOrigin: '120px 34px', transformBox: 'view-box' } },
  { points: '190,34 500,436 640,436', sway: 'mw-sway2', gradient: 'b', projector: 1, style: { transformOrigin: '190px 34px', transformBox: 'view-box' } },
  { points: '750,34 300,436 440,436', sway: 'mw-sway', gradient: 'b', projector: 2, style: { transformOrigin: '750px 34px', transformBox: 'view-box' } },
  { points: '820,34 540,436 680,436', sway: 'mw-sway2', gradient: 'a', projector: 3, style: { transformOrigin: '820px 34px', transformBox: 'view-box' } },
]
const PROJECTORS = [
  { housing: 108, x: 120, tone: 'sc-accent' },
  { housing: 178, x: 190, tone: 'sc-accent2' },
  { housing: 738, x: 750, tone: 'sc-accent2' },
  { housing: 808, x: 820, tone: 'sc-accent' },
] as const

/**
 * The room itself, behind everybody: the wall with its slats and its halo, the four beams that sway, the projectors, the
 * neon frame of the screen, the speakers, the floor in perspective and the stage with its cyan neon. Straight from the
 * mock-ups (screens 3 and 3b). The video sits on top of the screen, in the page: nothing here is ever drawn over it.
 * A genre adds its own decor (see ./decor): its wall, what hangs on the wings, what lies on the floor; the screen, the
 * speakers and the stage are the same everywhere.
 */
function SceneBackdrop({ kind }: { kind: DecorKind | null }) {
  const decor = kind ? DECORS[kind] : null
  const Wall = decor?.Wall
  const Back = decor?.Back
  const Floor = decor?.Floor
  const mode = decor?.beams ?? 'standard'
  const beams = mode === 'none' ? [] : mode === 'crossed' ? CROSSED_BEAMS : mode === 'outer' ? [BEAMS[0], BEAMS[3]] : BEAMS
  const projectors = mode === 'none' ? [] : mode === 'outer' ? [PROJECTORS[0], PROJECTORS[3]] : PROJECTORS
  const slats = decor?.slats !== false
  const grid = decor?.grid !== false
  return (
    <>
      <DecorDefs />
      <defs>
        <pattern id="scene-slats" width="56" height="10" patternUnits="userSpaceOnUse">
          <rect width="4" height="10" className="sc-wall2" />
        </pattern>
        <radialGradient id="scene-halo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="sc-stop-accent" stopOpacity="0.34" />
          <stop offset="1" className="sc-stop-accent" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="scene-beam-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="sc-stop-accent" stopOpacity="0.42" />
          <stop offset="1" className="sc-stop-accent" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="scene-beam-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="sc-stop-accent2" stopOpacity="0.38" />
          <stop offset="1" className="sc-stop-accent2" stopOpacity="0" />
        </linearGradient>
        <filter id="scene-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x={-FAR} y={-FAR} width={2 * FAR + 940} height={2 * FAR + 704} className="sc-bg" />
      <rect x={-FAR} y={-FAR} width={2 * FAR + 940} height={FAR + HORIZON} className="sc-wall" />
      {slats && <rect x={-FAR} y={-FAR} width={2 * FAR + 940} height={FAR + HORIZON} fill="url(#scene-slats)" opacity="0.7" />}
      {Wall && <Wall frame="room" />}
      <circle cx="470" cy="170" r="330" fill="url(#scene-halo)" />
      {Back && <Back frame="room" />}

      {beams.length > 0 && (
        <g opacity={mode === 'soft' ? 0.6 : undefined}>
          {beams.map((beam) => (
            <polygon
              key={beam.points}
              className={beam.style.transformBox ? beam.sway : `${beam.sway} scene__beam`}
              style={beam.style}
              points={beam.points}
              fill={beam.gradient === 'a' ? 'url(#scene-beam-a)' : 'url(#scene-beam-b)'}
            />
          ))}
        </g>
      )}
      {projectors.length > 0 && (
        <>
          <rect x="90" y="0" width="130" height="12" className="sc-stage" />
          <rect x="720" y="0" width="130" height="12" className="sc-stage" />
          {projectors.map((projector) => (
            <g key={projector.x}>
              <rect x={projector.housing} y="12" width="24" height="22" rx="5" fill="#16142B" />
              <circle cx={projector.x} cy="34" r="7" className={projector.tone} filter="url(#scene-glow)" />
            </g>
          ))}
        </>
      )}

      {/* The neon frame and the dark screen: the video covers the screen exactly. */}
      <rect className="mw-neon sc-stroke-accent" x="218" y="8" width="504" height="294" rx="20" fill="none" strokeWidth="4" filter="url(#scene-glow)" />
      <rect x="230" y="20" width="480" height="270" rx="12" className="sc-screen" />

      <rect x="140" y="262" width="66" height="174" rx="10" className="sc-stage" stroke="#16142B" strokeWidth="3" />
      <circle cx="173" cy="288" r="7" fill="#16142B" />
      <circle cx="173" cy="340" r="22" fill="#16142B" />
      <circle cx="173" cy="340" r="10" className="sc-stage-top" />
      <circle cx="173" cy="396" r="22" fill="#16142B" />
      <circle cx="173" cy="396" r="10" className="sc-stage-top" />
      <rect x="734" y="262" width="66" height="174" rx="10" className="sc-stage" stroke="#16142B" strokeWidth="3" />
      <circle cx="767" cy="288" r="7" fill="#16142B" />
      <circle cx="767" cy="340" r="22" fill="#16142B" />
      <circle cx="767" cy="340" r="10" className="sc-stage-top" />
      <circle cx="767" cy="396" r="22" fill="#16142B" />
      <circle cx="767" cy="396" r="10" className="sc-stage-top" />

      <rect x={-FAR} y={HORIZON} width={2 * FAR + 940} height={FAR} className="sc-floor" />
      <ellipse cx="470" cy="456" rx="400" ry="38" className="sc-accent" opacity="0.16" />
      {grid && (
        <g className="sc-stroke-accent2" strokeWidth="1.5" opacity="0.22" fill="none">
          {FAN.map((line) => (
            <line key={line.top} x1={line.top} y1={HORIZON} x2={line.far} y2={FAR} />
          ))}
          {ROWS.map((y) => (
            <line key={y} x1={-FAR} y1={y} x2={FAR + 940} y2={y} />
          ))}
        </g>
      )}
      {Floor && <Floor frame="room" />}

      <polygon points="240,356 700,356 730,390 210,390" className="sc-stage-top" stroke="#16142B" strokeWidth="3" strokeLinejoin="round" />
      <rect x="210" y="390" width="520" height="46" className="sc-stage" stroke="#16142B" strokeWidth="3" />
      <rect className="mw-neon sc-accent2" x="218" y="398" width="504" height="5" rx="2.5" filter="url(#scene-glow)" />
    </>
  )
}

// Nothing in it changes unless the genre does: drawn once, whatever the people in the room do.
export default memo(SceneBackdrop)
