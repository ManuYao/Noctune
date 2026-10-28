import { useState } from 'react'
import { Link } from 'react-router'
import { LINEUP_MAX, type DjQueue, type QueuedTrack, type RoomRules, type Track } from '../../shared/protocol'
import { useServerNow } from '../player/useServerNow'
import { djCount, estimateWaitSec, findMyPlace } from '../realtime/djQueue'
import { djErrorMessage, turnMessage } from '../realtime/djMessages'
import type { SendDjResult } from '../realtime/useRoom'
import LeaveQueueDialog from './LeaveQueueDialog'
import './DjBarAction.css'

interface DjBarActionProps {
  rules: RoomRules
  queue: DjQueue
  selfId: string | undefined
  /** Signed in, as the server sees it: only members can be DJs. */
  isMember: boolean
  /** The viewer's own tracks, in the order they will play. */
  lineup: QueuedTrack[]
  nowPlaying: Track | null
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
  /** Opens "Passer DJ" (the viewer's tracks, once in the queue). */
  onOpen: () => void
  onLeave: () => Promise<SendDjResult>
  /** A note in the corner, when leaving did not work. */
  onNote: (text: string) => void
}

const ordinal = (rank: number) => (rank === 1 ? '1er' : `${rank}e`)

/**
 * "Passer DJ" at the right end of the bar, as in mock-ups 3 and 3b, with its note under it: locked for a visitor (it
 * leads to signing in, in a new tab so that the room plays on), "+ Passer DJ" for a member, "− Quitter la file" once
 * in it "Ajouter un morceau" (to chain several), with "Quitter la file" demoted to an outline beside the note. Rendered as two items of the bar's grid: the button, then the note under the sound and the button.
 */
export default function DjBarAction({
  rules,
  queue,
  selfId,
  isMember,
  lineup,
  nowPlaying,
  clockOffsetMs,
  onOpen,
  onLeave,
  onNote,
}: DjBarActionProps) {
  const serverNow = useServerNow(clockOffsetMs, nowPlaying !== null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const place = findMyPlace(queue, selfId)
  const count = djCount(queue)
  const full = count >= rules.maxDjs

  if (!isMember) {
    return (
      <>
        <Link to="/connexion" target="_blank" rel="noopener noreferrer" className="dj-cta" aria-describedby="dj-cta-note">
          <svg viewBox="0 0 16 18" width="16" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <rect x="2" y="8" width="12" height="8" rx="2" fill="currentColor" />
            <path d="M4.5 8 V5.5 A3.5 3.5 0 0 1 11.5 5.5 V8" />
          </svg>
          Passer DJ<span className="visually-hidden"> : se connecter (nouvel onglet)</span>
        </Link>
        <p id="dj-cta-note" className="dj-cta__note">
          Un compte est requis pour ajouter des vidéos
        </p>
      </>
    )
  }

  if (!place) {
    // Someone who is not in the queue yet would stand behind everybody who waits.
    const waitSec = estimateWaitSec(queue, nowPlaying, serverNow, queue.waiting.length)
    return (
      <>
        <button type="button" className="dj-cta" disabled={full} aria-haspopup="dialog" aria-describedby="dj-cta-note" onClick={onOpen}>
          <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M9 3 V15 M3 9 H15" />
          </svg>
          Passer DJ
        </button>
        <p id="dj-cta-note" className="dj-cta__note">
          {full ? "La file est complète pour l'instant." : turnMessage(null, count, waitSec)}
        </p>
      </>
    )
  }

  // Leaving throws away the tracks lined up; the one that plays goes on to its end (nothing to ask when there is nothing lined up).
  const costs = place.onDecks
    ? (lineup.length > 0 ? "Quitter la file efface tes morceaux en attente. Ton morceau en cours va jusqu'au bout." : null)
    : lineup.length > 0
      ? 'Quitter la file efface tes morceaux en attente.'
      : null
  const noTrack = place.entry.next === null

  async function leave() {
    if (busy) return
    setBusy(true)
    const result = await onLeave()
    setBusy(false)
    setConfirming(false)
    if (!result.ok) onNote(djErrorMessage(result))
  }

  const lineupFull = lineup.length >= LINEUP_MAX

  return (
    <>
      <button
        type="button"
        className="dj-cta"
        disabled={lineupFull}
        aria-haspopup="dialog"
        aria-describedby="dj-cta-note"
        onClick={onOpen}
      >
        <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M9 3 V15 M3 9 H15" />
        </svg>
        {lineupFull ? (
          <>
            {LINEUP_MAX} morceaux au plus<span className="visually-hidden"> : ta file est pleine, retire un morceau pour en ajouter</span>
          </>
        ) : (
          <>
            Ajouter un morceau
            <span className="visually-hidden">
              {' '}
              à ta file ({lineup.length === 0 ? 'aucun morceau prévu' : `${lineup.length} morceau${lineup.length > 1 ? 'x' : ''} prévu${lineup.length > 1 ? 's' : ''}`})
            </span>
          </>
        )}
      </button>
      <p id="dj-cta-note" className="dj-cta__note">
        {noTrack ? (
          <span className="dj-cta__warn">Dernier morceau : ajoutes-en un</span>
        ) : place.onDecks ? (
          'À la console'
        ) : (
          `${ordinal((place.rank ?? 0) + 1)} dans la file`
        )}
        {' · '}
        <button type="button" className="dj-cta__link" aria-haspopup="dialog" onClick={onOpen}>
          Mes morceaux ({lineup.length}/{LINEUP_MAX})
        </button>
        <button
          type="button"
          className="dj-cta__leave"
          disabled={busy}
          aria-haspopup={costs ? 'dialog' : undefined}
          onClick={() => (costs ? setConfirming(true) : void leave())}
        >
          Quitter la file
        </button>
      </p>
      {costs && (
        <LeaveQueueDialog open={confirming} costs={costs} busy={busy} onConfirm={() => void leave()} onClose={() => setConfirming(false)} />
      )}
    </>
  )
}
