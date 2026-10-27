import type { Activity } from './activity'

/**
 * Where what is counted about members is kept. PostgreSQL in the real server (PgActivityStore), memory in tests
 * (MemoryActivityStore): both pass the same tests, see activityStoreContract.ts.
 *
 * Writes are additions: the caller (ActivityRecorder) has accumulated a while and hands over the sum. A counter never goes
 * under zero. An account that does not exist (deleted while a batch was on its way) is ignored, not an error.
 */
export interface ActivityStore {
  /** Adds `delta` to what the account has; the high-water marks keep the larger value; days and styles are merged. */
  add(accountId: string, delta: Activity): Promise<void>
  /** Everything kept for the account (an empty value when nothing is). */
  read(accountId: string): Promise<Activity>
  /** The largest number of distinct members, `exceptAccountId` excluded, who entered any one of these rooms. */
  mostMembersIn(roomIds: readonly string[], exceptAccountId: string): Promise<number>
  /** Raises the "most members in one of my rooms" mark to at least `count`. */
  raiseBestRoomMembers(accountId: string, count: number): Promise<void>
  /** Everything kept for the account: the end of the account (in the database the cascade already did it). */
  deleteAll(accountId: string): Promise<void>
}
