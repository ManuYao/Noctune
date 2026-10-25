import SiteHeader from '../components/SiteHeader'
import type { LegalDocument } from '../legal/types'
import { useDocumentTitle } from '../legal/useDocumentTitle'
import './LegalPage.css'

/** A legal text: title, date, a table of contents with anchors, and the sections. Used by the three legal pages. */
export default function LegalPage({ document: doc }: { document: LegalDocument }) {
  useDocumentTitle(doc.title)

  return (
    <div>
      <SiteHeader />
      <main className="legal">
        <article className={doc.wide ? 'legal__article legal__article--wide' : 'legal__article'}>
          <header className="legal__hero">
            <h1>{doc.title}</h1>
            <p className="legal__updated">Dernière mise à jour : {doc.updated}</p>
            <div className="legal__intro">{doc.intro}</div>
          </header>

          <nav className="legal__toc" aria-labelledby="legal-toc-title">
            <h2 id="legal-toc-title">Sommaire</h2>
            <ol>
              {doc.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          {doc.sections.map((section) => (
            <section key={section.id} id={section.id} className="legal__section" aria-labelledby={`${section.id}-title`}>
              <h2 id={`${section.id}-title`}>{section.title}</h2>
              {section.body}
            </section>
          ))}
        </article>
      </main>
    </div>
  )
}
