import { computeBadges, type BadgeState } from '../../../shared/badges'
import type { BadgeEarned, ProfileData } from '../../../shared/protocol'
import type { ActivityStore } from './ActivityStore'

export interface BadgeAnnouncerOptions {
  now?: () => number
  /** Quiet time after the last event of a member before their badges are looked at (a burst of likes counts once). */
  settleMs?: number
  /** The least time between two looks at the same member. */
  minGapMs?: number
}

const SETTLE_MS = 3_000
const MIN_GAP_MS = 15_000
// Members looked at in the same minute that are not connected get nothing: the cap bounds the timers and the map.
const MAX_TRACKED = 5_000

/**
 * Tells a member, once, that they have earned a badge or a new level. Badges are derived from the counters, so this is
 * what notices the change: after something is counted for a member, their badges are computed again and compared with
 * the levels already announced (kept in the store, so that every device and every restart agree).
 *
 * A level counts as announced only once a connection of the member has been handed it: a member who is offline when they
 * earn it is told on their next activity. A member who had earned badges before this existed is told of all of them in one go.
 * Nothing here may throw into a room, wait for one, or change a vote, a queue or a right.
 */
export class BadgeAnnouncer {
  private readonly timers = new Map<string, NodeJS.Timeout>()
  private readonly lastCheck = new Map<string, number>()
  private readonly now: () => number
  private readonly settleMs: number
  private readonly minGapMs: number
  private stopped = false

  constructor(
    private readonly store: ActivityStore,
    private readonly source: {
      /** The member's profile, or null when it cannot be read (nothing is announced then). */
      profileOf: (accountId: string) => Promise<ProfileData | null>
      /** Hands the badges to the member's open connections; how many connections got them. */
      send: (accountId: string, badges: BadgeEarned[]) => number
    },
    options: BadgeAnnouncerOptions = {},
  ) {
    this.now = options.now ?? Date.now
    this.settleMs = options.settleMs ?? SETTLE_MS
    this.minGapMs = options.minGapMs ?? MIN_GAP_MS
  }

  /** Something was counted for this member: look at their badges soon. */
  touch(accountId: string) {
    if (this.stopped || this.timers.has(accountId) || this.timers.size >= MAX_TRACKED) return
    const sinceLast = this.now() - (this.lastCheck.get(accountId) ?? -Infinity)
    const wait = Math.max(this.settleMs, this.minGapMs - sinceLast)
    const timer = setTimeout(() => {
      this.timers.delete(accountId)
      void this.check(accountId)
    }, wait)
    timer.unref()
    this.timers.set(accountId, timer)
  }

  /** The account is gone, or the server stops: nothing more is looked at. */
  forget(accountId: string) {
    clearTimeout(this.timers.get(accountId))
    this.timers.delete(accountId)
    this.lastCheck.delete(accountId)
  }

  stop() {
    this.stopped = true
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }

  /** Looks now (tests call it directly). Never throws. Resolves to the badges announced. */
  async check(accountId: string): Promise<BadgeEarned[]> {
    try {
      this.lastCheck.set(accountId, this.now())
      if (this.lastCheck.size > MAX_TRACKED) this.lastCheck.delete(this.lastCheck.keys().next().value as string)
      const profile = await this.source.profileOf(accountId)
      if (!profile) return []
      const announced = await this.store.announcedBadges(accountId)
      const earned = newlyEarned(computeBadges(profile.stats, new Date(this.now())), announced)
      if (earned.length === 0) return []
      if (this.source.send(accountId, earned.map((e) => e.badge)) === 0) return []
      await this.store.markBadgesAnnounced(accountId, new Map(earned.map((e) => [e.badge.id, e.badge.level])))
      return earned.map((e) => e.badge)
    } catch (error) {
      console.error(`[badges] ${(error as Error).message}`)
      return []
    }
  }
}

/** The badges whose level is above the announced one, with the payload for the page. A secret one is never among them. */
function newlyEarned(states: readonly BadgeState[], announced: ReadonlyMap<string, number>): { badge: BadgeEarned }[] {
  return states
    .filter((state) => state.level > (announced.get(state.id) ?? 0))
    .map((state) => ({
      badge: {
        id: state.id,
        name: state.name,
        kind: state.kind,
        level: state.level,
        levels: state.tiers.length,
        tierLabel: state.kind === 'tiered' ? (state.tiers[state.level - 1]?.label ?? '') : '',
      },
    }))
}
