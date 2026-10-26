interface MoreButtonProps {
  /** What it opens, said for people who cannot see the dots ("Actions sur le message de Léa"). */
  label: string
  onClick: () => void
  className?: string
}

/** The "⋯" that opens the actions of a message, a track or a person: report it, or (for the host) act on it. */
export default function MoreButton({ label, onClick, className }: MoreButtonProps) {
  return (
    <button type="button" className={className ? `mod-more ${className}` : 'mod-more'} aria-label={label} aria-haspopup="dialog" onClick={onClick}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <circle cx="5" cy="12" r="2" fill="currentColor" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
        <circle cx="19" cy="12" r="2" fill="currentColor" />
      </svg>
    </button>
  )
}
