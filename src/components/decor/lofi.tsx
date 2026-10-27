import { memo } from 'react'
import { OUT, Zone, onCurve, type DecorProps } from './zones'

const BULB = '#FFD166'

/** A strand of little warm bulbs hung in a curve: they breathe in turn. */
function Garland({ from, via, to, delay }: { from: [number, number]; via: [number, number]; to: [number, number]; delay: number }) {
  const bulbs = Array.from({ length: 9 }, (_, index) => onCurve(from, via, to, (index + 0.5) / 9))
  return (
    <g>
      <path d={`M${from[0]} ${from[1]} Q${via[0]} ${via[1]} ${to[0]} ${to[1]}`} fill="none" stroke={OUT} strokeWidth="2.5" />
      {bulbs.map(([x, y], index) => (
        <g key={index} className="mw-twinkle" style={{ animationDelay: `${delay - index * 0.37}s` }}>
          <circle cx={x} cy={y + 7} r="12" fill={BULB} opacity="0.2" />
          <circle cx={x} cy={y + 7} r="5" fill={BULB} stroke={OUT} strokeWidth="1.8" />
        </g>
      ))}
    </g>
  )
}

/** The bedroom of the card, grown up: a window on the night, a shelf, a lamp, a plant, a poster, and bulbs. Calm: no beams. */
const LofiBack = memo(function LofiBack({ frame }: DecorProps) {
  return (
    <>
      <Zone frame={frame} at="left">
        {/* The window: a crescent moon, stars, the roofs of the city. */}
        <rect x="22" y="48" width="106" height="130" rx="10" fill="#0B1230" stroke={OUT} strokeWidth="4" />
        <circle cx="70" cy="92" r="19" fill="#FFE9A8" />
        <circle cx="79" cy="87" r="16.5" fill="#0B1230" />
        <path d="M30 170 V150 H44 V136 H58 V152 H74 V140 H92 V156 H108 V144 H122 V170 Z" fill="#1B2A52" />
        <g fill="#FFFFFF">
          <circle className="mw-twinkle" cx="40" cy="70" r="1.8" />
          <circle className="mw-twinkle" style={{ animationDelay: '-1.1s' }} cx="106" cy="66" r="1.8" />
          <circle className="mw-twinkle" style={{ animationDelay: '-0.5s' }} cx="52" cy="122" r="1.6" />
          <circle className="mw-twinkle" style={{ animationDelay: '-1.8s' }} cx="110" cy="112" r="1.8" />
          <circle cx="96" cy="84" r="1.4" />
        </g>
        <path d="M75 48 V178 M22 112 H128" stroke={OUT} strokeWidth="3.5" />
        <rect x="14" y="176" width="122" height="9" rx="3" className="sc-stage" stroke={OUT} strokeWidth="3" />

        {/* A shelf: books, a pot of leaves. */}
        <g transform="translate(0 56)">
        <rect x="20" y="290" width="108" height="8" rx="2" fill="#A9743C" stroke={OUT} strokeWidth="2.5" />
        <rect x="28" y="298" width="6" height="10" fill={OUT} />
        <rect x="112" y="298" width="6" height="10" fill={OUT} />
        <rect x="28" y="258" width="12" height="32" rx="1.5" fill="#FF6B9A" stroke={OUT} strokeWidth="2" />
        <rect x="41" y="248" width="12" height="42" rx="1.5" fill="#5CC8FF" stroke={OUT} strokeWidth="2" />
        <rect x="54" y="262" width="13" height="28" rx="1.5" fill="#F2E55C" stroke={OUT} strokeWidth="2" />
        <rect x="68" y="252" width="12" height="38" rx="1.5" fill="#7BD88F" stroke={OUT} strokeWidth="2" transform="rotate(8 74 290)" />
        <path d="M92 290 L96 268 H116 L120 290 Z" fill="#FFB347" stroke={OUT} strokeWidth="2.5" strokeLinejoin="round" />
        <ellipse cx="98" cy="256" rx="7" ry="13" transform="rotate(-24 98 256)" fill="#7BD88F" stroke={OUT} strokeWidth="2.2" />
        <ellipse cx="114" cy="255" rx="7" ry="13" transform="rotate(24 114 255)" fill="#7BD88F" stroke={OUT} strokeWidth="2.2" />
        <ellipse cx="106" cy="248" rx="6.5" ry="13" fill="#7BD88F" stroke={OUT} strokeWidth="2.2" />
        </g>
      </Zone>
      <Zone frame={frame} at="leftTop">
        <Garland from={[-34, -14]} via={[82, 62]} to={[210, 14]} delay={0} />
      </Zone>

      <Zone frame={frame} at="right">
        {/* A poster of the moon, a reading lamp with its pool of light. */}
        <rect x="818" y="52" width="74" height="94" rx="4" fill="#0B1230" stroke={OUT} strokeWidth="3.5" />
        <circle cx="855" cy="92" r="19" fill="#FFE9A8" />
        <path d="M818 146 V122 L840 108 L858 122 L876 104 L892 118 V146 Z" fill="#2A3A78" />
        <circle cx="838" cy="70" r="1.6" fill="#FFFFFF" />
        <circle cx="878" cy="68" r="1.6" fill="#FFFFFF" />

        <polygon points="849,200 889,200 940,438 800,438" fill={BULB} opacity="0.07" />
        <circle cx="869" cy="196" r="112" fill={BULB} opacity="0.11" />
        <circle cx="869" cy="196" r="62" fill={BULB} opacity="0.12" />
        <rect x="865" y="200" width="8" height="238" fill={OUT} />
        <ellipse cx="869" cy="440" rx="26" ry="6" fill={OUT} />
        <polygon points="836,154 902,154 888,200 850,200" fill={BULB} stroke={OUT} strokeWidth="3.5" strokeLinejoin="round" />
        <rect x="860" y="146" width="18" height="10" rx="3" fill={OUT} />
      </Zone>
      {/* On the entry screen the navigation of the page runs where this strand would hang. */}
      {frame === 'room' && (
        <Zone frame={frame} at="rightTop">
          <Garland from={[726, 14]} via={[860, 66]} to={[974, -14]} delay={-0.9} />
        </Zone>
      )}

    </>
  )
})

/** A pot plant in the corner of the floor, under the crowd. */
export const LofiFloor = memo(function LofiFloor({ frame }: DecorProps) {
  return (
    <>
      {/* A pot plant in the corner of the floor, under the crowd. */}
      <Zone frame={frame} at="left">
        <ellipse cx="52" cy="552" rx="30" ry="6" fill="#000000" opacity="0.3" />
        <path d="M26 512 L32 550 H72 L78 512 Z" fill="#FFB347" stroke={OUT} strokeWidth="3" strokeLinejoin="round" />
        <ellipse cx="38" cy="486" rx="11" ry="26" transform="rotate(-28 38 486)" fill="#7BD88F" stroke={OUT} strokeWidth="2.5" />
        <ellipse cx="66" cy="484" rx="11" ry="26" transform="rotate(28 66 484)" fill="#7BD88F" stroke={OUT} strokeWidth="2.5" />
        <ellipse cx="52" cy="476" rx="11" ry="28" fill="#7BD88F" stroke={OUT} strokeWidth="2.5" />
      </Zone>
    </>
  )
})

export default LofiBack
