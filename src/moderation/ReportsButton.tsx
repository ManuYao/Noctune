import { useModeration } from './moderationContext'
import './Moderation.css'

/** The host's way into the inbox, in the header of the room. Nothing for anybody else. */
export default function ReportsButton() {
  const api = useModeration()
  if (!api?.isHost) return null
  const waiting = api.reports.length

  return (
    <button
      type="button"
      className="room__settings room__reports"
      aria-haspopup="dialog"
      onClick={api.openInbox}
    >
      Signalements
      {waiting > 0 && (
        <>
          <span className="room__reports-count" aria-hidden="true">
            {waiting}
          </span>
          <span className="visually-hidden"> ({waiting} en attente)</span>
        </>
      )}
    </button>
  )
}
