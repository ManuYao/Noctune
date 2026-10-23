import { randomUUID } from 'node:crypto'
import { CHAT_MIN_INTERVAL_MS, type ChatMessage, type ChatResult, type Participant } from '../../shared/protocol'
import { validateChatText } from './chatText'
import { MinInterval } from './MinInterval'

const HISTORY_SIZE = 50

export type PostResult = { ok: true; message: ChatMessage } | Exclude<ChatResult, { ok: true }>

/** Recent messages of one room, plus the per-participant send rate limit. Kept in memory only. */
export class ChatLog {
  private messages: ChatMessage[] = []
  private sendLimit = new MinInterval(CHAT_MIN_INTERVAL_MS)

  /** Oldest first. */
  recent(): ChatMessage[] {
    return [...this.messages]
  }

  /** The author comes from server state, never from what the client sends. */
  post(author: Participant, rawText: unknown, now = Date.now()): PostResult {
    const wait = this.sendLimit.waitTime(author.id, now)
    if (wait > 0) return { ok: false, error: 'rate-limited', retryAfterMs: wait }

    // A refused message does not use up the author's turn.
    const checked = validateChatText(rawText)
    if (!checked.ok) return checked

    const message: ChatMessage = {
      id: randomUUID(),
      authorId: author.id,
      pseudo: author.pseudo,
      avatarId: author.avatarId,
      text: checked.text,
      sentAt: now,
    }
    this.sendLimit.record(author.id, now)
    this.messages.push(message)
    if (this.messages.length > HISTORY_SIZE) this.messages.shift()
    return { ok: true, message }
  }

  forget(participantId: string) {
    this.sendLimit.forget(participantId)
  }

  clear() {
    this.messages = []
    this.sendLimit.clear()
  }
}
