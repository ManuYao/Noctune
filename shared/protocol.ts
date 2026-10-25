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

export type ReactError =
  | 'not-in-room'
  | 'no-track'
  | 'invalid'
  /** A DJ does not like their own track. (A DJ who skips their own track is allowed: it changes at once.) */
  | 'own-track'

export type ReactResult =
  | { ok: true }
  | { ok: false; error: ReactError }
  | { ok: false; error: 'rate-limited' | 'too-early'; retryAfterMs: number }

// ---- DJs: the rules of a room, the queue, the tracks a DJ lines up. Only members can be DJs.

/** What a room asks of the tracks its DJs bring. Each room has its own; its host will choose them later. */
export interface RoomRules {
  /** Longest track a DJ may bring, in seconds. Null: no limit. */
  maxTrackSec: number | null
  /** How long a track must wait before it can play again in this room, in seconds. Null: never again. */
  repeatDelaySec: number | null
  /** Most DJs the queue holds, the one on the decks included. */
  maxDjs: number
}

/** The most tracks one DJ can have lined up in a room. */
export const LINEUP_MAX = 10
/**
 * A DJ cannot skip their own track before it has played this long. (A play shorter than this does not count as played
 * in the room's memory, so a track that can be skipped always counts: skipping cannot be used to replay it at once.)
 */
export const OWN_SKIP_MIN_SEC = 10
/** The longest link (or video id) the server reads. */
export const DJ_INPUT_MAX = 300

/** A track a DJ lined up, waiting for their turn. */
export type QueuedTrack = Omit<Track, 'startedAt'>

/** What the server read about a YouTube video. */
export type VideoInfo = Pick<Track, 'videoId' | 'title' | 'artist' | 'durationSec'>

/** One DJ in the queue, as everybody sees it. */
export interface DjQueueEntry {
  /** Stays the same while the DJ keeps their place. Not the participant id: that changes when they come back. */
  id: string
  pseudo: string
  avatarId: AvatarId
  /** The DJ's id among the participants while they are in the room; null while they are away. */
  participantId: string | null
  /** The track they play on their next turn. Null while they have none lined up: their turn will be skipped. */
  next: QueuedTrack | null
}

export interface DjQueue {
  /** On the decks right now. Null while the room's own selection plays. */
  current: DjQueueEntry | null
  /** Waiting for their turn, the next one first. */
  waiting: DjQueueEntry[]
}

export type DjError =
  | 'not-in-room'
  /** Passing DJ needs an account. */
  | 'members-only'
  /** Not what the page sends: wrong shape, wrong type, too long. */
  | 'invalid'
  /** Not a link to a YouTube video. */
  | 'invalid-link'
  /** The video does not exist, or is private. */
  | 'not-found'
  /** Its owner does not allow it to be played outside YouTube. */
  | 'not-embeddable'
  /** A live stream, an age-restricted video, or otherwise not playable here. */
  | 'unavailable'
  /** A DJ of this room already lined it up. */
  | 'already-queued'
  /** The queue holds as many DJs as the room allows, and this member is not one of them. */
  | 'queue-full'
  /** This DJ already has LINEUP_MAX tracks lined up. */
  | 'lineup-full'
  /** Not in the DJ's line-up (already played, or never there). */
  | 'no-such-track'
  | 'not-in-queue'
  /** The server cannot read YouTube right now: no access configured, quota used up, YouTube down. */
  | 'service-unavailable'
  | 'server-error'

export type DjFailure =
  | { ok: false; error: DjError }
  | { ok: false; error: 'too-long'; maxSec: number }
  /** `retryAfterSec`: when it may play again, null if the room never lets a track play twice. */
  | { ok: false; error: 'recently-played'; retryAfterSec: number | null }
  | { ok: false; error: 'rate-limited'; retryAfterMs: number }

export type DjResult = { ok: true } | DjFailure
/** The track was added to the member's line-up; if they were not in the queue, they are now (at the end). */
export type AddTrackResult = { ok: true; track: QueuedTrack } | DjFailure

/** Where a playlist track stands in the room the member is in: whether the room would take it now. */
export type TrackStatus =
  | { state: 'ok' }
  | { state: 'too-long'; maxSec: number }
  /** `retryAfterSec`: when it may play again, null if the room never lets a track play twice. */
  | { state: 'recently-played'; retryAfterSec: number | null }
  /** A DJ of this room already lined it up, or it plays right now. */
  | { state: 'queued' }
  /** It could no longer be played at the last refresh (removed, private, no longer embeddable). */
  | { state: 'unavailable' }

/** Keyed by playlist track id. */
export type PlaylistStatusResult = { ok: true; statuses: Record<string, TrackStatus> } | DjFailure

/** Said to one DJ, and to nobody else. */
export type DjNotice =
  /** A track of the line-up was taken out when its turn came: it no longer fits the rules of the room. */
  | { kind: 'track-dropped'; title: string; reason: 'too-long' | 'recently-played' }
  /** Their turn came and they had no track to play: they keep their place, for one more turn. */
  | { kind: 'skipped' }
  /** Their turn was skipped twice in a row: they are out of the queue. */
  | { kind: 'removed' }

export interface RoomSnapshot {
  roomId: string
  name: string
  selfId: string
  participants: Participant[]
  nowPlaying: Track | null
  reactions: Reactions
  mine: MyReactions
  rules: RoomRules
  queue: DjQueue
  /** The viewer's own line-up (the tracks they will play, in order). Empty for a visitor. */
  lineup: QueuedTrack[]
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

// ---- Playlists (HTTP, under /api/playlists). Members only: the session cookie says whose they are.
//
//   GET    /api/playlists                                  -> PlaylistReply<{ playlists: PlaylistSummary[] }>
//   POST   /api/playlists                 { name }          -> PlaylistReply<{ playlist: PlaylistSummary }>
//   PATCH  /api/playlists/:id             { name }          -> PlaylistReply<{ playlist: PlaylistSummary }>
//   DELETE /api/playlists/:id                               -> PlaylistReply
//   GET    /api/playlists/:id                               -> PlaylistReply<{ playlist: Playlist }>
//   POST   /api/playlists/:id/tracks      { input }         -> PlaylistReply<{ track: PlaylistTrack }>   (a link or a video id)
//   DELETE /api/playlists/:id/tracks/:trackId               -> PlaylistReply
//   POST   /api/playlists/:id/tracks/:trackId/move { position } -> PlaylistReply   (new place, from 0)

export const PLAYLISTS_MAX = 20
export const PLAYLIST_TRACKS_MAX = 200
export const PLAYLIST_NAME_MAX = 40

export interface PlaylistSummary {
  id: string
  name: string
  trackCount: number
}

export interface PlaylistTrack {
  id: string
  videoId: string
  /** What YouTube said the last time the server asked. Null when that is too old to show and could not be refreshed now. */
  title: string | null
  artist: string | null
  durationSec: number | null
  /** At the last refresh the video could no longer be played (removed, private, no longer embeddable). */
  unavailable: boolean
}

export interface Playlist extends PlaylistSummary {
  tracks: PlaylistTrack[]
}

export type PlaylistError =
  | 'not-signed-in'
  /** The request does not come from the site itself. */
  | 'forbidden'
  | 'bad-request'
  /** The server runs without a database: visitors still work, accounts and playlists do not. */
  | 'no-database'
  /** Not found, or not the member's own: never said which. */
  | 'playlist-not-found'
  | 'track-not-found'
  | 'invalid-name'
  | 'name-taken'
  | 'playlists-full'
  | 'playlist-full'
  | 'already-in-playlist'
  // The video, read from the link (same meaning as in DjError).
  | 'invalid-link'
  | 'not-found'
  | 'not-embeddable'
  | 'unavailable'
  | 'service-unavailable'
  | 'server-error'

export type PlaylistFailure = { ok: false; error: PlaylistError } | { ok: false; error: 'rate-limited'; retryAfterSec: number }
export type PlaylistReply<T = object> = ({ ok: true } & T) | PlaylistFailure

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
  /** DJs in the queue (the one on the decks included), and how many the room holds at most. */
  djs: number
  maxDjs: number
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
  /** Sets or takes back the viewer's vote to skip the current track. A DJ skipping their own track: it changes at once. */
  'track:skip': (payload: { value: boolean }, ack: (result: ReactResult) => void) => void
  /**
   * Lines a YouTube video up for the member's turns. Either `input` (a link or a video id) or `playlistTrackId` (a track
   * of one of the member's own playlists). Puts them in the queue if they are not.
   */
  'dj:add': (payload: { input: string } | { playlistTrackId: string }, ack: (result: AddTrackResult) => void) => void
  /** For each track of one of the member's playlists: would this room take it now? */
  'dj:playlist-status': (payload: { playlistId: string }, ack: (result: PlaylistStatusResult) => void) => void
  /** Takes one track out of the member's own line-up. */
  'dj:remove': (payload: { trackId: string }, ack: (result: DjResult) => void) => void
  /** Leaves the queue, line-up included. On the decks, that cuts the track that plays. */
  'dj:leave': (ack: (result: DjResult) => void) => void
}

export interface ServerToClientEvents {
  /** The whole list again, to whoever follows it. Sent in batches, twice a second at most. */
  'lobby:rooms': (rooms: RoomSummary[]) => void
  'room:participant-joined': (participant: Participant) => void
  'room:participant-left': (participantId: string) => void
  /** A new track started (or the room emptied): likes and skip votes are back to zero, and the queue has moved on. */
  'room:track': (track: Track | null, reactions: Reactions, queue: DjQueue) => void
  /** The queue changed without a new track: someone joined, left, came back, lined up a track. */
  'dj:queue': (queue: DjQueue) => void
  /** To one DJ only: their line-up changed (a track added, removed, or taken for their turn). */
  'dj:lineup': (lineup: QueuedTrack[]) => void
  /** To one DJ only. */
  'dj:notice': (notice: DjNotice) => void
  /** Sent in batches, a few times a second at most. */
  'track:reactions': (reactions: Reactions) => void
  'chat:message': (message: ChatMessage) => void
}
