import { memo } from 'react'
import type { AvatarDef } from '../data/avatars'
import { findAvatar } from '../data/avatars'
import AvatarArt from './AvatarArt'
import type { DecorKind } from './decor/decorKind'
import { cutText } from './sceneText'
import './Scene.css'
import './EntryScene.css'
import './EntrySceneMobile.css'

// The small club of mock-up M1, drawn in its own 390 x 206 space. On a wider window (a big phone, a phone lying down) the
// wall and the floor go on past that space, sideways; the drawing itself keeps its size and stays centred.
const WIDTH = 390
const HEIGHT = 206
const FAR = 400
const WALL_BOTTOM = 122
const OUTLINE = '#16142B'

// The floor's fan: the mock-up's fourteen lines leave the middle of the stage's back edge and reach the bottom every 90 units.
const FAN = Array.from({ length: 14 }, (_, i) => -400 + 90 * i)
const ROWS = [132, 148, 172, 202]

const avatar = (id: string): AvatarDef => {
  const found = findAvatar(id)
  if (!found) throw new Error(`Unknown avatar ${id}`)
  return found
}

interface Dancer {
  avatar: AvatarDef
  x: number
  y: number
  size: number
  delay: number
}

// The four around the stage, avatar for avatar as in the mock-up (they are four of the site's eight).
const CROWD: Dancer[] = [
  { avatar: avatar('mango'), x: 12, y: 128, size: 50, delay: -0.4 },
  { avatar: avatar('moss'), x: 66, y: 148, size: 44, delay: -0.8 },
  { avatar: avatar('cloud'), x: 280, y: 148, size: 44, delay: -0.6 },
  { avatar: avatar('grape'), x: 328, y: 128, size: 50, delay: -0.2 },
]
const SELF = { x: 158, y: 124, size: 74 }

function Person({ dancer }: { dancer: Dancer }) {
  return (
    <g className="mw-bob" style={{ animationDelay: `${dancer.delay}s` }}>
      <svg x={dancer.x} y={dancer.y} width={dancer.size} height={dancer.size} viewBox="0 0 100 100" overflow="visible">
        <AvatarArt avatar={dancer.avatar} />
      </svg>
    </g>
  )
}

function Speaker({ x }: { x: number }) {
  const cx = x + 20
  return (
    <>
      <rect x={x} y="30" width="40" height="132" rx="8" className="sc-stage" stroke={OUTLINE} strokeWidth="2.5" />
      <circle cx={cx} cy="46" r="4" fill={OUTLINE} />
      <circle cx={cx} cy="92" r="13" fill={OUTLINE} />
      <circle cx={cx} cy="92" r="6" className="sc-stage-top" />
    </>
  )
}

/** The wall, the beams, the screen with its sunset, the speakers, the floor and the stage: everything but the people. */
const Club = memo(function Club({ title, artist }: { title: string | null; artist: string | null }) {
  return (
    <>
      <defs>
        <pattern id="entryp-slats" width="56" height="10" patternUnits="userSpaceOnUse">
          <rect width="4" height="10" className="sc-wall2" />
        </pattern>
        <radialGradient id="entryp-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="sc-stop-accent" stopOpacity="0.34" />
          <stop offset="1" className="sc-stop-accent" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="entryp-beam-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="sc-stop-accent" stopOpacity="0.42" />
          <stop offset="1" className="sc-stop-accent" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="entryp-beam-b" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="sc-stop-accent2" stopOpacity="0.38" />
          <stop offset="1" className="sc-stop-accent2" stopOpacity="0" />
        </linearGradient>
        <clipPath id="entryp-screen">
          <rect x="112" y="10" width="166" height="82" rx="8" />
        </clipPath>
        <filter id="entryp-neon" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x={-FAR} width={WIDTH + 2 * FAR} height={HEIGHT} className="sc-bg" />
      <rect x={-FAR} width={WIDTH + 2 * FAR} height={WALL_BOTTOM} className="sc-wall" />
      <rect x={-FAR} width={WIDTH + 2 * FAR} height={WALL_BOTTOM} fill="url(#entryp-slats)" opacity="0.7" />
      <circle cx="195" cy="51" r="214.5" fill="url(#entryp-glow)" />
      <polygon className="mw-sway" style={{ transformOrigin: '78px 0px' }} points="78,0 31,122 125,122" fill="url(#entryp-beam-a)" />
      <polygon className="mw-sway2" style={{ transformOrigin: '312px 0px' }} points="312,0 265,122 359,122" fill="url(#entryp-beam-b)" />

      {/* The screen: a drawing (a sunset over hills), never the video of the room. */}
      <rect className="mw-neon sc-stroke-accent" x="107" y="5" width="176" height="92" rx="12" fill="none" strokeWidth="3" filter="url(#entryp-neon)" />
      <rect x="112" y="10" width="166" height="82" rx="8" className="sc-screen" />
      <g clipPath="url(#entryp-screen)">
        <circle cx="195" cy="42.8" r="18.04" className="sc-accent" />
        <rect x="179" y="47" width="32" height="2" className="sc-screen" />
        <rect x="179" y="52" width="32" height="3" className="sc-screen" />
        <rect x="179" y="57" width="32" height="4" className="sc-screen" />
        <polygon points="112,92 112,69 148.5,59.2 178.4,67.4 208.3,55.9 241.5,65.8 278,60.8 278,92" className="sc-wall2" />
        {title !== null && (
          <>
            <rect x="112" y="68" width="166" height="24" fill="#000000" opacity="0.55" />
            <polygon points="120,74 120,86 130,80" fill="#FFFFFF" />
            <text x="138" y="84" className="entry-scene-phone__title">
              {cutText(title, 18)}
              {artist !== null && artist !== '' && <tspan className="entry-scene-phone__artist"> · {cutText(artist, 14)}</tspan>}
            </text>
          </>
        )}
      </g>
      {title !== null && (
        <>
          <rect x="118" y="16" width="64" height="18" rx="9" fill={OUTLINE} />
          <circle cx="130" cy="25" r="3" className="sc-accent" />
          <text x="138" y="28" className="entry-scene-phone__live">
            EN DIRECT
          </text>
        </>
      )}

      <rect x={-FAR} y={WALL_BOTTOM} width={WIDTH + 2 * FAR} height={HEIGHT - WALL_BOTTOM} className="sc-floor" />
      <ellipse cx="195" cy="122" rx="176" ry="12" className="sc-accent" opacity="0.16" />
      <g className="sc-stroke-accent2" strokeWidth="1.2" opacity="0.22" fill="none">
        {FAN.map((x) => (
          <line key={x} x1="195" y1="122" x2={x} y2="206" />
        ))}
        {ROWS.map((y) => (
          <line key={y} x1={-FAR} y1={y} x2={WIDTH + FAR} y2={y} />
        ))}
      </g>

      <Speaker x={16} />
      <Speaker x={334} />
      <polygon points="116,102 274,102 292,116 98,116" className="sc-stage-top" stroke={OUTLINE} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="98" y="116" width="194" height="14" className="sc-stage" stroke={OUTLINE} strokeWidth="2.5" />
      <rect className="mw-neon sc-accent2" x="104" y="122" width="182" height="4" rx="2" filter="url(#entryp-neon)" />
    </>
  )
})

interface EntrySceneMobileProps {
  /** The avatar the visitor picked (or the member's own): it stands in front, on its ring. */
  avatar: AvatarDef
  /** What plays in the proposed room right now, written on the screen; null: the screen shows its sunset only. */
  nowPlaying: { title: string; artist: string } | null
  /** The genre of the proposed room: its two neon accents (as on the big scene); null: the default ones. */
  decor: DecorKind | null
}

/**
 * The small club at the top of the entry screen on a phone (mock-up M1), with the visitor in front of four others. It
 * sits in the page, under the header; nothing in it can be read or clicked (the form says it all).
 */
export default function EntrySceneMobile({ avatar: selfAvatar, nowPlaying, decor }: EntrySceneMobileProps) {
  return (
    <div className="entry-scene entry-scene--phone" aria-hidden="true" data-decor={decor ?? undefined}>
      <svg className="entry-scene__phone-art" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} focusable="false">
        <Club title={nowPlaying?.title ?? null} artist={nowPlaying?.artist ?? null} />
        {CROWD.map((dancer) => (
          <Person key={dancer.x} dancer={dancer} />
        ))}
        <ellipse cx="195" cy="192" rx="48" ry="8" className="sc-accent sc-stroke-accent scene__ring" strokeWidth="2.5" />
        <Person dancer={{ avatar: selfAvatar, ...SELF, delay: 0 }} />
      </svg>
    </div>
  )
}
