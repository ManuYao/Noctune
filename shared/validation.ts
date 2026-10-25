// What counts as a valid pseudo, e-mail address or password. Pure functions, used by the site (to answer at once)
// and by the server (which never trusts the site).
import { EMAIL_MAX, PASSWORD_MAX, PASSWORD_MIN, PLAYLIST_NAME_MAX, PSEUDO_MAX, PSEUDO_MIN } from './protocol'

// Control characters, and everything that can be there without being seen: zero-width and direction-changing
// characters, the "filler" characters of Hangul and Braille that draw as a blank. They let one pseudo pass for
// another, or make a pseudo that is empty to the eye.
// Built from code points: typed as escapes in a file, some tools turn them into the invisible characters themselves.
const EMOJI_JOINERS = new RegExp(`[${String.fromCodePoint(0x200d, 0xfe0f)}]`, 'gu')
const INVISIBLE = /[\p{C}\p{Default_Ignorable_Code_Point}⠀]/u

/**
 * The pseudo as it is kept: Unicode-normalised (full-width and non-breaking spaces become plain ones), trimmed, runs of
 * spaces folded into one. Null when it is not a pseudo someone may use: wrong length, invisible characters, or letters
 * of two alphabets that look alike mixed in one word ("Аdmin" with a Cyrillic А).
 */
export function normalizePseudo(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const pseudo = raw.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (pseudo.length < PSEUDO_MIN || pseudo.length > PSEUDO_MAX) return null
  if (INVISIBLE.test(pseudo)) return null
  if (/\p{Script=Latin}/u.test(pseudo) && /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(pseudo)) return null
  return pseudo
}

/** Two pseudos that differ only by case are the same pseudo (and "ß" is "ss", the way a German reader sees it). */
export const pseudoKey = (pseudo: string): string => pseudo.toLowerCase().replace(/ß/g, 'ss').replace(/ς/g, 'σ')

/**
 * The name of a playlist as it is kept: Unicode-normalised, trimmed, runs of spaces folded into one. Null when it is
 * empty, longer than PLAYLIST_NAME_MAX characters, or has characters that cannot be seen (two names that look the same
 * must be the same name). Counted in characters, not in UTF-16 units: an emoji is one.
 */
export function normalizePlaylistName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.normalize('NFKC').replace(/\s+/g, ' ').trim()
  if (name.length === 0 || [...name].length > PLAYLIST_NAME_MAX) return null
  // Emoji are built with two characters that draw nothing by themselves (the variation selector of "❤️", the joiner of
  // "👨‍🎤"): they are fine in a playlist name, as long as something else is there to be seen.
  const seen = name.replace(EMOJI_JOINERS, '')
  if (seen.trim().length === 0 || INVISIBLE.test(seen)) return null
  return name
}

/** Two names of one member's playlists that differ only by case are the same name. */
export const playlistNameKey = (name: string): string => pseudoKey(name)

// Names that would make a pseudo pass for the team or for the site itself. Compared on the letters alone, so that
// "Admin_", "admin2" and "A d m i n" are caught as well as "Admin".
const STAFF_WORDS = new Set([
  'admin',
  'administrateur',
  'administrator',
  'modo',
  'moderateur',
  'moderator',
  'noctune',
  'staff',
  'support',
  'system',
  'systeme',
  'root',
])

/** True for a pseudo nobody may take, because it would pass for the team. */
export function isStaffLookalike(pseudo: string): boolean {
  const letters = pseudoKey(pseudo.normalize('NFD').replace(/\p{M}/gu, '')).replace(/[^\p{L}]/gu, '')
  return STAFF_WORDS.has(letters)
}

// Deliberately plain: one "@", something on each side, a dot in the domain, no spaces. Whether the address exists is
// only known by sending a message to it.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/
const UNREADABLE = /[\p{C}\p{Default_Ignorable_Code_Point}]/u

/** The e-mail as it is kept (trimmed, lower case), or null when it cannot be an address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (email.length > EMAIL_MAX || !EMAIL_SHAPE.test(email) || UNREADABLE.test(email)) return null
  return email
}

/** Length is the only rule (no "one capital, one digit"): a long phrase beats a short tangle. Counted in characters. */
export function isAcceptablePassword(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  const length = [...raw.normalize('NFKC')].length
  return length >= PASSWORD_MIN && length <= PASSWORD_MAX
}
