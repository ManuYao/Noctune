import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ReportReason, ReportTarget } from '../../shared/protocol'
import ModActionButtons from './ModActionButtons'
import ModDialog from './ModDialog'
import { useModerationApi, type ModTarget } from './moderationContext'
import { CHAT_REASONS, REASON_LABELS, TRACK_REASONS, reportErrorMessage } from './moderationMessages'

interface ActionsDialogProps {
  target: ModTarget | null
  onClose: () => void
}

function titleOf(target: ModTarget): string {
  switch (target.kind) {
    case 'chat':
      return `Message de ${target.pseudo}`
    case 'track':
      return `Morceau de ${target.pseudo}`
    case 'person':
      return target.pseudo
  }
}

/** Choosing a reason, then sending: nothing goes before the person has said why. */
function ReportSection({ target }: { target: Exclude<ModTarget, { kind: 'person' }> }) {
  const api = useModerationApi()
  const reasons = target.kind === 'track' ? TRACK_REASONS : CHAT_REASONS
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!reason || busy || sent) return
    setBusy(true)
    setError('')
    const reportTarget: ReportTarget =
      target.kind === 'chat'
        ? { kind: 'chat', messageId: target.messageId }
        : { kind: 'track', entryId: target.entryId, trackId: target.trackId }
    const result = await api.report(reportTarget, reason)
    setBusy(false)
    if (result.ok) {
      // The author of the report is told it is taken into account, never what came of it.
      setSent(result.toHost ? "Merci, ton signalement a été transmis à l'hôte." : "Merci, ton signalement a été transmis à l'équipe.")
    } else {
      setError(reportErrorMessage(result))
    }
  }

  return (
    <section aria-labelledby="mod-report-title">
      <h3 id="mod-report-title">Signaler</h3>
      {sent ? (
        <p className="mod-feedback mod-feedback--done" role="status">
          {sent}
        </p>
      ) : (
        <form className="mod-report-form" onSubmit={submit} noValidate>
          <fieldset className="mod-reasons">
            <legend>Pourquoi ?</legend>
            {reasons.map((candidate, index) => (
              <label key={candidate} className="mod-reason">
                <input
                  type="radio"
                  name="mod-reason"
                  value={candidate}
                  checked={reason === candidate}
                  data-autofocus={index === 0 ? '' : undefined}
                  onChange={() => setReason(candidate)}
                />
                <span>{REASON_LABELS[candidate]}</span>
              </label>
            ))}
          </fieldset>
          <button type="submit" className="mod-btn mod-btn--primary" disabled={!reason || busy}>
            {busy ? 'Envoi…' : 'Envoyer le signalement'}
          </button>
          <p className="mod-feedback mod-feedback--error" role="alert">
            {error}
          </p>
        </form>
      )}
    </section>
  )
}

/**
 * What can be done about a message, a queued track or a person: anybody can report a message or a track to the host; the
 * host can also act on the person behind it (warn, mute, exclude) or take the track out of the queue.
 */
export default function ActionsDialog({ target, onClose }: ActionsDialogProps) {
  const api = useModerationApi()

  // The people the host can act on: here, and not themselves.
  const here = (participantId: string | null) => {
    if (!participantId || participantId === api.selfId) return null
    return api.participants.find((participant) => participant.id === participantId) ?? null
  }
  const person = !target
    ? null
    : here(target.kind === 'chat' ? target.authorId : target.participantId)
  const own =
    !target || target.kind === 'person' ? false : target.kind === 'chat' ? target.authorId === api.selfId : target.participantId === api.selfId
  // The host has the inbox and the buttons themselves: the report is for everybody else (and for the team's rooms).
  const canReport = !!target && target.kind !== 'person' && !own && !api.isHost
  const canAct = !!target && api.isHost && (person !== null || target.kind === 'track')

  return (
    <ModDialog open={target !== null} onClose={onClose} titleId="mod-actions-title" title={target ? titleOf(target) : ''}>
      {target?.kind === 'chat' && <blockquote className="mod-context">« {target.excerpt} »</blockquote>}
      {target?.kind === 'track' && (
        <p className="mod-context">
          ♪ {target.title}
          {target.playing && ' (en cours)'}
        </p>
      )}

      {target && canReport && <ReportSection target={target as Exclude<ModTarget, { kind: 'person' }>} />}

      {target && canAct && (
        <section aria-labelledby="mod-host-title">
          <h3 id="mod-host-title">Actions de l'hôte</h3>
          <ModActionButtons
            person={person ? { participantId: person.id, pseudo: person.pseudo, member: person.member } : undefined}
            track={
              target.kind === 'track'
                ? { entryId: target.entryId, trackId: target.trackId, title: target.title, pseudo: target.pseudo, playing: target.playing }
                : undefined
            }
            onDone={(text) => {
              api.note(text)
              onClose()
            }}
          />
          {!person && target.kind !== 'track' && <p className="mod-hint">Cette personne a quitté la room.</p>}
        </section>
      )}

      {target && own && <p className="mod-hint">C'est à toi : tu ne peux pas le signaler.</p>}
      {target && !canReport && !canAct && !own && (
        <p className="mod-hint">{api.isHost ? "Cette personne a quitté la room : il n'y a plus rien à faire ici." : 'Rien à faire ici.'}</p>
      )}
    </ModDialog>
  )
}
