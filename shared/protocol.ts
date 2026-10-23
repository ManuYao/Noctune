// Contract between the realtime server and the web client. Types and constants only.

export const AVATAR_IDS = ['pulse', 'mango', 'moss', 'cloud', 'grape', 'ember', 'lemon', 'mist'] as const
export type AvatarId = (typeof AVATAR_IDS)[number]

export const PSEUDO_MIN = 2
export const PSEUDO_MAX = 20

export interface Participant {
  id: string
  pseudo: string
  avatarId: AvatarId
}

export interface Track {
  id: string
  /** YouTube video id, played in the official embedded player. */
  videoId: string
  title: string
  artist: string
  durationSec: number
  /** Server clock (ms since epoch) when the track started. Clients seek relative to it. */
  startedAt: number
}

export const CHAT_MAX_LENGTH = 300
/** A participant can send at most one chat message per interval. */
export const CHAT_MIN_INTERVAL_MS = 3000

export interface ChatMessage {
  id: string
  authorId: string
  /** Copied from the author at send time, so the message stays readable after they leave. */
  pseudo: string
  avatarId: AvatarId
  text: string
  /** Server clock (ms since epoch). */
  sentAt: number
}

export type ChatError = 'not-in-room' | 'empty' | 'too-long' | 'links-not-allowed' | 'rate-limited'

export type ChatResult =
  | { ok: true }
  | { ok: false; error: Exclude<ChatError, 'rate-limited'> }
  | { ok: false; error: 'rate-limited'; retryAfterMs: number }

/** The first seconds of a track are protected: nobody can vote to skip it yet. */
export const SKIP_PROTECTED_SEC = 30

export interface Reactions {
  likes: number
  skipVotes: number
  /** Votes needed to skip the track: more than half of the people who can vote. */
  skipRequired: number
}

/** What the viewer did on the current track. */
export interface MyReactions {
  liked: boolean
  votedSkip: boolean
}

export type ReactError = 'not-in-room' | 'no-track' | 'invalid'

export type ReactResult =
  | { ok: true }
  | { ok: false; error: ReactError }
  | { ok: false; error: 'rate-limited' | 'too-early'; retryAfterMs: number }

export interface RoomSnapshot {
  roomId: string
  name: string
  selfId: string
  participants: Participant[]
  nowPlaying: Track | null
  reactions: Reactions
  mine: MyReactions
  /** Most recent chat messages, oldest first. */
  chat: ChatMessage[]
  /** Server clock when the snapshot was built, to estimate the client clock offset. */
  serverTime: number
}

export type JoinError = 'invalid-pseudo' | 'invalid-avatar' | 'unknown-room' | 'pseudo-taken'

export type JoinResult = { ok: true; snapshot: RoomSnapshot } | { ok: false; error: JoinError }

export interface JoinPayload {
  roomId: string
  pseudo: string
  avatarId: string
}

/** What the list of rooms shows about one room. */
export interface RoomSummary {
  id: string
  name: string
  genre: string
  /** People in the room right now. */
  online: number
  /** What plays right now. Null while the room is empty: nothing plays for nobody. */
  nowPlaying: { title: string; artist: string } | null
}

export interface ClientToServerEvents {
  /** Starts following the list of rooms. The answer is the list as it is now; changes then arrive as `lobby:rooms`. */
  'lobby:join': (ack: (rooms: RoomSummary[]) => void) => void
  'lobby:leave': () => void
  'room:join': (payload: JoinPayload, ack: (result: JoinResult) => void) => void
  'room:leave': () => void
  'chat:send': (payload: { text: string }, ack: (result: ChatResult) => void) => void
  /** Sets (true) or takes back (false) the viewer's like on the current track. */
  'track:like': (payload: { value: boolean }, ack: (result: ReactResult) => void) => void
  /** Sets or takes back the viewer's vote to skip the current track. */
  'track:skip': (payload: { value: boolean }, ack: (result: ReactResult) => void) => void
}

export interface ServerToClientEvents {
  /** The whole list again, to whoever follows it. Sent in batches, twice a second at most. */
  'lobby:rooms': (rooms: RoomSummary[]) => void
  'room:participant-joined': (participant: Participant) => void
  'room:participant-left': (participantId: string) => void
  /** A new track started: likes and skip votes are back to zero. */
  'room:track': (track: Track | null, reactions: Reactions) => void
  /** Sent in batches, a few times a second at most. */
  'track:reactions': (reactions: Reactions) => void
  'chat:message': (message: ChatMessage) => void
}
