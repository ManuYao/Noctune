import { createContext, useContext } from 'react'
import type { DjQueue, ModAction, Participant, Report, ReportReason, ReportTarget, Track } from '../../shared/protocol'
import type { SendModResult, SendReportResult } from '../realtime/useRoom'

/** What a "⋯" button was pressed on: a chat message, a queued track, or (for the host) a person of the audience. */
export type ModTarget =
  | { kind: 'chat'; messageId: string; authorId: string; pseudo: string; excerpt: string }
  | { kind: 'track'; entryId: string; trackId: string; pseudo: string; title: string; participantId: string | null; playing: boolean }
  | { kind: 'person'; participantId: string; pseudo: string }

/** What the moderation screens need from the room, kept in one place so that the chat, the queue and the audience do not each get a dozen props. */
export interface ModerationApi {
  /** The viewer is the host of this room (as the server says). */
  isHost: boolean
  /** The room has a host: in a room of the team a report goes to the team. */
  hasHost: boolean
  selfId: string | undefined
  participants: Participant[]
  queue: DjQueue
  nowPlaying: Track | null
  reports: Report[]
  /** Milliseconds to add to the local clock to get the server clock (the age of a report). */
  clockOffsetMs: number
  report: (target: ReportTarget, reason: ReportReason) => Promise<SendReportResult>
  moderate: (action: ModAction, participantId: string, reportId?: string) => Promise<SendModResult>
  moderateTrack: (entryId: string, trackId: string, reportId?: string) => Promise<SendModResult>
  dismissReport: (reportId: string) => Promise<SendModResult>
  /** A small note in the corner of the window. */
  note: (text: string) => void
  /** What the host already did to somebody in this room during this visit (for the suggestion of the next level). */
  history: (participantId: string) => ModAction[]
  recordSanction: (participantId: string, action: ModAction) => void
  openActions: (target: ModTarget) => void
  openInbox: () => void
}

export const ModerationContext = createContext<ModerationApi | null>(null)

/** Null outside a room: the buttons simply do not show. */
export const useModeration = () => useContext(ModerationContext)

/** For the parts that only exist inside the provider. */
export function useModerationApi(): ModerationApi {
  const api = useContext(ModerationContext)
  if (!api) throw new Error('useModerationApi outside of a ModerationProvider')
  return api
}
