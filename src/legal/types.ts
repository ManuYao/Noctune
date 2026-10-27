import type { ReactNode } from 'react'

/**
 * Where a section sits on a page laid out in panels (the rules, mock-up 7), on a grid of six columns:
 * `bare`: the whole width, no panel of its own (its body brings its cards); `wide`: two thirds; `accent`: one third, in
 * the accent's frame ("Un souci ?"); `half`: half the width. Pages of running text (mock-up 8) ignore it.
 */
export type LegalPanel = 'bare' | 'wide' | 'accent' | 'half'

/** One titled part of a legal page. `id` is the anchor used by the table of contents. */
export interface LegalSection {
  id: string
  title: string
  body: ReactNode
  panel?: LegalPanel
  /** The title is still there for the table of contents and for screen readers, but not drawn (the cards say it). */
  hideTitle?: boolean
}

/** What a legal page says. Kept apart from the layout so that the texts can be edited without touching it. */
export interface LegalDocument {
  /** The title of the page (the `h1`) and of the browser tab. */
  title: string
  updated: string
  intro: ReactNode
  sections: LegalSection[]
  /**
   * `text` (the default): mock-up 8, the table of contents on the left and the numbered sections in a panel.
   * `panels`: mock-up 7, the sections in panels side by side (see `LegalPanel`).
   */
  layout?: 'text' | 'panels'
  /** Some facts are still to be filled in (`ToComplete`): the page says so above its text, as mock-up 8 does. */
  draft?: boolean
}
