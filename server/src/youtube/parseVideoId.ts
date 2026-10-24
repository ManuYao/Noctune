import { DJ_INPUT_MAX } from '../../../shared/protocol'

/** The id of a YouTube video: 11 characters of the URL-safe alphabet. */
const VIDEO_ID = /^[\w-]{11}$/

const SHORT_HOST = 'youtu.be'
const WATCH_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
])

// A link copied from an address bar has often lost its "https://".
const WITHOUT_SCHEME = /^(?:www\.|m\.|music\.)?(?:youtube(?:-nocookie)?\.com|youtu\.be)(?=[/?#]|$)/i
// Nothing copied from an address bar holds a space, a control character or a backslash. The URL parser would quietly
// drop (tabs, newlines) or reinterpret ("\" becomes "/") them, so they are refused before it sees the text.
const NOT_A_LINK = /[\s\u0000-\u001f\u007f-\u009f\\]/
// What stands between "//" and the first "/", "?" or "#": letters, digits, dots, hyphens, nothing else. No credentials
// ("@"), no port (":"), no brackets, no look-alike letters from other alphabets.
const AUTHORITY = /^[a-z0-9.-]+$/i
const EMBED_PATH = /^\/(?:embed|shorts|live|v)\/([\w-]{11})\/?$/
const SHORT_PATH = /^\/([\w-]{11})\/?$/

/**
 * The video a DJ pasted: the id of a bare id, a watch/embed/shorts/live link on a YouTube host, or a youtu.be link.
 * Null for anything else, and for anything ambiguous. The server never fetches what the user wrote: only the id this
 * returns goes any further.
 */
export function parseVideoId(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const text = input.trim()
  if (text.length === 0 || text.length > DJ_INPUT_MAX) return null
  if (NOT_A_LINK.test(text)) return null
  if (VIDEO_ID.test(text)) return text

  let link: string
  if (/^https?:\/\//i.test(text)) link = text
  else if (WITHOUT_SCHEME.test(text)) link = `https://${text}`
  else return null

  // Read the host from the text itself, not only from the parser: the two must agree on who the link points to.
  const authority = link.slice(link.indexOf('//') + 2).split(/[/?#]/, 1)[0]
  if (!AUTHORITY.test(authority)) return null
  const host = authority.toLowerCase()

  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  if (url.hostname !== host || url.username !== '' || url.password !== '' || url.port !== '') return null

  if (host === SHORT_HOST) return SHORT_PATH.exec(url.pathname)?.[1] ?? null
  if (!WATCH_HOSTS.has(host)) return null

  if (url.pathname === '/watch') {
    // Two "v" is a link that says two things: refuse it rather than pick one.
    const values = url.searchParams.getAll('v')
    return values.length === 1 && VIDEO_ID.test(values[0]) ? values[0] : null
  }
  return EMBED_PATH.exec(url.pathname)?.[1] ?? null
}
