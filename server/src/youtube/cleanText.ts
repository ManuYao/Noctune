// Spaces of every kind, line breaks, and characters that only look like a space (Braille blank, Hangul fillers...).
// (Not `\s`: it counts the byte order mark as a space, and that one shows nothing at all.)
const BLANK = /[\t\n\v\f\r\u0085\p{Z}\u115F\u1160\u2800\u3164\uFFA0]/gu
// What shows nothing, or changes how the text around it is drawn (the bidi controls reorder the page). The zero width
// joiner (U+200D) stays: emoji sequences need it.
const INVISIBLE = /[\p{Cc}\p{Cs}\p{Co}\p{Cn}\u00AD\u034F\u061C\u17B4\u17B5\u180E\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB]/gu
const VISIBLE = /[\p{L}\p{N}\p{P}\p{S}]/u

/**
 * Text that comes from YouTube (a title, a channel name), made safe to show to everybody: one line, plain spaces,
 * nothing invisible, at most `max` characters (cut with an ellipsis). Empty when nothing visible is left.
 * It is shown as text, never as HTML: this is about what the eye can be fooled by, not about markup.
 */
export function cleanText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return ''
  const text = raw.replace(BLANK, ' ').replace(INVISIBLE, '').replace(/ {2,}/g, ' ').trim()
  if (!VISIBLE.test(text)) return ''
  const characters = Array.from(text)
  return characters.length <= max ? text : `${characters.slice(0, max - 1).join('').trimEnd()}…`
}
