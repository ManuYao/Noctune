import type { ChangeRoomResult, CreateRoomResult, DeleteRoomResult, RoomInput, RoomStore, StoredRoom } from './RoomStore'
import { seedNameKey, seedRooms } from './RoomStore'

interface Entry {
  room: StoredRoom
  nameKey: string
  /** Order of arrival: the rooms of the team keep the order they were given, the others follow. */
  order: number
}

/** Callers get their own copy: what one does with it cannot reach what the store keeps. */
const copy = (room: StoredRoom): StoredRoom => ({ ...room, styles: [...room.styles], rules: { ...room.rules } })

/** The same behaviour as PgRoomStore, without a database: for tests, and for a server that has none. */
export class MemoryRoomStore implements RoomStore {
  private readonly entries = new Map<string, Entry>()
  private order = 0

  /** Starts with the rooms of the team. */
  constructor(seeds: StoredRoom[] = seedRooms()) {
    for (const room of seeds) this.entries.set(room.id, { room: copy(room), nameKey: seedNameKey(room.name), order: (this.order += 1) })
  }

  private sorted(): Entry[] {
    return [...this.entries.values()].sort((a, b) => a.order - b.order)
  }

  async list(): Promise<StoredRoom[]> {
    return this.sorted().map((entry) => copy(entry.room))
  }

  async listByHost(accountId: string): Promise<StoredRoom[]> {
    return this.sorted()
      .filter((entry) => entry.room.hostAccountId === accountId)
      .map((entry) => copy(entry.room))
  }

  async get(id: string): Promise<StoredRoom | null> {
    const entry = this.entries.get(id)
    return entry ? copy(entry.room) : null
  }

  async create(host: { accountId: string; pseudo: string }, id: string, input: RoomInput, max: number): Promise<CreateRoomResult> {
    if (this.entries.has(id)) return { ok: false, error: 'id-taken' }
    if (this.sorted().some((entry) => entry.nameKey === input.nameKey)) return { ok: false, error: 'name-taken' }
    const hosted = this.sorted().filter((entry) => entry.room.hostAccountId === host.accountId).length
    if (hosted >= max) return { ok: false, error: 'too-many-rooms' }
    const room: StoredRoom = {
      id,
      name: input.name,
      description: input.description,
      styles: [...input.styles],
      theme: input.theme,
      rules: { ...input.rules },
      hostAccountId: host.accountId,
      hostPseudo: host.pseudo,
    }
    this.entries.set(id, { room, nameKey: input.nameKey, order: (this.order += 1) })
    return { ok: true, room: copy(room) }
  }

  async update(accountId: string, id: string, input: RoomInput): Promise<ChangeRoomResult> {
    const entry = this.entries.get(id)
    if (!entry) return { ok: false, error: 'room-not-found' }
    if (entry.room.hostAccountId === null || entry.room.hostAccountId !== accountId) return { ok: false, error: 'not-host' }
    if (this.sorted().some((other) => other !== entry && other.nameKey === input.nameKey)) return { ok: false, error: 'name-taken' }
    entry.room = {
      ...entry.room,
      name: input.name,
      description: input.description,
      styles: [...input.styles],
      theme: input.theme,
      rules: { ...input.rules },
    }
    entry.nameKey = input.nameKey
    return { ok: true, room: copy(entry.room) }
  }

  async delete(accountId: string, id: string): Promise<DeleteRoomResult> {
    const entry = this.entries.get(id)
    if (!entry) return { ok: false, error: 'room-not-found' }
    if (entry.room.hostAccountId === null || entry.room.hostAccountId !== accountId) return { ok: false, error: 'not-host' }
    this.entries.delete(id)
    return { ok: true }
  }
}
