import { memo } from 'react'
import { OUT, Zone, seeded, type DecorProps } from './zones'

const LEAF = '#1F8A5B'
const LEAF_DARK = '#17734A'

/** A palm: a leaning trunk with rings, a crown of long leaves. `lean` is the x of the crown relative to the foot. */
function Palm({ foot, top, lean, delay, scale = 1 }: { foot: number; top: number; lean: number; delay: number; scale?: number }) {
  const baseY = 440
  const crownX = foot + lean
  const leaves = [-150, -112, -74, -38, -4, 28, 62, 100, 138]
  return (
    <g>
      <path d={`M${foot} ${baseY} Q${foot + lean * 0.1} ${(baseY + top) / 2} ${crownX} ${top}`} fill="none" stroke={OUT} strokeWidth={13 * scale} strokeLinecap="round" />
      <path d={`M${foot} ${baseY} Q${foot + lean * 0.1} ${(baseY + top) / 2} ${crownX} ${top}`} fill="none" stroke="#8A5A32" strokeWidth={7 * scale} strokeLinecap="round" />
      <g className="mw-sway-s" style={{ animationDelay: `${delay}s` }}>
        {leaves.map((angle, index) => (
          <g key={angle} transform={`translate(${crownX} ${top}) rotate(${angle}) scale(${scale})`}>
            <path d="M0 0 C18 -22 52 -26 82 -8 C54 -8 24 -4 0 0 Z" fill={index % 2 === 0 ? LEAF : LEAF_DARK} stroke={OUT} strokeWidth="2.6" strokeLinejoin="round" />
          </g>
        ))}
        <circle cx={crownX - 5 * scale} cy={top + 6 * scale} r={6 * scale} fill="#8A5A32" stroke={OUT} strokeWidth="2.4" />
        <circle cx={crownX + 7 * scale} cy={top + 8 * scale} r={6 * scale} fill="#8A5A32" stroke={OUT} strokeWidth="2.4" />
      </g>
    </g>
  )
}

/** Wall of a hot evening: a sunburst behind the stage, a woven band along the foot of the wall, and a palm each side. */
const AfroBack = memo(function AfroBack({ frame }: DecorProps) {
  const rays = Array.from({ length: 11 }, (_, index) => {
    const a = (Math.PI * (185 + index * 15)) / 180
    const b = (Math.PI * (185 + index * 15 + 7.5)) / 180
    const reach = 900
    return `470,436 ${(470 + Math.cos(a) * reach).toFixed(1)},${(436 + Math.sin(a) * reach).toFixed(1)} ${(470 + Math.cos(b) * reach).toFixed(1)},${(436 + Math.sin(b) * reach).toFixed(1)}`
  })
  const zigzag = Array.from({ length: 80 }, (_, index) => index)
  return (
    <>
      <Zone frame={frame} at="center">
        {rays.map((points) => (
          <polygon key={points} points={points} fill="#FFD166" opacity="0.1" />
        ))}
        <circle cx="470" cy="436" r="262" className="sc-accent" opacity="0.18" />
        <circle cx="470" cy="436" r="226" fill="#F4A340" />
        <circle cx="470" cy="436" r="196" className="sc-accent" />
        <path d="M274 436 A196 196 0 0 1 666 436" fill="none" stroke="#FFF3C4" strokeWidth="5" opacity="0.5" />
      </Zone>

      {/* The band of the foot of the wall, in triangles of the two accents. */}
      <Zone frame={frame} at="span">
        <rect x="-3000" y="412" width="6940" height="24" fill={OUT} opacity="0.35" />
        {zigzag.map((index) => (
          <polygon
            key={index}
            points={`${-600 + index * 28},436 ${-586 + index * 28},414 ${-572 + index * 28},436`}
            className={index % 2 === 0 ? 'sc-accent' : 'sc-accent2'}
            opacity="0.7"
          />
        ))}
      </Zone>

      <Zone frame={frame} at="left">
        <Palm foot={58} top={168} lean={30} delay={0} />
        <Palm foot={124} top={262} lean={-16} delay={-3} scale={0.72} />
      </Zone>
      <Zone frame={frame} at="right">
        <Palm foot={884} top={176} lean={-26} delay={-1.6} />
        <Palm foot={812} top={274} lean={14} delay={-4.4} scale={0.7} />
      </Zone>
    </>
  )
})

/** The floor is earth: no grid, a scatter of pebbles and dry grass, bigger at the front. */
export const AfroFloor = memo(function AfroFloor({ frame }: DecorProps) {
  const top = frame === 'room' ? 446 : 470
  const height = frame === 'room' ? 250 : 400
  const random = seeded(23)
  const specks = Array.from({ length: 70 }, () => {
    const depth = random() ** 1.7
    return { x: -80 + random() * (frame === 'room' ? 1100 : 1600), y: top + depth * height, size: 4 + depth * 14, kind: random() > 0.55 }
  })
  return (
    <g>
      {specks.map((speck, index) =>
        speck.kind ? (
          <ellipse key={index} cx={speck.x} cy={speck.y} rx={speck.size} ry={speck.size * 0.34} fill={OUT} opacity="0.28" />
        ) : (
          <path
            key={index}
            d={`M${speck.x} ${speck.y} l${-speck.size * 0.3} ${-speck.size * 0.8} M${speck.x} ${speck.y} l${speck.size * 0.05} ${-speck.size} M${speck.x} ${speck.y} l${speck.size * 0.3} ${-speck.size * 0.75}`}
            fill="none"
            className="sc-stroke-accent2"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.55"
          />
        ),
      )}
    </g>
  )
})

export default AfroBack
