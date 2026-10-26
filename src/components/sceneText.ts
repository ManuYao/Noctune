// The labels of the scene are SVG: their boxes are sized from the length of the text, not measured. Figtree in bold
// averages a little over half its size per character (the mock-ups' labels give 0.5 to 0.6 em): a box sized on 0.56 em
// is a touch roomy, never too short.
const AVERAGE_EM = 0.56

/** Characters, not UTF-16 units: an emoji counts once. */
const characters = (text: string) => Array.from(text)

/** About how wide a bold Figtree text is, in user units of the scene. */
export function approxTextWidth(text: string, fontSize: number): number {
  return characters(text).length * fontSize * AVERAGE_EM
}

/** The text, cut with an ellipsis past `max` characters. */
export function cutText(text: string, max: number): string {
  const chars = characters(text.trim())
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('')
}
