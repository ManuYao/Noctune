import { useCallback, useEffect, useRef, useState } from 'react'
import { estimateClockOffset } from '../../shared/clock'
import type {
  AddTrackResult,
  ChatMessage,
  ChatResult,
  DjNotice,
  DjQueue,
  DjResult,
  JoinError,
  ModAction,
  ModNotice,
  ModResult,
  MyReactions,
  Participant,
  PlaylistStatusResult,
  QueuedTrack,
  ReactResult,
  Reactions,
  Report,
  ReportReason,
  ReportResult,
  ReportTarget,
  RoomRules,
  RoomSettings,
  RoomSnapshot,
  RoomStyle,
  RoomTheme,
  Track,
} from '../../shared/protocol'
import { EMPTY_QUEUE } from './djQueue'
import { socket } from './socket'

interface RoomEntry {
  roomId: string
  pseudo: string
  avatarId: string
}

export type RoomStatus = 'connecting' | 'joined' | 'error'

/** The server answer, or a failure that never reached the server. */
export type SendChatResult = ChatResult | { ok: false; error: 'network' }
export type SendReactionResult = ReactResult | { ok: false; error: 'network' }
export type SendAddTrackResult = AddTrackResult | { ok: false; error: 'network' }
export type SendPlaylistStatusResult = PlaylistStatusResult | { ok: false; error: 'network' }
export type SendDjResult = DjResult | { ok: false; error: 'network' }
export type SendReportResult = ReportResult | { ok: false; error: 'network' }
export type SendModResult = ModResult | { ok: false; error: 'network' }

/** What a small note in the corner can say: what the server told this person alone, or something the page itself reports. */
export type NoticeContent = DjNotice | ModNotice | { kind: 'note'; text: string }

/** Something the server told this person, and nobody else. The id lets the screen drop it once it was read. */
export interface RoomNotice {
  id: number
  notice: NoticeContent
}

/** What the host decided about the room, and whether the viewer is that host. */
export interface RoomInfo {
  name: string
  description: string
  styles: RoomStyle[]
  theme: RoomTheme
  /** Pseudo of the host; null for the rooms of the team. */
  host: string | null
  isHost: boolean
}

interface RoomState {
  status: RoomStatus
  error: JoinError | null
  snapshot: RoomSnapshot | null
  participants: Participant[]
  nowPlaying: Track | null
  messages: ChatMessage[]
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
  reactions: Reactions
  /** What the viewer did on the current track. */
  mine: MyReactions
  /** Goes up each time the like count rises (anyone's like): the screen pulses. */
  likePulse: number
  /** What the room asks of its DJs. Null until the room is joined (or on a server without DJs). */
  rules: RoomRules | null
  /** The room's name, texts and ambiance, kept up to date when the host changes them. Null until it is joined. */
  info: RoomInfo | null
  /** The host deleted the room: everybody is out. */
  closed: boolean
  /** The host excluded the viewer: they are out, for 24 hours. */
  excluded: boolean
  /** What members reported in this room. Only the host is given any. */
  reports: Report[]
  /** When the viewer can write in the chat again (local clock, ms), after a mute; null when they are not muted. */
  mutedUntil: number | null
  queue: DjQueue
  /** The tracks the viewer lined up, in the order they will play. */
  lineup: QueuedTrack[]
  notices: RoomNotice[]
}

const NO_REACTIONS: Reactions = { likes: 0, skipVotes: 0, skipRequired: 1 }
const NOTHING_CAST: MyReactions = { liked: false, votedSkip: false }

const INITIAL_STATE: RoomState = {
  status: 'connecting',
  error: null,
  snapshot: null,
  participants: [],
  nowPlaying: null,
  messages: [],
  clockOffsetMs: 0,
  reactions: NO_REACTIONS,
  mine: NOTHING_CAST,
  likePulse: 0,
  rules: null,
  info: null,
  closed: false,
  excluded: false,
  reports: [],
  mutedUntil: null,
  queue: EMPTY_QUEUE,
  lineup: [],
  notices: [],
}

const ACK_TIMEOUT_MS = 5000
// Adding a track makes the server ask YouTube (it gives up after 5 s): wait for that, not less.
const DJ_ADD_ACK_TIMEOUT_MS = 12_000
// The server may wait for the database before it lets a visitor in (which is allowed 5 s per query).
const JOIN_ACK_TIMEOUT_MS = 12_000
// A place left behind by a dropped connection is freed within about 45 s: try again every 3 s for a minute.
const JOIN_RETRY_MS = 3000
const MAX_JOIN_RETRIES = 20
// The server sends the last 50 messages on join; the screen keeps a few more while the room goes on.
const MAX_MESSAGES_KEPT = 200
// A DJ is told about their own turn a few times a night, not dozens: older notices make room for new ones, so that a
// pile of them never covers the chat field under them.
const MAX_NOTICES_KEPT = 2

const trackKey = (track: Track | null) => (track ? `${track.id}|${track.startedAt}` : '')

// With a timeout, emitWithAck loses its typing: the answer is always the result type the event declares.
async function emitReaction(event: 'track:like' | 'track:skip', value: boolean): Promise<SendReactionResult> {
  // Offline, the socket would keep the click and send it later, out of context.
  if (!socket.connected) return { ok: false, error: 'network' }
  try {
    const result: ReactResult = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, { value })
    return result
  } catch {
    return { ok: false, error: 'network' }
  }
}

async function emitAddTrack(input: string): Promise<SendAddTrackResult> {
  if (!socket.connected) return { ok: false, error: 'network' }
  try {
    const result: AddTrackResult = await socket.timeout(DJ_ADD_ACK_TIMEOUT_MS).emitWithAck('dj:add', { input })
    return result
  } catch {
    return { ok: false, error: 'network' }
  }
}

/** Lines up a track of one of the member's own playlists: the server finds the video from its own records. */
async function emitAddFromPlaylist(playlistTrackId: string): Promise<SendAddTrackResult> {
  if (!socket.connected) return { ok: false, error: 'network' }
  try {
    // A track whose details are old is read from YouTube again first, like a link.
    const result: AddTrackResult = await socket.timeout(DJ_ADD_ACK_TIMEOUT_MS).emitWithAck('dj:add', { playlistTrackId })
    return result
  } catch {
    return { ok: false, error: 'network' }
  }
}

/** For each track of a playlist: would this room take it now? Answered from what the server already knows. */
async function emitPlaylistStatus(playlistId: string): Promise<SendPlaylistStatusResult> {
  if (!socket.connected) return { ok: false, error: 'network' }
  try {
    const result: PlaylistStatusResult = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('dj:playlist-status', { playlistId })
    return result
  } catch {
    return { ok: false, error: 'network' }
  }
}

async function emitRemoveTrack(trackId: string): Promise<SendDjResult> {
  if (!socket.connected) return { ok: false, error: 'network' }
  try {
    const result: DjResult = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('dj:remove', { trackId })
    return result
  } catch {
    return { ok: false, error: 'network' }
  }
}

async function emitLeaveQueue(): Promise<SendDjResult> {
  if (!socket.connected) return { ok: false, error: 'network' }
  try {
    const result: DjResult = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('dj:leave')
    return result
  } catch {
    return { ok: false, error: 'network' }
  }
}

async function emitReport(target: ReportTarget, reason: ReportReason): Promise<SendReportResult> {
  if (!socket.connected) return { ok: false, error: 'network' }
  try {
    const result: ReportResult = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('report:create', { target, reason })
    return result
  } catch {
    return { ok: false, error: 'network' }
  }
}

async function emitModAct(action: ModAction, participantId: string, reportId?: string): Promise<SendModResult> {
  if (!socket.connected) return { ok: false, error: 'network' }
  try {
    const result: ModResult = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('mod:act', { action, participantId, reportId })
    return result
  } catch {
    return { ok: false, error: 'network' }
  }
}

async function emitModRemoveTrack(entryId: string, trackId: string, reportId?: string): Promise<SendModResult> {
  if (!socket.connected) return { ok: false, error: 'network' }
  try {
    const result: ModResult = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('mod:remove-track', { entryId, trackId, reportId })
    return result
  } catch {
    return { ok: false, error: 'network' }
  }
}

async function emitModDismiss(reportId: string): Promise<SendModResult> {
  if (!socket.connected) return { ok: false, error: 'network' }
  try {
    const result: ModResult = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('mod:dismiss', { reportId })
    return result
  } catch {
    return { ok: false, error: 'network' }
  }
}

/** The people behind the reports of a list: more people reporting is news for the host, fewer is not. */
const reporters = (reports: Report[]) => reports.reduce((sum, report) => sum + report.count, 0)

/** Joins a room over the realtime connection and keeps its live state. Rejoins after a reconnection. */
export function useRoom({ roomId, pseudo, avatarId }: RoomEntry): RoomState & {
  sendChat: (text: string) => Promise<SendChatResult>
  like: (value: boolean) => Promise<SendReactionResult>
  voteSkip: (value: boolean) => Promise<SendReactionResult>
  addTrack: (input: string) => Promise<SendAddTrackResult>
  addFromPlaylist: (playlistTrackId: string) => Promise<SendAddTrackResult>
  playlistStatus: (playlistId: string) => Promise<SendPlaylistStatusResult>
  removeTrack: (trackId: string) => Promise<SendDjResult>
  leaveQueue: () => Promise<SendDjResult>
  dismissNotice: (id: number) => void
  /** Reports a chat message or a queued track to the host. */
  report: (target: ReportTarget, reason: ReportReason) => Promise<SendReportResult>
  /** The host warns, mutes or excludes somebody of the room. */
  moderate: (action: ModAction, participantId: string, reportId?: string) => Promise<SendModResult>
  /** The host takes a track out of a DJ's line-up. */
  moderateTrack: (entryId: string, trackId: string, reportId?: string) => Promise<SendModResult>
  /** The host sets a report aside. */
  dismissReport: (reportId: string) => Promise<SendModResult>
  /** A small note in the corner, for something the page itself has to say (an action of the host done, a new report). */
  note: (text: string) => void
} {
  const [state, setState] = useState<RoomState>(INITIAL_STATE)
  const currentTrackKey = useRef('')
  const nextNoticeId = useRef(1)
  useEffect(() => {
    currentTrackKey.current = trackKey(state.nowPlaying)
  }, [state.nowPlaying])

  useEffect(() => {
    let active = true
    let everJoined = false
    let retries = 0
    let retryTimer: number | undefined
    setState(INITIAL_STATE)

    function join() {
      window.clearTimeout(retryTimer)
      const sentAt = Date.now()
      // No answer in time is an error to show, not a screen that says "connecting" for ever.
      socket.timeout(JOIN_ACK_TIMEOUT_MS).emit('room:join', { roomId, pseudo, avatarId }, (timedOut, result) => {
        if (!active) return
        if (timedOut) {
          setState({ ...INITIAL_STATE, status: 'error', error: 'server-error' })
          return
        }
        if (result.ok) {
          everJoined = true
          retries = 0
          const { snapshot } = result
          setState((prev) => ({
            ...prev,
            status: 'joined',
            error: null,
            snapshot,
            participants: snapshot.participants,
            nowPlaying: snapshot.nowPlaying,
            messages: snapshot.chat,
            clockOffsetMs: estimateClockOffset(sentAt, Date.now(), snapshot.serverTime),
            reactions: snapshot.reactions,
            mine: snapshot.mine,
            // A server older than this page does not send them: the DJ panel then stays out of sight.
            rules: snapshot.rules ?? null,
            // The same for the texts and the ambiance: an older server has none, the room then looks as it always did.
            info: {
              name: snapshot.name,
              description: snapshot.description ?? '',
              styles: snapshot.styles ?? [],
              theme: snapshot.theme ?? 'neon',
              host: snapshot.host ?? null,
              isHost: snapshot.isHost ?? false,
            },
            queue: snapshot.queue ?? EMPTY_QUEUE,
            lineup: snapshot.lineup ?? [],
            // An older server has no moderation: the host's tools then stay out of sight.
            reports: snapshot.reports ?? [],
          }))
          return
        }
        // After a dropped connection (Wi-Fi to 4G, a laptop that slept) the server keeps the old place of the
        // person for up to 45 seconds: coming back at once is told "already here" or "pseudo taken", by themselves.
        // Better to try again for a while than to leave them on an error page.
        const stale = everJoined && (result.error === 'already-in-room' || result.error === 'pseudo-taken')
        if ((stale || result.error === 'rate-limited') && retries < MAX_JOIN_RETRIES) {
          retries += 1
          retryTimer = window.setTimeout(join, JOIN_RETRY_MS)
          return
        }
        setState({ ...INITIAL_STATE, status: 'error', error: result.error })
      })
    }

    const onConnect = () => join()
    const onDisconnect = () => setState((prev) => (prev.status === 'error' ? prev : { ...prev, status: 'connecting' }))
    const onParticipantJoined = (participant: Participant) =>
      setState((prev) =>
        prev.participants.some((known) => known.id === participant.id)
          ? prev
          : { ...prev, participants: [...prev.participants, participant] },
      )
    const onParticipantLeft = (participantId: string) =>
      setState((prev) => ({ ...prev, participants: prev.participants.filter((known) => known.id !== participantId) }))
    // A new track starts with no likes and no votes, for everyone, and the queue has moved on with it.
    const onTrack = (track: Track | null, reactions: Reactions, queue?: DjQueue) =>
      setState((prev) => ({ ...prev, nowPlaying: track, reactions, mine: NOTHING_CAST, queue: queue ?? prev.queue }))
    const onQueue = (queue: DjQueue) => setState((prev) => ({ ...prev, queue }))
    // The host changed the room: the new texts, ambiance and rules apply to everybody in it, at once.
    const onSettings = (settings: RoomSettings) =>
      setState((prev) => ({
        ...prev,
        rules: settings.rules,
        info: prev.info && {
          ...prev.info,
          name: settings.name,
          description: settings.description,
          styles: settings.styles,
          theme: settings.theme,
        },
      }))
    const onClosed = () => setState((prev) => ({ ...prev, closed: true }))
    // The host's inbox, whole, each time it changes. A report that adds people is news; one that goes is not.
    const onReports = (reports: Report[]) =>
      setState((prev) => {
        const news = prev.status === 'joined' && reporters(reports) > reporters(prev.reports)
        return {
          ...prev,
          reports,
          notices: news
            ? [...prev.notices, { id: nextNoticeId.current++, notice: { kind: 'note' as const, text: 'Nouveau signalement dans ta room.' } }].slice(-MAX_NOTICES_KEPT)
            : prev.notices,
        }
      })
    // What the host did to the viewer. A mute also keeps the chat shut until it ends.
    const onModNotice = (notice: ModNotice) =>
      setState((prev) => ({
        ...prev,
        mutedUntil: notice.kind === 'muted' ? Date.now() + notice.retryAfterMs : prev.mutedUntil,
        notices: [...prev.notices, { id: nextNoticeId.current++, notice }].slice(-MAX_NOTICES_KEPT),
      }))
    const onExcluded = () => setState((prev) => ({ ...prev, excluded: true }))
    const onLineup = (lineup: QueuedTrack[]) => setState((prev) => ({ ...prev, lineup }))
    const onNotice = (notice: DjNotice) =>
      setState((prev) => ({
        ...prev,
        notices: [...prev.notices, { id: nextNoticeId.current++, notice }].slice(-MAX_NOTICES_KEPT),
      }))
    const onReactions = (reactions: Reactions) =>
      setState((prev) => ({
        ...prev,
        reactions,
        likePulse: reactions.likes > prev.reactions.likes ? prev.likePulse + 1 : prev.likePulse,
      }))
    const onChatMessage = (message: ChatMessage) =>
      setState((prev) =>
        prev.messages.some((known) => known.id === message.id)
          ? prev
          : { ...prev, messages: [...prev.messages, message].slice(-MAX_MESSAGES_KEPT) },
      )

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('room:participant-joined', onParticipantJoined)
    socket.on('room:participant-left', onParticipantLeft)
    socket.on('room:track', onTrack)
    socket.on('dj:queue', onQueue)
    socket.on('room:settings', onSettings)
    socket.on('room:closed', onClosed)
    socket.on('mod:reports', onReports)
    socket.on('mod:notice', onModNotice)
    socket.on('room:excluded', onExcluded)
    socket.on('dj:lineup', onLineup)
    socket.on('dj:notice', onNotice)
    socket.on('track:reactions', onReactions)
    socket.on('chat:message', onChatMessage)

    if (socket.connected) join()
    else socket.connect()

    return () => {
      active = false
      window.clearTimeout(retryTimer)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room:participant-joined', onParticipantJoined)
      socket.off('room:participant-left', onParticipantLeft)
      socket.off('room:track', onTrack)
      socket.off('dj:queue', onQueue)
      socket.off('room:settings', onSettings)
      socket.off('room:closed', onClosed)
      socket.off('mod:reports', onReports)
      socket.off('mod:notice', onModNotice)
      socket.off('room:excluded', onExcluded)
      socket.off('dj:lineup', onLineup)
      socket.off('dj:notice', onNotice)
      socket.off('track:reactions', onReactions)
      socket.off('chat:message', onChatMessage)
      socket.emit('room:leave')
      socket.disconnect()
    }
  }, [roomId, pseudo, avatarId])

  const sendChat = useCallback(async (text: string): Promise<SendChatResult> => {
    // Offline, the socket would keep the message and send it later, out of context.
    if (!socket.connected) return { ok: false, error: 'network' }
    try {
      const result: ChatResult = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck('chat:send', { text })
      // Muted (the notice may have been missed, or the viewer was muted before a reconnection): the chat stays shut.
      if (!result.ok && result.error === 'muted') {
        setState((prev) => ({ ...prev, mutedUntil: Date.now() + result.retryAfterMs }))
      }
      return result
    } catch {
      return { ok: false, error: 'network' }
    }
  }, [])

  /** The button changes at once; the server confirms, and the change is undone if it refuses. */
  const react = useCallback(async (kind: keyof MyReactions, value: boolean): Promise<SendReactionResult> => {
    const trackAtClick = currentTrackKey.current
    setState((prev) => ({ ...prev, mine: { ...prev.mine, [kind]: value } }))

    const result = await emitReaction(kind === 'liked' ? 'track:like' : 'track:skip', value)
    if (!result.ok) {
      // Unless a new track started meanwhile: its flags were already reset.
      setState((prev) =>
        trackKey(prev.nowPlaying) === trackAtClick ? { ...prev, mine: { ...prev.mine, [kind]: !value } } : prev,
      )
    }
    return result
  }, [])

  const like = useCallback((value: boolean) => react('liked', value), [react])
  const voteSkip = useCallback((value: boolean) => react('votedSkip', value), [react])

  // The queue and the line-up change through what the server pushes (`dj:queue`, `dj:lineup`), not through these
  // answers: the screen shows what the server holds, never a guess.
  const addTrack = useCallback((input: string) => emitAddTrack(input), [])
  const addFromPlaylist = useCallback((playlistTrackId: string) => emitAddFromPlaylist(playlistTrackId), [])
  const playlistStatus = useCallback((playlistId: string) => emitPlaylistStatus(playlistId), [])
  const removeTrack = useCallback((trackId: string) => emitRemoveTrack(trackId), [])
  const leaveQueue = useCallback(() => emitLeaveQueue(), [])
  const dismissNotice = useCallback(
    (id: number) => setState((prev) => ({ ...prev, notices: prev.notices.filter((notice) => notice.id !== id) })),
    [],
  )
  const note = useCallback(
    (text: string) =>
      setState((prev) => ({
        ...prev,
        notices: [...prev.notices, { id: nextNoticeId.current++, notice: { kind: 'note' as const, text } }].slice(-MAX_NOTICES_KEPT),
      })),
    [],
  )
  // Reports and the host's actions: what the screen shows comes from what the server pushes (`mod:reports`).
  const report = useCallback((target: ReportTarget, reason: ReportReason) => emitReport(target, reason), [])
  const moderate = useCallback((action: ModAction, participantId: string, reportId?: string) => emitModAct(action, participantId, reportId), [])
  const moderateTrack = useCallback((entryId: string, trackId: string, reportId?: string) => emitModRemoveTrack(entryId, trackId, reportId), [])
  const dismissReport = useCallback((reportId: string) => emitModDismiss(reportId), [])

  return {
    ...state,
    sendChat,
    like,
    voteSkip,
    addTrack,
    addFromPlaylist,
    playlistStatus,
    removeTrack,
    leaveQueue,
    dismissNotice,
    report,
    moderate,
    moderateTrack,
    dismissReport,
    note,
  }
}
