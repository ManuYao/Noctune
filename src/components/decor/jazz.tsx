import { memo, useId } from 'react'
import { OUT, Zone, type DecorProps } from './zones'

const GOLD = '#FFD166'

/** A hanging lamp: cord, copper shade, a pool of warm light. It barely sways. */
function Lamp({ x, drop, delay }: { x: number; drop: number; delay: number }) {
  return (
    <g className="mw-sway-s" style={{ animationDelay: `${delay}s` }}>
      <line x1={x} y1="-40" x2={x} y2={drop} stroke={OUT} strokeWidth="3" />
      <circle cx={x} cy={drop + 26} r="58" fill={GOLD} opacity="0.13" />
      <circle cx={x} cy={drop + 26} r="30" fill={GOLD} opacity="0.14" />
      <path d={`M${x - 24} ${drop + 24} A24 24 0 0 1 ${x + 24} ${drop + 24} Z`} fill="#FFB347" stroke={OUT} strokeWidth="3.5" strokeLinejoin="round" />
      <rect x={x - 5} y={drop - 6} width="10" height="9" rx="2" fill={OUT} />
      <ellipse cx={x} cy={drop + 28} rx="9" ry="4" fill="#FFF3C4" />
    </g>
  )
}

/** The piano of the card, an upright with its keys, and its stool. */
function Piano({ frame }: DecorProps) {
  const white = Array.from({ length: 8 }, (_, index) => 22 + index * 13)
  return (
    <g>
      <rect x="14" y="292" width="116" height="144" rx="8" fill="#5A3A22" stroke={OUT} strokeWidth="3.5" />
      <rect x="22" y="300" width="100" height="40" rx="4" fill="#3B2410" />
      {/* The sheet music would sit on the text of the entry page. */}
      {frame === 'room' && (
        <g transform="rotate(-4 72 286)">
          <rect x="40" y="272" width="64" height="28" rx="2" fill="#F4F1FF" stroke={OUT} strokeWidth="2.5" />
          <path d="M48 282 H96 M48 288 H92 M48 294 H96" stroke={OUT} strokeWidth="1.5" />
        </g>
      )}
      <rect x="22" y="364" width="106" height="20" fill="#F4F1FF" stroke={OUT} strokeWidth="3" />
      {white.map((x) => (
        <rect key={x} x={x} y="364" width="8" height="12" fill={OUT} />
      ))}
      <rect x="22" y="384" width="100" height="36" rx="3" fill="#3B2410" />
      <rect x="26" y="436" width="10" height="14" fill={OUT} />
      <rect x="108" y="436" width="10" height="14" fill={OUT} />
    </g>
  )
}

/** A neon sign in the font of the site: a soft halo, then the letters. */
function Sign() {
  return (
    <g>
      <rect x="810" y="148" width="116" height="52" rx="10" fill={OUT} opacity="0.5" />
      <text className="dc-sign mw-flicker" x="868" y="187" textAnchor="middle" fontSize="33" fill="var(--accent-2)" filter="url(#dc-glow)" stroke={OUT} strokeWidth="0.5">
        JAZZ
      </text>
    </g>
  )
}

/** A café at night: lamps with their halos, an upright piano on one side, a neon sign on the other, wallpaper stripes. */
const JazzBack = memo(function JazzBack({ frame }: DecorProps) {
  return (
    <>
      <Zone frame={frame} at="leftTop">
        <Lamp x={40} drop={84} delay={0} />
        <Lamp x={116} drop={36} delay={-2.4} />
      </Zone>
      <Zone frame={frame} at="left">
        {/* A little lower and smaller on the entry screen: the text of the page runs above it. */}
        <g transform={frame === 'entry' ? 'translate(0 436) scale(0.78) translate(0 -436)' : undefined}>
          <Piano frame={frame} />
        </g>
      </Zone>
      {/* On the entry screen the navigation of the page runs where these two would hang. */}
      {frame === 'room' && (
        <Zone frame={frame} at="rightTop">
          <Lamp x={830} drop={40} delay={-1.3} />
          <Lamp x={906} drop={64} delay={-3.8} />
        </Zone>
      )}
      <Zone frame={frame} at="right">
        <Sign />
        {/* A frame on the wall: a trumpet. */}
        <rect x="822" y="226" width="104" height="60" rx="4" fill="#120D05" stroke={OUT} strokeWidth="3.5" />
        <path d="M834 268 H880 L912 248 V272 L880 260 H834 Z" fill="#FFB347" stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="838" cy="264" r="6" fill="none" stroke="#FFD166" strokeWidth="3" />
      </Zone>
    </>
  )
})

/** The wallpaper: wide stripes, and a panelled wainscot all along the foot of the wall. */
export const JazzWall = memo(function JazzWall({ frame }: DecorProps) {
  const id = `dc-jazz-stripes-${frame}`
  const y = frame === 'room' ? 396 : 417
  return (
    <>
      <defs>
        <pattern id={id} width="58" height="10" patternUnits="userSpaceOnUse">
          <rect width="22" height="10" className="sc-wall2" opacity="0.55" />
        </pattern>
      </defs>
      <rect x="-3000" y="-3000" width="6940" height={3000 + y} fill={`url(#${id})`} />
      <rect x="-3000" y={y} width="6940" height="60" className="sc-floor" opacity="0.7" />
      <rect x="-3000" y={y - 3} width="6940" height="5" className="sc-stage" />
    </>
  )
})

/** A café table on the floor, at the right, with two cups and their steam. */
export const JazzFloor = memo(function JazzFloor({ frame }: DecorProps) {
  const steam = useId()
  return (
    <Zone frame={frame} at="right">
      <ellipse cx="872" cy="512" rx="40" ry="8" fill="#000000" opacity="0.3" />
      <rect x="868" y="448" width="8" height="64" fill={OUT} />
      <ellipse cx="872" cy="512" rx="26" ry="6" fill={OUT} />
      <ellipse cx="872" cy="446" rx="50" ry="12" fill="#5A3A22" stroke={OUT} strokeWidth="3.5" />
      <ellipse cx="872" cy="443" rx="46" ry="9" fill="#7A5230" />
      <g>
        <rect x="846" y="424" width="18" height="16" rx="3" fill="#F4F1FF" stroke={OUT} strokeWidth="2.5" />
        <rect x="880" y="426" width="18" height="15" rx="3" fill="#F4F1FF" stroke={OUT} strokeWidth="2.5" />
        <path d="M864 428 q7 1 0 8 M898 430 q7 1 0 7" fill="none" stroke={OUT} strokeWidth="2" />
      </g>
      {[855, 889].map((x, index) => (
        <path
          key={`${steam}${x}`}
          className="mw-steam"
          style={{ animationDelay: `${-index * 1.4}s` }}
          d={`M${x} 420 q-5 -7 0 -12 q5 -6 0 -12`}
          fill="none"
          stroke="#F4F1FF"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      ))}
    </Zone>
  )
})

export default JazzBack
