/**
 * What the accounts API needs from the rest of the server when an account changes under it: the rooms and playlists of
 * a member live in other stores, and the rooms are live in memory. Wired in createServer.ts.
 */
import type { AvatarId, RoomRules, RoomStyle, RoomTheme } from '../../../shared/protocol'

export interface ExportedPlaylist {
  name: string
  tracks: { videoId: string; title: string | null; artist: string | null; durationSec: number | null }[]
}

export interface ExportedRoom {
  name: string
  description: string
  styles: RoomStyle[]
  theme: RoomTheme
  rules: RoomRules
}

/** The member's own data, as `GET /api/auth/export` gives it. Never the password hash, never a session token. */
export interface ExportedData {
  exportedAt: string
  account: { email: string; pseudo: string; avatarId: AvatarId; createdAt: string }
  playlists: ExportedPlaylist[]
  rooms: ExportedRoom[]
}

export interface AccountLifecycle {
  /** The ids of the rooms the account hosts. Asked BEFORE the account goes: afterwards the database cannot say. */
  hostedRoomIds(accountId: string): Promise<string[]>
  /** The member's playlists and hosted rooms, for the export. */
  exportData(accountId: string): Promise<Pick<ExportedData, 'playlists' | 'rooms'>>
  /**
   * The account is gone from the database (its sessions, playlists and rooms with it): the same must be true of what the
   * server holds in memory. The stores that live in memory drop their copies, the rooms it hosted are closed (everybody in
   * them is sent out), its connections are cut, its places are taken out of every room and every DJ queue.
   */
  accountDeleted(accountId: string, hostedRoomIds: string[]): Promise<void>
  /** Sessions of the account ended: every one, or every one but the one with this key. Their connections close. */
  sessionsEnded(accountId: string, exceptSessionKey?: string): void
  /** The pseudo of the account changed: what carries a copy of it (the rooms it hosts) is refreshed. */
  profileChanged(accountId: string, pseudo: string): Promise<void>
}
