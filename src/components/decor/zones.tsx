import type { ReactNode } from 'react'

/** The scene of the room is drawn on 940 x 704, the one of the entry screen on 1440 x 900: the decor knows both. */
export type Frame = 'room' | 'entry'

export interface DecorProps {
  frame: Frame
}

/** The outline colour of every drawing of the mock-ups. */
export const OUT = '#16142B'

/** Where the wall meets the floor. */
export const HORIZON: Record<Frame, number> = { room: 436, entry: 457 }

// The decor is drawn once, in the coordinates of the room. On the entry screen a zone is moved to where the same place is
// there: the stage (520 wide in both) is 260 to the right, the screen is smaller (so the wings move a little less than
// that), and the horizon is 21 lower.
// The wings (what stands or hangs on the wall beside the screen) are also drawn smaller there, 0.8, hugging the speakers:
// the text of the page takes the wall up to x = 395 and y = 410, and the decor must stay a backdrop to it. What hangs
// from the ceiling keeps its size (it is above the text).
type ZoneName = 'left' | 'right' | 'leftTop' | 'rightTop' | 'center' | 'span'
const WING_SCALE = 0.8
const ENTRY_TRANSFORM: Record<ZoneName, string> = {
  // The middle of each speaker lands on the middle of the speaker of the entry screen (room 173 and 767, entry 475 and 985), so
  // that what stands on a speaker is centred on it; the horizon of the room (436) on the one of the entry screen (457).
  left: `translate(${475 - 173 * WING_SCALE} ${457 - 436 * WING_SCALE}) scale(${WING_SCALE})`,
  right: `translate(${985 - 767 * WING_SCALE} ${457 - 436 * WING_SCALE}) scale(${WING_SCALE})`,
  leftTop: 'translate(295 0)',
  rightTop: 'translate(225 0)',
  center: 'translate(260 21)',
  span: 'translate(0 21)',
}

/**
 * A part of the decor in the place it belongs to: the wall at the left or right of the screen (`left`, `right`), what
 * hangs from the ceiling there (`leftTop`, `rightTop`), the middle behind the stage, or the whole width (a skyline). The
 * room draws it as it is; the entry screen moves it.
 */
export function Zone({ frame, at, children }: { frame: Frame; at: ZoneName; children: ReactNode }) {
  if (frame === 'room') return <g>{children}</g>
  return <g transform={ENTRY_TRANSFORM[at]}>{children}</g>
}

/** The same numbers every time (the decor must not change between two renders, nor between the card and the room). */
export function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A point of a quadratic curve (for the bulbs of a garland). */
export function onCurve(p0: [number, number], p1: [number, number], p2: [number, number], t: number): [number, number] {
  const u = 1 - t
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]
}

/** The floor grid of a frame: the line of the fan `i` at the height `y` (same numbers as SceneBackdrop and EntryScene). */
export const FAN = {
  room: { top0: 256, topStep: 44.2, bottom0: -500, bottomStep: 200, y0: 436, y1: 704, rows: [446, 463, 487, 521, 568, 630], cols: [1, 9] },
  entry: { top0: 533, topStep: 391 / 12, bottom0: -600, bottomStep: 220, y0: 457, y1: 900, rows: [470, 487, 511, 545, 592, 658], cols: [2, 11] },
} as const

export function fanX(frame: Frame, i: number, y: number): number {
  const f = FAN[frame]
  const top = f.top0 + f.topStep * i
  const bottom = f.bottom0 + f.bottomStep * i
  return top + ((bottom - top) * (y - f.y0)) / (f.y1 - f.y0)
}

/** What the decor shares: the glow of its neon. Drawn once by the scene that wears the decor. */
export function DecorDefs() {
  return (
    <defs>
      <filter id="dc-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  )
}
