import { useId } from 'react'
import type { ReactNode } from 'react'
import type { RoomStyle, RoomTheme } from '../../shared/protocol'
import { AVATARS, type AvatarDef } from '../data/avatars'
import { themeAttribute } from '../rooms/roomLabels'
import AvatarArt from './AvatarArt'
import { decorKind, type DecorKind } from './decor/decorKind'
import { frenchCardDecor } from './decor/french'
import './RoomCardScene.css'

const OUTLINE = '#16142B'

/** The little scenes of mock-up 2, one per style, and the stage of mock-up 2b for the styles it does not draw. */
type SceneKind = DecorKind | 'stage'

const SHAPES = { a: 'antenna', e: 'ears', t: 'tuft', n: 'classic' } as const

/**
 * [shape, body, headphones, x, y, size, delay of its bounce in seconds]: the `<use href="#av-…" color fill>` of the
 * mock-ups. Some mix the shape of one avatar with the colours of another: drawn as they are.
 */
type Dancer = [shape: keyof typeof SHAPES, body: string, headphones: string, x: number, y: number, size: number, delay: number]

/** One of the dancers of the mock-ups: its shadow on the floor (cards of mock-up 2 only), then the avatar, bouncing. */
function dancer([shape, body, headphones, x, y, size, delay]: Dancer, withShadow: boolean): ReactNode {
  const look: AvatarDef = { ...AVATARS[0], shape: SHAPES[shape], body, headphones }
  const big = size >= 76
  return (
    <g key={`${x}-${y}`}>
      {withShadow && <ellipse cx={x + size / 2} cy="141" rx={big ? 20 : 18} ry={big ? 3.8 : 3.6} fill="#000000" opacity="0.35" />}
      <g className="room-scene__bob" style={{ animationDelay: `${delay}s` }}>
        <svg x={x} y={y} width={size} height={size} viewBox="0 0 100 100" overflow="visible">
          <AvatarArt avatar={look} />
        </svg>
      </g>
    </g>
  )
}

/** The wall, the floor and the line between them, as every card of mock-up 2 draws them. */
function room(wall: string, floor: string): ReactNode {
  return (
    <>
      <rect width="428" height="160" fill={wall} />
      <rect y="110" width="428" height="50" fill={floor} />
      <rect y="108" width="428" height="3" fill={OUTLINE} opacity="0.5" />
    </>
  )
}

// The crowds of mock-up 2, avatar for avatar.
const CROWDS: Record<Exclude<SceneKind, 'stage'>, Dancer[]> = {
  lofi: [
    ['n', '#5CC8FF', '#FF4F7B', 84, 76, 70, -0.2],
    ['a', '#FF6B9A', '#16142B', 176, 70, 76, -0.6],
    ['t', '#7BD88F', '#16142B', 290, 76, 70, -0.9],
  ],
  rap: [
    ['e', '#FFB347', '#3A2A8C', 52, 76, 70, -0.3],
    ['e', '#FF7A59', '#FFE58A', 146, 70, 76, -0.7],
    ['t', '#F2E55C', '#3A2A8C', 250, 76, 70, -0.1],
  ],
  electro: [
    ['a', '#A98BFF', '#16142B', 70, 76, 70, -0.4],
    ['n', '#E6ECF5', '#FF4F7B', 170, 70, 76, -0.8],
    ['t', '#FF6B9A', '#16142B', 286, 76, 70, -0.15],
  ],
  rock: [
    ['e', '#FF7A59', '#FFE58A', 96, 76, 70, -0.5],
    ['t', '#F2E55C', '#3A2A8C', 176, 70, 76, -0.1],
    ['n', '#7BD88F', '#16142B', 262, 76, 70, -0.85],
  ],
  jazz: [
    ['t', '#F2E55C', '#3A2A8C', 136, 76, 70, -0.3],
    ['e', '#5CC8FF', '#FF4F7B', 206, 70, 76, -0.65],
    ['n', '#FF6B9A', '#16142B', 292, 76, 70, -0.95],
  ],
  afro: [
    ['t', '#F2E55C', '#3A2A8C', 116, 76, 70, -0.2],
    ['e', '#FF7A59', '#FFE58A', 196, 70, 76, -0.55],
    ['n', '#5CC8FF', '#FF4F7B', 290, 76, 70, -0.9],
  ],
  french: [
    ['a', '#FF6B9A', '#16142B', 100, 76, 70, -0.3],
    ['e', '#FFD166', '#3A2A8C', 182, 70, 76, -0.7],
    ['t', '#5CC8FF', '#FF4F7B', 274, 76, 70, -0.5],
  ],
}

// The crowd of the stage of mock-up 2b: the DJ in front of the decks, four people around.
const STAGE_CROWD: Dancer[] = [
  ['a', '#FF6B9A', '#16142B', 218, 70, 56, 0],
  ['e', '#FFB347', '#3A2A8C', 52, 112, 54, -0.4],
  ['t', '#7BD88F', '#16142B', 122, 124, 46, -0.8],
  ['n', '#5CC8FF', '#FF4F7B', 326, 124, 46, -0.6],
  ['e', '#FF7A59', '#FFE58A', 388, 112, 54, -0.2],
]

/** The decor of each scene of mock-up 2, shape for shape (`ids` keeps the patterns of two cards apart). */
function decor(kind: Exclude<SceneKind, 'stage'>, ids: string): ReactNode {
  switch (kind) {
    case 'lofi':
      return (
        <>
          {room('#1B2A52', '#121A38')}
          <rect x="150" y="14" width="128" height="76" rx="10" fill="#0B1230" stroke={OUTLINE} strokeWidth="4" />
          <circle cx="214" cy="48" r="16" fill="#FFE9A8" />
          <circle cx="222" cy="44" r="14" fill="#0B1230" />
          <circle cx="170" cy="32" r="1.8" fill="#FFFFFF" />
          <circle cx="252" cy="30" r="1.8" fill="#FFFFFF" />
          <circle cx="190" cy="72" r="1.8" fill="#FFFFFF" />
          <circle cx="262" cy="68" r="1.8" fill="#FFFFFF" />
          <path d="M214 14 V90 M150 52 H278" stroke={OUTLINE} strokeWidth="3" />
          <line x1="372" y1="60" x2="372" y2="112" stroke={OUTLINE} strokeWidth="4" />
          <circle cx="372" cy="72" r="40" fill="#FFD166" opacity="0.14" />
          <polygon points="356,48 388,48 380,70 364,70" fill="#FFD166" stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
          <rect x="26" y="86" width="24" height="24" rx="4" fill="#FFB347" stroke={OUTLINE} strokeWidth="3" />
          <ellipse cx="38" cy="78" rx="14" ry="10" fill="#7BD88F" stroke={OUTLINE} strokeWidth="2.5" />
          <ellipse cx="28" cy="70" rx="8" ry="12" fill="#7BD88F" stroke={OUTLINE} strokeWidth="2.5" />
        </>
      )
    case 'rap':
      return (
        <>
          <defs>
            <pattern id={`${ids}-brick`} width="48" height="26" patternUnits="userSpaceOnUse">
              <path d="M0 0.5 H48 M0 13.5 H48 M24 0 V13 M0 13 V26 M48 13 V26" fill="none" stroke="#5A3624" strokeWidth="2" />
            </pattern>
          </defs>
          <rect width="428" height="160" fill="#3A2418" />
          <rect width="428" height="110" fill={`url(#${ids}-brick)`} />
          <rect y="110" width="428" height="50" fill="#24150E" />
          <rect y="108" width="428" height="3" fill={OUTLINE} opacity="0.5" />
          <path d="M110 50 C140 18 164 84 196 46 S250 74 286 38" fill="none" stroke="#FFB347" strokeWidth="9" strokeLinecap="round" />
          <path d="M124 76 C158 52 188 100 232 70" fill="none" stroke="#FF6B9A" strokeWidth="6" strokeLinecap="round" />
          <rect x="336" y="82" width="64" height="28" rx="5" fill={OUTLINE} />
          <circle cx="354" cy="96" r="8" fill="#FFB347" />
          <circle cx="382" cy="96" r="8" fill="#FFB347" />
          <path d="M346 82 Q368 66 390 82" fill="none" stroke={OUTLINE} strokeWidth="3" />
        </>
      )
    case 'electro':
      return (
        <>
          {room('#1E1448', '#140C34')}
          <rect x="20" y="118" width="76" height="28" fill="#A98BFF" opacity="0.28" />
          <rect x="112" y="118" width="76" height="28" fill="#3DE0FF" opacity="0.22" />
          <rect x="240" y="118" width="76" height="28" fill="#FF3D81" opacity="0.24" />
          <rect x="332" y="118" width="76" height="28" fill="#A98BFF" opacity="0.28" />
          <line x1="214" y1="34" x2="52" y2="110" stroke="#3DE0FF" strokeWidth="3" opacity="0.8" />
          <line x1="214" y1="34" x2="140" y2="110" stroke="#FF3D81" strokeWidth="3" opacity="0.8" />
          <line x1="214" y1="34" x2="296" y2="110" stroke="#7BD88F" strokeWidth="3" opacity="0.8" />
          <line x1="214" y1="34" x2="380" y2="110" stroke="#FFE58A" strokeWidth="3" opacity="0.8" />
          <line x1="214" y1="0" x2="214" y2="16" stroke={OUTLINE} strokeWidth="3" />
          <circle cx="214" cy="34" r="18" fill="#CFC6FF" stroke={OUTLINE} strokeWidth="3" />
          <path d="M196 34 H232 M214 16 V52 M200 22 Q214 34 200 46 M228 22 Q214 34 228 46" fill="none" stroke={OUTLINE} strokeWidth="1.5" />
        </>
      )
    case 'rock':
      return (
        <>
          {room('#2E1C2E', '#1F121F')}
          <rect x="16" y="40" width="64" height="72" rx="6" fill={OUTLINE} />
          <rect x="24" y="48" width="48" height="40" rx="4" fill="#2A2A44" />
          <circle cx="48" cy="68" r="12" fill={OUTLINE} />
          <circle cx="48" cy="68" r="5" fill="#FF7A59" />
          <rect x="348" y="40" width="64" height="72" rx="6" fill={OUTLINE} />
          <rect x="356" y="48" width="48" height="40" rx="4" fill="#2A2A44" />
          <circle cx="380" cy="68" r="12" fill={OUTLINE} />
          <circle cx="380" cy="68" r="5" fill="#FF7A59" />
          <polygon points="214,10 188,58 208,58 196,100 244,46 222,46" fill="#FFE58A" stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
        </>
      )
    case 'jazz':
      return (
        <>
          {room('#3A2E14', '#261D0C')}
          {[90, 214, 338].map((x) => (
            <g key={x}>
              <line x1={x} y1="0" x2={x} y2="30" stroke={OUTLINE} strokeWidth="3" />
              <circle cx={x} cy="52" r="40" fill="#FFD166" opacity="0.15" />
              <path d={`M${x - 18} 44 A18 18 0 0 1 ${x + 18} 44 Z`} fill="#FFB347" stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
            </g>
          ))}
          <rect x="18" y="92" width="100" height="18" fill="#F4F1FF" stroke={OUTLINE} strokeWidth="3" />
          <rect x="32" y="92" width="8" height="11" fill={OUTLINE} />
          <rect x="50" y="92" width="8" height="11" fill={OUTLINE} />
          <rect x="76" y="92" width="8" height="11" fill={OUTLINE} />
          <rect x="94" y="92" width="8" height="11" fill={OUTLINE} />
          <ellipse cx="382" cy="124" rx="32" ry="8" fill={OUTLINE} />
          <rect x="378" y="124" width="8" height="26" fill={OUTLINE} />
          <rect x="372" y="108" width="14" height="14" rx="3" fill="#F4F1FF" stroke={OUTLINE} strokeWidth="2" />
        </>
      )
    case 'french':
      return frenchCardDecor(ids)
    case 'afro':
      return (
        <>
          <rect width="428" height="160" fill="#C8472F" />
          <circle cx="214" cy="112" r="68" fill="#FFD166" />
          <rect y="110" width="428" height="50" fill="#6E3A22" />
          <rect y="108" width="428" height="3" fill={OUTLINE} opacity="0.5" />
          <path d="M58 112 Q62 70 74 34" fill="none" stroke={OUTLINE} strokeWidth="6" strokeLinecap="round" />
          <ellipse cx="50" cy="36" rx="26" ry="8" transform="rotate(-25 50 36)" fill="#1F8A5B" stroke={OUTLINE} strokeWidth="2.5" />
          <ellipse cx="98" cy="32" rx="26" ry="8" transform="rotate(25 98 32)" fill="#1F8A5B" stroke={OUTLINE} strokeWidth="2.5" />
          <ellipse cx="74" cy="22" rx="24" ry="7" transform="rotate(-85 74 22)" fill="#1F8A5B" stroke={OUTLINE} strokeWidth="2.5" />
          <ellipse cx="74" cy="42" rx="22" ry="7" transform="rotate(8 74 42)" fill="#1F8A5B" stroke={OUTLINE} strokeWidth="2.5" />
          <path d="M370 112 Q372 86 380 66" fill="none" stroke={OUTLINE} strokeWidth="5" strokeLinecap="round" />
          <ellipse cx="368" cy="68" rx="20" ry="6" transform="rotate(-20 368 68)" fill="#1F8A5B" stroke={OUTLINE} strokeWidth="2.5" />
          <ellipse cx="394" cy="66" rx="20" ry="6" transform="rotate(22 394 66)" fill="#1F8A5B" stroke={OUTLINE} strokeWidth="2.5" />
        </>
      )
  }
}

/**
 * The stage of the preview of mock-up 2b (a screen with a sunset, two beams, the decks), in the colours of the room's
 * ambiance: the tokens of its `data-theme` paint it.
 */
function stage(ids: string): ReactNode {
  return (
    <>
      <defs>
        <pattern id={`${ids}-slats`} width="56" height="10" patternUnits="userSpaceOnUse">
          <rect width="4" height="10" className="room-scene__wall-2" />
        </pattern>
        <radialGradient id={`${ids}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="room-scene__stop-accent" stopOpacity="0.38" />
          <stop offset="1" className="room-scene__stop-accent" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${ids}-beam-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="room-scene__stop-accent" stopOpacity="0.42" />
          <stop offset="1" className="room-scene__stop-accent" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${ids}-beam-b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="room-scene__stop-accent-2" stopOpacity="0.38" />
          <stop offset="1" className="room-scene__stop-accent-2" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${ids}-screen`}>
          <rect x="170" y="14" width="152" height="84" rx="8" />
        </clipPath>
      </defs>
      <rect width="492" height="170" className="room-scene__wall" />
      <rect width="492" height="170" fill={`url(#${ids}-slats)`} opacity="0.7" />
      <circle cx="246" cy="60" r="190" fill={`url(#${ids}-glow)`} />
      <polygon className="room-scene__sway" style={{ transformOrigin: '90px 0px' }} points="90,0 40,120 150,120" fill={`url(#${ids}-beam-a)`} />
      <polygon className="room-scene__sway-2" style={{ transformOrigin: '402px 0px' }} points="402,0 340,120 452,120" fill={`url(#${ids}-beam-b)`} />
      <rect x="164" y="8" width="164" height="96" rx="12" fill="none" className="room-scene__neon" strokeWidth="3" />
      <rect x="170" y="14" width="152" height="84" rx="8" className="room-scene__screen" />
      <g clipPath={`url(#${ids}-screen)`}>
        <circle cx="246" cy="46" r="20" className="room-scene__accent" />
        <rect x="228" y="52" width="36" height="2.5" className="room-scene__screen" />
        <rect x="228" y="58" width="36" height="3.5" className="room-scene__screen" />
        <polygon points="170,98 170,76 206,62 232,74 264,58 296,72 322,64 322,98" className="room-scene__wall-2" />
      </g>
      <rect y="120" width="492" height="50" className="room-scene__floor" />
      <polygon points="170,104 322,104 336,122 156,122" className="room-scene__stage-top" stroke={OUTLINE} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="156" y="122" width="180" height="12" className="room-scene__stage" stroke={OUTLINE} strokeWidth="2.5" />
    </>
  )
}

interface RoomCardSceneProps {
  /** The room's id: the French touch of the team has a scene of its own though its style is "electro". */
  roomId?: string
  /** The room's styles: the first one picks the scene. */
  styles: readonly RoomStyle[]
  /** The room's ambiance: it paints the stage drawn for the styles without a scene of their own. */
  theme: RoomTheme
  /** The stage of mock-up 2b whatever the styles (the preview of the form, which shows the ambiance being picked). */
  stageOnly?: boolean
}

/** The illustration at the top of a card of the list of rooms. Decoration only: hidden from screen readers. */
export default function RoomCardScene({ roomId, styles, theme, stageOnly = false }: RoomCardSceneProps) {
  const ids = `scene${useId().replace(/[^\w-]/g, '')}`
  const kind: SceneKind = stageOnly ? 'stage' : (decorKind({ id: roomId, styles }) ?? 'stage')

  if (kind === 'stage') {
    return (
      <svg className="room-scene" viewBox="0 0 492 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" data-theme={themeAttribute(theme)}>
        {stage(ids)}
        {STAGE_CROWD.map((one) => dancer(one, false))}
      </svg>
    )
  }
  return (
    <svg className="room-scene" viewBox="0 0 428 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      {decor(kind, ids)}
      {CROWDS[kind].map((one) => dancer(one, true))}
    </svg>
  )
}
