import type { RoomRules, RoomStyle, RoomTheme } from '../../../shared/protocol'
import { roomNameKey } from '../../../shared/validation'
import { ROOM_DEFS } from '../catalog'

/** A room as the store keeps it. */
export interface StoredRoom {
  id: string
  name: string
  description: string
  styles: RoomStyle[]
  theme: RoomTheme
  rules: RoomRules
  /** The member who hosts it. Null for the rooms of the team, which nobody can change or delete through the API. */
  hostAccountId: string | null
  /** The host's pseudo, as their account has it. Null for the rooms of the team. */
  hostPseudo: string | null
  /** When a member made the room, in milliseconds. Null for the rooms of the team: the date of their migration would say nothing. */
  createdAt: number | null
}

/** What a host decides, already checked: name, description, styles, ambiance, rules, and the name key (see roomNameKey). */
export interface RoomInput {
  name: string
  nameKey: string
  description: string
  styles: RoomStyle[]
  theme: RoomTheme
  rules: RoomRules
}

export type CreateRoomResult =
  | { ok: true; room: StoredRoom }
  | { ok: false; error: 'name-taken' | 'too-many-rooms' | 'id-taken' }
export type ChangeRoomResult =
  | { ok: true; room: StoredRoom }
  | { ok: false; error: 'room-not-found' | 'not-host' | 'name-taken' }
export type DeleteRoomResult = { ok: true } | { ok: false; error: 'room-not-found' | 'not-host' }

/**
 * Where rooms are kept. PostgreSQL in the real server (PgRoomStore), memory in tests and without a database
 * (MemoryRoomStore): both pass the same tests, see roomStoreContract.ts.
 *
 * Who may change a room is decided here, not only by the code above: `update` and `delete` take the account that asks and
 * refuse unless it is the host. The limit of rooms per host is checked in the same step as the creation, so that two
 * requests at the same moment cannot both pass it.
 */
export interface RoomStore {
  /** Every room: the rooms of the team first, in their order, then the others, oldest first. */
  list(): Promise<StoredRoom[]>
  /** The rooms a member hosts, oldest first. */
  listByHost(accountId: string): Promise<StoredRoom[]>
  get(id: string): Promise<StoredRoom | null>
  /** Fails, with nothing created, when the name key or the id is used, or the host already has `max` rooms. */
  create(host: { accountId: string; pseudo: string }, id: string, input: RoomInput, max: number): Promise<CreateRoomResult>
  update(accountId: string, id: string, input: RoomInput): Promise<ChangeRoomResult>
  delete(accountId: string, id: string): Promise<DeleteRoomResult>
  /**
   * Every room the member hosts, deleted; the ids that went. The end of their account: in the database the cascade from the
   * account already did it (this finds nothing to do); in memory nothing else would.
   */
  deleteByHost(accountId: string): Promise<string[]>
  /** The host changed their pseudo. The database reads it from the account; a store that keeps a copy updates it. */
  renameHost(accountId: string, pseudo: string): Promise<void>
}

/** The six rooms of the team, as migration 003 puts them in the database. */
export function seedRooms(): StoredRoom[] {
  return ROOM_DEFS.map((def) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    styles: [...def.styles],
    theme: def.theme,
    rules: { ...def.rules },
    hostAccountId: null,
    hostPseudo: null,
    createdAt: null,
  }))
}

/** The name key of a room of the team (they are in the database with it). */
export const seedNameKey = (name: string): string => roomNameKey(name.normalize('NFKC'))
