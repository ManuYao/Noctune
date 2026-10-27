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

export type ChatError = 'not-in-room' | 'empty' | 'too-long' | 'links-not-allowed' | 'rate-limited' | 'muted'

export type ChatResult =
  | { ok: true }
  | { ok: false; error: Exclude<ChatError, 'rate-limited' | 'muted'> }
  | { ok: false; error: 'rate-limited' | 'muted'; retryAfterMs: number }

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

// ---- Moderation and reports. The host of a room (a member who made it) moderates it; the rooms of the team have no host:
// their reports are logged for the team. One ladder everywhere: 1 warning, 2 mute 10 minutes, 3 exclusion 24 hours, (4 ban
// from the platform: the team only, not built). Everything is kept in memory (like the chat) and goes when the room empties.

export const MUTE_SEC = 10 * 60
export const EXCLUDE_SEC = 24 * 60 * 60
export const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'off-topic', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

/** What a report points at: a message of the chat, or the next track of a DJ in the queue. */
export type ReportTarget = { kind: 'chat'; messageId: string } | { kind: 'track'; entryId: string; trackId: string }

/** A report as the host reads it (several people reporting the same thing make one report, with a count). */
export interface Report {
  id: string
  reason: ReportReason
  /** Server clock (ms since epoch) of the first report. */
  at: number
  /** How many different people reported it. */
  count: number
  target:
    | { kind: 'chat'; messageId: string; participantId: string; pseudo: string; text: string }
    | { kind: 'track'; entryId: string; trackId: string; pseudo: string; title: string }
}

export type ReportError = 'not-in-room' | 'invalid' | 'no-such-target' | 'own-target' | 'already-reported' | 'server-error'
export type ReportResult =
  /** `toHost`: false in a room without host (the team gets it in its log). */
  | { ok: true; toHost: boolean }
  | { ok: false; error: ReportError }
  | { ok: false; error: 'rate-limited'; retryAfterMs: number }

export type ModAction = 'warn' | 'mute' | 'exclude'
export type ModError =
  | 'not-in-room'
  | 'not-host'
  | 'invalid'
  | 'no-such-person'
  | 'no-such-report'
  | 'no-such-track'
  /** The host cannot sanction themselves. */
  | 'self'
  | 'server-error'
export type ModResult =
  /** `warnings`: how many warnings the person has had in this room (answer of `warn`), to choose the next step. */
  | { ok: true; warnings?: number }
  | { ok: false; error: ModError }
  | { ok: false; error: 'rate-limited'; retryAfterMs: number }

/** Said to the person a host acted on, and to nobody else. */
export type ModNotice =
  | { kind: 'warning' }
  /** `retryAfterMs`: when they can write again. */
  | { kind: 'muted'; retryAfterMs: number }
  /** The host took a track of theirs out of the queue (or cut it). */
  | { kind: 'track-removed'; title: string }

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
  /** Not in YouTube's "Music" category: Noctune plays music only. */
  | 'not-music'
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
  /** It was found not to be music at the last refresh. */
  | { state: 'not-music' }

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
  description: string
  styles: RoomStyle[]
  theme: RoomTheme
  host: string | null
  /** The viewer is the host of this room (decided by the server from the account, never from the page). */
  isHost: boolean
  /** What members reported in this room: only the host is given it, anybody else gets an empty list. */
  reports: Report[]
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
  /** The host of the room excluded this person (or this address, for a visitor) for 24 hours. */
  | 'excluded'

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
  | 'not-music'
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
  /** A request that needs a session was made without one (or with one that ended). */
  | 'not-signed-in'
  /** The current password given to confirm a sensitive change is not the account's. */
  | 'wrong-password'
  | 'server-error'

export type AuthResult =
  | { ok: true; account: Account }
  | { ok: false; error: Exclude<AuthError, 'rate-limited'> }
  | { ok: false; error: 'rate-limited'; retryAfterSec: number }

// ---- The member's own account (HTTP, under /api/auth; a session is needed, and the origin is checked on every method)
//
//   PATCH  /api/auth/me          { pseudo?, avatarId? }                -> AuthResult           the new account
//   POST   /api/auth/password    { currentPassword, newPassword }      -> AuthResult           this session stays, every other one ends
//   POST   /api/auth/logout-all  {}                                    -> AuthDone             every session ends, this one included
//   DELETE /api/auth/me          { password }                          -> AuthDone             the account and everything of theirs goes
//   GET    /api/auth/export                                            -> the member's data as a JSON file (right of access)
//
// A pseudo or avatar change shows in a room the next time the member enters it.

/** The answer of a call that gives nothing back but "done". */
export type AuthDone = { ok: true } | { ok: false; error: Exclude<AuthError, 'rate-limited'> } | { ok: false; error: 'rate-limited'; retryAfterSec: number }

/** The account behind the session cookie, or null for a visitor. */
export type SessionResult = { ok: true; account: Account | null }

// ---- The member's activity (profile, mock-up 5b, and badges, mock-up 9)
//
//   GET    /api/auth/profile                                           -> ProfileReply        signed in; same protections as /me
//
// Counted by the server for members only (a visitor has nothing). Badges are not stored: `computeBadges` (shared/badges.ts)
// derives them from `ProfileStats`. Nothing here changes votes, the queue or any right.

/** What the server counts about a member. Every number is >= 0. */
export interface ProfileStats {
  /** Tracks played as DJ (a track counts once it has played 10 s, like the "already played" rule). */
  tracksPlayed: number
  /** Likes received on their DJ tracks (one per person and track; a removed like is taken back). */
  likesReceived: number
  /** Likes given to other people's tracks (a track of the room's own selection counts too; own tracks cannot be liked). */
  likesGiven: number
  /** Time spent in rooms, in seconds (every room they are in at the same time counts). */
  listenSeconds: number
  /** Distinct rooms entered. */
  roomsVisited: number
  /** Distinct styles of the rooms entered. */
  stylesVisited: number
  /** Distinct styles of the rooms where their tracks played. */
  stylesPlayed: number
  /** Most likes one of their tracks got. */
  bestTrackLikes: number
  /** Distinct calendar days (Europe/Paris) on which they entered a room. */
  daysActive: number
  messagesSent: number
  /** Rooms they host now. */
  roomsHosted: number
  /** Most distinct members (themselves excluded) who entered one of the rooms they host(ed). Visitors are not counted. */
  membersInBestRoom: number
  /** Tracks in their playlists, all playlists together. */
  playlistTracks: number
  /** Entered a room between 02:00 and 05:00 (Europe/Paris), at least once. */
  nightOwl: boolean
  /** Account creation, ISO 8601. */
  memberSince: string
}

export interface ProfileData {
  stats: ProfileStats
  /** The styles (up to 3) of the rooms they listened to the longest, longest first. */
  topStyles: RoomStyle[]
  /** The rooms (up to 2, still open) they listened to the longest, longest first. */
  topRooms: { id: string; name: string }[]
}

export type ProfileReply =
  | { ok: true; profile: ProfileData }
  | { ok: false; error: Exclude<AuthError, 'rate-limited'> }
  | { ok: false; error: 'rate-limited'; retryAfterSec: number }

// ---- Rooms made by members (HTTP, under /api/rooms; the list and the room itself stay on the realtime connection)
//
//   GET    /api/rooms/mine                        -> RoomReply<{ rooms: RoomDetail[] }>   the rooms the member hosts (signed in)
//   POST   /api/rooms         { RoomSettings }    -> RoomReply<{ room: RoomDetail }>      any member; they become the host
//   GET    /api/rooms/:id                         -> RoomReply<{ room: RoomDetail }>      anybody
//   PATCH  /api/rooms/:id     { RoomSettings }    -> RoomReply<{ room: RoomDetail }>      the host only
//   DELETE /api/rooms/:id                         -> RoomReply                            the host only
//
// The six rooms of the team (no host) live in the same table; nobody can change or delete them through the API.

export const ROOM_STYLES = ['lofi', 'rap', 'electro', 'rock', 'jazz', 'afro', 'pop', 'classique'] as const
export type RoomStyle = (typeof ROOM_STYLES)[number]
/** The stage ambiances. `neon` is the default look (no `data-theme`); the others are `data-theme` values. */
export const ROOM_THEMES = ['neon', 'sunset', 'vinyl', 'jungle'] as const
export type RoomTheme = (typeof ROOM_THEMES)[number]

export const ROOM_NAME_MIN = 3
export const ROOM_NAME_MAX = 40
export const ROOM_DESCRIPTION_MAX = 200
export const ROOM_STYLES_MAX = 3
/** Rooms one member can host at the same time. */
export const ROOMS_PER_MEMBER_MAX = 3

/** What a host can pick for the rules (mock-up 2b). Null: no limit, or never again. */
export const ROOM_MAX_TRACK_CHOICES = [300, 420, 600, 900, null] as const
export const ROOM_REPEAT_CHOICES = [3600, 7200, 14400, null] as const
export const ROOM_MAX_DJS_CHOICES = [5, 10, 20, 50] as const

/** Everything a host decides about a room. */
export interface RoomSettings {
  name: string
  description: string
  styles: RoomStyle[]
  theme: RoomTheme
  rules: RoomRules
}

/** A room as the API tells it. */
export interface RoomDetail extends RoomSettings {
  id: string
  /** Pseudo of the host; null for the rooms of the team. */
  host: string | null
  /** When the member made it (ms since the epoch). Absent for the rooms of the team. */
  createdAt?: number
  /** The viewer hosts it (always false for a visitor). */
  mine: boolean
}

export type RoomError =
  | 'not-signed-in'
  /** The request does not come from the site itself. */
  | 'forbidden'
  | 'bad-request'
  /** The server runs without a database: visitors and the rooms of the team still work, rooms of members do not. */
  | 'no-database'
  | 'room-not-found'
  /** The room exists and is not the viewer's. */
  | 'not-host'
  | 'invalid-name'
  | 'name-taken'
  | 'invalid-description'
  | 'invalid-styles'
  | 'invalid-theme'
  | 'invalid-rules'
  /** The member already hosts `ROOMS_PER_MEMBER_MAX` rooms. */
  | 'too-many-rooms'
  /** The site holds as many rooms made by members as it accepts for now. */
  | 'rooms-full'
  | 'server-error'

export type RoomFailure = { ok: false; error: RoomError } | { ok: false; error: 'rate-limited'; retryAfterSec: number }
export type RoomReply<T = object> = ({ ok: true } & T) | RoomFailure

/** What the list of rooms shows about one room. */
export interface RoomSummary {
  id: string
  name: string
  description: string
  styles: RoomStyle[]
  theme: RoomTheme
  /** Pseudo of the host; null for the rooms of the team. */
  host: string | null
  rules: RoomRules
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
  /** Anybody in a room can report a chat message or a queued track; it goes to the host. */
  'report:create': (payload: { target: ReportTarget; reason: unknown }, ack: (result: ReportResult) => void) => void
  /** The host warns, mutes (10 min) or excludes (24 h) somebody of the room. `reportId`: the report that led to it, handled. */
  'mod:act': (payload: { action: ModAction; participantId: string; reportId?: string }, ack: (result: ModResult) => void) => void
  /** The host takes a track out of a DJ's line-up (on the decks: cuts it). */
  'mod:remove-track': (payload: { entryId: string; trackId: string; reportId?: string }, ack: (result: ModResult) => void) => void
  /** The host sets a report aside. */
  'mod:dismiss': (payload: { reportId: string }, ack: (result: ModResult) => void) => void
}

export interface ServerToClientEvents {
  /** The whole list again, to whoever follows it. Sent in batches, twice a second at most. */
  'lobby:rooms': (rooms: RoomSummary[]) => void
  /** The host changed the room: the new name, description, styles, ambiance and rules. */
  'room:settings': (settings: RoomSettings) => void
  /** The host deleted the room: everybody in it is out, the page goes back to the list. */
  'room:closed': () => void
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
  /** To the host only: the whole inbox of reports, each time it changes. */
  'mod:reports': (reports: Report[]) => void
  /** To the person a host acted on. */
  'mod:notice': (notice: ModNotice) => void
  /** To the person the host excluded: they are out of the room (and cannot come back for 24 hours). */
  'room:excluded': () => void
  /** Sent in batches, a few times a second at most. */
  'track:reactions': (reactions: Reactions) => void
  'chat:message': (message: ChatMessage) => void
}
