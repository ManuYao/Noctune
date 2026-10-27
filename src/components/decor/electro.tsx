import { memo } from 'react'
import { FAN, OUT, Zone, fanX, seeded, type DecorProps } from './zones'

const LASER_COLORS = ['var(--accent)', 'var(--accent-2)', '#7BD88F', '#FFE58A']

/** A fan of lasers that sweeps, from an emitter on the ceiling: `targets` are the x where each one meets the horizon. */
function Lasers({ x, y, targets, horizon, reverse }: { x: number; y: number; targets: number[]; horizon: number; reverse?: boolean }) {
  return (
    <g className="mw-sweep" style={{ transformOrigin: `${x}px ${y}px`, animationDuration: reverse ? '5.4s' : '4.6s', animationDirection: reverse ? 'reverse' : 'normal' }}>
      {targets.map((target, index) => (
        <g key={target}>
          <line x1={x} y1={y} x2={target} y2={horizon} stroke={LASER_COLORS[index % 4]} strokeWidth="9" opacity="0.14" strokeLinecap="round" />
          <line x1={x} y1={y} x2={target} y2={horizon} stroke={LASER_COLORS[index % 4]} strokeWidth="2.6" opacity="0.85" strokeLinecap="round" />
        </g>
      ))}
      <rect x={x - 11} y={y - 14} width="22" height="16" rx="4" fill={OUT} />
      <circle cx={x} cy={y} r="4.5" fill={LASER_COLORS[0]} />
    </g>
  )
}

/** Lit bars that rise and fall above a speaker, like the meters of a mixing desk. */
function Meters({ x, delay, frame }: { x: number; delay: number; frame: DecorProps['frame'] }) {
  const heights = [62, 104, 84, 118, 72, 96]
  // The speakers of the entry screen are taller than the room's once the wing is drawn smaller: lift the meters so that they
  // stand on the speaker instead of sinking behind it.
  return (
    <g transform={frame === 'entry' ? 'translate(0 -34)' : undefined}>
      <rect x={x - 3} y="124" width="72" height="132" rx="6" fill={OUT} opacity="0.55" />
      {heights.map((height, index) => (
        <line
          key={index}
          className="mw-eq"
          x1={x + 6 + index * 11.6}
          x2={x + 6 + index * 11.6}
          y1="250"
          y2={250 - height}
          stroke={index % 2 === 0 ? 'var(--accent-2)' : 'var(--accent)'}
          strokeWidth="8"
          strokeDasharray="7 3"
          style={{ animationDuration: `${0.8 + (index % 3) * 0.23}s`, animationDelay: `${delay - index * 0.17}s` }}
        />
      ))}
    </g>
  )
}

/** A mirror ball, hanging: its meridians turn, and the spots of light it throws circle the wall. */
function DiscoBall({ cx, cy }: { cx: number; cy: number }) {
  const spots = [
    [-120, -20, 'var(--accent)'],
    [90, -50, 'var(--accent-2)'],
    [140, 40, '#FFE58A'],
    [-70, 100, '#7BD88F'],
    [30, 130, 'var(--accent)'],
    [-150, 60, 'var(--accent-2)'],
  ] as const
  return (
    <g>
      <g className="mw-spin" style={{ animationDuration: '30s' }}>
        <circle cx={cx} cy={cy} r="170" fill="none" />
        {spots.map(([dx, dy, color]) => (
          <circle key={`${dx}${dy}`} cx={cx + dx} cy={cy + dy} r="5" fill={color} opacity="0.55" />
        ))}
      </g>
      <line x1={cx} y1="-30" x2={cx} y2={cy - 34} stroke={OUT} strokeWidth="3" />
      <circle cx={cx} cy={cy} r="34" fill="#CFC6FF" stroke={OUT} strokeWidth="3.5" />
      <path d={`M${cx - 34} ${cy} H${cx + 34} M${cx - 30} ${cy - 16} H${cx + 30} M${cx - 30} ${cy + 16} H${cx + 30}`} fill="none" stroke={OUT} strokeWidth="1.6" />
      {[0, 1, 2].map((index) => (
        <ellipse
          key={index}
          className="mw-meridian"
          cx={cx}
          cy={cy}
          rx="34"
          ry="34"
          fill="none"
          stroke={OUT}
          strokeWidth="1.6"
          style={{ transform: `scaleX(${[0.9, 0.5, 0.12][index]})`, animationDelay: `${-index * 2}s` }}
        />
      ))}
      <path d={`M${cx - 20} ${cy - 22} Q${cx - 10} ${cy - 30} ${cx + 4} ${cy - 28}`} fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      {[
        [cx + 46, cy - 30],
        [cx - 50, cy + 24],
      ].map(([x, y], index) => (
        <path key={index} className="mw-twinkle" style={{ animationDelay: `${-index * 1.2}s` }} d={`M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2} Z`} fill="#FFFFFF" />
      ))}
    </g>
  )
}

/** The club: a mirror ball and meters on the left, light tubes on the right, lasers from the ceiling. */
const ElectroBack = memo(function ElectroBack({ frame }: DecorProps) {
  return (
    <>
      <Zone frame={frame} at="leftTop">
        <DiscoBall cx={72} cy={112} />
        {/* On the entry screen the fan that goes left would cross the text of the page: only the lasers over the stage stay. */}
        <Lasers x={170} y={10} targets={frame === 'room' ? [-50, 80, 300, 540] : [300, 440, 540]} horizon={436} />
      </Zone>
      <Zone frame={frame} at="left">
        <Meters x={140} delay={0} frame={frame} />
      </Zone>
      <Zone frame={frame} at="rightTop">
        <Lasers x={770} y={10} targets={[990, 860, 640, 400]} horizon={436} reverse />
      </Zone>
      <Zone frame={frame} at="right">
        <Meters x={734} delay={-0.5} frame={frame} />
        {[0, 1, 2].map((index) => (
          <g key={index}>
            <rect x={840 + index * 32 - 5} y="34" width="10" height="200" rx="5" fill={OUT} />
            <rect
              className="mw-twinkle"
              style={{ animationDelay: `${-index * 0.9}s`, animationDuration: '2.2s' }}
              x={840 + index * 32 - 2.5}
              y="38"
              width="5"
              height="192"
              rx="2.5"
              fill={['var(--accent)', 'var(--accent-2)', '#A98BFF'][index]}
              filter="url(#dc-glow)"
            />
          </g>
        ))}
      </Zone>
    </>
  )
})

const TILE_COLORS = ['var(--accent)', 'var(--accent-2)', '#A98BFF', '#7BD88F']

/** The dance floor: lit tiles that follow the lines of the floor's perspective. */
export const ElectroFloor = memo(function ElectroFloor({ frame }: DecorProps) {
  const { rows, cols } = FAN[frame]
  const random = seeded(frame === 'room' ? 11 : 12)
  const tiles: { points: string; color: string; pulse: boolean; delay: number }[] = []
  for (let row = 0; row < rows.length - 1; row += 1) {
    for (let i = cols[0]; i < cols[1]; i += 1) {
      if (random() > 0.3) continue
      const [y1, y2] = [rows[row], rows[row + 1]]
      const points = [
        [fanX(frame, i, y1), y1],
        [fanX(frame, i + 1, y1), y1],
        [fanX(frame, i + 1, y2), y2],
        [fanX(frame, i, y2), y2],
      ]
        .map(([x, y]) => `${x.toFixed(1)},${y}`)
        .join(' ')
      tiles.push({ points, color: TILE_COLORS[Math.floor(random() * TILE_COLORS.length)], pulse: random() > 0.4, delay: -random() * 2 })
    }
  }
  return (
    <g>
      {tiles.map((tile, index) => (
        <polygon
          key={index}
          points={tile.points}
          fill={tile.color}
          opacity="0.2"
          className={tile.pulse ? 'mw-tile' : undefined}
          style={tile.pulse ? { animationDelay: `${tile.delay}s` } : undefined}
        />
      ))}
    </g>
  )
})

export default ElectroBack
