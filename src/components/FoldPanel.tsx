import type { FormEventHandler, ReactNode } from 'react'
import '../pages/PageKit.css'
import './FoldPanel.css'

interface FoldPanelProps {
  id: string
  title: string
  /** A phone: the panel folds under its title (a `<details>`); a computer: the plain panel it has always been. */
  folded: boolean
  /** Makes the body a form. */
  onSubmit?: FormEventHandler<HTMLFormElement>
  children: ReactNode
}

/** A panel of "Sécurité et données": open on a computer, a 48 px row that unfolds on a phone, so the page stays short. */
export default function FoldPanel({ id, title, folded, onSubmit, children }: FoldPanelProps) {
  const heading = (
    <h3 className="kit-panel__title" id={id}>
      {title}
    </h3>
  )
  const Body = onSubmit ? 'form' : 'section'
  const bodyProps = onSubmit ? { onSubmit, noValidate: true } : {}

  if (!folded) {
    return (
      <Body className="kit-panel" aria-labelledby={id} {...bodyProps}>
        {heading}
        {children}
      </Body>
    )
  }
  return (
    <details className="kit-panel fold-panel">
      <summary className="fold-panel__summary">
        {heading}
        <svg className="fold-panel__chevron" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7 L9 12 L14 7" />
        </svg>
      </summary>
      <Body className="fold-panel__body" aria-labelledby={id} {...bodyProps}>
        {children}
      </Body>
    </details>
  )
}
