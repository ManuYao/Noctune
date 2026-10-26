import { useEffect, useState } from 'react'
import type { Report } from '../../shared/protocol'
import ModActionButtons from './ModActionButtons'
import ModDialog from './ModDialog'
import { useModerationApi } from './moderationContext'
import { REASON_LABELS, ageText } from './moderationMessages'

interface ReportsInboxDialogProps {
  open: boolean
  onClose: () => void
}

function ReportCard({ report, now }: { report: Report; now: number }) {
  const api = useModerationApi()
  const { target } = report

  // Who the host can act on: the author of the message, or the DJ whose track it is, if still here.
  let participantId: string | null
  if (target.kind === 'chat') participantId = target.participantId
  else participantId = [api.queue.current, ...api.queue.waiting].find((entry) => entry?.id === target.entryId)?.participantId ?? null
  // The track a report points at is the one that plays now when its DJ is on the decks and it is the track on air.
  const playing = target.kind === 'track' && api.queue.current?.id === target.entryId && api.nowPlaying?.id === target.trackId
  const there = participantId && participantId !== api.selfId ? api.participants.find((participant) => participant.id === participantId) : undefined

  return (
    <li className="mod-report">
      <div className="mod-report__top">
        <span className="mod-chip">{REASON_LABELS[report.reason]}</span>
        <span className="mod-report__meta">
          {report.count > 1 ? `${report.count} personnes` : '1 personne'} · {ageText(now + api.clockOffsetMs - report.at)}
        </span>
      </div>
      <p className="mod-report__what">
        {target.kind === 'chat' ? <>« {target.text} »</> : <>♪ {target.title}</>}
        <span className="mod-report__who"> {target.kind === 'chat' ? 'de' : 'passé par'} {target.pseudo}</span>
      </p>
      <ModActionButtons
        person={there ? { participantId: there.id, pseudo: there.pseudo, member: there.member } : undefined}
        track={
          target.kind === 'track'
            ? { entryId: target.entryId, trackId: target.trackId, title: target.title, pseudo: target.pseudo, playing }
            : undefined
        }
        reportId={report.id}
        onDone={(text) => api.note(text)}
      />
      {!there && target.kind === 'chat' && <p className="mod-hint">Cette personne a quitté la room.</p>}
    </li>
  )
}

/** The host's inbox: what members reported, who did it, and the steps the host can take, one report at a time. */
export default function ReportsInboxDialog({ open, onClose }: ReportsInboxDialogProps) {
  const api = useModerationApi()
  // The ages are re-read from time to time while the window is open.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [open])

  return (
    <ModDialog open={open} onClose={onClose} titleId="mod-inbox-title" title="Signalements">
      {api.reports.length === 0 ? (
        <p className="mod-empty">
          Aucun signalement pour l'instant. Quand quelqu'un signale un message ou un morceau de ta room, il apparaît ici (et
          dans la barre, un petit mot te prévient).
        </p>
      ) : (
        <ul className="mod-reports">
          {api.reports.map((report) => (
            <ReportCard key={report.id} report={report} now={now} />
          ))}
        </ul>
      )}
    </ModDialog>
  )
}
