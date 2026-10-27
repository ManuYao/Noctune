import { randomUUID } from 'node:crypto'
import { EXCLUDE_SEC, MUTE_SEC, type Report, type ReportReason } from '../../../shared/protocol'
import { RateWindow } from './RateWindow'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
// Reports a host keeps, and how long: like the chat, nothing here is a record. Oldest dropped past the limit.
const MAX_REPORTS = 50
const REPORT_TTL_MS = DAY_MS
// A warning is remembered for a day (it only helps the host choose the next step).
const WARNING_TTL_MS = DAY_MS
// Sanctions a room remembers at most: past this the expired ones go, then the oldest.
const MAX_KEYS = 2000
const EXCERPT_MAX = 100

export interface ModerationOptions {
  /** Tests shorten the sanctions. */
  muteMs?: number
  excludeMs?: number
  reportTtlMs?: number
  maxReports?: number
  maxKeys?: number
  /** Time between two reports of one person (5 s), reports per person per hour (20), acts of a host per minute (30). */
  reportGapMs?: number
  reportsPerHour?: number
  actionsPerMinute?: number
}

type ReportTargetInfo = Report['target']

/** One key, or the several a person's sanctions stick to. */
type Keys = string | readonly string[]
const asList = (keys: Keys): readonly string[] => (typeof keys === 'string' ? [keys] : keys)

interface FiledReport {
  report: Report
  /** Who reported it (their sanction keys): one person, one report per target. Never sent anywhere. */
  reporters: Set<string>
  /** What it points at, to find the same target again. */
  targetKey: string
}

export type FileResult =
  | { ok: true; report: Report; created: boolean }
  | { ok: false; error: 'already-reported' }
  /** The inbox is full of reports that more people made than this one: it is not taken. */
  | { ok: false; error: 'inbox-full'; retryAfterMs: number }

// When the inbox is full and refuses a report, it says to come back in a minute (the host may have made room).
const INBOX_FULL_RETRY_MS = 60_000

/** The text of a reported message, cut to what the host needs to recognise it. */
export function excerpt(text: string): string {
  const characters = [...text]
  return characters.length <= EXCERPT_MAX ? text : `${characters.slice(0, EXCERPT_MAX - 1).join('')}…`
}

/**
 * What a room knows about sanctions and reports. In memory only, bounded, expiring by itself, and gone with the room.
 * Pure bookkeeping: the clock is passed in, and it knows nothing about sockets.
 */
export class Moderation {
  private muted = new Map<string, number>()
  private excluded = new Map<string, number>()
  private warned = new Map<string, { count: number; expiresAt: number }>()
  private filed: FiledReport[] = []
  // Who already reported what (reporter + target, for as long as a report lives): setting a report aside must not let the
  // same person file it again, 20 times an hour, at the host.
  private reportedBy = new Map<string, number>()
  // 1 report per 5 s and 20 per hour for each person; 30 acts a minute for a host.
  private readonly reportGap: RateWindow
  private readonly reportHourly: RateWindow
  private readonly actions: RateWindow
  private readonly muteMs: number
  private readonly excludeMs: number
  private readonly reportTtlMs: number
  private readonly maxReports: number
  private readonly maxKeys: number

  constructor(options: ModerationOptions = {}) {
    this.muteMs = options.muteMs ?? MUTE_SEC * 1000
    this.excludeMs = options.excludeMs ?? EXCLUDE_SEC * 1000
    this.reportTtlMs = options.reportTtlMs ?? REPORT_TTL_MS
    this.maxReports = options.maxReports ?? MAX_REPORTS
    this.maxKeys = options.maxKeys ?? MAX_KEYS
    this.reportGap = new RateWindow(1, options.reportGapMs ?? 5000)
    this.reportHourly = new RateWindow(options.reportsPerHour ?? 20, HOUR_MS)
    this.actions = new RateWindow(options.actionsPerMinute ?? 30, 60_000)
  }

  // ---- Sanctions

  /** Silences the keys (all of them) for the length of a mute. Returns how long, in ms. */
  mute(keys: Keys, now: number): number {
    for (const key of asList(keys)) this.remember(this.muted, key, now + this.muteMs, now)
    return this.muteMs
  }

  /** Milliseconds the keys still cannot write (the longest of them): 0 when they can. */
  mutedFor(keys: Keys, now: number): number {
    return Math.max(0, ...asList(keys).map((key) => this.left(this.muted, key, now)))
  }

  exclude(keys: Keys, now: number): void {
    for (const key of asList(keys)) this.remember(this.excluded, key, now + this.excludeMs, now)
  }

  /** Milliseconds the keys are still kept out of the room (the longest of them): 0 when they may come in. */
  excludedFor(keys: Keys, now: number): number {
    return Math.max(0, ...asList(keys).map((key) => this.left(this.excluded, key, now)))
  }

  /** Counts a warning given to the key, and returns how many it has now (for the host's choice of the next step). */
  warn(key: string, now: number): number {
    const known = this.warned.get(key)
    const count = known && known.expiresAt > now ? known.count + 1 : 1
    this.remember(this.warned, key, { count, expiresAt: now + WARNING_TTL_MS }, now)
    return count
  }

  // ---- Allowances

  /** How long this person must wait before they may report again: 0 when they may. */
  reportWait(key: string, now: number): number {
    return Math.max(this.reportGap.wait(key, now), this.reportHourly.wait(key, now))
  }

  /** How long this host must wait before they may act again: 0 when they may. */
  actionWait(key: string, now: number): number {
    return this.actions.wait(key, now)
  }

  recordAction(key: string, now: number) {
    this.actions.record(key, now)
  }

  // ---- Reports

  /**
   * One report per (person, target): several people reporting the same thing make one report with a count. The reason
   * is the first one given. Counted against the person's allowance only when it is taken.
   */
  file(reporter: string, targetKey: string, reason: ReportReason, target: ReportTargetInfo, now: number): FileResult {
    this.expire(now)
    const pair = `${reporter}|${targetKey}`
    if (this.left(this.reportedBy, pair, now) > 0) return { ok: false, error: 'already-reported' }
    const known = this.filed.find((item) => item.targetKey === targetKey)
    if (known) {
      if (known.reporters.has(reporter)) return { ok: false, error: 'already-reported' }
      this.remember(this.reportedBy, pair, now + this.reportTtlMs, now)
      known.reporters.add(reporter)
      known.report.count = known.reporters.size
      this.reportGap.record(reporter, now)
      this.reportHourly.record(reporter, now)
      return { ok: true, report: { ...known.report }, created: false }
    }
    // A full inbox gives up its least corroborated report (the oldest of them), never one that more people made than this
    // one: a few accounts cannot push a real report out by filing many.
    let evicted: FiledReport | undefined
    if (this.filed.length >= this.maxReports) {
      for (const item of this.filed) if (!evicted || item.reporters.size < evicted.reporters.size) evicted = item
      if (!evicted || evicted.reporters.size > 1) return { ok: false, error: 'inbox-full', retryAfterMs: INBOX_FULL_RETRY_MS }
    }
    const report: Report = { id: randomUUID(), reason, at: now, count: 1, target }
    this.remember(this.reportedBy, pair, now + this.reportTtlMs, now)
    if (evicted) this.filed = this.filed.filter((item) => item !== evicted)
    this.filed.push({ report, reporters: new Set([reporter]), targetKey })
    this.reportGap.record(reporter, now)
    this.reportHourly.record(reporter, now)
    return { ok: true, report: { ...report }, created: true }
  }

  /** The inbox, oldest first. Copies: what is given out cannot change what is kept. */
  list(now: number): Report[] {
    this.expire(now)
    return this.filed.map((item) => ({ ...item.report, target: { ...item.report.target } }))
  }

  has(reportId: string): boolean {
    return this.filed.some((item) => item.report.id === reportId)
  }

  /** The host dealt with it, or set it aside. True when there was such a report. */
  resolve(reportId: string): boolean {
    const before = this.filed.length
    this.filed = this.filed.filter((item) => item.report.id !== reportId)
    return this.filed.length < before
  }

  /** The room emptied: like the chat, the reports are not kept for whoever comes next. Sanctions stay until they end. */
  clearReports() {
    this.filed = []
    // The messages and tracks they pointed at are gone with the room's chat and queue.
    this.reportedBy.clear()
  }

  /** The room is deleted: nothing is kept. */
  clear() {
    this.muted.clear()
    this.excluded.clear()
    this.warned.clear()
    this.filed = []
    this.reportedBy.clear()
    this.reportGap.clear()
    this.reportHourly.clear()
    this.actions.clear()
  }

  // ---- Internals

  private expire(now: number) {
    this.filed = this.filed.filter((item) => now - item.report.at < this.reportTtlMs)
  }

  private left(map: Map<string, number>, key: string, now: number): number {
    const until = map.get(key)
    if (until === undefined) return 0
    if (until <= now) {
      map.delete(key)
      return 0
    }
    return until - now
  }

  /** Sets a value, keeping the map bounded: expired entries go first, then the oldest. */
  private remember<T extends number | { expiresAt: number }>(map: Map<string, T>, key: string, value: T, now: number) {
    map.delete(key)
    if (map.size >= this.maxKeys) {
      for (const [other, held] of map) {
        const until = typeof held === 'number' ? held : held.expiresAt
        if (until <= now) map.delete(other)
      }
      while (map.size >= this.maxKeys) {
        const oldest = map.keys().next().value
        if (oldest === undefined) break
        map.delete(oldest)
      }
    }
    map.set(key, value)
  }
}
