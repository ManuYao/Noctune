// Contract between the realtime server and the web client. Types and constants only.

export const AVATAR_IDS = ['pulse', 'mango', 'moss', 'cloud', 'grape', 'ember', 'lemon', 'mist'] as const
export type AvatarId = (typeof AVATAR_IDS)[number]

export const PSEUDO_MIN = 2
export const PSEUDO_MAX = 20

export interface Participant {
  id: string
  pseudo: string
  avatarId: AvatarId
  /** Signed in with an account. Their pseudo is theirs alone: a visitor cannot take it. */
  member: boolean
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

export type JoinError =
  | 'invalid-pseudo'
  | 'invalid-avatar'
  | 'unknown-room'
  | 'pseudo-taken'
  /** A visitor asked for the pseudo of a member. */
  | 'pseudo-reserved'
  /** The member is already in this room (another tab, another device). */
  | 'already-in-room'
  /** Something went wrong on the server: the visitor can try again. */
  | 'server-error'
  /** Joins asked for faster than anybody does. */
  | 'rate-limited'

export type JoinResult = { ok: true; snapshot: RoomSnapshot } | { ok: false; error: JoinError }

export interface JoinPayload {
  roomId: string
  pseudo: string
  avatarId: string
}

// ---- Accounts (HTTP, under /api/auth). The browser keeps the session in a cookie it cannot read.

export const EMAIL_MAX = 254
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128

/** What the owner of an account sees about it. */
export interface Account {
  email: string
  pseudo: string
  avatarId: AvatarId
}

export type AuthError =
  | 'invalid-email'
  | 'weak-password'
  | 'invalid-pseudo'
  | 'invalid-avatar'
  | 'email-taken'
  | 'pseudo-taken'
  /** Wrong e-mail or wrong password: never said which, so that nobody can test which e-mails have an account. */
  | 'bad-credentials'
  | 'rate-limited'
  /** Not a request the page would send: wrong shape, wrong type, too big, unknown route. */
  | 'bad-request'
  /** The request does not come from the site itself. */
  | 'forbidden'
  /** The server runs without a database: visitors still work, accounts do not. */
  | 'unavailable'
  /** Too many passwords being checked at once. */
  | 'busy'
  | 'server-error'

export type AuthResult =
  | { ok: true; account: Account }
  | { ok: false; error: Exclude<AuthError, 'rate-limited'> }
  | { ok: false; error: 'rate-limited'; retryAfterSec: number }

/** The account behind the session cookie, or null for a visitor. */
export type SessionResult = { ok: true; account: Account | null }

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
