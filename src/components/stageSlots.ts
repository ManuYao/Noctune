/**
 * Where people stand in the illustrated room, in the coordinates of the scene (viewBox 940 x 704 of the mock-ups).
 * x and y are the top-left corner of the avatar's 100 x 100 drawing, size its width and height; the shadow is the dark
 * ellipse under the feet. Everything is taken from the mock-ups (screens 3 and 3b), size and shadow included.
 */
export interface StageSlot {
  x: number
  y: number
  size: number
  shadow: { cx: number; cy: number; rx: number; ry: number; opacity: number }
  /** Delay of the bounce, so that the crowd does not move as one. */
  delay: number
  /**
   * On the stage beside the DJ: right under the screen, so a chat bubble goes to the side of the head (`left`: on its
   * left), never up over the video.
   */
  bubbleSide?: 'left' | 'right'
}

// Two on the stage, then the back, middle and front rows of the floor. Drawn in this order: rows in front cover the
// rows behind them.
export const STAGE_SLOTS: StageSlot[] = [
  { x: 260, y: 300, size: 66, shadow: { cx: 293, cy: 362, rx: 17, ry: 3.6, opacity: 0.3 }, delay: -0.4, bubbleSide: 'left' },
  { x: 620, y: 300, size: 66, shadow: { cx: 653, cy: 362, rx: 17, ry: 3.6, opacity: 0.3 }, delay: -0.8, bubbleSide: 'right' },
  { x: 200, y: 452, size: 66, shadow: { cx: 233, cy: 514, rx: 17, ry: 3.6, opacity: 0.35 }, delay: -0.2 },
  { x: 700, y: 454, size: 66, shadow: { cx: 733, cy: 516, rx: 17, ry: 3.6, opacity: 0.35 }, delay: -0.7 },
  { x: 860, y: 460, size: 62, shadow: { cx: 891, cy: 518, rx: 16, ry: 3.4, opacity: 0.35 }, delay: -0.5 },
  { x: 300, y: 490, size: 88, shadow: { cx: 344, cy: 573, rx: 23, ry: 4.8, opacity: 0.4 }, delay: -0.35 },
  { x: 600, y: 498, size: 90, shadow: { cx: 645, cy: 583, rx: 23, ry: 5, opacity: 0.4 }, delay: -0.6 },
  { x: 110, y: 500, size: 92, shadow: { cx: 156, cy: 586, rx: 24, ry: 5, opacity: 0.4 }, delay: -0.9 },
  { x: 790, y: 505, size: 94, shadow: { cx: 837, cy: 593, rx: 24, ry: 5, opacity: 0.4 }, delay: -0.15 },
  { x: 800, y: 558, size: 130, shadow: { cx: 865, cy: 680, rx: 34, ry: 7, opacity: 0.45 }, delay: -0.55 },
  { x: 640, y: 565, size: 126, shadow: { cx: 703, cy: 683, rx: 33, ry: 7, opacity: 0.45 }, delay: -0.3 },
  { x: 180, y: 575, size: 126, shadow: { cx: 243, cy: 693, rx: 33, ry: 7, opacity: 0.45 }, delay: -0.75 },
]

/**
 * The podium: the DJ on the decks is number 1 (behind the console), the next two DJs stand beside the console, number 2 on
 * its left and number 3 on its right. Nobody else stands there. Between the speakers (the stage is 210-730 wide) and clear of the console's plate (370-570).
 */
export const WAITING_DJ_SLOTS: StageSlot[] = [
  { x: 287, y: 306, size: 56, shadow: { cx: 315, cy: 361, rx: 15, ry: 3.2, opacity: 0.3 }, delay: -0.8, bubbleSide: 'left' },
  { x: 597, y: 306, size: 56, shadow: { cx: 625, cy: 361, rx: 15, ry: 3.2, opacity: 0.3 }, delay: -0.6, bubbleSide: 'right' },
]

/** The viewer: always in front, in the middle, on a ring of the accent colour. */
export const SELF_SLOT: StageSlot = {
  x: 400,
  y: 548,
  size: 150,
  shadow: { cx: 475, cy: 689, rx: 39, ry: 8, opacity: 0.4 },
  delay: 0,
}

/** The DJ on the decks, behind the console (it hides their feet). */
export const DJ_SLOT = { x: 424, y: 275, size: 92, delay: -0.1 }

function hash(text: string): number {
  let value = 0
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0
  return value
}

/**
 * Gives each person a slot from their id, so that an avatar does not move when someone else comes or goes
 * (unless two ids want the same slot, then the later one takes the next free slot). Returns slot indexes.
 * People beyond the number of slots (`count`, all of STAGE_SLOTS by default) get none: the stage shows "+N" for them.
 */
export function assignSlots(ids: string[], count: number = STAGE_SLOTS.length, order?: number[]): Map<string, number> {
  const taken = new Set<number>()
  const slots = new Map<string, number>()
  for (const id of ids) {
    if (taken.size === count) break
    // With an order, the hash is squeezed towards 0 so that few people gather near the front of the order (the middle).
    let index = order ? Math.floor((hash(id) / 2 ** 32) ** 2 * count) : hash(id) % count
    while (taken.has(index)) index = (index + 1) % count
    taken.add(index)
    slots.set(id, order ? order[index] : index)
  }
  return slots
}

/** Indexes of STAGE_SLOTS, the ones nearest the middle of the scene first. */
export const CENTER_FIRST: number[] = STAGE_SLOTS.map((slot, index) => ({ index, d: Math.abs(slot.x + slot.size / 2 - 470) }))
  .sort((a, b) => a.d - b.d || a.index - b.index)
  .map((entry) => entry.index)
