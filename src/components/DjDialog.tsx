import { useEffect, useRef } from 'react'
import type { DjQueue, QueuedTrack, RoomRules, RoomStyle, Track } from '../../shared/protocol'
import type { SendAddManyResult, SendAddTrackResult, SendDjResult, SendPlaylistStatusResult } from '../realtime/useRoom'
import DjDialogContent from './DjDialogContent'
import { useSheetDrag } from './useSheetDrag'
import './DjDialog.css'

interface DjDialogProps {
  open: boolean
  onClose: () => void
  rules: RoomRules
  queue: DjQueue
  selfId: string | undefined
  lineup: QueuedTrack[]
  nowPlaying: Track | null
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
  /** The room's name and styles: "Accepté dans …" and the chips of its rules. Without them the dialog says "cette room". */
  roomName?: string
  styles?: RoomStyle[]
  onAdd: (input: string) => Promise<SendAddTrackResult>
  onAddFromPlaylist: (playlistTrackId: string) => Promise<SendAddTrackResult>
  onAddManyFromPlaylist: (playlistTrackIds: string[]) => Promise<SendAddManyResult>
  onPlaylistStatus: (playlistId: string) => Promise<SendPlaylistStatusResult>
  onRemove: (trackId: string) => Promise<SendDjResult>
  onLeave: () => Promise<SendDjResult>
}

/**
 * "Passer DJ" (mock-up 3c): a native modal dialog (focus trapped inside, Escape closes it, the page behind is inert). It is always
 * in the page and only its content comes and goes, so that closing it gives the focus back to the button that opened it
 * and so that every opening starts with a clean form.
 */
export default function DjDialog({ open, onClose, ...content }: DjDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  // Whether the press that ends in a click began on the backdrop too. Selecting the text of the link field and letting
  // go over the backdrop is a click on the dialog as well, and must not close it and lose what was typed.
  const pressStartedOnBackdrop = useRef(false)
  // A phone: the sheet can be pulled up (as far as the video allows) to see more of the playlist and of the line-up.
  const sheet = useSheetDrag(dialogRef, open)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // The content has mounted but the dialog was closed until now: the browser could not focus the field before.
      // Not on a touch screen: the keyboard would rise at once and cover most of the sheet before anything is read.
      if (!window.matchMedia('(pointer: coarse)').matches) dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="dj-dialog dj-dialog--dj"
      aria-labelledby="dj-dialog-title"
      aria-describedby="dj-dialog-sub"
      // Escape, and the close() above: the page's own state follows.
      onClose={onClose}
      // The sheet fills the whole dialog, so a press that lands on the dialog itself is a press on the backdrop.
      onPointerDown={(event) => {
        pressStartedOnBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressStartedOnBackdrop.current) onClose()
        pressStartedOnBackdrop.current = false
      }}
    >
      {open && <DjDialogContent {...content} onClose={onClose} sheet={sheet} />}
    </dialog>
  )
}
