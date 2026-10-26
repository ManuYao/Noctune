import { approxTextWidth, cutText } from './sceneText'

// The scene's own space (viewBox of the mock-ups): a bubble is kept inside it, a little off the edges.
const SCENE_WIDTH = 940
const MARGIN = 8
export const BUBBLE_HEIGHT = 32
export const TAG_HEIGHT = 20
// A name longer than this is cut in its tag.
const TAG_CHARS = 16

export type BubbleAnchor =
  /** Above the speaker: `x` is the middle of their head, `y` the top of their drawing (or of what stands above it). */
  | { side: 'above'; x: number; y: number }
  /** Beside the speaker, at the height of their head: `x`, `y` is the point the bubble points at. */
  | { side: 'left' | 'right'; x: number; y: number }

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Where everything of a bubble goes, in the scene's coordinates. */
export interface BubbleLayout {
  bubble: { left: number; top: number; width: number }
  /** The tail: its three points, and the white strip that hides the outline where it meets the bubble. */
  tail: { points: string; cover: { x: number; y: number; width: number; height: number } }
  /** The dark tag with the name (centre and top), when there is one. */
  tag: { label: string; x: number; y: number; width: number } | null
  /** All of it: two bubbles whose boxes meet would be drawn over each other. */
  bounds: Box
}

const tagWidthOf = (label: string) => Math.max(48, approxTextWidth(label, 12) + 24)

/** Lays out a bubble (and the tag of its author's name) for an anchor. */
export function layoutBubble(text: string, name: string | null, anchor: BubbleAnchor): BubbleLayout {
  const width = Math.max(48, approxTextWidth(text, 13) + 24)
  const label = name === null ? null : cutText(name, TAG_CHARS)

  if (anchor.side === 'above') {
    // Tag right above the head, the bubble above the tag, its tail pointing down at them.
    const tagTop = anchor.y - TAG_HEIGHT
    const tip = label === null ? anchor.y : tagTop - 8
    const top = tip - 10 - BUBBLE_HEIGHT
    const left = Math.min(Math.max(anchor.x - width / 2, MARGIN), SCENE_WIDTH - MARGIN - width)
    const tailX = Math.min(Math.max(anchor.x, left + 14), left + width - 14)
    const tag = label === null ? null : { label, x: anchor.x, y: tagTop, width: tagWidthOf(label) }
    return {
      bubble: { left, top, width },
      tail: {
        points: `${tailX - 9},${top + BUBBLE_HEIGHT} ${tailX + 9},${top + BUBBLE_HEIGHT} ${tailX},${tip}`,
        cover: { x: tailX - 13, y: top + BUBBLE_HEIGHT - 3, width: 26, height: 5 },
      },
      tag,
      bounds: {
        left: Math.min(left, tag ? tag.x - tag.width / 2 : left),
        top,
        right: Math.max(left + width, tag ? tag.x + tag.width / 2 : 0),
        bottom: tag ? tag.y + TAG_HEIGHT : tip,
      },
    }
  }

  // Beside the head: on its left (the tail points right) or on its right (the tail points left), the tag under it.
  const onLeft = anchor.side === 'left'
  const left = onLeft ? anchor.x - 10 - width : anchor.x + 10
  const top = anchor.y - BUBBLE_HEIGHT / 2
  const edge = onLeft ? left + width : left
  const tagWidth = label === null ? 0 : tagWidthOf(label)
  const tag = label === null ? null : { label, x: onLeft ? left + width - tagWidth / 2 : left + tagWidth / 2, y: top + BUBBLE_HEIGHT + 4, width: tagWidth }
  return {
    bubble: { left, top, width },
    tail: {
      points: `${edge},${anchor.y - 9} ${edge},${anchor.y + 9} ${anchor.x},${anchor.y}`,
      cover: { x: edge - (onLeft ? 3 : 2), y: anchor.y - 13, width: 5, height: 26 },
    },
    tag,
    bounds: {
      left: Math.min(left, anchor.x),
      top,
      right: Math.max(left + width, anchor.x),
      bottom: tag ? tag.y + TAG_HEIGHT : top + BUBBLE_HEIGHT,
    },
  }
}

/** Whether two boxes meet (with a little air between them). */
export function boxesMeet(a: Box, b: Box, air = 4): boolean {
  return a.left < b.right + air && b.left < a.right + air && a.top < b.bottom + air && b.top < a.bottom + air
}
