import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { DjQueue, RoomRules, Track } from '../../shared/protocol'
import { formatWaitShort } from '../data/duration'
import { useServerNow } from '../player/useServerNow'
import { djCount, estimateWaitSec, findMyPlace } from '../realtime/djQueue'
import { turnMessage } from '../realtime/djMessages'
import DjQueueRow from './DjQueueRow'
import './DjQueuePanel.css'

interface DjQueuePanelProps {
  queue: DjQueue
  rules: RoomRules
  selfId: string | undefined
  /** Signed in: only members can be DJs. */
  isMember: boolean
  nowPlaying: Track | null
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
  /** How many tracks the viewer has lined up. */
  lineupSize: number
  /**
   * The way in ("Passer DJ", "Mes morceaux") under the list: on a phone, where the bar has no room for it. On a computer
   * it is at the end of the bar, as in the mock-ups.
   */
  showCta: boolean
  onOpen: () => void
}

export default function DjQueuePanel({
  queue,
  rules,
  selfId,
  isMember,
  nowPlaying,
  clockOffsetMs,
  lineupSize,
  showCta,
  onOpen,
}: DjQueuePanelProps) {
  const serverNow = useServerNow(clockOffsetMs, nowPlaying !== null)
  const place = findMyPlace(queue, selfId)
  const count = djCount(queue)
  const full = count >= rules.maxDjs
  // Someone who is not in the queue yet would stand behind everybody who waits.
  const waitSec = estimateWaitSec(queue, nowPlaying, serverNow, place?.position ?? queue.waiting.length)
  // The wait of a newcomer, in the header: behind everybody who waits.
  const newcomerWait = estimateWaitSec(queue, nowPlaying, serverNow, queue.waiting.length)
  const selfWait = place && !place.onDecks ? formatWaitShort(waitSec) : null

  const noTrack = place !== null && place.entry.next === null
  // Without a track the warning replaces the sentence about the turn: it matters more, and the footer stays one row.
  const status = !isMember
    ? null
    : noTrack
      ? 'Sans morceau, ton tour sera passé : ajoutes-en un.'
      : place === null && full
        ? 'La file est complète : réessaie quand un DJ sera parti.'
        : turnMessage(place, count, waitSec)

  // The list is a scroll box. Its edges fade where more rows hide, so that a cut row reads as "there is more" and not as
  // a mistake; it takes the keyboard focus only when there is something to scroll.
  const listRef = useRef<HTMLOListElement>(null)
  const [overflow, setOverflow] = useState({ above: false, below: false })
  const updateOverflow = useCallback(() => {
    const list = listRef.current
    if (!list) return
    const above = list.scrollTop > 2
    const below = list.scrollHeight - list.scrollTop - list.clientHeight > 2
    setOverflow((previous) => (previous.above === above && previous.below === below ? previous : { above, below }))
  }, [])
  // Only the list scrolls: the page is left where it is.
  const keepSelfInView = useCallback(() => {
    const list = listRef.current
    const row = list?.querySelector<HTMLElement>('.dj-row--self')
    if (!list || !row) return
    const listBox = list.getBoundingClientRect()
    const rowBox = row.getBoundingClientRect()
    if (rowBox.top < listBox.top) list.scrollTop -= listBox.top - rowBox.top
    else if (rowBox.bottom > listBox.bottom) list.scrollTop += rowBox.bottom - listBox.bottom
  }, [])
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    // The window changed shape: the box is taller or shorter, and the viewer's row must not end up cut.
    const observer = new ResizeObserver(() => {
      keepSelfInView()
      updateOverflow()
    })
    observer.observe(list)
    return () => observer.disconnect()
  }, [updateOverflow, keepSelfInView, count])
  // Rows come and go without the box changing size.
  useEffect(updateOverflow, [queue, updateOverflow])

  // When the viewer's own place changes (they joined, moved up, reached the decks), their row is brought into view.
  const placeKey = place ? `${place.onDecks}-${place.position}` : ''
  useEffect(keepSelfInView, [placeKey, keepSelfInView])

  return (
    <section className="dj-queue" aria-labelledby="dj-queue-title">
      <header className="dj-queue__header">
        <h2 id="dj-queue-title">File d'attente</h2>
        <p className={full ? 'dj-queue__slots dj-queue__slots--full' : 'dj-queue__slots'}>
          {full
            ? `File complète · ${count}/${rules.maxDjs}`
            : count === 0
              ? `Place DJ libre · 0/${rules.maxDjs}`
              : `Attente estimée : ${formatWaitShort(newcomerWait)}`}
        </p>
      </header>

      {count === 0 ? (
        <p className="dj-queue__empty">Personne à la console : la room joue sa propre sélection.</p>
      ) : (
        <ol
          ref={listRef}
          className="dj-queue__list"
          role="list"
          aria-label="Ordre de passage des DJ"
          data-above={overflow.above}
          data-below={overflow.below}
          tabIndex={overflow.above || overflow.below ? 0 : undefined}
          onScroll={updateOverflow}
        >
          {queue.current && (
            <DjQueueRow
              entry={queue.current}
              rank={null}
              isSelf={queue.current.participantId === selfId}
              nowPlaying={nowPlaying}
              selfWait={null}
            />
          )}
          {queue.waiting.map((entry, index) => {
            const isSelf = entry.participantId !== null && entry.participantId === selfId
            return (
              <DjQueueRow
                key={entry.id}
                entry={entry}
                rank={index + 1}
                isSelf={isSelf}
                nowPlaying={nowPlaying}
                selfWait={isSelf ? selfWait : null}
              />
            )
          })}
        </ol>
      )}

      {showCta &&
        (isMember ? (
          <div className="dj-queue__footer">
            <p className={noTrack ? 'dj-queue__status dj-queue__status--warn' : 'dj-queue__status'}>{status}</p>
            <button type="button" className="dj-queue__cta" disabled={place === null && full} onClick={onOpen}>
              {place ? `Mes morceaux (${lineupSize})` : full ? 'File complète' : 'Passer DJ'}
            </button>
          </div>
        ) : (
          <div className="dj-queue__footer dj-queue__footer--locked">
            <button type="button" className="dj-queue__cta" disabled aria-describedby="dj-queue-locked">
              Passer DJ · compte requis
            </button>
            <p id="dj-queue-locked" className="dj-queue__locked">
              {/* New tabs: the room, and its player, keep going while the visitor signs in. */}
              <Link to="/connexion" target="_blank" rel="noopener noreferrer">
                Se connecter<span className="visually-hidden"> (nouvel onglet)</span>
              </Link>
              {' · '}
              <Link to="/inscription" target="_blank" rel="noopener noreferrer">
                Créer un compte<span className="visually-hidden"> (nouvel onglet)</span>
              </Link>
            </p>
          </div>
        ))}
    </section>
  )
}
