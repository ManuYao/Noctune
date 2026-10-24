import { useEffect } from 'react'
import { djNoticeMessage } from '../realtime/djMessages'
import type { RoomNotice } from '../realtime/useRoom'
import './DjNotices.css'

interface DjNoticesProps {
  notices: RoomNotice[]
  onDismiss: (id: number) => void
}

// Long enough to read a sentence, short enough not to stay over the chat field and the audience.
const READ_TIME_MS = 8000

function Notice({ notice, onDismiss }: { notice: RoomNotice; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(notice.id), READ_TIME_MS)
    return () => window.clearTimeout(timer)
  }, [notice.id, onDismiss])

  return (
    <li className="dj-notices__item">
      <p>{djNoticeMessage(notice.notice)}</p>
      <button type="button" aria-label="Fermer ce message" onClick={() => onDismiss(notice.id)}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>
    </li>
  )
}

/**
 * What the server tells a DJ about their own turn (a track taken out, a turn skipped, a place lost). Small notes in a
 * corner of the window, never over the video: YouTube requires its player to stay unobstructed.
 * The region is always in the page, so that a screen reader reads each note as it arrives.
 */
export default function DjNotices({ notices, onDismiss }: DjNoticesProps) {
  return (
    <div className="dj-notices" role="status" aria-live="polite">
      <ul>
        {notices.map((notice) => (
          <Notice key={notice.id} notice={notice} onDismiss={onDismiss} />
        ))}
      </ul>
    </div>
  )
}
