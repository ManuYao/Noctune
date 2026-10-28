import { useState } from 'react'
import { Link } from 'react-router'
import { LINEUP_MAX, type DjQueue, type QueuedTrack, type RoomRules } from '../../shared/protocol'
import { djCount, findMyPlace } from '../realtime/djQueue'
import { djErrorMessage } from '../realtime/djMessages'
import type { SendDjResult } from '../realtime/useRoom'
import LeaveQueueDialog from './LeaveQueueDialog'
import './DjDock.css'

interface DjDockProps {
  /** `pill`: above the chat field (mock-ups M3, M4). `bar`: the whole width, at the foot of the queue tab (mock-up M3b). */
  variant: 'pill' | 'bar'
  rules: RoomRules
  queue: DjQueue
  selfId: string | undefined
  /** Signed in, as the server sees it: only members can be DJs. */
  isMember: boolean
  /** The viewer's own tracks, in the order they will play. */
  lineup: QueuedTrack[]
  /** Opens "Passer DJ" (the viewer's tracks, once in the queue). */
  onOpen: () => void
  onLeave: () => Promise<SendDjResult>
  /** A note in the corner, when leaving did not work. */
  onNote: (text: string) => void
}

const ordinal = (rank: number) => (rank === 1 ? '1er' : `${rank}e`)

function Lock() {
  return (
    <svg viewBox="0 0 16 18" width="14" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <rect x="2" y="8" width="12" height="8" rx="2" fill="currentColor" />
      <path d="M4.5 8 V5.5 A3.5 3.5 0 0 1 11.5 5.5 V8" />
    </svg>
  )
}

/**
 * The way into "Passer DJ" on a phone (the bar has no room for it, see DjBarAction for a computer): locked for a visitor (it
 * leads to signing in, in a new tab so that the room plays on), "+ Passer DJ" for a member, and once in the queue the place
 * in it above the chat field, "Ajouter un morceau" and "Quitter la file" at the foot of the queue tab.
 */
export default function DjDock({ variant, rules, queue, selfId, isMember, lineup, onOpen, onLeave, onNote }: DjDockProps) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const place = findMyPlace(queue, selfId)
  const full = djCount(queue) >= rules.maxDjs
  const classes = `dj-dock dj-dock--${variant}`

  if (!isMember) {
    return (
      <Link to="/connexion" target="_blank" rel="noopener noreferrer" className={`${classes} dj-dock--locked`}>
        <Lock />
        Passer DJ · compte requis<span className="visually-hidden"> : se connecter (nouvel onglet)</span>
      </Link>
    )
  }

  if (!place) {
    return (
      <button type="button" className={`${classes} dj-dock--add`} disabled={full} aria-haspopup="dialog" onClick={onOpen}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M8 3 V13 M3 8 H13" />
        </svg>
        {full ? 'File complète' : 'Passer DJ'}
      </button>
    )
  }

  if (variant === 'pill') {
    return (
      <button type="button" className={`${classes} dj-dock--mine`} aria-haspopup="dialog" onClick={onOpen}>
        {place.onDecks ? 'À la console' : `${ordinal((place.rank ?? 0) + 1)} dans la file`} · Mes morceaux ({lineup.length})
      </button>
    )
  }

  // Leaving throws away the tracks lined up, and cuts the one that plays when it is the viewer's own.
  const costs = place.onDecks
    ? 'Quitter la file coupe ton morceau en cours et efface tes morceaux en attente.'
    : lineup.length > 0
      ? 'Quitter la file efface tes morceaux en attente.'
      : null

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
    <div className="dj-dock-row">
      <button type="button" className={`${classes} dj-dock--add`} disabled={lineupFull} aria-haspopup="dialog" onClick={onOpen}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M8 3 V13 M3 8 H13" />
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
      <button
        type="button"
        className={`${classes} dj-dock--leave`}
        disabled={busy}
        aria-haspopup={costs ? 'dialog' : undefined}
        onClick={() => (costs ? setConfirming(true) : void leave())}
      >
        Quitter la file
      </button>
      {costs && <LeaveQueueDialog open={confirming} costs={costs} busy={busy} onConfirm={() => void leave()} onClose={() => setConfirming(false)} />}
    </div>
  )
}
