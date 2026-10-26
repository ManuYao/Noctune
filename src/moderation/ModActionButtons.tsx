import { useState } from 'react'
import type { ModAction } from '../../shared/protocol'
import { useModerationApi } from './moderationContext'
import {
  ACTION_DONE_WORDS,
  ACTION_LABELS,
  LADDER,
  actionDescription,
  actionDoneText,
  modErrorMessage,
} from './moderationMessages'

interface ModActionButtonsProps {
  /** Somebody of the room the host can sanction. */
  person?: { participantId: string; pseudo: string; member: boolean }
  /** A track of a DJ's line-up the host can take out. */
  track?: { entryId: string; trackId: string; title: string; pseudo: string; playing: boolean }
  /** The report that led here: it is handled by the action, or set aside with "Ignorer". */
  reportId?: string
  /** Told, once the server accepted what was asked, with a few words about it. */
  onDone: (text: string) => void
}

type Pending = ModAction | 'remove'

/**
 * What the host can do, as buttons, and the confirmation that says what a step does before it happens (nothing is
 * sent by one press). The next step of the ladder is suggested from what was already done to this person in this room.
 */
export default function ModActionButtons({ person, track, reportId, onDone }: ModActionButtonsProps) {
  const api = useModerationApi()
  const [pending, setPending] = useState<Pending | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const past = person ? api.history(person.participantId) : []
  // The step after the heaviest one already taken (the first one when none was): the ladder is a guide, not an obligation.
  const reached = past.reduce((level, action) => Math.max(level, LADDER.indexOf(action)), -1)
  const suggested = LADDER[Math.min(LADDER.length - 1, reached + 1)]

  async function confirm() {
    if (!pending || busy) return
    setBusy(true)
    setError('')
    const result =
      pending === 'remove'
        ? track && (await api.moderateTrack(track.entryId, track.trackId, reportId))
        : person && (await api.moderate(pending, person.participantId, reportId))
    setBusy(false)
    if (!result) return
    if (!result.ok) {
      setError(modErrorMessage(result))
      setPending(null)
      return
    }
    if (pending !== 'remove' && person) api.recordSanction(person.participantId, pending)
    onDone(actionDoneText(pending, pending === 'remove' ? (track?.pseudo ?? '') : (person?.pseudo ?? ''), { playing: track?.playing }))
  }

  async function ignore() {
    if (!reportId || busy) return
    setBusy(true)
    setError('')
    const result = await api.dismissReport(reportId)
    setBusy(false)
    if (result.ok) onDone('Signalement ignoré.')
    else setError(modErrorMessage(result))
  }

  const description =
    pending === 'remove'
      ? actionDescription('remove', track?.pseudo ?? '', { title: track?.title, playing: track?.playing })
      : pending && person
        ? actionDescription(pending, person.pseudo, { visitor: !person.member })
        : ''

  return (
    <div className="mod-actions">
      {person && (
        <div role="group" aria-label={`Sanctions pour ${person.pseudo}`}>
          {past.length > 0 && (
            <p className="mod-actions__hint">
              Déjà fait dans cette room, par toi : {past.map((action) => ACTION_DONE_WORDS[action]).join(', ')}.
            </p>
          )}
          <div className="mod-actions__row">
            {LADDER.map((action) => (
              <button
                key={action}
                type="button"
                className={action === suggested ? 'mod-btn mod-btn--suggested' : 'mod-btn'}
                aria-pressed={pending === action}
                disabled={busy}
                onClick={() => {
                  setError('')
                  setPending(action)
                }}
              >
                {ACTION_LABELS[action]}
                {action === suggested && <span className="mod-btn__tag"> · conseillé</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {(track || reportId) && (
        <div className="mod-actions__row">
          {track && (
            <button
              type="button"
              className="mod-btn"
              aria-pressed={pending === 'remove'}
              disabled={busy}
              onClick={() => {
                setError('')
                setPending('remove')
              }}
            >
              {track.playing ? 'Couper ce morceau' : 'Retirer ce morceau'}
            </button>
          )}
          {reportId && (
            <button type="button" className="mod-btn mod-btn--quiet" disabled={busy} onClick={() => void ignore()}>
              Ignorer le signalement
            </button>
          )}
        </div>
      )}

      {pending && (
        <div className="mod-confirm" role="group" aria-label="Confirmer">
          <p>{description}</p>
          <div className="mod-actions__row">
            <button type="button" className="mod-btn mod-btn--danger" disabled={busy} onClick={() => void confirm()}>
              {busy ? 'Un instant…' : 'Confirmer'}
            </button>
            <button type="button" className="mod-btn" disabled={busy} onClick={() => setPending(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <p className="mod-feedback mod-feedback--error" role="alert">
        {error}
      </p>
    </div>
  )
}
