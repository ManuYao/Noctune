import { useCallback, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { DjQueue, ModAction, Participant, Report, ReportReason, ReportTarget, Track } from '../../shared/protocol'
import type { SendModResult, SendReportResult } from '../realtime/useRoom'
import ActionsDialog from './ActionsDialog'
import { ModerationContext, type ModTarget, type ModerationApi } from './moderationContext'
import ReportsInboxDialog from './ReportsInboxDialog'

interface ModerationProviderProps {
  isHost: boolean
  hasHost: boolean
  selfId: string | undefined
  participants: Participant[]
  queue: DjQueue
  nowPlaying: Track | null
  reports: Report[]
  clockOffsetMs: number
  report: (target: ReportTarget, reason: ReportReason) => Promise<SendReportResult>
  moderate: (action: ModAction, participantId: string, reportId?: string) => Promise<SendModResult>
  moderateTrack: (entryId: string, trackId: string, reportId?: string) => Promise<SendModResult>
  dismissReport: (reportId: string) => Promise<SendModResult>
  note: (text: string) => void
  children: ReactNode
}

/**
 * Everything the moderation screens share: what can be done (report, and for the host act), the two windows that do it
 * ("⋯" actions and the inbox), and what the host already did to somebody during this visit. The room's parts only ask to
 * open a window; none of them carries the logic.
 */
export default function ModerationProvider({ children, ...room }: ModerationProviderProps) {
  const [target, setTarget] = useState<ModTarget | null>(null)
  const [inboxOpen, setInboxOpen] = useState(false)
  // In memory, for this visit: the server keeps the real record, the page only suggests the next step from its own.
  const sanctions = useRef(new Map<string, ModAction[]>())
  const history = useCallback((participantId: string) => sanctions.current.get(participantId) ?? [], [])
  const recordSanction = useCallback((participantId: string, action: ModAction) => {
    sanctions.current.set(participantId, [...(sanctions.current.get(participantId) ?? []), action])
  }, [])

  const { isHost, hasHost, selfId, participants, queue, nowPlaying, reports, clockOffsetMs, report, moderate, moderateTrack, dismissReport, note } = room
  const api = useMemo<ModerationApi>(
    () => ({
      isHost,
      hasHost,
      selfId,
      participants,
      queue,
      nowPlaying,
      reports,
      clockOffsetMs,
      report,
      moderate,
      moderateTrack,
      dismissReport,
      note,
      history,
      recordSanction,
      openActions: setTarget,
      openInbox: () => setInboxOpen(true),
    }),
    [isHost, hasHost, selfId, participants, queue, nowPlaying, reports, clockOffsetMs, report, moderate, moderateTrack, dismissReport, note, history, recordSanction],
  )

  return (
    <ModerationContext.Provider value={api}>
      {children}
      <ActionsDialog target={target} onClose={() => setTarget(null)} />
      {isHost && <ReportsInboxDialog open={inboxOpen} onClose={() => setInboxOpen(false)} />}
    </ModerationContext.Provider>
  )
}
