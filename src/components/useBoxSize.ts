import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

/** The size of an element's box (content and padding), kept up to date as it changes. Null until it is measured. */
export function useBoxSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () =>
      setSize((previous) =>
        previous?.width === element.clientWidth && previous.height === element.clientHeight
          ? previous
          : { width: element.clientWidth, height: element.clientHeight },
      )
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}
