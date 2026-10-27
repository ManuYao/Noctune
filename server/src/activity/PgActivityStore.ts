import type pg from 'pg'
import { emptyActivity, type Activity } from './activity'
import type { ActivityStore } from './ActivityStore'

interface CountersRow {
  tracks_played: number
  likes_received: number
  likes_given: number
  messages_sent: number
  listen_seconds: string
  best_track_likes: number
  best_room_members: number
  night_owl: boolean
}

export class PgActivityStore implements ActivityStore {
  constructor(private readonly pool: pg.Pool) {}

  async add(accountId: string, delta: Activity): Promise<void> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      // Inserted only for an account that exists: one deleted while its batch was on its way is simply ignored.
      const counters = await client.query(
        `INSERT INTO member_activity
           (user_id, tracks_played, likes_received, likes_given, messages_sent, listen_seconds, best_track_likes, best_room_members, night_owl)
         SELECT $1::uuid, GREATEST(0, $2::int), GREATEST(0, $3::int), GREATEST(0, $4::int), GREATEST(0, $5::int), GREATEST(0, $6::bigint),
                GREATEST(0, $7::int), GREATEST(0, $8::int), $9::boolean
         WHERE EXISTS (SELECT 1 FROM users WHERE id = $1::uuid)
         ON CONFLICT (user_id) DO UPDATE SET
           tracks_played = GREATEST(0, member_activity.tracks_played + $2::int),
           likes_received = GREATEST(0, member_activity.likes_received + $3::int),
           likes_given = GREATEST(0, member_activity.likes_given + $4::int),
           messages_sent = GREATEST(0, member_activity.messages_sent + $5::int),
           listen_seconds = GREATEST(0, member_activity.listen_seconds + $6::bigint),
           best_track_likes = GREATEST(member_activity.best_track_likes, $7::int),
           best_room_members = GREATEST(member_activity.best_room_members, $8::int),
           night_owl = member_activity.night_owl OR $9::boolean,
           updated_at = now()`,
        [
          accountId,
          delta.tracksPlayed,
          delta.likesReceived,
          delta.likesGiven,
          delta.messagesSent,
          delta.listenSeconds,
          delta.bestTrackLikes,
          delta.bestRoomMembers,
          delta.nightOwl,
        ],
      )
      if (counters.rowCount === 0) {
        await client.query('ROLLBACK')
        return
      }
      if (delta.days.size > 0) {
        await client.query(
          'INSERT INTO member_activity_days (user_id, day) SELECT $1::uuid, unnest($2::date[]) ON CONFLICT DO NOTHING',
          [accountId, [...delta.days]],
        )
      }
      if (delta.styles.size > 0) {
        const styles = [...delta.styles]
        await client.query(
          `INSERT INTO member_activity_styles (user_id, style, visited, played, listen_seconds)
           SELECT $1::uuid, t.style, t.visited, t.played, GREATEST(0, t.seconds)
           FROM unnest($2::text[], $3::boolean[], $4::boolean[], $5::bigint[]) AS t(style, visited, played, seconds)
           ON CONFLICT (user_id, style) DO UPDATE SET
             visited = member_activity_styles.visited OR EXCLUDED.visited,
             played = member_activity_styles.played OR EXCLUDED.played,
             listen_seconds = member_activity_styles.listen_seconds + EXCLUDED.listen_seconds`,
          [accountId, styles.map(([style]) => style), styles.map(([, v]) => v.visited), styles.map(([, v]) => v.played), styles.map(([, v]) => v.seconds)],
        )
      }
      if (delta.rooms.size > 0) {
        const rooms = [...delta.rooms]
        await client.query(
          `INSERT INTO member_activity_rooms (user_id, room_id, visits, listen_seconds)
           SELECT $1::uuid, t.room_id, GREATEST(0, t.visits), GREATEST(0, t.seconds)
           FROM unnest($2::text[], $3::int[], $4::bigint[]) AS t(room_id, visits, seconds)
           ON CONFLICT (user_id, room_id) DO UPDATE SET
             visits = member_activity_rooms.visits + EXCLUDED.visits,
             listen_seconds = member_activity_rooms.listen_seconds + EXCLUDED.listen_seconds`,
          [accountId, rooms.map(([room]) => room), rooms.map(([, v]) => v.visits), rooms.map(([, v]) => v.seconds)],
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      // The account went between the check and the write: nothing to keep for it.
      if ((error as { code?: string }).code === '23503') return
      throw error
    } finally {
      client.release()
    }
  }

  async read(accountId: string): Promise<Activity> {
    const [counters, days, styles, rooms] = await Promise.all([
      this.pool.query<CountersRow>(
        `SELECT tracks_played, likes_received, likes_given, messages_sent, listen_seconds, best_track_likes, best_room_members, night_owl
         FROM member_activity WHERE user_id = $1`,
        [accountId],
      ),
      this.pool.query<{ day: string }>("SELECT to_char(day, 'YYYY-MM-DD') AS day FROM member_activity_days WHERE user_id = $1", [accountId]),
      this.pool.query<{ style: string; visited: boolean; played: boolean; listen_seconds: string }>(
        'SELECT style, visited, played, listen_seconds FROM member_activity_styles WHERE user_id = $1',
        [accountId],
      ),
      this.pool.query<{ room_id: string; visits: number; listen_seconds: string }>(
        'SELECT room_id, visits, listen_seconds FROM member_activity_rooms WHERE user_id = $1',
        [accountId],
      ),
    ])
    const activity = emptyActivity()
    const row = counters.rows[0]
    if (row) {
      activity.tracksPlayed = row.tracks_played
      activity.likesReceived = row.likes_received
      activity.likesGiven = row.likes_given
      activity.messagesSent = row.messages_sent
      activity.listenSeconds = Number(row.listen_seconds)
      activity.bestTrackLikes = row.best_track_likes
      activity.bestRoomMembers = row.best_room_members
      activity.nightOwl = row.night_owl
    }
    for (const { day } of days.rows) activity.days.add(day)
    for (const s of styles.rows) activity.styles.set(s.style, { visited: s.visited, played: s.played, seconds: Number(s.listen_seconds) })
    for (const r of rooms.rows) activity.rooms.set(r.room_id, { visits: r.visits, seconds: Number(r.listen_seconds) })
    return activity
  }

  async mostMembersIn(roomIds: readonly string[], exceptAccountId: string): Promise<number> {
    if (roomIds.length === 0) return 0
    const { rows } = await this.pool.query<{ most: number }>(
      `SELECT COALESCE(MAX(members), 0)::int AS most FROM (
         SELECT count(*) AS members FROM member_activity_rooms
         WHERE room_id = ANY($1::text[]) AND user_id <> $2 GROUP BY room_id
       ) per_room`,
      [[...roomIds], exceptAccountId],
    )
    return rows[0].most
  }

  async raiseBestRoomMembers(accountId: string, count: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO member_activity (user_id, best_room_members)
       SELECT $1::uuid, GREATEST(0, $2::int) WHERE EXISTS (SELECT 1 FROM users WHERE id = $1::uuid)
       ON CONFLICT (user_id) DO UPDATE SET
         best_room_members = GREATEST(member_activity.best_room_members, $2::int), updated_at = now()`,
      [accountId, count],
    )
  }

  async announcedBadges(accountId: string): Promise<Map<string, number>> {
    const { rows } = await this.pool.query<{ badge_id: string; level: number }>(
      'SELECT badge_id, level FROM member_badges_announced WHERE user_id = $1',
      [accountId],
    )
    return new Map(rows.map((row) => [row.badge_id, row.level]))
  }

  async markBadgesAnnounced(accountId: string, levels: ReadonlyMap<string, number>): Promise<void> {
    if (levels.size === 0) return
    await this.pool.query(
      `INSERT INTO member_badges_announced (user_id, badge_id, level)
       SELECT $1::uuid, t.badge_id, t.level FROM unnest($2::text[], $3::smallint[]) AS t(badge_id, level)
       WHERE EXISTS (SELECT 1 FROM users WHERE id = $1::uuid)
       ON CONFLICT (user_id, badge_id) DO UPDATE SET level = GREATEST(member_badges_announced.level, EXCLUDED.level)`,
      [accountId, [...levels.keys()], [...levels.values()]],
    )
  }

  async deleteAll(accountId: string): Promise<void> {
    for (const table of ['member_badges_announced', 'member_activity', 'member_activity_days', 'member_activity_styles', 'member_activity_rooms']) {
      await this.pool.query(`DELETE FROM ${table} WHERE user_id = $1`, [accountId])
    }
  }
}
