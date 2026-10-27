import { AVATAR_IDS, PSEUDO_MAX, type AvatarId } from '../../shared/protocol'

const STORAGE_KEY = 'noctune.entry'

export interface EntryDraft {
  pseudo: string
  avatarId: AvatarId
}

const EMPTY_DRAFT: EntryDraft = { pseudo: '', avatarId: AVATAR_IDS[0] }

/**
 * What the visitor typed on the entry screen, kept for this tab so that a trip to the list of rooms does not
 * lose it. Storage can be missing or throw (private window, blocked site data): the draft is then just empty.
 */
export function readEntryDraft(): EntryDraft {
  return parseEntryDraft(entryDraftSnapshot())
}

/** The stored text itself (a string, so that it can be compared between two renders). */
export function entryDraftSnapshot(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function parseEntryDraft(raw: string): EntryDraft {
  try {
    const stored = JSON.parse(raw || 'null') as Partial<EntryDraft> | null
    return {
      pseudo: typeof stored?.pseudo === 'string' ? stored.pseudo.slice(0, PSEUDO_MAX) : EMPTY_DRAFT.pseudo,
      avatarId: AVATAR_IDS.find((id) => id === stored?.avatarId) ?? EMPTY_DRAFT.avatarId,
    }
  } catch {
    return EMPTY_DRAFT
  }
}

export function saveEntryDraft(draft: EntryDraft) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // Not kept, nothing else to do.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

const CHANGE_EVENT = 'noctune:entry-draft'

/** For `useSyncExternalStore`: a draft saved in this tab (the header shows the visitor's pseudo). */
export function subscribeEntryDraft(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => window.removeEventListener(CHANGE_EVENT, onChange)
}
