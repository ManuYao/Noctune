// A resolver for the tests that need DJs: knows the videos it is given and nothing else. No network.
import type { VideoInfo } from '../../../shared/protocol'
import type { ResolveError, ResolveResult, TrackResolver } from '../youtube/TrackResolver'

const VIDEO_ID = /(?:v=|youtu\.be\/|^)([\w-]{11})(?![\w-])/

export class FakeResolver implements TrackResolver {
  /** Every input it was asked about, in order. */
  readonly calls: string[] = []
  /** While set, every call waits for it: to test what happens to a request that is still being answered. */
  gate: Promise<void> | null = null

  /** Keyed by video id. A string value is the error to answer for that video. */
  constructor(private readonly videos: Record<string, VideoInfo | ResolveError>) {}

  /** Ids asked about through `resolveMany`, one array per call. */
  readonly manyCalls: string[][] = []

  async resolveMany(videoIds: readonly string[]): Promise<Map<string, ResolveResult>> {
    this.manyCalls.push([...videoIds])
    const answers = new Map<string, ResolveResult>()
    for (const id of videoIds) answers.set(id, await this.resolve(id))
    return answers
  }

  async resolve(input: string): Promise<ResolveResult> {
    this.calls.push(input)
    if (this.gate) await this.gate
    const id = VIDEO_ID.exec(input.trim())?.[1]
    if (!id) return { ok: false, error: 'invalid-link' }
    const known = this.videos[id]
    if (!known) return { ok: false, error: 'not-found' }
    return typeof known === 'string' ? { ok: false, error: known } : { ok: true, video: known }
  }
}
