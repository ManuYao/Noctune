import { useEffect, useRef, useState } from 'react'
import { trackPositionSec } from '../../shared/clock'
import { SKIP_PROTECTED_SEC, type MyReactions, type Reactions, type Track } from '../../shared/protocol'
import { useServerNow } from '../player/useServerNow'
import type { SendReactionResult } from '../realtime/useRoom'
import ReactionIcon from './ReactionIcon'
import './ReactionButtons.css'

interface ReactionButtonsProps {
  track: Track | null
  reactions: Reactions
  mine: MyReactions
  /** Milliseconds to add to the local clock to get the server clock. */
  clockOffsetMs: number
  onLike: (value: boolean) => Promise<SendReactionResult>
  onSkip: (value: boolean) => Promise<SendReactionResult>
}

const MESSAGE_MS = 3000

function errorMessage(result: Exclude<SendReactionResult, { ok: true }>): string {
  switch (result.error) {
    case 'rate-limited':
      return 'Doucement, réessaie dans un instant.'
    case 'too-early':
      return `Le vote pour passer s'ouvre dans ${Math.ceil(result.retryAfterMs / 1000)} s.`
    case 'not-in-room':
      return "Tu n'es plus dans la room."
    case 'network':
      return 'Pas de connexion : réessaie dans un instant.'
    case 'no-track':
    case 'invalid':
      return "Action impossible pour l'instant."
  }
}

export default function ReactionButtons({ track, reactions, mine, clockOffsetMs, onLike, onSkip }: ReactionButtonsProps) {
  const serverNow = useServerNow(clockOffsetMs, track !== null)
  const [message, setMessage] = useState('')
  const [heartBurst, setHeartBurst] = useState(0)
  const messageTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(messageTimer.current), [])

  const position = track ? trackPositionSec(track, serverNow) : 0
  const opensIn = Math.max(0, Math.ceil(SKIP_PROTECTED_SEC - position))
  // Taking a vote back is always possible; casting one waits for the end of the protected seconds.
  const skipLocked = track === null || (opensIn > 0 && !mine.votedSkip)

  async function react(send: (value: boolean) => Promise<SendReactionResult>, value: boolean) {
    const result = await send(value)
    if (result.ok) return
    setMessage(errorMessage(result))
    window.clearTimeout(messageTimer.current)
    messageTimer.current = window.setTimeout(() => setMessage(''), MESSAGE_MS)
  }

  function handleLike() {
    if (!mine.liked) setHeartBurst((count) => count + 1)
    void react(onLike, !mine.liked)
  }

  const hint = skipLocked
    ? `Le vote pour passer s'ouvre dans ${opensIn} s.`
    : `${reactions.skipVotes} vote${reactions.skipVotes > 1 ? 's' : ''} sur ${reactions.skipRequired} nécessaires pour passer ce morceau.`

  return (
    <div className="reactions">
      <div className="reactions__buttons">
        <button
          type="button"
          className="reactions__button reactions__like"
          aria-pressed={mine.liked}
          disabled={track === null}
          onClick={handleLike}
        >
          <ReactionIcon kind="heart" filled={mine.liked} />
          <span className="reactions__label">J'aime</span>
          <span className="reactions__count">{reactions.likes}</span>
          {heartBurst > 0 && (
            <span key={heartBurst} className="reactions__burst" aria-hidden="true">
              <ReactionIcon kind="heart" filled />
              <ReactionIcon kind="heart" filled />
              <ReactionIcon kind="heart" filled />
            </span>
          )}
        </button>
        <button
          type="button"
          className="reactions__button"
          aria-pressed={mine.votedSkip}
          aria-describedby="skip-hint"
          disabled={skipLocked}
          onClick={() => void react(onSkip, !mine.votedSkip)}
        >
          <ReactionIcon kind="skip" />
          <span className="reactions__label">Passer</span>
          <span className="reactions__count">
            {reactions.skipVotes}/{reactions.skipRequired}
          </span>
        </button>
      </div>
      <p id="skip-hint" className="reactions__hint">
        {hint}
      </p>
      <p className="reactions__message" role="status">
        {message}
      </p>
    </div>
  )
}
