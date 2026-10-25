import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { PASSWORD_MAX } from '../../shared/protocol'
import type { AccountDoneResult } from '../auth/accountApi'
import { authMessage } from '../auth/authMessages'
import './AccountDialog.css'

/** What the member has to write to confirm: nobody deletes an account by pressing Enter on a habit. */
const CONFIRM_WORD = 'SUPPRIMER'

interface DeleteAccountDialogProps {
  open: boolean
  /** A request is on its way: the dialog cannot be left until it is answered. */
  busy: boolean
  onClose: () => void
  /** Resolves with the server's answer; on success the page leaves, on a refusal the dialog says why. */
  onConfirm: (password: string) => Promise<AccountDoneResult>
}

/**
 * "Supprimer mon compte": a native modal dialog (focus trapped inside, Escape closes it, the page behind is inert).
 * Always in the page, its content comes and goes, so that each opening starts with a clean form and closing gives the
 * focus back to the button that opened it.
 */
export default function DeleteAccountDialog({ open, busy, onClose, onConfirm }: DeleteAccountDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Whether the press that ends in a click began on the backdrop too: selecting text and letting go over the backdrop
  // is a click on the dialog as well, and must not close it.
  const pressStartedOnBackdrop = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // Not on a touch screen: the keyboard would rise at once and cover most of the text before anything is read.
      if (!window.matchMedia('(pointer: coarse)').matches) dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="account-dialog"
      aria-labelledby="delete-account-title"
      // Escape: not while the account is being deleted.
      onCancel={(event) => {
        if (busy) event.preventDefault()
      }}
      onClose={onClose}
      onPointerDown={(event) => {
        pressStartedOnBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget && pressStartedOnBackdrop.current) onClose()
        pressStartedOnBackdrop.current = false
      }}
    >
      {open && <DeleteAccountForm busy={busy} onClose={onClose} onConfirm={onConfirm} />}
    </dialog>
  )
}

function DeleteAccountForm({ busy, onClose, onConfirm }: Omit<DeleteAccountDialogProps, 'open'>) {
  const [password, setPassword] = useState('')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const confirmed = password.length > 0 && typed.trim().toUpperCase() === CONFIRM_WORD

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy || !confirmed) return
    setError('')
    const result = await onConfirm(password)
    // On success the page has left; what is left to say is a refusal.
    if (!result.ok) setError(authMessage(result))
  }

  return (
    <form className="account-dialog__sheet" onSubmit={handleSubmit} noValidate>
      <h2 id="delete-account-title">Supprimer ton compte ?</h2>
      <p>Cette action est définitive, on ne peut pas revenir en arrière. Elle supprime :</p>
      <ul>
        <li>ton compte, ton pseudo et ton adresse e-mail ;</li>
        <li>toutes tes playlists ;</li>
        <li>les rooms que tu animes : les personnes qui s'y trouvent seront renvoyées vers la liste des rooms.</li>
      </ul>

      <label htmlFor="delete-account-password">Ton mot de passe</label>
      <input
        id="delete-account-password"
        data-autofocus
        type="password"
        autoComplete="current-password"
        maxLength={PASSWORD_MAX}
        value={password}
        onChange={(event) => {
          setPassword(event.target.value)
          setError('')
        }}
      />

      <label htmlFor="delete-account-confirm">
        Pour confirmer, écris <strong>{CONFIRM_WORD}</strong>
      </label>
      <input
        id="delete-account-confirm"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
      />

      <p className="account-dialog__error" role="alert">
        {error}
      </p>

      <div className="account-dialog__actions">
        <button type="submit" className="account-dialog__danger" disabled={!confirmed || busy}>
          {busy ? 'Suppression…' : 'Supprimer pour de bon'}
        </button>
        <button type="button" className="account-dialog__keep" disabled={busy} onClick={onClose}>
          Garder mon compte
        </button>
      </div>
    </form>
  )
}
