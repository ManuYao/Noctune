import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { inspect } from 'node:util'
import type { ResolveResult } from './TrackResolver'
import { classifyVideo, YouTubeResolver, type YouTubeResolverOptions } from './YouTubeResolver'

const KEY = 'AIzaSyTest_key-0123456789abcdefghijklmnop'
const START = 1_700_000_000_000
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const LIST = 'youtube#videoListResponse'

const A = 'aaaaaaaaaaa'
const B = 'bbbbbbbbbbb'
const C = 'ccccccccccc'
const D = 'ddddddddddd'
const link = (id: string) => `https://www.youtube.com/watch?v=${id}`

// ---- Fakes: a YouTube that answers what the test says, a clock the test moves, a log the test reads.

const has = (options: Record<string, unknown>, key: string) => Object.hasOwn(options, key)
const pick = (options: Record<string, unknown>, key: string, fallback: unknown) => (has(options, key) ? options[key] : fallback)

/** One video as the API writes it. Any part can be replaced, or (with `undefined`) taken away. */
function item(id: string, options: Record<string, unknown> = {}) {
  const contentDetails: Record<string, unknown> = {
    duration: pick(options, 'duration', 'PT4M28S'),
    contentRating: pick(options, 'rating', {}),
  }
  if (has(options, 'region')) contentDetails.regionRestriction = options.region
  return {
    id,
    snippet: {
      title: pick(options, 'title', 'A song'),
      channelTitle: pick(options, 'channel', 'A channel'),
      liveBroadcastContent: pick(options, 'live', 'none'),
    },
    contentDetails,
    status: {
      uploadStatus: pick(options, 'upload', 'processed'),
      privacyStatus: pick(options, 'privacy', 'public'),
      embeddable: pick(options, 'embeddable', true),
    },
  }
}

const listing = (...items: unknown[]) => ({ kind: LIST, items })
const reply = (body: unknown, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
const apiError = (status: number, reason: string, apiStatus = 'ERROR') =>
  reply({ error: { code: status, message: 'free text', errors: [{ reason }], status: apiStatus } }, status)

interface Call {
  url: URL
  headers: Record<string, string>
  init: RequestInit
}

const idOf = (call: Call) => call.url.searchParams.get('id') ?? ''

function fakeApi(handler: (call: Call) => Response | Promise<Response> = (call) => reply(listing(item(idOf(call))))) {
  const calls: Call[] = []
  const fetchImpl = (async (input: URL | string | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const call: Call = { url, headers: Object.fromEntries(new Headers(init?.headers).entries()), init: init ?? {} }
    calls.push(call)
    return handler(call)
  }) as typeof fetch
  return { fetch: fetchImpl, calls }
}

let clock: number
let logs: string[]

function setup(handler?: (call: Call) => Response | Promise<Response>, extra: Partial<YouTubeResolverOptions> = {}) {
  const api = fakeApi(handler)
  const resolver = new YouTubeResolver({ apiKey: KEY, fetch: api.fetch, now: () => clock, log: (line) => logs.push(line), ...extra })
  return { resolver, api }
}

/** Lets the promises that are ready run (the fake fetch included). */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

beforeEach(() => {
  clock = START
  logs = []
})

afterEach(() => {
  mock.timers.reset()
  mock.restoreAll()
})

describe('YouTubeResolver: the request', () => {
  it('asks for the checked id only, with the key in a header and nowhere else', async () => {
    const { resolver, api } = setup()
    const result = await resolver.resolve(`${link(A)}&list=PLabcdefghijklmnopqrstuvwxyz012345&t=42s`)
    assert.equal(result.ok, true)
    assert.equal(api.calls.length, 1)

    const { url, headers, init } = api.calls[0]
    assert.equal(`${url.origin}${url.pathname}`, 'https://www.googleapis.com/youtube/v3/videos')
    assert.deepEqual([...url.searchParams.keys()].sort(), ['fields', 'id', 'part'])
    assert.equal(url.searchParams.get('id'), A)
    assert.equal(url.searchParams.get('part'), 'snippet,contentDetails,status')
    assert.equal(headers['x-goog-api-key'], KEY)
    assert.ok(!url.href.includes(KEY), 'the key is not in the address')
    assert.ok(init.method === undefined || init.method === 'GET', 'a plain GET')
    assert.equal(init.body, undefined)
    assert.equal(init.redirect, 'error')
    assert.ok(init.signal instanceof AbortSignal, 'the request can be cancelled')
  })

  it('never fetches an address the user wrote', async () => {
    const { resolver, api } = setup()
    await resolver.resolve(`${link(A)}&u=https://evil.example/steal`)
    await resolver.resolve(`https://youtu.be/${B}?redirect=http://169.254.169.254/latest/meta-data/`)
    await resolver.resolve(`https://www.youtube.com/embed/${C}?origin=https://evil.example`)
    assert.equal(api.calls.length, 3)
    for (const call of api.calls) {
      assert.equal(call.url.hostname, 'www.googleapis.com')
      assert.match(idOf(call), /^[\w-]{11}$/)
    }
  })

  it('answers invalid-link, without any call, to what is not a YouTube video', async () => {
    const { resolver, api } = setup()
    const inputs = [
      'https://evil.example/watch?v=' + A,
      'http://169.254.169.254/latest/meta-data/',
      'javascript:alert(1)',
      'https://www.youtube.com/playlist?list=PLabcdefghijklmnopqrstuvwxyz012345',
      'hello',
      '',
      undefined,
      null,
      42,
      { toString: () => link(A) },
    ]
    for (const input of inputs) {
      assert.deepEqual(await resolver.resolve(input as string), { ok: false, error: 'invalid-link' }, String(input))
    }
    assert.equal(api.calls.length, 0)
  })
})

describe('YouTubeResolver: what a video is', () => {
  it('gives the title, the channel and the length in whole seconds', async () => {
    const { resolver } = setup((call) =>
      reply(listing(item(idOf(call), { title: 'Sky High', channel: 'NoCopyrightSounds', duration: 'PT3M58S' }))),
    )
    assert.deepEqual(await resolver.resolve(link(A)), {
      ok: true,
      video: { videoId: A, title: 'Sky High', artist: 'NoCopyrightSounds', durationSec: 238 },
    })
  })

  it('reads a bare id and a short link the same way', async () => {
    const { resolver } = setup()
    const bare = await resolver.resolve(A)
    const short = await resolver.resolve(`https://youtu.be/${A}?si=xyz`)
    assert.deepEqual(bare, short)
  })

  it('says not-found when YouTube has no such video', async () => {
    const { resolver } = setup(() => reply(listing()))
    assert.deepEqual(await resolver.resolve(link(A)), { ok: false, error: 'not-found' })
  })

  const REFUSED: Array<[what: string, options: Record<string, unknown>, error: string]> = [
    ['a private video', { privacy: 'private' }, 'not-found'],
    ['a private video that cannot be embedded either', { privacy: 'private', embeddable: false }, 'not-found'],
    ['a video that cannot be embedded', { embeddable: false }, 'not-embeddable'],
    ['a live stream', { live: 'live', duration: 'PT0S' }, 'unavailable'],
    ['a live stream that reports a duration', { live: 'live' }, 'unavailable'],
    ['a premiere that has not started', { live: 'upcoming', duration: 'PT0S' }, 'unavailable'],
    ['a video of no length', { duration: 'PT0S' }, 'unavailable'],
    ['a duration that is not one', { duration: 'soon' }, 'unavailable'],
    ['the archive of a stream that lasted days', { duration: 'P1407DT10H11M52S', upload: 'uploaded' }, 'unavailable'],
    ['a video just over 24 hours', { duration: 'PT24H1S' }, 'unavailable'],
    ['a video still being processed', { upload: 'uploaded' }, 'unavailable'],
    ['a failed upload', { upload: 'failed' }, 'unavailable'],
    ['a rejected video', { upload: 'rejected' }, 'unavailable'],
    ['a deleted video', { upload: 'deleted' }, 'unavailable'],
    ['a video with no upload status', { upload: undefined }, 'unavailable'],
    ['an age-restricted video', { rating: { ytRating: 'ytAgeRestricted' } }, 'unavailable'],
    ['a video no country may watch', { region: { allowed: [] } }, 'unavailable'],
  ]
  for (const [what, options, error] of REFUSED) {
    it(`refuses ${what} as ${error}`, async () => {
      const { resolver } = setup(({ url }) => reply(listing(item(url.searchParams.get('id') ?? '', options))))
      assert.deepEqual(await resolver.resolve(link(A)), { ok: false, error })
    })
  }

  const ALLOWED: Array<[what: string, options: Record<string, unknown>]> = [
    ['an unlisted video', { privacy: 'unlisted' }],
    ['a video of exactly 24 hours', { duration: 'PT24H' }],
    ['a video of one second', { duration: 'PT1S' }],
    ['a rating that is not an age restriction', { rating: { ytRating: 'ytUnspecified' } }],
    ['a video blocked in some countries', { region: { blocked: ['FR'] } }],
    ['a video allowed in some countries', { region: { allowed: ['FR', 'DE'] } }],
    ['a live stream that is over', { live: 'none' }],
  ]
  for (const [what, options] of ALLOWED) {
    it(`accepts ${what}`, async () => {
      const { resolver } = setup(({ url }) => reply(listing(item(url.searchParams.get('id') ?? '', options))))
      assert.equal((await resolver.resolve(link(A))).ok, true)
    })
  }

  it('ignores a second item in the answer, and reads only the one it asked for', async () => {
    const { resolver } = setup(() => reply(listing(item(A, { title: 'First' }), item(B, { title: 'Second' }))))
    const result = await resolver.resolve(link(A))
    assert.equal(result.ok && result.video.title, 'First')
  })
})

describe('YouTubeResolver: text from YouTube', () => {
  const resolveWith = async (options: Record<string, unknown>) => {
    const { resolver } = setup(() => reply(listing(item(A, options))))
    const result = await resolver.resolve(link(A))
    assert.ok(result.ok, 'the video was read')
    return result.video
  }

  it('shows nothing that can fool the eye', async () => {
    const video = await resolveWith({ title: 'Safe\u202Eexe.mp3\u200B\u0000  Song\n2', channel: 'Chan\u2066nel\uFEFF' })
    assert.equal(video.title, 'Safeexe.mp3 Song 2')
    assert.equal(video.artist, 'Channel')
  })

  it('keeps markup as plain text', async () => {
    const video = await resolveWith({ title: '<img src=x onerror=alert(1)> & "quotes"', channel: '<b>Chan</b>' })
    assert.equal(video.title, '<img src=x onerror=alert(1)> & "quotes"')
    assert.equal(video.artist, '<b>Chan</b>')
  })

  it('cuts a long title and a long channel name', async () => {
    const video = await resolveWith({ title: 'x'.repeat(500), channel: 'y'.repeat(500) })
    assert.equal(Array.from(video.title).length, 100)
    assert.ok(video.title.endsWith('…'), 'cut with an ellipsis')
    assert.equal(Array.from(video.artist).length, 50)
    assert.ok(video.artist.endsWith('…'), 'cut with an ellipsis')
  })

  it('drops "- Topic" from the channels YouTube makes for artists', async () => {
    assert.equal((await resolveWith({ channel: 'Daft Punk - Topic' })).artist, 'Daft Punk')
    assert.equal((await resolveWith({ channel: 'daft punk - topic' })).artist, 'daft punk')
    assert.equal((await resolveWith({ channel: 'Topic' })).artist, 'Topic')
    assert.equal((await resolveWith({ channel: 'Topic - Topic Records' })).artist, 'Topic - Topic Records')
  })

  it('has something to show when a title or a channel is empty or invisible', async () => {
    const video = await resolveWith({ title: '\u200B\u200B \u202E', channel: '' })
    assert.equal(video.title, 'Sans titre')
    assert.equal(video.artist, 'Artiste inconnu')
    assert.equal((await resolveWith({ channel: undefined })).artist, 'Artiste inconnu')
  })
})

describe('YouTubeResolver: answers that are not what the API documents', () => {
  const noStatus = { ...item(A), status: undefined }
  const WEIRD: Array<[what: string, body: unknown]> = [
    ['null', null],
    ['an array', []],
    ['a string', 'hello'],
    ['a number', 42],
    ['an empty object', {}],
    ['another kind of list', { kind: 'youtube#channelListResponse', items: [] }],
    ['items that is not a list', { kind: LIST, items: 'none' }],
    ['items that is an object', { kind: LIST, items: { 0: item(A) } }],
    ['no items', { kind: LIST }],
    ['a null item', { kind: LIST, items: [null] }],
    ['an item that is a string', { kind: LIST, items: ['x'] }],
    ['an item for another video', { kind: LIST, items: [item(B)] }],
    ['an item with no id', { kind: LIST, items: [{ ...item(A), id: undefined }] }],
    ['no snippet', { kind: LIST, items: [{ ...item(A), snippet: undefined }] }],
    ['a snippet that is a string', { kind: LIST, items: [{ ...item(A), snippet: 'x' }] }],
    ['no content details', { kind: LIST, items: [{ ...item(A), contentDetails: undefined }] }],
    ['no status', { kind: LIST, items: [noStatus] }],
    ['a status that is a list', { kind: LIST, items: [{ ...item(A), status: [] }] }],
    ['a title that is a number', { kind: LIST, items: [item(A, { title: 42 })] }],
    ['no title', { kind: LIST, items: [item(A, { title: undefined })] }],
    ['a duration that is a number', { kind: LIST, items: [item(A, { duration: 268 })] }],
    ['no duration', { kind: LIST, items: [item(A, { duration: undefined })] }],
    ['embeddable written as a string', { kind: LIST, items: [item(A, { embeddable: 'true' })] }],
    ['embeddable missing', { kind: LIST, items: [item(A, { embeddable: undefined })] }],
  ]
  for (const [what, body] of WEIRD) {
    it(`does not let through, nor crash on, ${what}`, async () => {
      const { resolver } = setup(() => reply(body))
      assert.deepEqual(await resolver.resolve(link(A)), { ok: false, error: 'service-unavailable' })
    })
  }

  for (const [what, text] of [
    ['an empty body', ''],
    ['a web page', '<html><body>Oops</body></html>'],
    ['a truncated body', '{"kind": "youtube#videoListResp'],
  ] as const) {
    it(`does not crash on ${what}`, async () => {
      const { resolver } = setup(() => reply(text))
      assert.deepEqual(await resolver.resolve(link(A)), { ok: false, error: 'service-unavailable' })
    })
  }

  it('survives a stream of random JSON, answering only with a verdict', () => {
    let seed = 987
    const next = () => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648)
    const leaves = [null, undefined, true, false, 0, 1, 268, -1, '', 'a', 'PT4M28S', 'ytAgeRestricted', LIST, A, [], {}, ['x'], NaN]
    const keys = ['kind', 'items', 'id', 'snippet', 'contentDetails', 'status', 'title', 'channelTitle', 'duration', 'embeddable', 'privacyStatus', 'uploadStatus', 'liveBroadcastContent', 'contentRating', 'ytRating', 'regionRestriction', 'allowed', '__proto__', 'constructor']
    const make = (depth: number): unknown => {
      if (depth === 0 || next() % 3 === 0) return leaves[next() % leaves.length]
      if (next() % 4 === 0) return Array.from({ length: next() % 3 }, () => make(depth - 1))
      const object: Record<string, unknown> = {}
      for (let count = next() % 5; count > 0; count -= 1) object[keys[next() % keys.length]] = make(depth - 1)
      return object
    }
    for (let round = 0; round < 3000; round += 1) {
      const verdict = classifyVideo(A, make(5))
      assert.ok(['ok', 'refused', 'malformed'].includes(verdict.kind), 'a verdict')
    }
  })
})

describe('YouTubeResolver: when YouTube or the network fails', () => {
  const STATUSES = [400, 401, 403, 404, 429, 500, 502, 503]
  for (const status of STATUSES) {
    it(`answers service-unavailable to an HTTP ${status}, with or without a body`, async () => {
      for (const body of ['', '{}', '<html>', JSON.stringify({ error: { code: status, message: 'nope' } })]) {
        const { resolver } = setup(() => reply(body, status))
        assert.deepEqual(await resolver.resolve(link(A)), { ok: false, error: 'service-unavailable' })
      }
    })
  }

  it('answers service-unavailable when the network fails', async () => {
    const { resolver } = setup(() => {
      throw new TypeError('fetch failed')
    })
    assert.deepEqual(await resolver.resolve(link(A)), { ok: false, error: 'service-unavailable' })
  })

  it('answers service-unavailable when what comes back is not a response', async () => {
    for (const nonsense of [undefined, null, 'ok', 42, {}]) {
      const { resolver } = setup(() => nonsense as unknown as Response)
      assert.deepEqual(await resolver.resolve(link(A)), { ok: false, error: 'service-unavailable' })
    }
  })

  it('answers service-unavailable when the body cannot be read', async () => {
    const broken = () => {
      const response = reply('{}')
      response.text = () => Promise.reject(new TypeError('terminated'))
      return response
    }
    const { resolver } = setup(broken)
    assert.deepEqual(await resolver.resolve(link(A)), { ok: false, error: 'service-unavailable' })
  })

  it('does not accept an enormous answer, even a well-formed one', async () => {
    // One video is a few hundred bytes. A title of 300 000 characters is not YouTube talking to us.
    const { resolver } = setup((call) => reply(listing(item(idOf(call), { title: 'x'.repeat(300_000) }))))
    assert.deepEqual(await resolver.resolve(link(A)), { ok: false, error: 'service-unavailable' })
    assert.match(logs.join('\n'), /illisible/)
  })

  it('does not remember a failure: the next try asks again', async () => {
    let failing = true
    const { resolver, api } = setup((call) => (failing ? reply('', 503) : reply(listing(item(idOf(call))))))
    assert.equal((await resolver.resolve(link(A))).ok, false)
    failing = false
    assert.equal((await resolver.resolve(link(A))).ok, true)
    assert.equal(api.calls.length, 2)
  })

  it('does not remember a malformed answer either', async () => {
    let broken = true
    const { resolver, api } = setup((call) => (broken ? reply({ nonsense: true }) : reply(listing(item(idOf(call))))))
    assert.equal((await resolver.resolve(link(A))).ok, false)
    broken = false
    assert.equal((await resolver.resolve(link(A))).ok, true)
    assert.equal(api.calls.length, 2)
  })
})

describe('YouTubeResolver: waiting too long', () => {
  it('gives up after the time allowed, even for a fetch that ignores the signal', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const { resolver, api } = setup(() => new Promise<Response>(() => {}))
    const pending = resolver.resolve(link(A))
    await flush()
    assert.equal(api.calls.length, 1)

    mock.timers.tick(5000)
    assert.deepEqual(await pending, { ok: false, error: 'service-unavailable' })
    assert.equal(api.calls[0].init.signal?.aborted, true, 'the request is cancelled')
    assert.match(logs.join('\n'), /ne répond pas/)
  })

  it('does not give up a moment early', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    let answer!: () => void
    const { resolver } = setup(
      (call) =>
        new Promise<Response>((resolve) => {
          answer = () => resolve(reply(listing(item(idOf(call)))))
        }),
    )
    const pending = resolver.resolve(link(A))
    await flush()
    mock.timers.tick(4999)
    answer()
    assert.equal((await pending).ok, true)
  })

  it('survives a request that fails after the wait is over', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const { resolver } = setup(
      (call) =>
        new Promise<Response>((_, reject) => {
          call.init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const pending = resolver.resolve(link(A))
    await flush()
    mock.timers.tick(5000)
    assert.deepEqual(await pending, { ok: false, error: 'service-unavailable' })
    await flush() // an unhandled rejection would fail the test run here
  })

  it('stops its timer once the answer is in', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const { resolver, api } = setup()
    assert.equal((await resolver.resolve(link(A))).ok, true)
    mock.timers.tick(60_000)
    assert.equal(api.calls[0].init.signal?.aborted, false)
  })

  it('waits as long as it is told to', async () => {
    mock.timers.enable({ apis: ['setTimeout'] })
    const { resolver } = setup(() => new Promise<Response>(() => {}), { timeoutMs: 1000 })
    const pending = resolver.resolve(link(A))
    await flush()
    mock.timers.tick(1000)
    assert.deepEqual(await pending, { ok: false, error: 'service-unavailable' })
  })
})

describe('YouTubeResolver: the memory of what it learned', () => {
  it('does not ask again about a video it knows', async () => {
    const { resolver, api } = setup()
    const first = await resolver.resolve(link(A))
    const second = await resolver.resolve(`https://youtu.be/${A}`)
    assert.deepEqual(second, first)
    assert.equal(api.calls.length, 1)
  })

  it('hands out copies: what a caller changes does not reach the next one', async () => {
    const { resolver } = setup()
    const fresh = await resolver.resolve(link(A)) // just read from YouTube
    const remembered = await resolver.resolve(link(A)) // taken from memory
    for (const result of [fresh, remembered]) {
      assert.ok(result.ok, 'the video was read')
      result.video.title = 'Changed'
      result.video.durationSec = 1
    }
    const later = await resolver.resolve(link(A))
    assert.ok(later.ok, 'the video was read again')
    assert.equal(later.video.title, 'A song')
    assert.equal(later.video.durationSec, 268)
    assert.notEqual(later, remembered)
  })

  it('asks again once the video is 6 hours old, not before', async () => {
    const { resolver, api } = setup()
    await resolver.resolve(link(A))
    clock += 6 * HOUR - 1
    await resolver.resolve(link(A))
    assert.equal(api.calls.length, 1)
    clock += 1
    await resolver.resolve(link(A))
    assert.equal(api.calls.length, 2)
  })

  it('remembers a missing video for 5 minutes only', async () => {
    const { resolver, api } = setup(() => reply(listing()))
    await resolver.resolve(link(A))
    clock += 5 * MINUTE - 1
    assert.deepEqual(await resolver.resolve(link(A)), { ok: false, error: 'not-found' })
    assert.equal(api.calls.length, 1)
    clock += 1
    await resolver.resolve(link(A))
    assert.equal(api.calls.length, 2)
  })

  it('remembers what is wrong with a video for 6 hours', async () => {
    for (const [options, error] of [
      [{ embeddable: false }, 'not-embeddable'],
      [{ live: 'live' }, 'unavailable'],
    ] as const) {
      const { resolver, api } = setup((call) => reply(listing(item(idOf(call), options))))
      await resolver.resolve(link(A))
      clock += 5 * HOUR
      assert.deepEqual(await resolver.resolve(link(A)), { ok: false, error })
      assert.equal(api.calls.length, 1)
      clock += HOUR
      await resolver.resolve(link(A))
      assert.equal(api.calls.length, 2)
    }
  })

  it('keeps a limited number of videos, dropping the one used longest ago', async () => {
    const { resolver, api } = setup(undefined, { maxCacheEntries: 2 })
    await resolver.resolve(link(A))
    await resolver.resolve(link(B))
    await resolver.resolve(link(A)) // A is used again: B is now the oldest
    await resolver.resolve(link(C)) // the cache is full: B goes
    assert.equal(api.calls.length, 3)
    await resolver.resolve(link(A))
    assert.equal(api.calls.length, 3, 'A was kept')
    await resolver.resolve(link(B))
    assert.equal(api.calls.length, 4, 'B was dropped')
  })

  it('does not grow without limit', async () => {
    const { resolver, api } = setup(undefined, { maxCacheEntries: 50, budget: { burst: 1000, refillMs: 1 } })
    for (let index = 0; index < 500; index += 1) await resolver.resolve(`id${String(index).padStart(9, '0')}`)
    assert.equal(api.calls.length, 500)
    // The first ones are long gone, the last ones are still there.
    await resolver.resolve(`id${String(499).padStart(9, '0')}`)
    assert.equal(api.calls.length, 500)
    await resolver.resolve(`id${String(0).padStart(9, '0')}`)
    assert.equal(api.calls.length, 501)
  })
})

describe('YouTubeResolver: several people asking at once', () => {
  it('shares one call between the people who ask for the same video', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { resolver, api } = setup(async (call) => {
      await gate
      return reply(listing(item(idOf(call))))
    })
    const first = resolver.resolve(link(A))
    const second = resolver.resolve(`https://youtu.be/${A}`)
    const third = resolver.resolve(A)
    const other = resolver.resolve(link(B))
    await flush()
    assert.equal(api.calls.length, 2, 'one call for A, one for B')

    release()
    const [one, two, three, four] = await Promise.all([first, second, third, other])
    assert.deepEqual(one, two)
    assert.deepEqual(one, three)
    assert.ok(one !== two && one !== three && two !== three, 'each gets its own copy')
    assert.ok(four.ok && four.video.videoId === B, 'B was read too')
    assert.equal(api.calls.length, 2)

    // What one of them does with its copy reaches neither the others nor what is remembered.
    assert.ok(one.ok && two.ok, 'both were read')
    one.video.title = 'Changed'
    two.video.durationSec = 1
    const later = await resolver.resolve(link(A))
    assert.ok(later.ok, 'the video was read again')
    assert.equal(later.video.title, 'A song')
    assert.equal(later.video.durationSec, 268)
    assert.ok(three.ok && three.video.title === 'A song' && three.video.durationSec === 268, 'the third copy is untouched')
  })

  it('fails them all together when the call fails, and asks again afterwards', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let failing = true
    const { resolver, api } = setup(async (call) => {
      await gate
      return failing ? reply('', 503) : reply(listing(item(idOf(call))))
    })
    const both = Promise.all([resolver.resolve(link(A)), resolver.resolve(link(A))])
    await flush()
    release()
    assert.deepEqual(await both, [
      { ok: false, error: 'service-unavailable' },
      { ok: false, error: 'service-unavailable' },
    ])
    failing = false
    assert.equal((await resolver.resolve(link(A))).ok, true)
    assert.equal(api.calls.length, 2)
  })
})

describe('YouTubeResolver: the budget of calls', () => {
  const small = { budget: { burst: 3, refillMs: SECOND } }

  it('lets a burst through, then says service-unavailable without calling', async () => {
    const { resolver, api } = setup(undefined, small)
    for (const id of [A, B, C]) assert.equal((await resolver.resolve(link(id))).ok, true)
    assert.deepEqual(await resolver.resolve(link(D)), { ok: false, error: 'service-unavailable' })
    assert.equal(api.calls.length, 3)
    assert.match(logs.join('\n'), /trop d'appels/)
  })

  it('earns calls back with time', async () => {
    const { resolver, api } = setup(undefined, small)
    for (const id of [A, B, C]) await resolver.resolve(link(id))
    clock += SECOND - 1
    assert.equal((await resolver.resolve(link(D))).ok, false)
    clock += 1
    assert.equal((await resolver.resolve(link(D))).ok, true)
    assert.equal(api.calls.length, 4)
  })

  it('costs nothing to answer from memory', async () => {
    const { resolver, api } = setup(undefined, small)
    for (const id of [A, B, C]) await resolver.resolve(link(id))
    for (let round = 0; round < 10; round += 1) assert.equal((await resolver.resolve(link(A))).ok, true)
    assert.equal(api.calls.length, 3)
  })

  it('counts a failed call too', async () => {
    const { resolver, api } = setup(() => reply('', 503), small)
    for (const id of [A, B, C]) await resolver.resolve(link(id))
    await resolver.resolve(link(D))
    assert.equal(api.calls.length, 3)
  })

  it('counts a shared call once', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { resolver, api } = setup(async (call) => {
      await gate
      return reply(listing(item(idOf(call))))
    }, small)
    const asks = [A, A, A, B, B, C].map((id) => resolver.resolve(link(id)))
    await flush()
    release()
    const results = await Promise.all(asks)
    assert.ok(results.every((result) => result.ok), 'the three videos were read')
    assert.equal(api.calls.length, 3)
    assert.equal((await resolver.resolve(link(D))).ok, false, 'the three calls used the burst')
  })

  it('is not used up by links that are not videos', async () => {
    const { resolver, api } = setup(undefined, small)
    for (let round = 0; round < 20; round += 1) await resolver.resolve('https://evil.example/')
    for (const id of [A, B, C]) assert.equal((await resolver.resolve(link(id))).ok, true)
    assert.equal(api.calls.length, 3)
  })
})

describe('YouTubeResolver: quota and key trouble', () => {
  it('stops calling for 5 minutes after the quota is used up, but still answers from memory', async () => {
    let quota = false
    const { resolver, api } = setup((call) => (quota ? apiError(403, 'quotaExceeded', 'RESOURCE_EXHAUSTED') : reply(listing(item(idOf(call))))))
    await resolver.resolve(link(A))
    quota = true
    assert.deepEqual(await resolver.resolve(link(B)), { ok: false, error: 'service-unavailable' })
    assert.equal(api.calls.length, 2)
    assert.match(logs.join('\n'), /quotaExceeded/)

    clock += 5 * MINUTE - 1
    assert.deepEqual(await resolver.resolve(link(C)), { ok: false, error: 'service-unavailable' })
    assert.equal(api.calls.length, 2, 'no call during the pause')
    assert.equal((await resolver.resolve(link(A))).ok, true, 'a video it knows is still answered')

    clock += 1
    quota = false
    assert.equal((await resolver.resolve(link(C))).ok, true)
    assert.equal(api.calls.length, 3)
  })

  it('treats a 429 and a rate limit like a used-up quota', async () => {
    for (const make of [() => reply('', 429), () => apiError(403, 'rateLimitExceeded'), () => apiError(403, 'dailyLimitExceeded'), () => apiError(403, 'userRateLimitExceeded')]) {
      const { resolver, api } = setup(make)
      await resolver.resolve(link(A))
      await resolver.resolve(link(B))
      assert.equal(api.calls.length, 1)
    }
  })

  it('waits a minute after the key is refused, and says what to check', async () => {
    let refused = true
    const { resolver, api } = setup((call) => (refused ? apiError(400, 'badRequest', 'INVALID_ARGUMENT') : reply(listing(item(idOf(call))))))
    assert.deepEqual(await resolver.resolve(link(A)), { ok: false, error: 'service-unavailable' })
    clock += MINUTE - 1
    await resolver.resolve(link(B))
    assert.equal(api.calls.length, 1)
    refused = false
    clock += 1
    assert.equal((await resolver.resolve(link(B))).ok, true)
    assert.match(logs.join('\n'), /YOUTUBE_API_KEY/)
    assert.match(logs.join('\n'), /HTTP 400/)
  })

  it('waits a minute after a refusal that is not about quota', async () => {
    for (const status of [401, 403]) {
      const { resolver, api } = setup(() => apiError(status, 'forbidden'))
      await resolver.resolve(link(A))
      await resolver.resolve(link(B))
      assert.equal(api.calls.length, 1, `HTTP ${status}`)
    }
  })

  it('does not pause for a trouble that passes (server errors, network, timeouts)', async () => {
    for (const make of [() => reply('', 500), () => reply('', 503), () => { throw new TypeError('fetch failed') }]) {
      const { resolver, api } = setup(make)
      await resolver.resolve(link(A))
      await resolver.resolve(link(B))
      assert.equal(api.calls.length, 2)
    }
  })

  it('serves a video already being fetched even while paused', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { resolver, api } = setup(async (call) => {
      await gate
      return reply(listing(item(idOf(call))))
    })
    const first = resolver.resolve(link(A))
    await flush()
    const joined = resolver.resolve(link(A))
    release()
    assert.equal((await first).ok && (await joined).ok, true)
    assert.equal(api.calls.length, 1)
  })
})

describe('YouTubeResolver: the log', () => {
  it('writes in French, behind [youtube]', async () => {
    const { resolver } = setup(() => reply('', 503))
    await resolver.resolve(link(A))
    assert.equal(logs.length, 1)
    assert.match(logs[0], /^\[youtube\] YouTube a un souci \(HTTP 503\)\.$/)
  })

  it('writes nothing when all goes well', async () => {
    const { resolver } = setup()
    await resolver.resolve(link(A))
    await resolver.resolve(link(B))
    await resolver.resolve('not a link')
    assert.deepEqual(logs, [])
  })

  it('writes the same trouble once a minute, not once per request', async () => {
    const { resolver } = setup(() => reply('', 503), { budget: { burst: 100, refillMs: 1 } })
    for (let index = 0; index < 20; index += 1) await resolver.resolve(`id${String(index).padStart(9, '0')}`)
    assert.equal(logs.length, 1)
    clock += MINUTE - 1
    await resolver.resolve(link(A))
    assert.equal(logs.length, 1)
    clock += 1
    await resolver.resolve(link(B))
    assert.equal(logs.length, 2)
  })

  it('writes each kind of trouble on its own', async () => {
    let step = 0
    const { resolver } = setup(() => {
      step += 1
      if (step === 1) return reply('', 503)
      if (step === 2) throw new TypeError('fetch failed')
      return reply({ nonsense: true })
    })
    await resolver.resolve(link(A))
    await resolver.resolve(link(B))
    await resolver.resolve(link(C))
    assert.equal(logs.length, 3)
    assert.match(logs[1], /injoignable \(TypeError\)/)
    assert.match(logs[2], /inattendue \(liste\)/)
  })

  it('says what kind of error a network failure was, and the system code when there is one', async () => {
    const { resolver } = setup(() => {
      throw new TypeError('fetch failed', { cause: Object.assign(new Error('connect refused'), { code: 'ECONNREFUSED' }) })
    })
    await resolver.resolve(link(A))
    assert.match(logs[0], /injoignable \(TypeError ECONNREFUSED\)/)
  })

  it('uses the console when no log is given', async () => {
    const written = mock.method(console, 'error', () => {})
    const resolver = new YouTubeResolver({ apiKey: KEY, fetch: fakeApi(() => reply('', 503)).fetch, now: () => clock })
    await resolver.resolve(link(A))
    assert.equal(written.mock.callCount(), 1)
    assert.match(String(written.mock.calls[0].arguments[0]), /^\[youtube\] /)
  })
})

describe('YouTubeResolver: the key', () => {
  const TRAPS: Array<[what: string, handler: (call: Call) => Response]> = [
    ['an error that quotes the address with the key', () => { throw new TypeError(`request to https://www.googleapis.com/youtube/v3/videos?key=${KEY} failed`) }],
    ['an error whose message is the key', () => { throw new Error(KEY) }],
    ['a system error that carries the key', () => { throw new Error('boom', { cause: { code: KEY, message: KEY } }) }],
    ['something thrown that is not an error', () => { throw { key: KEY, toString: () => KEY } }],
    ['a body that echoes the key', () => reply({ error: { code: 400, message: `bad key ${KEY}`, errors: [{ reason: 'badRequest', message: KEY }], status: 'INVALID_ARGUMENT' } }, 400)],
    ['a reason that is the key itself', () => reply({ error: { code: 400, errors: [{ reason: KEY }], status: KEY } }, 400)],
    ['a quota error that echoes the key', () => reply({ error: { code: 403, message: KEY, errors: [{ reason: 'quotaExceeded' }] } }, 403)],
    ['a page that echoes the key', () => reply(`<html>${KEY}</html>`, 502)],
    ['a video whose title is a decoy', (call) => reply(listing(item(idOf(call), { title: 'Song' })))],
  ]
  for (const [what, handler] of TRAPS) {
    it(`never writes it in a log line or an answer: ${what}`, async () => {
      const { resolver } = setup(handler)
      const results: ResolveResult[] = []
      for (const id of [A, B]) {
        results.push(await resolver.resolve(link(id)))
        clock += 10 * MINUTE
      }
      assert.ok(!JSON.stringify(results).includes(KEY), 'the key is not in an answer')
      assert.ok(!logs.join('\n').includes(KEY), logs.join('\n'))
    })
  }

  it('cuts the key out of a line even when a reason would carry it', async () => {
    const { resolver } = setup(() => reply({ error: { code: 400, errors: [{ reason: KEY }] } }, 400))
    await resolver.resolve(link(A))
    assert.ok(logs.length > 0, 'something was logged')
    assert.ok(!logs.join('\n').includes(KEY), 'the key is not in the log')
    assert.match(logs.join('\n'), /\*\*\*/)
  })

  it('keeps it out of sight of anything that looks at the resolver', () => {
    const { resolver } = setup()
    assert.equal(JSON.stringify(resolver), '{}')
    assert.ok(!inspect(resolver, { showHidden: true, depth: 8 }).includes(KEY), 'not visible to inspect')
    assert.ok(!Object.getOwnPropertyNames(resolver).some((name) => name.includes(KEY)), 'not a property name')
    assert.ok(!Object.values(resolver).some((value) => String(value).includes(KEY)), 'not a property value')
  })

  it('trims spaces and line breaks around it, as an editor may leave them', async () => {
    const { resolver, api } = setup(undefined, { apiKey: `  ${KEY}\r\n` })
    await resolver.resolve(link(A))
    assert.equal(api.calls[0].headers['x-goog-api-key'], KEY)
  })

  const UNUSABLE = ['', '   ', 'short', 'has a space inside the key 123456', `${'é'.repeat(20)}`, `line\nbreak${'x'.repeat(20)}`, 'x'.repeat(301), undefined, null, 42]
  for (const key of UNUSABLE) {
    it(`does nothing with the key ${JSON.stringify(key)}, and says so once`, async () => {
      const { resolver, api } = setup(undefined, { apiKey: key as string })
      assert.equal(logs.length, 1)
      assert.match(logs[0], /^\[youtube\] clé API absente ou malformée/)
      for (const id of [A, B]) assert.deepEqual(await resolver.resolve(link(id)), { ok: false, error: 'service-unavailable' })
      assert.equal(api.calls.length, 0)
      assert.equal(logs.length, 1)
      if (typeof key === 'string' && key.trim().length > 5) assert.ok(!logs.join('\n').includes(key.trim()), 'the key is not in the log')
    })
  }
})

describe('YouTubeResolver: never throws', () => {
  it('answers even when the log cannot be written', async () => {
    const api = fakeApi(() => reply('', 503))
    const resolver = new YouTubeResolver({
      apiKey: KEY,
      fetch: api.fetch,
      now: () => clock,
      log: () => {
        throw new Error('disk full')
      },
    })
    assert.deepEqual(await resolver.resolve(link(A)), { ok: false, error: 'service-unavailable' })
  })

  it('answers even when something it did not plan for goes wrong', async () => {
    let broken = false
    const resolver = new YouTubeResolver({
      apiKey: KEY,
      fetch: fakeApi().fetch,
      now: () => {
        if (broken) throw new Error('clock exploded')
        return clock
      },
      log: (line) => logs.push(line),
    })
    broken = true
    assert.deepEqual(await resolver.resolve(link(A)), { ok: false, error: 'service-unavailable' })
  })

  it('does not touch an object it is given instead of a string', async () => {
    const { resolver, api } = setup()
    const proxy = new Proxy({}, { get: () => { throw new Error('nope') } })
    assert.deepEqual(await resolver.resolve(proxy as unknown as string), { ok: false, error: 'invalid-link' })
    assert.equal(api.calls.length, 0)
  })
})
