import { combine, emptyActivity, type Activity } from './activity'
import type { ActivityStore } from './ActivityStore'

/** The same behaviour as PgActivityStore, without a database: for tests. */
export class MemoryActivityStore implements ActivityStore {
  private readonly byAccount = new Map<string, Activity>()

  async add(accountId: string, delta: Activity): Promise<void> {
    this.byAccount.set(accountId, combine(this.byAccount.get(accountId) ?? emptyActivity(), delta, true))
  }

  async read(accountId: string): Promise<Activity> {
    return combine(this.byAccount.get(accountId) ?? emptyActivity(), emptyActivity())
  }

  async mostMembersIn(roomIds: readonly string[], exceptAccountId: string): Promise<number> {
    let most = 0
    for (const roomId of roomIds) {
      let members = 0
      for (const [accountId, activity] of this.byAccount) {
        if (accountId !== exceptAccountId && activity.rooms.has(roomId)) members += 1
      }
      most = Math.max(most, members)
    }
    return most
  }

  async raiseBestRoomMembers(accountId: string, count: number): Promise<void> {
    const mark = emptyActivity()
    mark.bestRoomMembers = count
    await this.add(accountId, mark)
  }

  async deleteAll(accountId: string): Promise<void> {
    this.byAccount.delete(accountId)
  }
}
