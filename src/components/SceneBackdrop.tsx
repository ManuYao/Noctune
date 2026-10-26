import { memo } from 'react'

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

/**
 * The room itself, behind everybody: the wall with its slats and its halo, the four beams that sway, the projectors, the
 * neon frame of the screen, the speakers, the floor in perspective and the stage with its cyan neon. Straight from the
 * mock-ups (screens 3 and 3b). The video sits on top of the screen, in the page: nothing here is ever drawn over it.
 */
function SceneBackdrop() {
  return (
    <>
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
      <rect x={-FAR} y={-FAR} width={2 * FAR + 940} height={FAR + HORIZON} fill="url(#scene-slats)" opacity="0.7" />
      <circle cx="470" cy="170" r="330" fill="url(#scene-halo)" />

      <polygon className="mw-sway scene__beam" style={{ transformOrigin: '50% 0%' }} points="120,34 40,436 200,436" fill="url(#scene-beam-a)" />
      <polygon className="mw-sway2 scene__beam" style={{ transformOrigin: '0% 0%' }} points="190,34 250,436 380,436" fill="url(#scene-beam-b)" />
      <polygon className="mw-sway scene__beam" style={{ transformOrigin: '38.46% 0%' }} points="750,34 700,436 830,436" fill="url(#scene-beam-b)" />
      <polygon className="mw-sway2 scene__beam" style={{ transformOrigin: '50% 0%' }} points="820,34 740,436 900,436" fill="url(#scene-beam-a)" />
      <rect x="90" y="0" width="130" height="12" className="sc-stage" />
      <rect x="720" y="0" width="130" height="12" className="sc-stage" />
      <rect x="108" y="12" width="24" height="22" rx="5" fill="#16142B" />
      <circle cx="120" cy="34" r="7" className="sc-accent" filter="url(#scene-glow)" />
      <rect x="178" y="12" width="24" height="22" rx="5" fill="#16142B" />
      <circle cx="190" cy="34" r="7" className="sc-accent2" filter="url(#scene-glow)" />
      <rect x="738" y="12" width="24" height="22" rx="5" fill="#16142B" />
      <circle cx="750" cy="34" r="7" className="sc-accent2" filter="url(#scene-glow)" />
      <rect x="808" y="12" width="24" height="22" rx="5" fill="#16142B" />
      <circle cx="820" cy="34" r="7" className="sc-accent" filter="url(#scene-glow)" />

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
      <g className="sc-stroke-accent2" strokeWidth="1.5" opacity="0.22" fill="none">
        {FAN.map((line) => (
          <line key={line.top} x1={line.top} y1={HORIZON} x2={line.far} y2={FAR} />
        ))}
        {ROWS.map((y) => (
          <line key={y} x1={-FAR} y1={y} x2={FAR + 940} y2={y} />
        ))}
      </g>

      <polygon points="240,356 700,356 730,390 210,390" className="sc-stage-top" stroke="#16142B" strokeWidth="3" strokeLinejoin="round" />
      <rect x="210" y="390" width="520" height="46" className="sc-stage" stroke="#16142B" strokeWidth="3" />
      <rect className="mw-neon sc-accent2" x="218" y="398" width="504" height="5" rx="2.5" filter="url(#scene-glow)" />
    </>
  )
}

// Nothing in it ever changes: drawn once, whatever the people in the room do.
export default memo(SceneBackdrop)
