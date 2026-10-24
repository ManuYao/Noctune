import type { VideoInfo } from '../../../shared/protocol'
import { cleanText } from './cleanText'
import { parseIsoDuration } from './parseIsoDuration'
import { parseVideoId } from './parseVideoId'
import { TokenBucket } from './TokenBucket'
import type { ResolveError, ResolveResult, TrackResolver } from './TrackResolver'

const API_URL = 'https://www.googleapis.com/youtube/v3/videos'
// Only what is read below: a small answer, and no description to carry around.
const FIELDS =
  'kind,items(id,snippet(title,channelTitle,liveBroadcastContent),contentDetails(duration,regionRestriction,contentRating),status(embeddable,privacyStatus,uploadStatus))'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

const REQUEST_TIMEOUT_MS = 5 * SECOND
// The facts about a video rarely change; a missing one may be published any minute.
const FOUND_TTL_MS = 6 * HOUR
const MISSING_TTL_MS = 5 * MINUTE
const MAX_CACHE_ENTRIES = 5000
// The default quota is 10 000 units a day and one lookup costs 1. A burst of 30, then one more every 10 s (8 640 a
// day at most) keeps well inside it and leaves room for the other calls the site will make (a search costs 100).
const BUDGET_BURST = 30
const BUDGET_REFILL_MS = 10 * SECOND
// After "quota exceeded" asking again at once is pointless. After a refusal of the key only a fix helps, but the fix can
// come at any moment, so it is tried again after a minute.
const QUOTA_BACKOFF_MS = 5 * MINUTE
const KEY_BACKOFF_MS = MINUTE
// The same kind of trouble is written to the log at most once a minute: a broken key must not flood it.
const LOG_EVERY_MS = MINUTE
const MAX_BODY_CHARS = 200_000
const LONGEST_VIDEO_SEC = 24 * 60 * 60
const TITLE_MAX = 100
const ARTIST_MAX = 50

// What Google calls a key it can use: printable ASCII, no space. Anything else could not even be sent as a header.
const USABLE_KEY = /^[\x21-\x7e]{10,300}$/
const QUOTA_REASON = /quota|rate.?limit|daily.?limit|resource.?exhausted/i
// Identifiers like "quotaExceeded" or "API_KEY_INVALID": the only parts of an error body that are ever logged.
const REASON = /^[\w.-]{1,60}$/

export interface YouTubeResolverOptions {
  apiKey: string
  /** For tests: replaces the global fetch. */
  fetch?: typeof fetch
  /** For tests: replaces the clock (ms since epoch). */
  now?: () => number
  /** Where the `[youtube]` lines go. Defaults to the error output. */
  log?: (line: string) => void
  /** The longest wait for YouTube's answer. */
  timeoutMs?: number
  /** The most videos kept in memory. */
  maxCacheEntries?: number
  /** Calls to YouTube allowed at once, and the time it takes to earn one more. */
  budget?: { burst: number; refillMs: number }
}

type Refusal = Extract<ResolveError, 'not-found' | 'not-embeddable' | 'unavailable'>

type Verdict =
  | { kind: 'ok'; video: VideoInfo }
  | { kind: 'refused'; error: Refusal }
  /** The answer is not what the API documents, so it says nothing about the video. `why` names the part, not its content. */
  | { kind: 'malformed'; why: string }

interface CacheEntry {
  result: ResolveResult
  expiresAt: number
}

class AskTimedOut extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function failure(error: ResolveError): ResolveResult {
  return { ok: false, error }
}

/** Callers get their own copy: what one does with it cannot reach what the cache hands to the next. */
function copy(result: ResolveResult): ResolveResult {
  return result.ok ? { ok: true, video: { ...result.video } } : { ok: false, error: result.error }
}

/**
 * What the API's answer for one video means. Pure: no clock, no network. Fails closed: a field that is missing or of
 * the wrong type is "malformed", never a reason to let a video through.
 */
export function classifyVideo(videoId: string, body: unknown): Verdict {
  if (!isRecord(body) || body.kind !== 'youtube#videoListResponse' || !Array.isArray(body.items)) {
    return { kind: 'malformed', why: 'liste' }
  }
  if (body.items.length === 0) return { kind: 'refused', error: 'not-found' }

  const item = body.items[0]
  if (!isRecord(item) || item.id !== videoId) return { kind: 'malformed', why: 'vidéo' }
  const { snippet, contentDetails, status } = item
  if (!isRecord(snippet) || !isRecord(contentDetails) || !isRecord(status)) return { kind: 'malformed', why: 'parties' }
  if (
    typeof snippet.title !== 'string' ||
    typeof contentDetails.duration !== 'string' ||
    typeof status.embeddable !== 'boolean'
  ) {
    return { kind: 'malformed', why: 'champs' }
  }

  if (status.privacyStatus === 'private') return { kind: 'refused', error: 'not-found' }
  if (!status.embeddable) return { kind: 'refused', error: 'not-embeddable' }

  // Everything below is a video that exists and may be embedded, but that a room cannot play.
  if (status.uploadStatus !== 'processed') return { kind: 'refused', error: 'unavailable' }
  if (snippet.liveBroadcastContent === 'live' || snippet.liveBroadcastContent === 'upcoming') {
    return { kind: 'refused', error: 'unavailable' }
  }
  const durationSec = parseIsoDuration(contentDetails.duration)
  // A stream that never ends has a duration of days, one that has not started has none.
  if (durationSec === null || durationSec === 0 || durationSec > LONGEST_VIDEO_SEC) {
    return { kind: 'refused', error: 'unavailable' }
  }
  if (isRecord(contentDetails.contentRating) && contentDetails.contentRating.ytRating === 'ytAgeRestricted') {
    return { kind: 'refused', error: 'unavailable' }
  }
  // An empty "allowed" list means a video that no country may watch. Countries that are blocked are not looked at: the
  // viewers' countries are not known here, and a video that fails to play is reported by the player itself.
  const region = contentDetails.regionRestriction
  if (isRecord(region) && Array.isArray(region.allowed) && region.allowed.length === 0) {
    return { kind: 'refused', error: 'unavailable' }
  }

  const channel = cleanText(snippet.channelTitle, 200).replace(/ - Topic$/i, '')
  return {
    kind: 'ok',
    video: {
      videoId,
      title: cleanText(snippet.title, TITLE_MAX) || 'Sans titre',
      artist: cleanText(channel, ARTIST_MAX) || 'Artiste inconnu',
      durationSec,
    },
  }
}

/** The identifiers Google gives for a failed call, for the log. Never the messages: they are free text. */
function errorReasons(text: string): string[] {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return []
  }
  if (!isRecord(body) || !isRecord(body.error)) return []
  const found: string[] = []
  const add = (value: unknown) => {
    if (typeof value === 'string' && REASON.test(value) && !found.includes(value) && found.length < 4) found.push(value)
  }
  add(body.error.status)
  for (const list of [body.error.errors, body.error.details]) {
    if (!Array.isArray(list)) continue
    for (const entry of list.slice(0, 5)) if (isRecord(entry)) add(entry.reason)
  }
  return found
}

/**
 * Reads a video from the YouTube Data API: which video a DJ means, whether it exists, whether it can play in the
 * embedded player, how long it is. It knows nothing about rooms.
 *
 * The API key is a secret: it travels in a header, lives in a private field, and is cut out of anything that is logged.
 * Calls cost quota, so they are cached, shared when several people ask for the same video, and rationed.
 */
export class YouTubeResolver implements TrackResolver {
  readonly #apiKey: string
  readonly #usable: boolean
  readonly #fetch: typeof fetch
  readonly #now: () => number
  readonly #write: (line: string) => void
  readonly #timeoutMs: number
  readonly #maxCacheEntries: number
  readonly #budget: TokenBucket
  /** Insertion order is use order (a hit moves the entry to the end), so the first entry is the one to drop. */
  readonly #cache = new Map<string, CacheEntry>()
  readonly #inflight = new Map<string, Promise<ResolveResult>>()
  readonly #lastLogged = new Map<string, number>()
  #blockedUntil = 0

  constructor(options: YouTubeResolverOptions) {
    const key = typeof options.apiKey === 'string' ? options.apiKey.trim() : ''
    this.#usable = USABLE_KEY.test(key)
    this.#apiKey = this.#usable ? key : ''
    this.#fetch = options.fetch ?? fetch
    this.#now = options.now ?? Date.now
    this.#write = options.log ?? ((line) => console.error(line))
    this.#timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS
    this.#maxCacheEntries = options.maxCacheEntries ?? MAX_CACHE_ENTRIES
    this.#budget = new TokenBucket(
      options.budget?.burst ?? BUDGET_BURST,
      options.budget?.refillMs ?? BUDGET_REFILL_MS,
      this.#now(),
    )
    if (!this.#usable) this.#report('key', 'clé API absente ou malformée (YOUTUBE_API_KEY) : les morceaux ne peuvent pas être ajoutés.')
  }

  async resolve(input: string): Promise<ResolveResult> {
    try {
      const videoId = parseVideoId(input)
      if (videoId === null) return failure('invalid-link')
      return await this.#lookup(videoId)
    } catch (error) {
      this.#report('unexpected', `erreur inattendue (${this.#describe(error)}).`)
      return failure('service-unavailable')
    }
  }

  async #lookup(videoId: string): Promise<ResolveResult> {
    const cached = this.#fromCache(videoId)
    if (cached) return copy(cached)

    // Someone is already asking YouTube about this very video: share the answer, and the single unit of quota.
    const pending = this.#inflight.get(videoId)
    if (pending) return copy(await pending)

    if (!this.#usable) {
      this.#report('key', 'clé API absente ou malformée (YOUTUBE_API_KEY) : les morceaux ne peuvent pas être ajoutés.')
      return failure('service-unavailable')
    }
    const now = this.#now()
    if (now < this.#blockedUntil) return failure('service-unavailable')
    if (!this.#budget.tryTake(now)) {
      this.#report('budget', "trop d'appels à YouTube en peu de temps : les ajouts attendent quelques secondes.")
      return failure('service-unavailable')
    }

    const work = this.#fetchVideo(videoId).finally(() => this.#inflight.delete(videoId))
    this.#inflight.set(videoId, work)
    return copy(await work)
  }

  #fromCache(videoId: string): ResolveResult | null {
    const entry = this.#cache.get(videoId)
    if (!entry) return null
    if (this.#now() >= entry.expiresAt) {
      this.#cache.delete(videoId)
      return null
    }
    // Used again: it is now the last one to go when the cache is full.
    this.#cache.delete(videoId)
    this.#cache.set(videoId, entry)
    return entry.result
  }

  #remember(videoId: string, result: ResolveResult, ttlMs: number) {
    this.#cache.delete(videoId)
    this.#cache.set(videoId, { result, expiresAt: this.#now() + ttlMs })
    while (this.#cache.size > this.#maxCacheEntries) {
      const oldest = this.#cache.keys().next().value
      if (oldest === undefined) break
      this.#cache.delete(oldest)
    }
  }

  /** Never rejects: whatever happens is an answer for the caller and, when it matters, a line in the log. */
  async #fetchVideo(videoId: string): Promise<ResolveResult> {
    let reply: { status: number; text: string }
    try {
      reply = await this.#ask(videoId)
    } catch (error) {
      if (error instanceof AskTimedOut) {
        this.#report('timeout', `YouTube ne répond pas (délai de ${Math.round(this.#timeoutMs / SECOND)} s dépassé).`)
      } else {
        this.#report('network', `YouTube injoignable (${this.#describe(error)}).`)
      }
      return failure('service-unavailable')
    }
    if (reply.status !== 200) return this.#refuseReply(reply.status, reply.text)

    let body: unknown
    try {
      body = JSON.parse(reply.text)
    } catch {
      this.#report('format', 'réponse de YouTube illisible.')
      return failure('service-unavailable')
    }
    const verdict = classifyVideo(videoId, body)
    if (verdict.kind === 'malformed') {
      this.#report('format', `réponse de YouTube inattendue (${verdict.why}).`)
      return failure('service-unavailable')
    }
    if (verdict.kind === 'ok') {
      const result: ResolveResult = { ok: true, video: verdict.video }
      this.#remember(videoId, result, FOUND_TTL_MS)
      return result
    }
    const result = failure(verdict.error)
    this.#remember(videoId, result, verdict.error === 'not-found' ? MISSING_TTL_MS : FOUND_TTL_MS)
    return result
  }

  /** One call to the API. The address is built from the checked id alone: nothing the user typed goes into it. */
  async #ask(videoId: string): Promise<{ status: number; text: string }> {
    const url = new URL(API_URL)
    url.searchParams.set('part', 'snippet,contentDetails,status')
    url.searchParams.set('id', videoId)
    url.searchParams.set('fields', FIELDS)

    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new AskTimedOut())
      }, this.#timeoutMs)
    })
    const send = this.#fetch
    const answer = (async () => {
      const response = await send(url, {
        headers: { 'x-goog-api-key': this.#apiKey, accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error',
      })
      return { status: response.status, text: (await response.text()).slice(0, MAX_BODY_CHARS) }
    })()
    try {
      // `race` goes on watching the loser: a request that fails after the timeout (it was aborted) is not left unhandled.
      return await Promise.race([answer, timeout])
    } finally {
      clearTimeout(timer)
    }
  }

  #refuseReply(status: number, text: string): ResolveResult {
    const reasons = errorReasons(text)
    const detail = [`HTTP ${status}`, ...reasons].join(', ')
    if (status === 429 || reasons.some((reason) => QUOTA_REASON.test(reason))) {
      this.#blockedUntil = this.#now() + QUOTA_BACKOFF_MS
      this.#report('quota', `quota de YouTube atteint (${detail}) : plus d'appel pendant 5 min.`)
    } else if (status === 400 || status === 401 || status === 403) {
      this.#blockedUntil = this.#now() + KEY_BACKOFF_MS
      this.#report(
        'key',
        `YouTube refuse la demande (${detail}) : vérifie YOUTUBE_API_KEY et que l'API YouTube Data v3 est activée. Nouvel essai dans 1 min.`,
      )
    } else if (status >= 500) {
      this.#report('server', `YouTube a un souci (${detail}).`)
    } else {
      this.#report('http', `réponse inattendue de YouTube (${detail}).`)
    }
    return failure('service-unavailable')
  }

  /** What kind of error it was, and nothing it said: a message could carry a URL, and a URL could carry a key. */
  #describe(error: unknown): string {
    if (!(error instanceof Error)) return typeof error
    const code = (error.cause as { code?: unknown } | undefined)?.code ?? (error as { code?: unknown }).code
    return typeof code === 'string' && REASON.test(code) ? `${error.name} ${code}` : error.name
  }

  #report(kind: string, line: string) {
    try {
      const now = this.#now()
      const last = this.#lastLogged.get(kind)
      if (last !== undefined && now - last < LOG_EVERY_MS) return
      this.#lastLogged.set(kind, now)
      // The key is cut out of whatever is written, whatever the caller thought it was passing.
      const text = this.#apiKey ? line.split(this.#apiKey).join('***') : line
      this.#write(`[youtube] ${text.slice(0, 300)}`)
    } catch {
      // A log that cannot be written is no reason to fail the lookup that wanted to write to it.
    }
  }
}
