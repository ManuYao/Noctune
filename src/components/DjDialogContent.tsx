import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  DJ_INPUT_MAX,
  LINEUP_MAX,
  type DjQueue,
  type PlaylistTrack,
  type QueuedTrack,
  type RoomRules,
  type RoomStyle,
  type Track,
} from '../../shared/protocol'
import { formatClock, formatSpan, formatWait } from '../data/duration'
import { useServerNow } from '../player/useServerNow'
import KeepPicker, { type KeepOutcome } from './KeepPicker'
import { djCount, estimateWaitSec, findMyPlace, type MyPlace } from '../realtime/djQueue'
import { djErrorMessage } from '../realtime/djMessages'
import type { SendAddManyResult, SendAddTrackResult, SendDjResult, SendPlaylistStatusResult } from '../realtime/useRoom'
import { STYLE_LABELS, maxTrackChip } from '../rooms/roomLabels'
import DjPlaylistTab from './DjPlaylistTab'
import TrackCover from './TrackCover'
import { trackVerdict, useDjPlaylist } from './useDjPlaylist'
import { useMediaQuery } from './useMediaQuery'

interface DjDialogContentProps {
  rules: RoomRules
  queue: DjQueue
  selfId: string | undefined
  /** The viewer's own tracks, in the order they will play. */
  lineup: QueuedTrack[]
  nowPlaying: Track | null
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
  /** The room's name and styles, for "Accepté dans …" and the chips of its rules. */
  roomName?: string
  styles?: RoomStyle[]
  onAdd: (input: string) => Promise<SendAddTrackResult>
  onAddFromPlaylist: (playlistTrackId: string) => Promise<SendAddTrackResult>
  /** Several at once: only offered, and only accepted by the server, to a DJ who is alone in the queue. */
  onAddManyFromPlaylist: (playlistTrackIds: string[]) => Promise<SendAddManyResult>
  onPlaylistStatus: (playlistId: string) => Promise<SendPlaylistStatusResult>
  onRemove: (trackId: string) => Promise<SendDjResult>
  onLeave: () => Promise<SendDjResult>
  onClose: () => void
}

type Busy = 'add' | 'remove' | 'leave'
type Tab = 'playlist' | 'link' | 'file'
/** Where "Ton morceau" comes from: a row of the playlist, or the link being typed. */
type Source = 'playlist' | 'link'

// The phone layout (a sheet with tabs): the same breakpoint as the room's.
const PHONE_QUERY = '(max-width: 760px)'

// A touch screen raises its keyboard when a field takes the focus: only mouse and keyboard users get it moved for them.
const touchScreen = () => window.matchMedia('(pointer: coarse)').matches

const TABS: { id: Tab; label: string }[] = [
  { id: 'playlist', label: 'Ma playlist' },
  { id: 'link', label: 'Lien' },
]

/** The sentence under the title (mock-up 3c: "Choisis le morceau que tu lances à ton tour · 3 DJ avant toi, environ 12 min."). */
function turnLine(place: MyPlace | null, queue: DjQueue, maxDjs: number, waitSec: number): string {
  if (place) {
    const lead = 'Ajoute les morceaux de tes prochains tours'
    if (place.onDecks) return `${lead} · tu es à la console.`
    const ahead = (place.position ?? 0) + (queue.current ? 1 : 0)
    return ahead === 0 ? `${lead} · tu es le prochain.` : `${lead} · ${ahead} DJ avant toi, ${formatWait(waitSec)}.`
  }
  const djs = djCount(queue)
  if (djs >= maxDjs) return 'La file est complète : réessaie quand un DJ sera parti.'
  if (djs === 0) return 'Choisis le morceau que tu lances · la file est vide, il démarre tout de suite.'
  return `Choisis le morceau que tu lances à ton tour · ${djs} DJ avant toi, ${formatWait(waitSec)}.`
}

/** The same, short, for the sheet of a phone (mock-up M4: "3 DJ avant toi · environ 12 min"). */
function turnLineShort(place: MyPlace | null, queue: DjQueue, maxDjs: number, waitSec: number): string {
  if (place) {
    if (place.onDecks) return 'Tu es à la console.'
    const ahead = (place.position ?? 0) + (queue.current ? 1 : 0)
    return ahead === 0 ? 'Tu es le prochain.' : `${ahead} DJ avant toi · ${formatWait(waitSec)}`
  }
  const djs = djCount(queue)
  if (djs >= maxDjs) return 'La file est complète : réessaie plus tard.'
  if (djs === 0) return 'La file est vide · ton morceau démarre tout de suite.'
  return `${djs} DJ avant toi · ${formatWait(waitSec)}`
}

/** A link as it reads best on one line: without its scheme nor "www.". */
const shortLink = (link: string) => link.replace(/^https?:\/\//i, '').replace(/^www\./i, '')

function Check() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
      <path d="M2.5 6.2 L5 8.7 L9.5 3.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Plus() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M8 3 V13 M3 8 H13" />
    </svg>
  )
}

/**
 * The inside of "Passer DJ" (mock-up 3c): "Ma playlist" on the left, the link and the member's own tracks lined up on the
 * right, "Ton morceau" at the bottom. A track is chosen first (a row of the playlist, or a link), then the button at
 * the bottom joins the queue with it, or adds it to the tracks already lined up (up to LINEUP_MAX). On a phone the two
 * sources are tabs of a sheet.
 */
export default function DjDialogContent({
  rules,
  queue,
  selfId,
  lineup,
  nowPlaying,
  clockOffsetMs,
  roomName,
  styles = [],
  onAdd,
  onAddFromPlaylist,
  onAddManyFromPlaylist,
  onPlaylistStatus,
  onRemove,
  onLeave,
  onClose,
}: DjDialogContentProps) {
  const phone = useMediaQuery(PHONE_QUERY)
  const serverNow = useServerNow(clockOffsetMs, nowPlaying !== null)
  const place = findMyPlace(queue, selfId)
  const waitSec = estimateWaitSec(queue, nowPlaying, serverNow, place?.position ?? queue.waiting.length)

  const [tab, setTab] = useState<Tab>('playlist')
  const [input, setInput] = useState('')
  const [source, setSource] = useState<Source | null>(null)
  // The tracks of the playlist chosen for the queue, in the order they were chosen: one, or several for a DJ who is alone.
  const [pickedIds, setPickedIds] = useState<string[]>([])
  const [busy, setBusy] = useState<Busy | null>(null)
  const [error, setError] = useState('')
  // Which part of the dialog the error is about: the link field is only marked invalid for its own mistakes.
  const [errorFromLink, setErrorFromLink] = useState(false)
  const [done, setDone] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)
  // The last link that was lined up, which can be kept in a playlist; and how many times something was kept (the
  // playlist reads its tracks again when that goes up).
  const [lastAdded, setLastAdded] = useState<QueuedTrack | null>(null)
  // The playlist chooser under "Garder dans une playlist": open only after a press, so nothing is kept by accident.
  const [keepOpen, setKeepOpen] = useState(false)
  const [keptVersion, setKeptVersion] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // What the room would answer about a playlist track depends on what plays and on what the member already lined up.
  const refreshKey = `${nowPlaying?.id ?? ''}|${queue.current?.id ?? ''}|${lineup.map((track) => track.id).join(',')}`
  const playlist = useDjPlaylist(onPlaylistStatus, refreshKey, keptVersion)

  const link = input.trim()
  const pickedTracks = pickedIds.flatMap((id) => playlist.tracks.tracks.find((track) => track.id === id) ?? [])
  const picked = pickedTracks[0] ?? null
  // The first refusal among the chosen tracks: the button waits until none is left (the room's answer can change meanwhile).
  const pickedVerdict = pickedTracks.map((track) => trackVerdict(track, playlist.statuses[track.id], rules)).find((verdict) => verdict) ?? null
  const choice: Source | null = source === 'link' && link !== '' ? 'link' : source === 'playlist' && picked ? 'playlist' : null
  // Several tracks at once are for a DJ who is alone in the queue (the server says the same): with others, one by one.
  const alone = djCount(queue) - (place ? 1 : 0) === 0
  const capacity = Math.max(0, LINEUP_MAX - lineup.length)

  function handlePick(track: PlaylistTrack) {
    setDone('')
    const verdict = trackVerdict(track, playlist.statuses[track.id], rules)
    if (verdict) {
      setErrorFromLink(false)
      setError(verdict.full)
      return
    }
    setError('')
    if (source === 'playlist' && pickedIds.includes(track.id)) {
      const rest = pickedIds.filter((id) => id !== track.id)
      setPickedIds(rest)
      if (rest.length === 0) setSource(link !== '' ? 'link' : null)
      return
    }
    if (alone && source === 'playlist') {
      if (pickedIds.length >= capacity) {
        setErrorFromLink(false)
        setError(`Ta file ne tient que ${LINEUP_MAX} morceaux : tu peux en ajouter ${capacity} de plus.`)
        return
      }
      setPickedIds([...pickedIds, track.id])
    } else {
      setPickedIds([track.id])
    }
    setSource('playlist')
  }

  function handleSelectPlaylist(playlistId: string) {
    playlist.lists.select(playlistId)
    setPickedIds([])
    if (source === 'playlist') setSource(link !== '' ? 'link' : null)
  }

  async function handleAddLink() {
    if (busy) return
    setDone('')
    setLastAdded(null)
    setErrorFromLink(true)
    if (link === '') {
      setError("Colle le lien d'une vidéo YouTube.")
      if (!touchScreen()) inputRef.current?.focus()
      return
    }
    setSource('link')
    setBusy('add')
    setError('')
    const result = await onAdd(link)
    setBusy(null)
    if (result.ok) {
      setInput('')
      setSource(null)
      setDone(`Ajouté : « ${result.track.title} » est dans ta file.`)
      setLastAdded(result.track)
      setKeepOpen(false)
      // Several tracks in a row: the field is empty and ready for the next link.
      if (!touchScreen()) inputRef.current?.focus()
    } else {
      setError(djErrorMessage(result))
    }
  }

  async function handleAddPicked() {
    if (busy || !picked) return
    setDone('')
    setLastAdded(null)
    setErrorFromLink(false)
    if (pickedVerdict) return setError(pickedVerdict.full)
    if (pickedTracks.length > 1) return handleAddSeveral()
    setBusy('add')
    setError('')
    const result = await onAddFromPlaylist(picked.id)
    setBusy(null)
    if (result.ok) {
      setDone(`Ajouté : « ${result.track.title} » est dans ta file.`)
      setPickedIds([])
      setSource(link !== '' ? 'link' : null)
      if (!phone && !touchScreen()) inputRef.current?.focus()
    } else {
      setError(djErrorMessage(result))
    }
  }

  /** Several tracks of the playlist at once: each is lined up or refused on its own, and the dialog says both. */
  async function handleAddSeveral() {
    setBusy('add')
    setError('')
    const result = await onAddManyFromPlaylist(pickedTracks.map((track) => track.id))
    setBusy(null)
    if (!result.ok) return setError(djErrorMessage(result))
    let added = 0
    let firstTitle = ''
    const refusals: string[] = []
    result.results.forEach((answer, index) => {
      if (answer.ok) {
        added += 1
        firstTitle = firstTitle || answer.track.title
      } else {
        refusals.push(`« ${pickedTracks[index]?.title ?? 'Ce morceau'} » : ${djErrorMessage(answer)}`)
      }
    })
    setPickedIds([])
    setSource(link !== '' ? 'link' : null)
    if (added > 0) {
      setDone(added === 1 ? `Ajouté : « ${firstTitle} » est dans ta file.` : `${added} morceaux ajoutés à ta file, dans l'ordre choisi.`)
    }
    if (refusals.length > 0) {
      setError(refusals.length === 1 ? refusals[0] : `${refusals[0]} (et ${refusals.length - 1} de plus refusé${refusals.length > 2 ? 's' : ''})`)
    }
  }

  function handleKept(outcome: KeepOutcome) {
    if (!lastAdded) return
    setError('')
    setErrorFromLink(false)
    setKeepOpen(false)
    if (outcome.kind === 'added') {
      setDone(`« ${lastAdded.title} » est gardé dans « ${outcome.playlistName} ».`)
      setKeptVersion((version) => version + 1)
    } else {
      setDone(`« ${lastAdded.title} » est déjà dans « ${outcome.playlistName} ».`)
    }
    setLastAdded(null)
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

  // On a phone: once in the queue, a third tab holds the viewer's own tracks (a computer shows them in the right column).
  const tabs = place ? [...TABS, { id: 'file' as const, label: `Ma file · ${lineup.length}` }] : TABS
  const shownTab: Tab = tabs.some((candidate) => candidate.id === tab) ? tab : 'playlist'

  function handleTabKeys(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((candidate) => candidate.id === shownTab)
    let target: number
    if (event.key === 'ArrowRight') target = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = tabs.length - 1
    else return
    event.preventDefault()
    setTab(tabs[target].id)
    document.getElementById(`dj-tab-${tabs[target].id}`)?.focus()
  }

  // Leaving throws away the tracks lined up, and cuts the one that plays when it is the viewer's own.
  const leaveCosts = place?.onDecks
    ? 'Quitter la file coupe ton morceau en cours et efface tes morceaux en attente.'
    : lineup.length > 0
      ? 'Quitter la file efface tes morceaux en attente.'
      : null

  // What the big button of a phone says it will join the queue with.
  const severalPicked = choice === 'playlist' && pickedTracks.length > 1
  const choiceTitle = severalPicked ? null : choice === 'playlist' && picked ? (picked.title ?? 'Titre à actualiser') : choice === 'link' ? shortLink(link) : null
  const pickedTotalSec = pickedTracks.reduce((sum, track) => sum + (track.durationSec ?? 0), 0)
  const goVerb = place ? 'Ajouter à ma file' : 'Rejoindre la file'
  const lineupFull = lineup.length >= LINEUP_MAX

  const ruleChips = [
    maxTrackChip(rules),
    rules.repeatDelaySec === null ? 'Aucun doublon' : `Pas de doublon (${formatSpan(rules.repeatDelaySec)})`,
    `${rules.maxDjs} DJ max`,
    ...(styles.length > 0 ? [styles.map((style) => STYLE_LABELS[style]).join(' · ')] : []),
  ]

  return (
    <div className="dj-dialog__sheet dj-sheet">
      {phone && <span className="dj-handle" aria-hidden="true" />}
      <header className="dj-dialog__header dj-head">
        <div className="dj-head__titles">
          <h2 id="dj-dialog-title">{place ? 'Ma file de DJ' : 'Passer DJ'}</h2>
          <p id="dj-dialog-sub" className="dj-head__sub">
            {phone ? turnLineShort(place, queue, rules.maxDjs, waitSec) : turnLine(place, queue, rules.maxDjs, waitSec)}
          </p>
        </div>
        <div className="dj-head__rules">
          <span id="dj-rules-label">Règles de la room</span>
          <ul role="list" aria-labelledby="dj-rules-label">
            {ruleChips.map((chip) => (
              <li key={chip} className="dj-chip">
                {chip}
              </li>
            ))}
          </ul>
        </div>
        <button type="button" className="dj-dialog__close dj-head__close" aria-label="Fermer" onClick={onClose}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M3 3 L13 13 M13 3 L3 13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {phone && (
        <div className="dj-tabs" role="tablist" aria-label="Où choisir ton morceau" onKeyDown={handleTabKeys}>
          {tabs.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              id={`dj-tab-${candidate.id}`}
              className="dj-tabs__tab"
              // The dialog puts the focus here when it opens on a narrow screen with a mouse or a keyboard.
              data-autofocus={shownTab === candidate.id ? '' : undefined}
              aria-selected={shownTab === candidate.id}
              aria-controls={`dj-panel-${candidate.id}`}
              tabIndex={shownTab === candidate.id ? 0 : -1}
              onClick={() => setTab(candidate.id)}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      )}

      {/* Both sources stay in the page on a phone too: what was typed, and the playlist that was read, are still there on coming back. */}
      <div className="dj-cols">
        <section
          className="dj-panel dj-panel--playlist"
          id="dj-panel-playlist"
          role={phone ? 'tabpanel' : undefined}
          aria-labelledby={phone ? 'dj-tab-playlist' : 'dj-playlist-title'}
          hidden={phone && shownTab !== 'playlist'}
        >
          <DjPlaylistTab
            playlist={playlist}
            rules={rules}
            pickedIds={choice === 'playlist' ? pickedIds : []}
            multi={alone}
            onPick={handlePick}
            onSelectPlaylist={handleSelectPlaylist}
            onShowLink={
              phone
                ? () => {
                    setTab('link')
                    // The button that was pressed is in the panel that goes away: the focus must not be lost with it. The
                    // link field takes it with a mouse or a keyboard; on a touch screen that would raise the keyboard.
                    window.setTimeout(() => (touchScreen() ? document.getElementById('dj-tab-link') : inputRef.current)?.focus(), 0)
                  }
                : undefined
            }
          />
        </section>

        <div className="dj-panel dj-panel--side" hidden={phone && shownTab === 'playlist'}>
          <div
            className="dj-link"
            id="dj-panel-link"
            role={phone ? 'tabpanel' : undefined}
            aria-labelledby={phone ? 'dj-tab-link' : undefined}
            hidden={phone && shownTab !== 'link'}
          >
            <form
              className="dj-link__form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                void handleAddLink()
              }}
            >
              <label htmlFor="dj-link">Coller un lien YouTube</label>
              <div className="dj-search" data-active={choice === 'link' ? '' : undefined}>
                <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M7.5 10.5 A3 3 0 0 0 11.7 10.8 L14.2 8.3 A3 3 0 0 0 10 4.1 L9 5.1" />
                  <path d="M10.5 7.5 A3 3 0 0 0 6.3 7.2 L3.8 9.7 A3 3 0 0 0 8 13.9 L9 12.9" />
                </svg>
                <input
                  ref={inputRef}
                  id="dj-link"
                  type="text"
                  inputMode="url"
                  enterKeyHint="go"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={DJ_INPUT_MAX}
                  placeholder="https://youtu.be/…"
                  value={input}
                  // A mouse or a keyboard starts here on a computer: a link can be pasted at once.
                  data-autofocus={phone ? undefined : ''}
                  aria-describedby="dj-link-help"
                  aria-invalid={error !== '' && errorFromLink}
                  onFocus={() => {
                    if (link !== '') setSource('link')
                  }}
                  onChange={(event) => {
                    setInput(event.target.value)
                    setSource(event.target.value.trim() !== '' ? 'link' : picked ? 'playlist' : null)
                    setError('')
                    setDone('')
                    setLastAdded(null)
                  }}
                />
              </div>
              <p id="dj-link-help" className="dj-link__help">
                La vidéo doit pouvoir être lue en dehors de YouTube.{!phone && ' Elle devient « Ton morceau » en bas.'}
              </p>
            </form>
            {lastAdded && (
              <div className="dj-found">
                <div className="dj-song">
                  <TrackCover seed={lastAdded.videoId} size={40} />
                  <span className="dj-song__text">
                    <span className="dj-song__title">{lastAdded.title}</span>
                    <span className="dj-song__meta">
                      {lastAdded.artist} · {formatClock(lastAdded.durationSec)}
                    </span>
                  </span>
                  <span className="dj-chip">
                    <Check />
                    Lien reconnu
                  </span>
                </div>
                {keepOpen ? (
                  <KeepPicker videoId={lastAdded.videoId} onDone={handleKept} onCancel={() => setKeepOpen(false)} />
                ) : (
                  <button type="button" className="dj-pill" aria-expanded={false} onClick={() => setKeepOpen(true)}>
                    <Plus />
                    Garder dans une playlist
                  </button>
                )}
              </div>
            )}
          </div>

          <section
            className="dj-lineup"
            id="dj-panel-file"
            aria-labelledby={phone ? 'dj-tab-file' : 'dj-lineup-title'}
            role={phone ? 'tabpanel' : undefined}
            hidden={phone && shownTab !== 'file'}
          >
            <h3 id="dj-lineup-title">
              Mes morceaux{' '}
              <span>
                ({lineup.length}/{LINEUP_MAX})
              </span>
            </h3>
            {lineup.length === 0 ? (
              <div className="dj-lineup__empty">
                <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 6 H15 M3 12 H15 M3 18 H10" />
                  <circle cx="18" cy="17" r="3" />
                  <path d="M21 17 V8" />
                </svg>
                <p>
                  {place
                    ? 'Aucun morceau en attente : ajoutes-en un avant la fin du tien pour rester DJ.'
                    : `Tes morceaux en attente seront ici, jusqu'à ${LINEUP_MAX}. Tu pourras en ajouter d'autres et les retirer.`}
                </p>
              </div>
            ) : (
              <ol className="dj-lineup__list" role="list">
                {lineup.map((track, index) => (
                  <li key={track.id} className="dj-song">
                    <TrackCover seed={track.videoId} size={40} />
                    <span className="dj-song__text">
                      <span className="dj-song__title">{track.title}</span>
                      <span className="dj-song__meta">
                        <strong>{index === 0 ? 'Ton prochain' : `N° ${index + 1}`}</strong> · {track.artist} · {formatClock(track.durationSec)}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="dj-song__remove"
                      aria-label={`Retirer « ${track.title} » de ma file`}
                      disabled={busy !== null}
                      onClick={() => void handleRemove(track)}
                    >
                      <span aria-hidden="true">Retirer</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}

            {place && (
              <div className="dj-lineup__leave">
                {confirmLeave && leaveCosts ? (
                  <div role="group" aria-label="Confirmer">
                    <p>{leaveCosts}</p>
                    <div className="dj-lineup__confirm">
                      <button type="button" className="dj-pill dj-pill--danger" disabled={busy !== null} onClick={() => void handleLeave()}>
                        Quitter la file
                      </button>
                      <button type="button" className="dj-pill" onClick={() => setConfirmLeave(false)}>
                        Rester
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="dj-pill"
                    disabled={busy !== null}
                    onClick={() => (leaveCosts ? setConfirmLeave(true) : void handleLeave())}
                  >
                    Quitter la file
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Live regions: always in the page (a screen reader only hears a region it already knew), empty most of the time. */}
      <p className="dj-feedback dj-feedback--error" role="alert">
        {error}
      </p>
      <p className="dj-feedback dj-feedback--done" role="status">
        {done}
      </p>

      <div className="dj-band" hidden={phone && shownTab === 'file'}>
        <TrackCover seed={choice === 'playlist' && picked ? picked.videoId : null} />
        <div className="dj-band__what" id="dj-band-what">
          <span className="dj-band__text">
            <span className="dj-band__label">Ton morceau</span>
            {severalPicked ? (
              <span className="dj-band__track">
                <strong>{pickedTracks.length} morceaux</strong> · dans l'ordre choisi · {formatClock(pickedTotalSec)}
              </span>
            ) : choice === 'playlist' && picked ? (
              <span className="dj-band__track">
                <strong>{picked.title ?? 'Titre à actualiser'}</strong> · {picked.artist ?? 'Artiste inconnu'}
                {picked.durationSec !== null && ` · ${formatClock(picked.durationSec)}`}
              </span>
            ) : choice === 'link' ? (
              <span className="dj-band__track">
                <strong>Lien YouTube</strong> · {shortLink(link)}
              </span>
            ) : (
              <span className="dj-band__none">Choisis un morceau dans ta playlist, ou colle un lien YouTube.</span>
            )}
          </span>
          {choice === 'playlist' &&
            (pickedVerdict ? (
              <span className="dj-band__refused">{pickedVerdict.short}</span>
            ) : (
              <span className="dj-chip">
                <Check />
                Accepté dans {roomName ?? 'cette room'}
              </span>
            ))}
          {choice === 'link' && <span className="dj-chip dj-chip--quiet">La room le vérifie à l'ajout</span>}
        </div>
        <div className="dj-band__actions">
          <button type="button" className="dj-band__cancel" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="dj-band__go"
            aria-describedby="dj-band-what"
            disabled={busy !== null || lineupFull || choice === null || (choice === 'playlist' && pickedVerdict !== null)}
            onClick={() => void (choice === 'link' ? handleAddLink() : handleAddPicked())}
          >
            <Plus />
            <span className="dj-band__go-label">
              {lineupFull ? `${LINEUP_MAX} morceaux au plus` : busy === 'add' ? 'Vérification…' : severalPicked ? `${goVerb} avec ${pickedTracks.length} morceaux` : phone && choiceTitle ? `${goVerb} avec « ${choiceTitle} »` : goVerb}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
