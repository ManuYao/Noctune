/** Where a person can stand on the dance floor: x is the centre, y the feet (both in % of the floor), size in % of its width. */
export interface StageSlot {
  x: number
  y: number
  size: number
}

// Back rows are higher and smaller: a cheap perspective. The spacing keeps neighbours from covering each other.
export const STAGE_SLOTS: StageSlot[] = [
  { x: 8, y: 46, size: 7.5 },
  { x: 25, y: 46, size: 7.5 },
  { x: 42, y: 46, size: 7.5 },
  { x: 59, y: 46, size: 7.5 },
  { x: 76, y: 46, size: 7.5 },
  { x: 92, y: 46, size: 7.5 },
  { x: 16.5, y: 72, size: 9 },
  { x: 33.5, y: 72, size: 9 },
  { x: 50.5, y: 72, size: 9 },
  { x: 67.5, y: 72, size: 9 },
  { x: 84, y: 72, size: 9 },
  { x: 8, y: 98, size: 11 },
  { x: 29, y: 98, size: 11 },
  { x: 50, y: 98, size: 11 },
  { x: 71, y: 98, size: 11 },
  { x: 92, y: 98, size: 11 },
]

function hash(text: string): number {
  let value = 0
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0
  return value
}

/**
 * Gives each person a slot from their id, so that an avatar does not move when someone else comes or goes
 * (unless two ids want the same slot, then the later one takes the next free slot).
 * Whoever comes first in `ids` is served first: the caller puts the visitor themself there.
 * People beyond the number of slots get none: the stage shows "+N" for them.
 */
export function assignSlots(ids: string[]): Map<string, StageSlot> {
  const taken = new Set<number>()
  const slots = new Map<string, StageSlot>()
  for (const id of ids) {
    if (taken.size === STAGE_SLOTS.length) break
    let index = hash(id) % STAGE_SLOTS.length
    while (taken.has(index)) index = (index + 1) % STAGE_SLOTS.length
    taken.add(index)
    slots.set(id, STAGE_SLOTS[index])
  }
  return slots
}
