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
  title: string
  artist: string
  durationSec: number
  /** Server clock (ms since epoch) when the track started. Clients seek relative to it. */
  startedAt: number
}

export interface RoomSnapshot {
  roomId: string
  name: string
  selfId: string
  participants: Participant[]
  nowPlaying: Track | null
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

export interface ClientToServerEvents {
  'room:join': (payload: JoinPayload, ack: (result: JoinResult) => void) => void
  'room:leave': () => void
}

export interface ServerToClientEvents {
  'room:participant-joined': (participant: Participant) => void
  'room:participant-left': (participantId: string) => void
  'room:track': (track: Track | null) => void
}
