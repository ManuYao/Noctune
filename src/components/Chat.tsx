import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CHAT_MAX_LENGTH, type ChatMessage } from '../../shared/protocol'
import { AVATARS } from '../data/avatars'
import type { SendChatResult } from '../realtime/useRoom'
import Avatar from './Avatar'
import './Chat.css'

interface ChatProps {
  messages: ChatMessage[]
  selfId: string | undefined
  /** Why writing is impossible right now. Shown to the user instead of a field that silently does nothing. */
  disabledReason: string | null
  onSend: (text: string) => Promise<SendChatResult>
}

// Distance from the bottom under which the list keeps following new messages.
const STICK_TO_BOTTOM_PX = 48

function errorMessage(result: Exclude<SendChatResult, { ok: true }>): string {
  switch (result.error) {
    case 'empty':
      return "Écris un message avant d'envoyer."
    case 'too-long':
      return `Ton message est trop long (${CHAT_MAX_LENGTH} caractères maximum).`
    case 'links-not-allowed':
      return 'Les liens ne sont pas autorisés dans le chat.'
    case 'rate-limited':
      return `Doucement ! Tu pourras réécrire dans ${Math.ceil(result.retryAfterMs / 1000)} s.`
    case 'not-in-room':
      return "Tu n'es plus dans la room. Retourne à l'entrée pour la rejoindre."
    case 'network':
      return 'Message non envoyé : vérifie ta connexion et réessaie.'
  }
}

export default function Chat({ messages, selfId, disabledReason, onSend }: ChatProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLOListElement>(null)
  const followsEnd = useRef(true)

  useEffect(() => {
    const list = listRef.current
    if (list && followsEnd.current) list.scrollTop = list.scrollHeight
  }, [messages])

  // On a phone the chat is a tab: while another tab is shown the list has no size, so messages that arrive cannot be
  // scrolled to. When it shows again (or the window changes shape) it goes back to the end, if it was following it.
  useEffect(() => {
    const list = listRef.current
    if (!list || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (followsEnd.current) list.scrollTop = list.scrollHeight
    })
    observer.observe(list)
    return () => observer.disconnect()
  }, [])

  function handleScroll() {
    const list = listRef.current
    if (list) followsEnd.current = list.scrollHeight - list.scrollTop - list.clientHeight < STICK_TO_BOTTOM_PX
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (sending || disabledReason) return
    if (text.trim() === '') {
      setError(errorMessage({ ok: false, error: 'empty' }))
      return
    }

    setSending(true)
    setError('')
    const result = await onSend(text)
    setSending(false)
    if (result.ok) {
      setText('')
      followsEnd.current = true
    } else {
      setError(errorMessage(result))
    }
  }

  return (
    <section className="chat" aria-labelledby="chat-title">
      <h2 id="chat-title">Chat</h2>

      <ol ref={listRef} className="chat__list" role="log" aria-label="Messages du chat" tabIndex={0} onScroll={handleScroll}>
        {messages.length === 0 && <li className="chat__empty">Aucun message pour l'instant. Lance la conversation !</li>}
        {messages.map((message) => {
          const avatar = AVATARS.find((candidate) => candidate.id === message.avatarId)
          const isSelf = message.authorId === selfId
          return (
            <li key={message.id} className={isSelf ? 'chat__message chat__message--self' : 'chat__message'}>
              {avatar && <Avatar avatar={avatar} size={32} />}
              <p>
                <strong className="chat__author">
                  {message.pseudo}
                  {isSelf && <span className="visually-hidden"> (toi)</span>}
                </strong>{' '}
                {message.text}
              </p>
            </li>
          )
        })}
      </ol>

      <form className="chat__form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="chat-input" className="visually-hidden">
          Ton message
        </label>
        <input
          id="chat-input"
          type="text"
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Écris un message…"
          autoComplete="off"
          enterKeyHint="send"
          readOnly={disabledReason !== null}
          aria-describedby={disabledReason || error ? 'chat-feedback' : undefined}
          onChange={(event) => {
            setText(event.target.value)
            setError('')
          }}
        />
        <button type="submit" aria-label="Envoyer" disabled={sending || disabledReason !== null}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
            <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>

      {disabledReason ? (
        <p id="chat-feedback" className="chat__feedback" role="status">
          {disabledReason}
        </p>
      ) : (
        error && (
          <p id="chat-feedback" className="chat__feedback chat__feedback--error" role="alert">
            {error}
          </p>
        )
      )}
    </section>
  )
}
