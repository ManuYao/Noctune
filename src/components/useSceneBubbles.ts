import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../shared/protocol'
import { cutText } from './sceneText'

/** A message somebody just sent, shown for a moment over their head in the scene. */
export interface SceneBubbleState {
  id: string
  authorId: string
  text: string
}

// Long enough to read a short line, then the scene goes back to dancing.
const BUBBLE_MS = 6000
// More would hide the crowd: the newest ones win.
const MAX_BUBBLES = 3
// About as long as the bubbles of the mock-ups: the chat has the rest.
const BUBBLE_CHARS = 28

/**
 * The bubbles of the scene: each new chat message makes one over its author, for a few seconds, one per person (their
 * next message replaces it). Messages older than that are not news: the history a newcomer receives makes none.
 */
export function useSceneBubbles(messages: ChatMessage[], clockOffsetMs: number): SceneBubbleState[] {
  const [bubbles, setBubbles] = useState<SceneBubbleState[]>([])
  const lastSeenId = useRef<string | null>(null)
  const timers = useRef(new Map<string, number>())

  useEffect(() => {
    const lastIndex = lastSeenId.current === null ? -1 : messages.findIndex((message) => message.id === lastSeenId.current)
    const fresh = messages.slice(lastIndex + 1)
    if (messages.length > 0) lastSeenId.current = messages[messages.length - 1].id
    const serverNow = Date.now() + clockOffsetMs
    const added = fresh.filter((message) => serverNow - message.sentAt < BUBBLE_MS)
    if (added.length === 0) return

    setBubbles((current) => {
      let next = current
      for (const message of added) {
        next = [...next.filter((bubble) => bubble.authorId !== message.authorId), { id: message.id, authorId: message.authorId, text: cutText(message.text, BUBBLE_CHARS) }]
      }
      return next.slice(-MAX_BUBBLES)
    })
    for (const message of added) {
      const left = Math.max(1000, BUBBLE_MS - (serverNow - message.sentAt))
      const timer = window.setTimeout(() => {
        timers.current.delete(message.id)
        setBubbles((current) => current.filter((bubble) => bubble.id !== message.id))
      }, left)
      timers.current.set(message.id, timer)
    }
  }, [messages, clockOffsetMs])

  // Only when the scene goes: a new message must not cancel the end of the bubbles already shown.
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer)
      pending.clear()
    }
  }, [])

  return bubbles
}
