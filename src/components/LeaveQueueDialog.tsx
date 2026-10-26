import ModDialog from '../moderation/ModDialog'

interface LeaveQueueDialogProps {
  open: boolean
  /** What leaving throws away, in a sentence ("Quitter la file efface tes morceaux en attente."). */
  costs: string
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}

/** "Quitter la file" from the bar, when it would cost something: the same question as in "Passer DJ", in a small window. */
export default function LeaveQueueDialog({ open, costs, busy, onConfirm, onClose }: LeaveQueueDialogProps) {
  return (
    <ModDialog open={open} onClose={onClose} titleId="leave-queue-title" title="Quitter la file ?">
      <p className="mod-hint">{costs}</p>
      <div className="mod-actions__row">
        <button type="button" className="mod-btn mod-btn--danger" disabled={busy} onClick={onConfirm}>
          Quitter la file
        </button>
        {/* The answer that loses nothing has the focus. */}
        <button type="button" className="mod-btn" data-autofocus="" onClick={onClose}>
          Rester
        </button>
      </div>
    </ModDialog>
  )
}
