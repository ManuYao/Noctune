import { useEffect, useState } from 'react'
import SiteHeader from '../components/SiteHeader'
import type { LegalDocument, LegalSection } from '../legal/types'
import { useDocumentTitle } from '../legal/useDocumentTitle'
import './PageKit.css'
import './LegalPage.css'

/** How far below the top of the window a section counts as the one being read. */
const READING_LINE = 140

/**
 * The section being read: the last one whose title has passed the reading line (the last one at the bottom of the page).
 * A section reached through the table of contents stays lit until the reader scrolls on, even when the end of the page
 * stops it short of the reading line.
 */
function useCurrentSection(sections: LegalSection[]): string | null {
  const [current, setCurrent] = useState<string | null>(sections[0]?.id ?? null)

  useEffect(() => {
    let frame = 0
    // The section the address points to, and where the page was when it was reached (null until the first measure).
    let pinned: { id: string; y: number | null } | null = null
    const measure = () => {
      frame = 0
      if (pinned) {
        if (pinned.y === null) pinned.y = window.scrollY
        if (Math.abs(window.scrollY - pinned.y) <= 2) return setCurrent(pinned.id)
        pinned = null
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      let found = sections[0]?.id ?? null
      for (const section of sections) {
        const element = document.getElementById(section.id)
        if (element && element.getBoundingClientRect().top <= READING_LINE) found = section.id
      }
      setCurrent(atBottom ? (sections[sections.length - 1]?.id ?? found) : found)
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(measure)
    }
    const onHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!sections.some((section) => section.id === id)) return
      pinned = { id, y: null }
      setCurrent(id)
      onScroll()
    }
    onHash()
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    window.addEventListener('hashchange', onHash)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('hashchange', onHash)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [sections])

  return current
}

/**
 * A legal text: title, date, a table of contents with anchors, and the sections. Used by the three legal pages, in the
 * layout of mock-up 8 (the table of contents on the left, the numbered text in a panel) or of mock-up 7 (panels).
 */
export default function LegalPage({ document: doc }: { document: LegalDocument }) {
  useDocumentTitle(doc.title)
  return (
    <div>
      <SiteHeader />
      {doc.layout === 'panels' ? <PanelsLayout doc={doc} /> : <TextLayout doc={doc} />}
    </div>
  )
}

function TextLayout({ doc }: { doc: LegalDocument }) {
  const current = useCurrentSection(doc.sections)
  return (
    <main className="kit-page legal">
      <div className="kit-intro legal__intro">
        <h1>{doc.title}</h1>
        <div className="legal__lead">{doc.intro}</div>
      </div>

      <div className="legal__layout">
        <nav className="kit-panel legal__toc" aria-labelledby="legal-toc-title">
          <h2 className="kit-eyebrow legal__toc-title" id="legal-toc-title">
            Sommaire
          </h2>
          <ol>
            {doc.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} aria-current={section.id === current ? 'true' : undefined}>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <article className="kit-panel legal__text">
          {doc.draft && (
            <p className="legal__draft">
              <span className="legal__draft-badge">Contenu provisoire</span>
              <span>Les passages marqués « À compléter » sont à remplir avant la mise en ligne.</span>
            </p>
          )}
          <p className="legal__updated">Dernière mise à jour : {doc.updated}</p>
          {doc.sections.map((section, index) => (
            <section key={section.id} id={section.id} className="legal__section" aria-labelledby={`${section.id}-title`}>
              <h2 id={`${section.id}-title`}>
                <span className="legal__number">{index + 1}.</span> {section.title}
              </h2>
              {section.body}
            </section>
          ))}
        </article>
      </div>
    </main>
  )
}

function PanelsLayout({ doc }: { doc: LegalDocument }) {
  return (
    <main className="kit-page legal legal--panels">
      <div className="kit-intro legal__intro">
        <h1>{doc.title}</h1>
        <div className="legal__lead">{doc.intro}</div>
        {/* Not in mock-up 7: the table of contents every legal page has, as one quiet line under the title. */}
        <div className="legal__line">
          <nav className="legal__inline-toc" aria-labelledby="legal-toc-title">
            <h2 className="legal__inline-title" id="legal-toc-title">
              Sommaire :
            </h2>
            <ol>
              {doc.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          <p className="legal__updated">Dernière mise à jour : {doc.updated}</p>
        </div>
      </div>

      <div className="legal__panels">
        {doc.sections.map((section) => {
          const panel = section.panel ?? 'half'
          return (
            <section
              key={section.id}
              id={section.id}
              className={`legal__section legal__panel legal__panel--${panel}${panel === 'bare' ? '' : ' kit-panel'}${panel === 'accent' ? ' kit-panel--accent' : ''}`}
              aria-labelledby={`${section.id}-title`}
            >
              <h2 id={`${section.id}-title`} className={section.hideTitle ? 'visually-hidden' : 'kit-panel__title'}>
                {section.title}
              </h2>
              {section.body}
            </section>
          )
        })}
      </div>
    </main>
  )
}
