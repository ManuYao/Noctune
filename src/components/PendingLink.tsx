import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PENDING_LEGAL_PAGES, PENDING_TEXT, PENDING_TITLE, type PendingLegalPage } from '../legal/pending'
import ModDialog from '../moderation/ModDialog'
import './PendingLink.css'

interface PendingLinkProps {
  page: PendingLegalPage
  children: ReactNode
  /** Opens in a new tab when the page is ready (so that a form or a room is not left). */
  newTab?: boolean
  className?: string
}

/** A link to a legal page; while the page is not written, a button that opens a small "en cours de rédaction" notice instead. */
export default function PendingLink({ page, children, newTab, className }: PendingLinkProps) {
  const [open, setOpen] = useState(false)
  if (!PENDING_LEGAL_PAGES.has(page)) {
    return (
      <Link to={`/${page}`} className={className} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {children}
      </Link>
    )
  }
  return (
    <>
      <button type="button" className={`pending-link${className ? ` ${className}` : ''}`} onClick={() => setOpen(true)}>
        {children}
      </button>
      <ModDialog open={open} onClose={() => setOpen(false)} titleId={`pending-${page}`} title={PENDING_TITLE}>
        <p className="mod-hint">{PENDING_TEXT}</p>
        <div className="mod-actions__row">
          <button type="button" className="mod-btn" data-autofocus="" onClick={() => setOpen(false)}>
            Compris
          </button>
        </div>
      </ModDialog>
    </>
  )
}
