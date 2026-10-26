import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import '../components/DjDialog.css'
import './Moderation.css'

interface ModDialogProps {
  open: boolean
  onClose: () => void
  titleId: string
  title: string
  children: ReactNode
}

/**
 * A native modal dialog (focus trapped inside, Escape closes it, the page behind is inert), in the look of "Passer DJ":
 * centred on a computer, a sheet from the bottom on a phone. It is always in the page and its content comes and goes, so
 * that closing gives the focus back to the button that opened it and every opening starts clean.
 */
export default function ModDialog({ open, onClose, titleId, title, children }: ModDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Whether the press that ends in a click began on the backdrop too: letting go over it after selecting some text is not a click on it.
  const pressStartedOnBackdrop = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // Not on a touch screen: the keyboard would rise before anything is read.
      if (!window.matchMedia('(pointer: coarse)').matches) dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="dj-dialog mod-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onPointerDown={(event) => {
        pressStartedOnBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressStartedOnBackdrop.current) onClose()
        pressStartedOnBackdrop.current = false
      }}
    >
      {open && (
        <div className="dj-dialog__sheet">
          <header className="dj-dialog__header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="dj-dialog__close" aria-label="Fermer" onClick={onClose}>
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          <div className="dj-dialog__body">{children}</div>
        </div>
      )}
    </dialog>
  )
}
