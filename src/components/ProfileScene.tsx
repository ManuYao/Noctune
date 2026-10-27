import { useId } from 'react'
import type { AvatarDef } from '../data/avatars'
import { AVATARS } from '../data/avatars'
import AvatarArt from './AvatarArt'
import { approxTextWidth, cutText } from './sceneText'
import './ProfileScene.css'

/**
 * Which of the little stages of the profile mock-ups:
 * - `band`: the band of the member's profile (5b), the avatar alone on its ring under two beams (300 x 197);
 * - `preview`: the preview of "Mon avatar" (5b), two dimmed neighbours on the floor (357 x 140);
 * - `stage`: the big stage of "Ton avatar" (5), the floor in perspective, four dimmed neighbours and the pseudo in a pill
 *   over the head (557 x 250).
 */
export type ProfileSceneVariant = 'band' | 'preview' | 'stage'

interface Layout {
  width: number
  height: number
  floorTop: number
  glow: { cx: number; cy: number; r: number }
  beams: { top: number; left: number; right: number; bottom: number }[]
  ring: { cx: number; cy: number; rx: number; ry: number; shadowRx: number; shadowRy: number }
  self: { x: number; y: number; size: number }
  hearts: { x: number; y: number; width: number; delay: number }[]
  /** [index in AVATARS, x, y, size, delay]: the dimmed neighbours of the mock-ups, in their colours. */
  crowd: [number, number, number, number, number][]
  crowdOpacity: number
}

const LAYOUTS: Record<ProfileSceneVariant, Layout> = {
  band: {
    width: 300,
    height: 197,
    floorTop: 140,
    glow: { cx: 150, cy: 80, r: 150 },
    beams: [
      { top: 50, left: 14, right: 96, bottom: 150 },
      { top: 250, left: 204, right: 286, bottom: 150 },
    ],
    ring: { cx: 150, cy: 168, rx: 72, ry: 13, shadowRx: 28, shadowRy: 5.5 },
    self: { x: 90, y: 50, size: 120 },
    hearts: [
      { x: 212, y: 62, width: 20, delay: -0.5 },
      { x: 66, y: 70, width: 18, delay: -1.8 },
      { x: 226, y: 30, width: 16, delay: -2.6 },
    ],
    crowd: [],
    crowdOpacity: 0,
  },
  preview: {
    width: 357,
    height: 140,
    floorTop: 104,
    glow: { cx: 178, cy: 60, r: 140 },
    beams: [],
    ring: { cx: 178, cy: 122, rx: 64, ry: 11, shadowRx: 0, shadowRy: 0 },
    self: { x: 118, y: 12, size: 120 },
    hearts: [],
    crowd: [
      [1, 30, 56, 62, -0.4],
      [3, 265, 56, 62, -0.8],
    ],
    crowdOpacity: 0.5,
  },
  stage: {
    width: 557,
    height: 250,
    floorTop: 170,
    glow: { cx: 278, cy: 90, r: 220 },
    beams: [
      { top: 120, left: 60, right: 190, bottom: 200 },
      { top: 437, left: 370, right: 500, bottom: 200 },
    ],
    ring: { cx: 278, cy: 214, rx: 96, ry: 18, shadowRx: 36, shadowRy: 7 },
    self: { x: 203, y: 84, size: 150 },
    hearts: [
      { x: 366, y: 96, width: 22, delay: -0.6 },
      { x: 186, y: 104, width: 20, delay: -1.9 },
      { x: 384, y: 60, width: 18, delay: -2.7 },
    ],
    crowd: [
      [1, 60, 112, 80, -0.3],
      [2, 150, 128, 70, -0.7],
      [3, 337, 128, 70, -0.5],
      [4, 417, 112, 80, -0.9],
    ],
    crowdOpacity: 0.55,
  },
}

// The wall and the floor go far past the drawing: a wider or taller box than the mock-up's shows more club, never a gap.
const FAR = 1200
const HEART = 'M12 21 C2 13 0 8 0 5.5 C0 2.4 2.4 0 5.5 0 C8 0 10.6 1.4 12 4 C13.4 1.4 16 0 18.5 0 C21.6 0 24 2.4 24 5.5 C24 8 22 13 12 21 Z'
const PILL = { fontSize: 14, height: 26, padding: 14, gap: 6 }

interface ProfileSceneProps {
  variant: ProfileSceneVariant
  avatar: AvatarDef
  /** `stage` only: the pseudo in the pill over the head ("Toi" while it is empty). */
  pseudo?: string
}

/**
 * The little club of the profile mock-ups (5 and 5b) with the person's avatar on its ring. Decoration only: the page
 * says the same in words. Its colours are the tokens of the ambiance; it fills the box it is given, centred.
 */
export default function ProfileScene({ variant, avatar, pseudo = '' }: ProfileSceneProps) {
  const ids = useId().replace(/:/g, '')
  const layout = LAYOUTS[variant]
  const { width, height, floorTop, glow, ring, self } = layout
  const centre = self.x + self.size / 2
  const pill = cutText(pseudo, 20) || 'Toi'
  const pillWidth = approxTextWidth(pill, PILL.fontSize) + 2 * PILL.padding
  // The pill sits a little over the top of the head (the mock-up's: 32 units above an avatar of 150).
  const pillTop = self.y - PILL.height - PILL.gap

  return (
    <svg
      className={`profile-scene profile-scene--${variant}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={`${ids}-slats`} width="56" height="10" patternUnits="userSpaceOnUse">
          <rect width="4" height="10" className="profile-scene__wall-2" />
        </pattern>
        <radialGradient id={`${ids}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="profile-scene__stop-accent" stopOpacity="0.34" />
          <stop offset="1" className="profile-scene__stop-accent" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${ids}-beam-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="profile-scene__stop-accent" stopOpacity="0.42" />
          <stop offset="1" className="profile-scene__stop-accent" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${ids}-beam-b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="profile-scene__stop-accent-2" stopOpacity="0.38" />
          <stop offset="1" className="profile-scene__stop-accent-2" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect x={-FAR} y={-FAR} width={width + 2 * FAR} height={FAR + floorTop} className="profile-scene__wall" />
      <rect x={-FAR} y={-FAR} width={width + 2 * FAR} height={FAR + floorTop} fill={`url(#${ids}-slats)`} opacity="0.7" />
      <circle cx={glow.cx} cy={glow.cy} r={glow.r} fill={`url(#${ids}-glow)`} />
      {layout.beams.map((beam, index) => (
        <polygon
          key={beam.top}
          className={index === 0 ? 'profile-scene__sway' : 'profile-scene__sway-2'}
          style={{ transformOrigin: `${beam.top}px 0px` }}
          points={`${beam.top},0 ${beam.left},${beam.bottom} ${beam.right},${beam.bottom}`}
          fill={`url(#${ids}-beam-${index === 0 ? 'a' : 'b'})`}
        />
      ))}
      <rect x={-FAR} y={floorTop} width={width + 2 * FAR} height={height - floorTop + FAR} className="profile-scene__floor" />

      {variant === 'stage' && (
        // The lines of the floor in perspective, towards the middle of the stage.
        <g className="profile-scene__grid" strokeWidth="1.5" opacity="0.22" fill="none">
          {[-300, -100, 60, 170, 278, 386, 496, 657, 857].map((x) => (
            <line key={x} x1="278" y1={floorTop} x2={x} y2={height} />
          ))}
          {[182, 200, 224].map((y) => (
            <line key={y} x1={-FAR} y1={y} x2={width + FAR} y2={y} />
          ))}
        </g>
      )}

      {layout.crowd.length > 0 && (
        <g opacity={layout.crowdOpacity}>
          {layout.crowd.map(([index, x, y, size, delay]) => (
            <g key={x} className="profile-scene__bob" style={{ animationDelay: `${delay}s` }}>
              <svg x={x} y={y} width={size} height={size} viewBox="0 0 100 100" overflow="visible">
                <AvatarArt avatar={AVATARS[index]} />
              </svg>
            </g>
          ))}
        </g>
      )}

      <ellipse cx={ring.cx} cy={ring.cy} rx={ring.rx} ry={ring.ry} className="profile-scene__ring" strokeWidth="3" />
      {ring.shadowRx > 0 && <ellipse cx={ring.cx} cy={ring.cy} rx={ring.shadowRx} ry={ring.shadowRy} fill="#000000" opacity="0.4" />}
      <g className="profile-scene__bob">
        <svg x={self.x} y={self.y} width={self.size} height={self.size} viewBox="0 0 100 100" overflow="visible">
          <AvatarArt avatar={avatar} />
        </svg>
      </g>

      {variant === 'stage' && (
        <>
          <rect x={centre - pillWidth / 2} y={pillTop} width={pillWidth} height={PILL.height} rx={PILL.height / 2} className="profile-scene__accent" />
          <text x={centre} y={pillTop + 18} textAnchor="middle" className="profile-scene__pill">
            {pill}
          </text>
        </>
      )}

      {layout.hearts.map((heart) => (
        <g key={heart.x} className="profile-scene__float" style={{ animationDelay: `${heart.delay}s` }}>
          <svg x={heart.x} y={heart.y} width={heart.width} height={(heart.width * 22) / 24} viewBox="0 0 24 22" overflow="visible">
            <path d={HEART} className="profile-scene__accent" stroke="#16142B" strokeWidth="1.5" />
          </svg>
        </g>
      ))}
    </svg>
  )
}
