import { useEffect } from 'react'

const SITE_NAME = 'Noctune'

/** The title of the browser tab while the page is shown; the previous one comes back when it goes. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title
    document.title = `${title} · ${SITE_NAME}`
    return () => {
      document.title = previous
    }
  }, [title])
}
