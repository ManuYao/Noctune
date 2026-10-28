import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { UPCOMING_MAX } from '../../shared/protocol'
import type { DjQueue, RoomRules, Track } from '../../shared/protocol'
import { trackPositionSec } from '../../shared/clock'
import { formatWaitShort } from '../data/duration'
import { useServerNow } from '../player/useServerNow'
import { djCount, estimateWaitSec, findMyPlace } from '../realtime/djQueue'
import { turnMessage } from '../realtime/djMessages'
import DjQueueRow from './DjQueueRow'
import UpcomingRow from './UpcomingRow'
import '../pages/PageKit.css'
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
  /**
   * A phone: the panel is the whole tab (mock-up M3b). The list scrolls above `dock`, the way in ("Passer DJ", "Quitter
   * la file") at its foot, where the bar has no room for it. On a computer it is at the end of the bar, as in the mock-ups.
   */
  showCta: boolean
  dock?: ReactNode
}

export default function DjQueuePanel({
  queue,
  rules,
  selfId,
  isMember,
  nowPlaying,
  clockOffsetMs,
  showCta,
  dock,
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
  // Nothing lined up behind the track on the decks: when it ends the viewer is no longer a DJ. The warning replaces the
  // sentence about the turn: it matters more, and the footer stays one row.
  const status = !isMember
    ? null
    : noTrack
      ? "C'est ton dernier morceau : ajoutes-en un pour rester DJ."
      : place === null && full
        ? 'La file est complète : réessaie quand un DJ sera parti.'
        : turnMessage(place, count, waitSec)

  // The list is a scroll box. Its edges fade where more rows hide, so that a cut row reads as "there is more" and not as
  // a mistake; it takes the keyboard focus only when there is something to scroll.
  const listRef = useRef<HTMLDivElement>(null)
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

  // A phone: the rows and the notes scroll as one. The viewer's own row is brought into view when their place changes, and
  // when the tab is shown (a hidden tab has no size, so that cannot be done while it is hidden).
  const scrollRef = useRef<HTMLDivElement>(null)
  const revealOwn = useCallback(() => {
    const scroll = scrollRef.current
    const target = scroll?.querySelector<HTMLElement>('.dj-row--self')
    if (!scroll || !target) return
    const box = scroll.getBoundingClientRect()
    const row = target.getBoundingClientRect()
    if (row.bottom > box.bottom) scroll.scrollTop += row.bottom - box.bottom + 8
    else if (row.top < box.top) scroll.scrollTop -= box.top - row.top + 8
  }, [])
  useEffect(() => {
    if (showCta) revealOwn()
  }, [showCta, placeKey, queue.upcoming.length, revealOwn])
  useEffect(() => {
    const scroll = scrollRef.current
    if (!showCta || !scroll) return
    let shown = scroll.clientHeight > 0
    const observer = new ResizeObserver(() => {
      const nowShown = scroll.clientHeight > 0
      if (nowShown && !shown) revealOwn()
      shown = nowShown
    })
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [showCta, revealOwn])

  // The order to come, as the server plays it. The "⋯" sits on the first track of each waiting DJ: that is the one a report
  // or the host's action points at. An absent DJ is not in it: they are passed over, so the times are what will happen.
  const remainingSec = nowPlaying ? Math.max(0, nowPlaying.durationSec - trackPositionSec(nowPlaying, serverNow)) : 0
  const upcomingRows: ReactNode[] = []
  {
    const seen = new Set<string>()
    let eta = remainingSec
    for (const item of queue.upcoming) {
      const entry = queue.waiting.find((candidate) => candidate.id === item.entryId)
      const first = !seen.has(item.entryId)
      seen.add(item.entryId)
      const aims = first && entry?.next?.id === item.track.id
      upcomingRows.push(
        <UpcomingRow
          key={item.track.id}
          item={item}
          isSelf={place?.entry.id === item.entryId}
          etaSec={eta}
          action={aims && entry ? { entryId: entry.id, trackId: item.track.id, participantId: entry.participantId } : null}
        />,
      )
      eta += item.track.durationSec
    }
  }

  const body = (
    <>
      <header className="dj-queue__header">
        <h2 id="dj-queue-title">File d'attente</h2>
        <p className={full ? 'dj-queue__slots dj-queue__slots--full' : 'dj-queue__slots'}>
          {full
            ? `File complète · ${count}/${rules.maxDjs}`
            : count === 0
              ? `Place DJ libre · 0/${rules.maxDjs}`
              : showCta && selfWait
                ? `Ton tour dans ${selfWait}`
                : `Attente estimée : ${formatWaitShort(newcomerWait)}`}
        </p>
      </header>

      {count === 0 ? (
        <p className="dj-queue__empty">Personne à la console : la room joue sa propre sélection.</p>
      ) : (
        <div
          ref={listRef}
          className="dj-queue__list"
          role="group"
          aria-label="Ordre de passage"
          data-above={overflow.above}
          data-below={overflow.below}
          tabIndex={overflow.above || overflow.below ? 0 : undefined}
          onScroll={updateOverflow}
        >
          {queue.current && (
            <ol className="dj-queue__upcoming" aria-label="En cours">
              <DjQueueRow
                entry={queue.current}
                rank={null}
                isSelf={queue.current.participantId === selfId}
                nowPlaying={nowPlaying}
                selfWait={null}
              />
            </ol>
          )}
          <h3 className="dj-queue__sub">À suivre</h3>
          {queue.upcoming.length === 0 ? (
            <p className="dj-queue__note">
              {queue.current
                ? 'Rien de prévu après ce morceau : la room jouera sa sélection.'
                : 'Rien de prévu : la room joue sa sélection.'}
            </p>
          ) : (
            <ol className="dj-queue__upcoming" aria-label="Morceaux à venir, dans l'ordre">
              {upcomingRows}
            </ol>
          )}
          {queue.upcoming.length >= UPCOMING_MAX && (
            <p className="dj-queue__note">Seuls les {UPCOMING_MAX} prochains morceaux sont affichés.</p>
          )}
        </div>
      )}

      {/* A phone: the viewer's own tracks are already in the order above ("toi"); the dock below leads to all of them. */}
      {showCta && isMember && status && (
        <p className={noTrack ? 'dj-queue__status dj-queue__status--warn' : 'dj-queue__status'}>{status}</p>
      )}
      {showCta && !isMember && (
        <div id="dj-queue-locked" className="dj-queue__locked">
          {/* New tabs: the room, and its player, keep going while the visitor signs in. */}
          <Link to="/inscription" target="_blank" rel="noopener noreferrer" className="kit-btn">
            Créer un compte<span className="visually-hidden"> (nouvel onglet)</span>
          </Link>
          <Link to="/connexion" target="_blank" rel="noopener noreferrer" className="kit-btn kit-btn--ghost">
            Se connecter<span className="visually-hidden"> (nouvel onglet)</span>
          </Link>
        </div>
      )}
    </>
  )

  if (showCta) {
    return (
      <section className="dj-queue dj-queue--phone" aria-labelledby="dj-queue-title">
        <div ref={scrollRef} className="dj-queue__scroll">{body}</div>
        <div className="dj-queue__dock">{dock}</div>
      </section>
    )
  }
  return (
    <section className="dj-queue" aria-labelledby="dj-queue-title">
      {body}
    </section>
  )
}
