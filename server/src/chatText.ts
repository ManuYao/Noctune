import { CHAT_MAX_LENGTH } from '../../shared/protocol'

// Invisible characters that only serve to hide or reorder text. U+200D (zero-width joiner) is kept in
// displayed text because emoji sequences need it.
const HIDDEN_IN_DISPLAY = /[­​⁠﻿‪-‮⁦-⁩]/g
const HIDDEN_IN_LINK_CHECK = /[­​-‍⁠﻿‪-‮⁦-⁩]/g
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g

// Domain endings that are almost never typed by accident right after a dot. Words like "me", "de" or "it"
// are left out on purpose: "oui.de rien" must not be taken for a link.
const LINK_TLDS = 'com|net|org|fr|io|gg|tv|ly|xyz|info|biz|app|dev|link|click|top|site|shop|live'

const LINK_PATTERN = new RegExp(
  [
    String.raw`[a-z][a-z0-9+.-]*:\/\/`,
    String.raw`\bwww\s*\.`,
    String.raw`\byoutu\.be\b`,
    String.raw`\b\d{1,3}(?:\.\d{1,3}){3}\b`,
    String.raw`\b[a-z0-9-]+\.(?:${LINK_TLDS})\b`,
  ].join('|'),
  'i',
)

/** Plain single-line text: control and hidden characters removed, whitespace collapsed. */
export function cleanChatText(raw: string): string {
  return raw.replace(CONTROL_CHARS, ' ').replace(HIDDEN_IN_DISPLAY, '').replace(/\s+/g, ' ').trim()
}

/** Best effort: catches the usual ways of writing a link, not every trick. The host moderates the rest. */
export function containsLink(text: string): boolean {
  const normalized = text
    .replace(HIDDEN_IN_LINK_CHECK, '')
    .normalize('NFKC')
    .replace(/[。｡]/g, '.')
  return LINK_PATTERN.test(normalized)
}

export type ChatTextResult =
  | { ok: true; text: string }
  | { ok: false; error: 'empty' | 'too-long' | 'links-not-allowed' }

export function validateChatText(raw: unknown): ChatTextResult {
  if (typeof raw !== 'string') return { ok: false, error: 'empty' }
  // Bound the work done on hostile input before cleaning it.
  if (raw.length > CHAT_MAX_LENGTH * 8) return { ok: false, error: 'too-long' }

  const text = cleanChatText(raw)
  if (text === '') return { ok: false, error: 'empty' }
  if ([...text].length > CHAT_MAX_LENGTH) return { ok: false, error: 'too-long' }
  if (containsLink(text)) return { ok: false, error: 'links-not-allowed' }
  return { ok: true, text }
}
