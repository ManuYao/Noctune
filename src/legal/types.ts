import type { ReactNode } from 'react'

/** One titled part of a legal page. `id` is the anchor used by the table of contents. */
export interface LegalSection {
  id: string
  title: string
  body: ReactNode
}

/** What a legal page says. Kept apart from the layout so that the texts can be edited without touching it. */
export interface LegalDocument {
  /** The title of the page (the `h1`) and of the browser tab. */
  title: string
  updated: string
  intro: ReactNode
  sections: LegalSection[]
  /** The cards of the rules page need more room than a text does. */
  wide?: boolean
}
