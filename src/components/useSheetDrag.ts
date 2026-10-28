import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

const SEEN_KEY = 'noctune.djSheetSeen'

// A convenience of this browser: storage can be missing or refuse (private window), and then the hint just keeps coming.
function readSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Not remembered.
  }
}

/** A drag that ended faster than this (px per ms) decides by its direction, wherever the finger stopped. */
const FLING = 0.4
/** Under this many px a press is a tap, not a drag. */
const TAP_SLOP = 6

export interface SheetControl {
  /** The sheet is pulled up as far as the video allows. */
  expanded: boolean
  /** The member has already used the handle: the little hint animation stops. */
  seen: boolean
  toggle: () => void
  /** For the zone that is dragged: the handle and the title. */
  zoneProps: {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
  }
  /** True once after a drag: the click that follows the finger lifting is not a tap on the handle. */
  consumeClick: () => boolean
}

/**
 * A bottom sheet that can be pulled up and down. It has two heights: its own, and up to where the video ends (the room page
 * says how much more that is, `--m-extras`: the video is never covered). The height is the page's CSS (`--sheet-grow`);
 * this only moves that number while the finger is down, then settles on one of the two heights. A press on the handle that
 * does not move is a tap, which switches between the two.
 */
export function useSheetDrag(dialogRef: RefObject<HTMLDialogElement | null>, open: boolean): SheetControl {
  const [expanded, setExpanded] = useState(false)
  const [seen, setSeen] = useState(readSeen)
  const drag = useRef<{ startY: number; startGrow: number; max: number; moved: boolean; lastY: number; lastT: number; speed: number } | null>(null)
  const suppressClick = useRef(false)

  /** How much higher the sheet can go, in px: the extra height the room page leaves under the video. */
  const measureMax = useCallback(() => {
    const dialog = dialogRef.current
    if (!dialog) return 0
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:var(--m-extras, 0px)'
    dialog.appendChild(probe)
    const height = probe.offsetHeight
    dialog.removeChild(probe)
    return height
  }, [dialogRef])

  const apply = useCallback(
    (value: boolean) => {
      const dialog = dialogRef.current
      if (!dialog) return
      dialog.style.setProperty('--sheet-grow', `${value ? measureMax() : 0}px`)
      dialog.dataset.expanded = String(value)
    },
    [dialogRef, measureMax],
  )

  // Closed, the sheet is back to its own height for the next time; open, it follows the window (turning the phone).
  useEffect(() => {
    if (!open) {
      setExpanded(false)
      return
    }
    apply(expanded)
    const onResize = () => apply(expanded)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, expanded, apply])

  const markSeen = useCallback(() => {
    setSeen(true)
    writeSeen()
  }, [])

  const toggle = useCallback(() => {
    markSeen()
    const next = !expanded
    setExpanded(next)
    apply(next)
  }, [expanded, apply, markSeen])

  const zoneProps: SheetControl['zoneProps'] = {
    onPointerDown(event) {
      // A button in the zone (the cross) keeps its own press.
      if ((event.target as HTMLElement).closest('.dj-head__close')) return
      const dialog = dialogRef.current
      if (!dialog) return
      const max = measureMax()
      drag.current = { startY: event.clientY, startGrow: expanded ? max : 0, max, moved: false, lastY: event.clientY, lastT: event.timeStamp, speed: 0 }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove(event) {
      const state = drag.current
      const dialog = dialogRef.current
      if (!state || !dialog) return
      const up = state.startY - event.clientY
      if (!state.moved && Math.abs(up) < TAP_SLOP) return
      if (!state.moved) {
        state.moved = true
        // Following the finger: no transition until it lets go.
        dialog.dataset.dragging = 'true'
      }
      const elapsed = Math.max(1, event.timeStamp - state.lastT)
      state.speed = (state.lastY - event.clientY) / elapsed
      state.lastY = event.clientY
      state.lastT = event.timeStamp
      const grow = Math.min(state.max, Math.max(0, state.startGrow + up))
      dialog.style.setProperty('--sheet-grow', `${grow}px`)
    },
    onPointerUp(event) {
      const state = drag.current
      const dialog = dialogRef.current
      drag.current = null
      if (!state || !dialog) return
      delete dialog.dataset.dragging
      if (!state.moved) return // a tap: the button's own click does the switching
      // The click that follows the finger lifting is not a tap on the handle (and if nothing receives it, this must not
      // linger and swallow the next real tap).
      suppressClick.current = true
      window.setTimeout(() => {
        suppressClick.current = false
      }, 0)
      markSeen()
      const current = parseFloat(dialog.style.getPropertyValue('--sheet-grow')) || 0
      const next = state.speed > FLING ? true : state.speed < -FLING ? false : current > state.max / 2
      setExpanded(next)
      apply(next)
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    },
    onPointerCancel() {
      const dialog = dialogRef.current
      drag.current = null
      if (dialog) delete dialog.dataset.dragging
      apply(expanded)
    },
  }

  const consumeClick = useCallback(() => {
    const was = suppressClick.current
    suppressClick.current = false
    return was
  }, [])

  return { expanded, seen, toggle, zoneProps, consumeClick }
}
