import { memo } from 'react'
import { HORIZON, OUT, Zone, seeded, type DecorProps } from './zones'

// The sky of the French touch: a violet night that turns to coral where it meets the roofs.
export const SKY_TOP = '#3A1B5E'
export const SKY_HORIZON = '#E8785A'
const ROOF = '#2B1342'
const ROOF_DARK = '#1C0B30'
const TOWER = '#1A0B2E'
const GOLD = '#FFD166'
const PINK = '#FF6BC6'

/** The wall as a sunset, from the top of the room to the horizon. The gradient is in the user space so that the sun's cut bands can reuse it. */
export const FrenchWall = memo(function FrenchWall({ frame }: DecorProps) {
  const horizon = HORIZON[frame]
  return (
    <>
      <defs>
        <linearGradient id={`dc-french-sky-${frame}`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={horizon}>
          <stop offset="0" stopColor={SKY_TOP} />
          <stop offset="0.55" stopColor="#8A3A86" />
          <stop offset="1" stopColor={SKY_HORIZON} />
        </linearGradient>
      </defs>
      <rect x="-3000" y="-3000" width="6940" height={3000 + horizon} fill={`url(#dc-french-sky-${frame})`} />
    </>
  )
})

/** The silhouette of the Eiffel Tower: a curve that narrows to a spire, two platforms, an arch, and its lattice. */
export function eiffel(cx: number, base: number, height: number, halfBase: number) {
  const half = (t: number) => 2 + (halfBase - 2) * t ** 2.3
  const steps = Array.from({ length: 26 }, (_, index) => index / 25)
  const left = steps.map((t) => `${(cx - half(t)).toFixed(1)},${(base - height + t * height).toFixed(1)}`)
  const right = [...steps].reverse().map((t) => `${(cx + half(t)).toFixed(1)},${(base - height + t * height).toFixed(1)}`)
  const archHalf = halfBase * 0.58
  const archTop = base - height * 0.16
  const body = `M${left.join(' L')} L${right.join(' L')} Z M${cx - archHalf} ${base} V${archTop + archHalf * 0.5} A${archHalf} ${archHalf * 0.9} 0 0 1 ${cx + archHalf} ${archTop + archHalf * 0.5} V${base} Z`
  const platform = (t: number, extra: number) => {
    const y = base - height + t * height
    return <rect key={t} x={cx - half(t) - extra} y={y - height * 0.012} width={2 * (half(t) + extra)} height={height * 0.026} fill={TOWER} />
  }
  // The cross-bracing: from each level to the next, one way and the other, down to the arch.
  const levels = [0.08, 0.2, 0.34, 0.5, 0.66, 0.8]
  const lattice = levels.slice(0, -1).map((t, index) => {
    const next = levels[index + 1]
    const [y1, y2] = [base - height + t * height, base - height + next * height]
    return `M${cx - half(t)} ${y1} L${cx + half(next)} ${y2} M${cx + half(t)} ${y1} L${cx - half(next)} ${y2}`
  })
  return (
    <g>
      <path d={body} fillRule="evenodd" fill={TOWER} />
      {platform(0.36, 3)}
      {platform(0.64, 4)}
      <path d={lattice.join(' ')} fill="none" stroke="#6A2E7E" strokeWidth={Math.max(0.8, height / 230)} opacity="0.8" />
      <circle className="mw-twinkle" cx={cx} cy={base - height - 4} r={Math.max(1.8, height / 100)} fill={PINK} />
    </g>
  )
}

/** The zinc roofs of Paris along the horizon, with chimneys and lit windows: the same skyline wherever it is drawn. */
function Rooftops({ from, to, base, scale = 1, seed = 5 }: { from: number; to: number; base: number; scale?: number; seed?: number }) {
  const random = seeded(seed)
  const houses: { x: number; w: number; h: number; roof: number; chimney: number | null }[] = []
  for (let x = from; x < to; ) {
    const w = (44 + random() * 36) * scale
    houses.push({ x, w, h: (20 + random() * 26) * scale, roof: (11 + random() * 8) * scale, chimney: random() > 0.45 ? 0.2 + random() * 0.55 : null })
    x += w - 1
  }
  return (
    <g>
      {houses.map((house, index) => {
        const top = base - house.h
        const windows = Math.max(1, Math.floor(house.w / (16 * scale)))
        return (
          <g key={index}>
            {house.chimney !== null && <rect x={house.x + house.w * house.chimney} y={top - house.roof - 11 * scale} width={5.5 * scale} height={14 * scale} fill={ROOF_DARK} />}
            <polygon points={`${house.x - 1},${top} ${house.x + 7 * scale},${top - house.roof} ${house.x + house.w - 7 * scale},${top - house.roof} ${house.x + house.w + 1},${top}`} fill={ROOF_DARK} />
            <rect x={house.x} y={top} width={house.w} height={house.h + 2} fill={ROOF} />
            {Array.from({ length: windows }, (_, w) => (
              <rect
                key={w}
                className={random() > 0.7 ? 'mw-twinkle' : undefined}
                style={{ animationDelay: `${-random() * 3}s` }}
                x={house.x + (w + 0.5) * (house.w / windows) - 2.5 * scale}
                y={top + 5 * scale}
                width={5 * scale}
                height={7 * scale}
                fill={GOLD}
                opacity={random() > 0.35 ? 0.8 : 0.15}
              />
            ))}
          </g>
        )
      })}
    </g>
  )
}

/** A Parisian street lamp with two lanterns, in gold. */
function StreetLamp({ x, base, height, scale = 1 }: { x: number; base: number; height: number; scale?: number }) {
  const top = base - height
  const arms = `M${x} ${top + 8 * scale} C${x - 8 * scale} ${top} ${x - 24 * scale} ${top} ${x - 26 * scale} ${top - 2 * scale} M${x} ${top + 8 * scale} C${x + 8 * scale} ${top} ${x + 24 * scale} ${top} ${x + 26 * scale} ${top - 2 * scale}`
  const lantern = (lx: number) => (
    <g key={lx}>
      <circle cx={lx} cy={top - 4} r={36 * scale} fill={GOLD} opacity="0.16" />
      <polygon points={`${lx - 8 * scale},${top - 22 * scale} ${lx + 8 * scale},${top - 22 * scale} ${lx + 11 * scale},${top - 2 * scale} ${lx - 11 * scale},${top - 2 * scale}`} fill="#FFF3C4" stroke={OUT} strokeWidth={2.2 * scale} strokeLinejoin="round" />
      <polygon points={`${lx - 11 * scale},${top - 22 * scale} ${lx},${top - 31 * scale} ${lx + 11 * scale},${top - 22 * scale}`} fill="#C79A3A" stroke={OUT} strokeWidth={2.2 * scale} strokeLinejoin="round" />
    </g>
  )
  return (
    <g>
      <rect x={x - 11 * scale} y={base - 18 * scale} width={22 * scale} height={18 * scale} rx={3 * scale} fill="#C79A3A" stroke={OUT} strokeWidth={2.4 * scale} />
      <rect x={x - 4 * scale} y={top} width={8 * scale} height={height - 18 * scale} fill={GOLD} stroke={OUT} strokeWidth={2.2 * scale} />
      <rect x={x - 8 * scale} y={base - height * 0.4} width={16 * scale} height={6 * scale} rx={2 * scale} fill="#C79A3A" stroke={OUT} strokeWidth={2 * scale} />
      <path d={arms} fill="none" stroke={OUT} strokeWidth={4 * scale} strokeLinecap="round" />
      <path d={arms} fill="none" stroke={GOLD} strokeWidth={2 * scale} strokeLinecap="round" />
      {lantern(x - 26 * scale)}
      {lantern(x + 26 * scale)}
    </g>
  )
}

/** A small golden mirror ball on its cord. */
function GoldBall({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <line x1={cx} y1="-30" x2={cx} y2={cy - 22} stroke={OUT} strokeWidth="2.6" />
      <circle cx={cx} cy={cy} r="42" fill={GOLD} opacity="0.1" />
      <circle cx={cx} cy={cy} r="22" fill={GOLD} stroke={OUT} strokeWidth="3" />
      <path
        d={`M${cx - 22} ${cy} H${cx + 22} M${cx - 18} ${cy - 10} H${cx + 18} M${cx - 18} ${cy + 10} H${cx + 18} M${cx} ${cy - 22} V${cy + 22} M${cx - 8} ${cy - 20} Q${cx - 14} ${cy} ${cx - 8} ${cy + 20} M${cx + 8} ${cy - 20} Q${cx + 14} ${cy} ${cx + 8} ${cy + 20}`}
        fill="none"
        stroke={OUT}
        strokeWidth="1.2"
      />
      <path d={`M${cx - 12} ${cy - 12} Q${cx - 6} ${cy - 17} ${cx + 2} ${cy - 16}`} fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
    </g>
  )
}

const STARS = [
  [20, 24],
  [58, 70],
  [104, 28],
  [128, 96],
  [40, 124],
  [168, 52],
]

/** Dusk on Paris: a big sun cut by bands behind the screen and the stage, the tower, the roofs, a street lamp, a gold ball. */
const FrenchBack = memo(function FrenchBack({ frame }: DecorProps) {
  // The bands cut the sun in the colour of the wall behind it: the same gradient, in the local coordinates of the zone.
  const dy = frame === 'room' ? 0 : 21
  const clip = `dc-french-sun-${frame}`
  return (
    <>
      <Zone frame={frame} at="center">
        <defs>
          <linearGradient id={`dc-french-sun-fill-${frame}`} gradientUnits="userSpaceOnUse" x1="0" y1="60" x2="0" y2="400">
            <stop offset="0" stopColor="#FFE9A8" />
            <stop offset="0.55" stopColor={PINK} />
            <stop offset="1" stopColor="#FF8A5C" />
          </linearGradient>
          <linearGradient id={`dc-french-band-${frame}`} gradientUnits="userSpaceOnUse" x1="0" y1={-dy} x2="0" y2={436}>
            <stop offset="0" stopColor={SKY_TOP} />
            <stop offset="0.55" stopColor="#8A3A86" />
            <stop offset="1" stopColor={SKY_HORIZON} />
          </linearGradient>
          <clipPath id={clip}>
            <circle cx="470" cy="296" r="250" />
          </clipPath>
        </defs>
        <circle cx="470" cy="296" r="330" fill={PINK} opacity="0.12" />
        <circle cx="470" cy="296" r="286" fill={PINK} opacity="0.16" />
        <circle cx="470" cy="296" r="250" fill={`url(#dc-french-sun-fill-${frame})`} />
        <g clipPath={`url(#${clip})`} fill={`url(#dc-french-band-${frame})`}>
          <rect x="200" y="311" width="540" height="3" />
          <rect x="200" y="324" width="540" height="5" />
          <rect x="200" y="340" width="540" height="8" />
          <rect x="200" y="360" width="540" height="12" />
        </g>
      </Zone>

      <Zone frame={frame} at="left">
        {STARS.map(([x, y], index) => (
          <circle key={index} className="mw-twinkle" style={{ animationDelay: `${-index * 0.7}s` }} cx={x} cy={y} r="1.6" fill="#FFFFFF" />
        ))}
        <ellipse cx="86" cy="150" rx="86" ry="5" fill={PINK} opacity="0.3" />
        <ellipse cx="40" cy="170" rx="60" ry="4" fill={GOLD} opacity="0.22" />
        {eiffel(76, 438, 326, 54)}
      </Zone>

      <Zone frame={frame} at="span">
        <Rooftops from={-460} to={1400} base={438} />
      </Zone>

      <Zone frame={frame} at="right">
        {STARS.map(([x, y], index) => (
          <circle key={index} className="mw-twinkle" style={{ animationDelay: `${-index * 0.9}s` }} cx={940 - x} cy={y + 8} r="1.6" fill="#FFFFFF" />
        ))}
        <ellipse cx="850" cy="124" rx="84" ry="5" fill={PINK} opacity="0.3" />
        <ellipse cx="900" cy="142" rx="58" ry="4" fill={GOLD} opacity="0.22" />
        <StreetLamp x={868} base={440} height={196} />
      </Zone>
      <Zone frame={frame} at="rightTop">
        <GoldBall cx={774} cy={92} />
      </Zone>
    </>
  )
})

/** The card of the list: the same dusk in 428 x 160. */
export function frenchCardDecor(ids: string) {
  const sky = `${ids}-sky`
  const sunClip = `${ids}-sunclip`
  return (
    <>
      <defs>
        <linearGradient id={sky} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="110">
          <stop offset="0" stopColor={SKY_TOP} />
          <stop offset="0.55" stopColor="#8A3A86" />
          <stop offset="1" stopColor={SKY_HORIZON} />
        </linearGradient>
        <linearGradient id={`${ids}-sun`} gradientUnits="userSpaceOnUse" x1="0" y1="16" x2="0" y2="110">
          <stop offset="0" stopColor="#FFE9A8" />
          <stop offset="0.55" stopColor={PINK} />
          <stop offset="1" stopColor="#FF8A5C" />
        </linearGradient>
        <clipPath id={sunClip}>
          <circle cx="214" cy="70" r="50" />
        </clipPath>
      </defs>
      <rect width="428" height="160" fill="#231032" />
      <rect width="428" height="110" fill={`url(#${sky})`} />
      <circle cx="214" cy="70" r="76" fill={PINK} opacity="0.14" />
      <circle cx="214" cy="70" r="50" fill={`url(#${ids}-sun)`} />
      <g clipPath={`url(#${sunClip})`} fill={`url(#${sky})`}>
        <rect x="150" y="76" width="130" height="2" />
        <rect x="150" y="86" width="130" height="3.4" />
        <rect x="150" y="96" width="130" height="5" />
      </g>
      {[
        [20, 22],
        [52, 40],
        [96, 16],
        [338, 24],
        [398, 44],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" fill="#FFFFFF" />
      ))}
      {eiffel(52, 110, 96, 18)}
      <Rooftops from={-10} to={440} base={110} scale={0.55} seed={9} />
      <StreetLamp x={384} base={112} height={64} scale={0.5} />
      <rect y="110" width="428" height="50" fill="#231032" />
      <rect y="108" width="428" height="3" fill={OUT} opacity="0.5" />
    </>
  )
}

export default FrenchBack
