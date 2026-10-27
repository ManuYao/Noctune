import { memo } from 'react'
import type { ReactNode } from 'react'
import { OUT, Zone, type DecorProps } from './zones'

/** A stack of two cabinets under an amp head, at `x` (104 wide, standing on the horizon). `low`: the bottom cabinet only. */
function Stack({ x, low }: { x: number; low?: boolean }) {
  const cone = (cx: number, cy: number, r: number) => (
    <g key={`${cx}-${cy}`}>
      <circle cx={cx} cy={cy} r={r} fill={OUT} />
      <circle cx={cx} cy={cy} r={r * 0.62} fill="#3A3A5C" />
      <circle cx={cx} cy={cy} r={r * 0.26} className="sc-accent" />
    </g>
  )
  return (
    <g>
      <rect x={x} y="320" width="104" height="116" rx="6" fill="#241A30" stroke={OUT} strokeWidth="3.5" />
      <rect x={x + 8} y="328" width="88" height="100" rx="4" fill="#2A2A44" />
      {cone(x + 30, 354, 17)}
      {cone(x + 74, 354, 17)}
      {cone(x + 30, 400, 17)}
      {cone(x + 74, 400, 17)}
      {!low && <TopOfStack x={x} cone={cone} />}
    </g>
  )
}

/** The second cabinet and the amp head. */
function TopOfStack({ x, cone }: { x: number; cone: (cx: number, cy: number, r: number) => ReactNode }) {
  return (
    <g>
      <rect x={x + 8} y="236" width="88" height="80" rx="6" fill="#241A30" stroke={OUT} strokeWidth="3.5" />
      <rect x={x + 16} y="244" width="72" height="64" rx="4" fill="#2A2A44" />
      {cone(x + 36, 276, 17)}
      {cone(x + 68, 276, 17)}
      <rect x={x + 4} y="204" width="96" height="30" rx="5" fill={OUT} />
      <rect x={x + 10} y="209" width="84" height="8" rx="2" fill="#5E3858" />
      {[0, 1, 2, 3, 4].map((index) => (
        <circle key={index} cx={x + 20 + index * 16} cy="225" r="3.6" className="sc-accent2" />
      ))}
    </g>
  )
}

/**
 * The stage of a rock gig: walls of amps on both sides, a neon bolt that flickers on the left, a guitar on the right,
 * crossed beams and cables on the floor.
 */
const RockBack = memo(function RockBack({ frame }: DecorProps) {
  return (
    <>
      <Zone frame={frame} at="left">
        <polygon
          className="mw-flicker sc-accent2"
          points="62,12 20,98 54,98 36,178 104,84 70,84"
          stroke={OUT}
          strokeWidth="3.5"
          strokeLinejoin="round"
          filter="url(#dc-glow)"
        />
        {/* On the entry screen, the text of the page takes the wall above the first cabinet. */}
        <Stack x={14} low={frame === 'entry'} />
      </Zone>
      <Zone frame={frame} at="right">
        <Stack x={822} />
        {/* The guitar hung on the wall: neck up, a little askew. */}
        <g transform="rotate(14 880 110)">
          <rect x="873" y="34" width="14" height="82" fill="#C58A4A" stroke={OUT} strokeWidth="2.5" />
          <rect x="868" y="10" width="24" height="28" rx="4" fill={OUT} />
          <circle cx="874" cy="18" r="2.4" className="sc-accent2" />
          <circle cx="886" cy="18" r="2.4" className="sc-accent2" />
          <circle cx="874" cy="30" r="2.4" className="sc-accent2" />
          <circle cx="886" cy="30" r="2.4" className="sc-accent2" />
          <path
            d="M852 108 C842 120 844 130 838 142 C828 160 842 188 880 188 C918 188 932 160 922 142 C916 130 918 120 908 108 C904 98 890 96 880 98 C870 96 856 98 852 108 Z"
            className="sc-accent"
            stroke={OUT}
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <rect x="866" y="124" width="28" height="7" rx="2" fill={OUT} />
          <rect x="866" y="140" width="28" height="7" rx="2" fill={OUT} />
          <rect x="868" y="164" width="24" height="5" rx="2" fill="#FFE58A" />
          <path d="M876 40 V160 M884 40 V160" stroke="#FFE58A" strokeWidth="1" opacity="0.8" />
        </g>
      </Zone>
    </>
  )
})

/** The cables that run from the amps across the floor. The crowd stands over them. */
export const RockFloor = memo(function RockFloor({ frame }: DecorProps) {
  return (
    <>
      <Zone frame={frame} at="left">
        <path d="M70 438 C70 476 130 468 168 494 S262 530 330 512" fill="none" stroke={OUT} strokeWidth="5" strokeLinecap="round" />
        <path d="M46 438 C40 486 96 504 120 540 S204 584 290 566" fill="none" stroke={OUT} strokeWidth="4" strokeLinecap="round" />
        <rect x="326" y="504" width="16" height="12" rx="3" fill={OUT} />
      </Zone>
      <Zone frame={frame} at="right">
        <path d="M870 438 C870 476 810 470 770 496 S680 532 610 514" fill="none" stroke={OUT} strokeWidth="5" strokeLinecap="round" />
        <path d="M894 438 C902 488 846 506 820 540 S740 586 650 568" fill="none" stroke={OUT} strokeWidth="4" strokeLinecap="round" />
        <rect x="598" y="506" width="16" height="12" rx="3" fill={OUT} />
      </Zone>
    </>
  )
})

export default RockBack
