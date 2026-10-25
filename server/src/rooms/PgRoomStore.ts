import type pg from 'pg'
import type { RoomStyle, RoomTheme } from '../../../shared/protocol'
import type { ChangeRoomResult, CreateRoomResult, DeleteRoomResult, RoomInput, RoomStore, StoredRoom } from './RoomStore'

interface RoomRow {
  id: string
  name: string
  description: string
  styles: string[]
  theme: string
  max_track_sec: number | null
  repeat_delay_sec: number | null
  max_djs: number
  host_account_id: string | null
  host_pseudo: string | null
}

const SELECT = `SELECT r.id, r.name, r.description, r.styles, r.theme, r.max_track_sec, r.repeat_delay_sec, r.max_djs,
                       r.host_account_id, u.pseudo AS host_pseudo
                  FROM rooms r LEFT JOIN users u ON u.id = r.host_account_id`
// The rooms of the team come first, in their order; the others follow, oldest first.
const ORDER = 'ORDER BY r.seed_position NULLS LAST, r.created_at, r.id'

const toRoom = (row: RoomRow): StoredRoom => ({
  id: row.id,
  name: row.name,
  description: row.description,
  // The database only holds values its CHECKs let through.
  styles: row.styles as RoomStyle[],
  theme: row.theme as RoomTheme,
  rules: { maxTrackSec: row.max_track_sec, repeatDelaySec: row.repeat_delay_sec, maxDjs: row.max_djs },
  hostAccountId: row.host_account_id,
  hostPseudo: row.host_pseudo,
})

/** The constraint a unique violation was about (see migration 003). */
const violated = (error: unknown): string | undefined => {
  const { code, constraint } = error as { code?: string; constraint?: string }
  return code === '23505' ? constraint : undefined
}

export class PgRoomStore implements RoomStore {
  constructor(private readonly pool: pg.Pool) {}

  /** One transaction. Whatever throws rolls it back, and the connection goes back to the pool either way. */
  private async inTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async list(): Promise<StoredRoom[]> {
    const { rows } = await this.pool.query<RoomRow>(`${SELECT} ${ORDER}`)
    return rows.map(toRoom)
  }

  async listByHost(accountId: string): Promise<StoredRoom[]> {
    const { rows } = await this.pool.query<RoomRow>(`${SELECT} WHERE r.host_account_id = $1 ${ORDER}`, [accountId])
    return rows.map(toRoom)
  }

  async get(id: string): Promise<StoredRoom | null> {
    const { rows } = await this.pool.query<RoomRow>(`${SELECT} WHERE r.id = $1`, [id])
    return rows[0] ? toRoom(rows[0]) : null
  }

  async create(host: { accountId: string; pseudo: string }, id: string, input: RoomInput, max: number): Promise<CreateRoomResult> {
    try {
      return await this.inTransaction(async (client): Promise<CreateRoomResult> => {
        // Locks the member's row: what changes their set of rooms happens one at a time, so the limit cannot be passed.
        const member = await client.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [host.accountId])
        if (!member.rowCount) throw new Error('unknown account')
        const hosted = await client.query<{ count: number }>('SELECT count(*)::int AS count FROM rooms WHERE host_account_id = $1', [host.accountId])
        if (hosted.rows[0].count >= max) return { ok: false, error: 'too-many-rooms' }
        await client.query(
          `INSERT INTO rooms (id, name, name_key, description, styles, theme, max_track_sec, repeat_delay_sec, max_djs, host_account_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [id, input.name, input.nameKey, input.description, input.styles, input.theme, input.rules.maxTrackSec, input.rules.repeatDelaySec, input.rules.maxDjs, host.accountId],
        )
        const { rows } = await client.query<RoomRow>(`${SELECT} WHERE r.id = $1`, [id])
        return { ok: true, room: toRoom(rows[0]) }
      })
    } catch (error) {
      // Two members creating a room with the same name at the same moment: the table has the last word.
      const constraint = violated(error)
      if (constraint === 'rooms_name_key_unique') return { ok: false, error: 'name-taken' }
      if (constraint === 'rooms_pkey') return { ok: false, error: 'id-taken' }
      throw error
    }
  }

  async update(accountId: string, id: string, input: RoomInput): Promise<ChangeRoomResult> {
    try {
      return await this.inTransaction(async (client): Promise<ChangeRoomResult> => {
        const found = await client.query<{ host_account_id: string | null }>('SELECT host_account_id FROM rooms WHERE id = $1 FOR UPDATE', [id])
        if (!found.rowCount) return { ok: false, error: 'room-not-found' }
        const host = found.rows[0].host_account_id
        if (host === null || host !== accountId) return { ok: false, error: 'not-host' }
        await client.query(
          `UPDATE rooms SET name = $2, name_key = $3, description = $4, styles = $5, theme = $6,
                  max_track_sec = $7, repeat_delay_sec = $8, max_djs = $9, updated_at = now()
            WHERE id = $1`,
          [id, input.name, input.nameKey, input.description, input.styles, input.theme, input.rules.maxTrackSec, input.rules.repeatDelaySec, input.rules.maxDjs],
        )
        const { rows } = await client.query<RoomRow>(`${SELECT} WHERE r.id = $1`, [id])
        return { ok: true, room: toRoom(rows[0]) }
      })
    } catch (error) {
      if (violated(error) === 'rooms_name_key_unique') return { ok: false, error: 'name-taken' }
      throw error
    }
  }

  async delete(accountId: string, id: string): Promise<DeleteRoomResult> {
    return this.inTransaction(async (client): Promise<DeleteRoomResult> => {
      const found = await client.query<{ host_account_id: string | null }>('SELECT host_account_id FROM rooms WHERE id = $1 FOR UPDATE', [id])
      if (!found.rowCount) return { ok: false, error: 'room-not-found' }
      const host = found.rows[0].host_account_id
      if (host === null || host !== accountId) return { ok: false, error: 'not-host' }
      await client.query('DELETE FROM rooms WHERE id = $1', [id])
      return { ok: true }
    })
  }
}
