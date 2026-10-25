import { useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import {
  DJ_INPUT_MAX,
  LINEUP_MAX,
  type DjQueue,
  type QueuedTrack,
  type RoomRules,
  type Track,
} from '../../shared/protocol'
import { formatClock, formatSpan } from '../data/duration'
import { useServerNow } from '../player/useServerNow'
import { keepInPlaylist } from '../playlists/keepInPlaylist'
import { djCount, estimateWaitSec, findMyPlace } from '../realtime/djQueue'
import { djErrorMessage, turnMessage } from '../realtime/djMessages'
import type { SendAddTrackResult, SendDjResult, SendPlaylistStatusResult } from '../realtime/useRoom'
import DjPlaylistTab from './DjPlaylistTab'

interface DjDialogContentProps {
  rules: RoomRules
  queue: DjQueue
  selfId: string | undefined
  /** The viewer's own tracks, in the order they will play. */
  lineup: QueuedTrack[]
  nowPlaying: Track | null
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
  onAdd: (input: string) => Promise<SendAddTrackResult>
  onAddFromPlaylist: (playlistTrackId: string) => Promise<SendAddTrackResult>
  onPlaylistStatus: (playlistId: string) => Promise<SendPlaylistStatusResult>
  onRemove: (trackId: string) => Promise<SendDjResult>
  onLeave: () => Promise<SendDjResult>
  onClose: () => void
}

type Busy = 'add' | 'remove' | 'leave'
type Tab = 'playlist' | 'link'

// A touch screen raises its keyboard when a field takes the focus: only mouse and keyboard users get it moved for them.
const touchScreen = () => window.matchMedia('(pointer: coarse)').matches

const TABS: { id: Tab; label: string }[] = [
  { id: 'playlist', label: 'Ma playlist' },
  { id: 'link', label: 'Lien' },
]

export default function DjDialogContent({
  rules,
  queue,
  selfId,
  lineup,
  nowPlaying,
  clockOffsetMs,
  onAdd,
  onAddFromPlaylist,
  onPlaylistStatus,
  onRemove,
  onLeave,
  onClose,
}: DjDialogContentProps) {
  const serverNow = useServerNow(clockOffsetMs, nowPlaying !== null)
  const place = findMyPlace(queue, selfId)
  const count = djCount(queue)
  const waitSec = estimateWaitSec(queue, nowPlaying, serverNow, place?.position ?? queue.waiting.length)

  const [tab, setTab] = useState<Tab>('playlist')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState<Busy | null>(null)
  const [error, setError] = useState('')
  // Which part of the dialog the error is about: the link field is only marked invalid for its own mistakes.
  const [errorFromLink, setErrorFromLink] = useState(false)
  const [done, setDone] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)
  // The last link that was lined up, which can be kept in a playlist; and how many times something was kept (the
  // playlist tab reads its list again when that goes up).
  const [lastAdded, setLastAdded] = useState<QueuedTrack | null>(null)
  const [keeping, setKeeping] = useState(false)
  const [keptVersion, setKeptVersion] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // What the room would answer about a playlist track depends on what plays and on what the member already lined up.
  const refreshKey = `${nowPlaying?.id ?? ''}|${queue.current?.id ?? ''}|${lineup.map((track) => track.id).join(',')}`

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const link = input.trim()
    setDone('')
    setLastAdded(null)
    setErrorFromLink(true)
    if (link === '') {
      setError("Colle le lien d'une vidéo YouTube.")
      if (!touchScreen()) inputRef.current?.focus()
      return
    }

    setBusy('add')
    setError('')
    const result = await onAdd(link)
    setBusy(null)
    if (result.ok) {
      setInput('')
      setDone(`« ${result.track.title} » est dans ta file.`)
      setLastAdded(result.track)
    } else {
      setError(djErrorMessage(result))
    }
    // Ready for the next link, or to fix this one.
    if (!touchScreen()) inputRef.current?.focus()
  }

  async function handleAddFromPlaylist(playlistTrackId: string) {
    if (busy) return
    setBusy('add')
    setError('')
    setErrorFromLink(false)
    setDone('')
    setLastAdded(null)
    const result = await onAddFromPlaylist(playlistTrackId)
    setBusy(null)
    if (result.ok) setDone(`« ${result.track.title} » est dans ta file.`)
    else setError(djErrorMessage(result))
  }

  async function handleKeep() {
    if (!lastAdded || keeping) return
    setKeeping(true)
    setError('')
    setErrorFromLink(false)
    const result = await keepInPlaylist(lastAdded.videoId)
    setKeeping(false)
    if (result.ok) {
      setDone(`« ${lastAdded.title} » est gardé dans « ${result.playlistName} ».`)
      setLastAdded(null)
      setKeptVersion((version) => version + 1)
    } else if (result.error === 'already') {
      setDone(`« ${lastAdded.title} » est déjà dans « ${result.playlistName} ».`)
      setLastAdded(null)
    } else {
      setError(result.message)
    }
  }

  async function handleRemove(track: QueuedTrack) {
    if (busy) return
    setBusy('remove')
    setError('')
    setDone('')
    const result = await onRemove(track.id)
    setBusy(null)
    if (result.ok) setDone(`« ${track.title} » a été retiré de ta file.`)
    else setError(djErrorMessage(result))
    // The button that was pressed is gone from the list: keep the focus somewhere useful.
    if (!touchScreen()) inputRef.current?.focus()
  }

  async function handleLeave() {
    if (busy) return
    setBusy('leave')
    setError('')
    const result = await onLeave()
    setBusy(null)
    if (result.ok) {
      onClose()
    } else {
      setConfirmLeave(false)
      setError(djErrorMessage(result))
    }
  }

  function handleTabKeys(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((candidate) => candidate.id === tab)
    let target: number
    if (event.key === 'ArrowRight') target = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') target = (index + TABS.length - 1) % TABS.length
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = TABS.length - 1
    else return
    event.preventDefault()
    setTab(TABS[target].id)
    document.getElementById(`dj-tab-${TABS[target].id}`)?.focus()
  }

  // Leaving throws away the tracks lined up, and cuts the one that plays when it is the viewer's own.
  const leaveCosts = place?.onDecks
    ? 'Quitter la file coupe ton morceau en cours et efface tes morceaux en attente.'
    : lineup.length > 0
      ? 'Quitter la file efface tes morceaux en attente.'
      : null

  return (
    <div className="dj-dialog__sheet">
      <header className="dj-dialog__header">
        <h2 id="dj-dialog-title">{place ? 'Ma file de DJ' : 'Passer DJ'}</h2>
        <button type="button" className="dj-dialog__close" aria-label="Fermer" onClick={onClose}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <div className="dj-dialog__body">
        <section aria-labelledby="dj-rules-title">
          <h3 id="dj-rules-title">Règles de cette room</h3>
          <dl className="dj-dialog__rules">
            <div>
              <dt>Durée maximale d'un morceau</dt>
              <dd>{rules.maxTrackSec === null ? 'Sans limite' : formatSpan(rules.maxTrackSec)}</dd>
            </div>
            <div>
              <dt>Retour d'un même morceau</dt>
              <dd>{rules.repeatDelaySec === null ? 'Jamais' : `Après ${formatSpan(rules.repeatDelaySec)}`}</dd>
            </div>
            <div>
              <dt>DJ dans la file</dt>
              <dd>
                {count} sur {rules.maxDjs}
              </dd>
            </div>
          </dl>
          <p className="dj-dialog__turn">
            {place === null && count >= rules.maxDjs
              ? 'La file est complète : réessaie quand un DJ sera parti.'
              : turnMessage(place, count, waitSec)}
          </p>
        </section>

        <section aria-label="Choisir un morceau">
          <div className="dj-tabs" role="tablist" aria-label="Où choisir ton morceau" onKeyDown={handleTabKeys}>
            {TABS.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                role="tab"
                id={`dj-tab-${candidate.id}`}
                className="dj-tabs__tab"
                // The dialog puts the focus here when it opens (a mouse or keyboard user goes on from the tabs).
                data-autofocus={tab === candidate.id ? '' : undefined}
                aria-selected={tab === candidate.id}
                aria-controls={`dj-panel-${candidate.id}`}
                tabIndex={tab === candidate.id ? 0 : -1}
                onClick={() => setTab(candidate.id)}
              >
                {candidate.label}
              </button>
            ))}
          </div>

          {/* Both panels stay in the page: what was typed, and the playlist that was read, are still there on coming back. */}
          <div role="tabpanel" id="dj-panel-playlist" aria-labelledby="dj-tab-playlist" hidden={tab !== 'playlist'} className="dj-dialog__panel">
            <DjPlaylistTab
              inQueue={place !== null}
              busy={busy !== null}
              refreshKey={refreshKey}
              keptVersion={keptVersion}
              onAdd={(playlistTrackId) => void handleAddFromPlaylist(playlistTrackId)}
              onPlaylistStatus={onPlaylistStatus}
              onShowLink={() => {
                setTab('link')
                // The button that was pressed is in the panel that goes away: the focus must not be lost with it. The link
                // field takes it on a computer; on a touch screen that would raise the keyboard, so the tab does.
                window.setTimeout(() => (touchScreen() ? document.getElementById('dj-tab-link') : inputRef.current)?.focus(), 0)
              }}
            />
          </div>

          <div role="tabpanel" id="dj-panel-link" aria-labelledby="dj-tab-link" hidden={tab !== 'link'} className="dj-dialog__panel">
            <form className="dj-dialog__form" onSubmit={handleSubmit} noValidate>
              <label htmlFor="dj-link">Lien YouTube</label>
              <div className="dj-dialog__field">
                <input
                  ref={inputRef}
                  id="dj-link"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={DJ_INPUT_MAX}
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={input}
                  aria-describedby="dj-link-help"
                  aria-invalid={error !== '' && errorFromLink}
                  onChange={(event) => {
                    setInput(event.target.value)
                    setError('')
                    setDone('')
                    setLastAdded(null)
                  }}
                />
                <button type="submit" className="btn-primary" disabled={busy !== null}>
                  {busy === 'add' ? 'Vérification…' : place ? 'Ajouter à ma file' : 'Rejoindre la file'}
                </button>
              </div>
              <p id="dj-link-help" className="dj-dialog__hint">
                Colle l'adresse d'une vidéo YouTube. Elle doit pouvoir être lue en dehors de YouTube.
              </p>
            </form>
            {lastAdded && (
              <div className="dj-dialog__keep">
                <button type="button" disabled={keeping} onClick={() => void handleKeep()}>
                  {keeping ? 'Un instant…' : 'Garder dans ma playlist'}
                </button>
              </div>
            )}
          </div>

          {/* Live regions: always in the page (a screen reader only hears a region it already knew), empty most of the time. */}
          <p className="dj-dialog__feedback dj-dialog__feedback--error" role="alert">
            {error}
          </p>
          <p className="dj-dialog__feedback dj-dialog__feedback--done" role="status">
            {done}
          </p>
        </section>

        <section aria-labelledby="dj-lineup-title">
          <h3 id="dj-lineup-title">
            Mes morceaux{' '}
            <span>
              ({lineup.length}/{LINEUP_MAX})
            </span>
          </h3>
          {lineup.length === 0 ? (
            <p className="dj-dialog__hint">Aucun morceau en attente : choisis-en un dans ta playlist ou colle un lien YouTube pour garder ta place.</p>
          ) : (
            <ol className="dj-dialog__lineup" role="list">
              {lineup.map((track, index) => (
                <li key={track.id}>
                  <span className="dj-dialog__order">{index === 0 ? 'Ton prochain morceau' : `N° ${index + 1}`}</span>
                  <span className="dj-dialog__track">
                    <span className="dj-dialog__title">{track.title}</span>
                    <span className="dj-dialog__meta">
                      {track.artist} · {formatClock(track.durationSec)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="dj-dialog__remove"
                    aria-label={`Retirer « ${track.title} » de ma file`}
                    disabled={busy !== null}
                    onClick={() => void handleRemove(track)}
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        {place && (
          <section className="dj-dialog__leave" aria-label="Quitter la file">
            {confirmLeave && leaveCosts ? (
              <div role="group" aria-label="Confirmer">
                <p>{leaveCosts}</p>
                <div className="dj-dialog__confirm">
                  <button type="button" className="dj-dialog__danger" disabled={busy !== null} onClick={() => void handleLeave()}>
                    Quitter la file
                  </button>
                  <button type="button" onClick={() => setConfirmLeave(false)}>
                    Rester
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => (leaveCosts ? setConfirmLeave(true) : void handleLeave())}
              >
                Quitter la file
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
