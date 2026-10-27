import { memo } from 'react'
import { OUT, Zone, type DecorProps } from './zones'

/** The wall of bricks of the card, all along the wall. */
export const RapWall = memo(function RapWall({ frame }: DecorProps) {
  const id = `dc-rap-brick-${frame}`
  const y = frame === 'room' ? 436 : 470
  return (
    <>
      <defs>
        <pattern id={id} width="56" height="30" patternUnits="userSpaceOnUse">
          <rect width="56" height="15" fill="#FFFFFF" opacity="0.025" />
          <path d="M0 1 H56 M0 16 H56 M28 1 V16 M0 16 V31 M56 16 V31" fill="none" className="sc-stroke-wall2" strokeWidth="2.2" />
        </pattern>
      </defs>
      <rect x="-3000" y="-3000" width="6940" height={3000 + y} fill={`url(#${id})`} />
    </>
  )
})

/** The tag of the card, big, then a second one and a pink neon: a wall somebody has been working on. */
const RapBack = memo(function RapBack({ frame }: DecorProps) {
  return (
    <>
      <Zone frame={frame} at="left">
        <path d="M-6 52 C26 18 52 90 86 46 S142 78 178 34" fill="none" stroke={OUT} strokeWidth="15" strokeLinecap="round" />
        <path d="M-6 52 C26 18 52 90 86 46 S142 78 178 34" fill="none" className="sc-stroke-accent" strokeWidth="9" strokeLinecap="round" />
        <path d="M6 88 C40 62 72 112 116 82" fill="none" stroke={OUT} strokeWidth="10" strokeLinecap="round" />
        <path d="M6 88 C40 62 72 112 116 82" fill="none" className="sc-stroke-accent2" strokeWidth="6" strokeLinecap="round" />
        <g transform="rotate(-9 76 176)">
          <text className="dc-sign" x="76" y="186" textAnchor="middle" fontSize="35" fill="none" stroke={OUT} strokeWidth="9" strokeLinejoin="round">
            BOOM
          </text>
          <text className="dc-sign" x="76" y="186" textAnchor="middle" fontSize="35" fill="var(--accent-2)" stroke="none">
            BOOM
          </text>
        </g>
      </Zone>

      <Zone frame={frame} at="right">
        <g transform="rotate(7 864 78)">
          <text className="dc-sign" x="864" y="94" textAnchor="middle" fontSize="31" fill="none" stroke={OUT} strokeWidth="9" strokeLinejoin="round">
            FLOW
          </text>
          <text className="dc-sign" x="864" y="94" textAnchor="middle" fontSize="31" fill="var(--accent)" stroke="none">
            FLOW
          </text>
        </g>
        {/* A pink neon microphone. */}
        <g className="mw-flicker" filter="url(#dc-glow)" fill="none" stroke="var(--accent-2)" strokeWidth="5" strokeLinecap="round">
          <rect x="852" y="140" width="28" height="46" rx="14" />
          <path d="M844 176 C844 204 888 204 888 176 M866 198 V224 M850 226 H882" />
        </g>
      </Zone>
    </>
  )
})

/** Crates of records on the left, a boom box on a crate on the right. */
export const RapFloor = memo(function RapFloor({ frame }: DecorProps) {
  const sleeves = ['#FF6B9A', '#FFB347', '#5CC8FF', '#F2E55C', '#7BD88F']
  return (
    <>
      <Zone frame={frame} at="left">
        <ellipse cx="62" cy="496" rx="60" ry="9" fill="#000000" opacity="0.3" />
        {sleeves.map((color, index) => (
          <rect
            key={color}
            x={14 + index * 18}
            y={444 - (index % 3) * 6}
            width="15"
            height="34"
            fill={color}
            stroke={OUT}
            strokeWidth="2.2"
            transform={`rotate(${(index - 2) * 4} ${21 + index * 18} 478)`}
          />
        ))}
        <rect x="8" y="468" width="108" height="28" rx="3" fill="#6B4430" stroke={OUT} strokeWidth="3" />
        <path d="M14 476 H110 M14 486 H110" stroke={OUT} strokeWidth="1.6" opacity="0.7" />
      </Zone>

      <Zone frame={frame} at="right">
        <ellipse cx="876" cy="496" rx="62" ry="9" fill="#000000" opacity="0.3" />
        <rect x="826" y="446" width="100" height="50" rx="3" fill="#6B4430" stroke={OUT} strokeWidth="3" />
        <path d="M832 460 H920 M832 474 H920 M876 446 V496" stroke={OUT} strokeWidth="1.6" opacity="0.7" />
        {/* The boom box. */}
        <path d="M842 380 Q876 350 910 380" fill="none" stroke={OUT} strokeWidth="5" />
        <rect x="836" y="378" width="80" height="68" rx="7" fill={OUT} />
        <circle cx="858" cy="414" r="16" className="sc-accent" />
        <circle cx="858" cy="414" r="9" fill={OUT} />
        <circle cx="858" cy="414" r="3.4" className="sc-accent" />
        <circle cx="894" cy="414" r="16" className="sc-accent" />
        <circle cx="894" cy="414" r="9" fill={OUT} />
        <circle cx="894" cy="414" r="3.4" className="sc-accent" />
        <rect x="866" y="388" width="20" height="12" rx="2" fill="#2A2A44" />
        <rect x="869" y="391" width="14" height="6" rx="1" className="sc-accent2" opacity="0.8" />
        <circle className="mw-twinkle" cx="868" cy="436" r="2.4" fill="var(--accent-2)" />
        <circle className="mw-twinkle" style={{ animationDelay: '-0.8s' }} cx="876" cy="436" r="2.4" fill="var(--accent)" />
        <circle className="mw-twinkle" style={{ animationDelay: '-1.6s' }} cx="884" cy="436" r="2.4" fill="var(--accent-2)" />
      </Zone>
    </>
  )
})

export default RapBack
