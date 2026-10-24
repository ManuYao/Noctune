import { useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { ChatMessage, DjQueue, Participant, QueuedTrack, RoomRules, Track } from '../../shared/protocol'
import { djCount, findMyPlace } from '../realtime/djQueue'
import type { SendAddTrackResult, SendChatResult, SendDjResult } from '../realtime/useRoom'
import Chat from './Chat'
import DjDialog from './DjDialog'
import DjQueuePanel from './DjQueuePanel'
import ParticipantList from './ParticipantList'
import { useMediaQuery } from './useMediaQuery'
import './RoomSide.css'

// The same breakpoint as the phone layout of the room (RoomPage.css).
const PHONE_QUERY = '(max-width: 760px)'

type TabId = 'chat' | 'queue' | 'public'

interface RoomSideProps {
  selfId: string | undefined
  /** Signed in, as the server sees it: only members can be DJs. */
  isMember: boolean
  participants: Participant[]
  messages: ChatMessage[]
  chatDisabledReason: string | null
  onSendChat: (text: string) => Promise<SendChatResult>
  /** Null on a server that has no DJs: the queue then stays out of sight. */
  rules: RoomRules | null
  queue: DjQueue
  lineup: QueuedTrack[]
  nowPlaying: Track | null
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
  onAddTrack: (input: string) => Promise<SendAddTrackResult>
  onRemoveTrack: (trackId: string) => Promise<SendDjResult>
  onLeaveQueue: () => Promise<SendDjResult>
}

/**
 * Everything beside the video: the queue of DJs, the chat, the audience. On a computer the three are stacked and all in
 * view. On a phone the video stays pinned at the top and these are three tabs under it (mock-up M3); the panels stay
 * mounted when hidden, so that the chat does not lose its place when somebody looks at the queue.
 */
export default function RoomSide({
  selfId,
  isMember,
  participants,
  messages,
  chatDisabledReason,
  onSendChat,
  rules,
  queue,
  lineup,
  nowPlaying,
  clockOffsetMs,
  onAddTrack,
  onRemoveTrack,
  onLeaveQueue,
}: RoomSideProps) {
  const phone = useMediaQuery(PHONE_QUERY)
  const [tab, setTab] = useState<TabId>('chat')
  const [dialogOpen, setDialogOpen] = useState(false)

  // Signed out while the dialog is open (another tab, a session that ended): nothing left to do in it.
  useEffect(() => {
    if (!isMember) setDialogOpen(false)
  }, [isMember])

  // A dot on the Chat tab when messages arrive while another tab is shown.
  const chatShown = !phone || tab === 'chat'
  const lastMessageId = messages.at(-1)?.id
  const [seenMessageId, setSeenMessageId] = useState(lastMessageId)
  useEffect(() => {
    if (chatShown) setSeenMessageId(lastMessageId)
  }, [chatShown, lastMessageId])
  const unread = !chatShown && lastMessageId !== seenMessageId

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'chat', label: 'Chat' },
    ...(rules ? [{ id: 'queue' as const, label: 'File', count: djCount(queue) }] : []),
    { id: 'public', label: 'Public', count: participants.length },
  ]
  const active = tabs.some((candidate) => candidate.id === tab) ? tab : 'chat'

  // Said aloud when the viewer's own turn changes, and only then (not the wait, which would speak every minute). It
  // lives here and not in the queue panel: on a phone that panel is hidden while another tab is shown, and a hidden
  // region says nothing.
  const place = findMyPlace(queue, selfId)
  const announcement = place?.onDecks ? 'Tu es à la console.' : place?.position === 0 ? 'Tu es le prochain à jouer.' : ''

  function handleTabKeys(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((candidate) => candidate.id === active)
    let target: number
    if (event.key === 'ArrowRight') target = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = tabs.length - 1
    else return
    event.preventDefault()
    setTab(tabs[target].id)
    document.getElementById(`room-tab-${tabs[target].id}`)?.focus()
  }

  /** On a phone each panel is a tab panel, shown or not; on a computer it is just there. */
  function panelProps(id: TabId) {
    if (!phone) return { className: 'room-panel' }
    return {
      className: 'room-panel room-panel--tab',
      role: 'tabpanel',
      id: `room-panel-${id}`,
      'aria-labelledby': `room-tab-${id}`,
      hidden: active !== id,
    }
  }

  return (
    <div className="room__side">
      <p className="visually-hidden" role="status">
        {announcement}
      </p>
      {phone && (
        <div className="room-tabs" role="tablist" aria-label="Sections de la room" onKeyDown={handleTabKeys}>
          {tabs.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              id={`room-tab-${candidate.id}`}
              className="room-tabs__tab"
              aria-selected={active === candidate.id}
              aria-controls={`room-panel-${candidate.id}`}
              tabIndex={active === candidate.id ? 0 : -1}
              onClick={() => setTab(candidate.id)}
            >
              {candidate.label}
              {candidate.count !== undefined && <span className="room-tabs__count">{candidate.count}</span>}
              {candidate.id === 'chat' && unread && (
                <>
                  <span className="room-tabs__dot" aria-hidden="true" />
                  <span className="visually-hidden"> (nouveaux messages)</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {rules && (
        <div {...panelProps('queue')}>
          <DjQueuePanel
            queue={queue}
            rules={rules}
            selfId={selfId}
            isMember={isMember}
            nowPlaying={nowPlaying}
            clockOffsetMs={clockOffsetMs}
            lineupSize={lineup.length}
            onOpen={() => setDialogOpen(true)}
          />
        </div>
      )}
      <div {...panelProps('chat')}>
        <Chat messages={messages} selfId={selfId} disabledReason={chatDisabledReason} onSend={onSendChat} />
      </div>
      <div {...panelProps('public')}>
        <ParticipantList participants={participants} selfId={selfId} />
      </div>

      {rules && isMember && (
        <DjDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          rules={rules}
          queue={queue}
          selfId={selfId}
          lineup={lineup}
          nowPlaying={nowPlaying}
          clockOffsetMs={clockOffsetMs}
          onAdd={onAddTrack}
          onRemove={onRemoveTrack}
          onLeave={onLeaveQueue}
        />
      )}
    </div>
  )
}
