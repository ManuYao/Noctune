import { useEffect, useRef, useState } from 'react'
import { trackPositionSec } from '../../shared/clock'
import { OWN_SKIP_MIN_SEC, SKIP_PROTECTED_SEC, type MyReactions, type Reactions, type Track } from '../../shared/protocol'
import { useAccount } from '../auth/useAccount'
import { keepInPlaylist } from '../playlists/keepInPlaylist'
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
  /** The viewer is the DJ whose track plays: no like of their own, and skipping hands the decks over at once. */
  onDecks: boolean
  /** What follows when the DJ on the decks skips ("Le DJ suivant prend la main."). Null when the viewer is not that DJ. */
  ownSkipHint: string | null
  onLike: (value: boolean) => Promise<SendReactionResult>
  onSkip: (value: boolean) => Promise<SendReactionResult>
}

const MESSAGE_MS = 3000
// What was kept, or why not, is read rather than glanced at: it stays a little longer.
const KEEP_MESSAGE_MS = 4500

function errorMessage(result: Exclude<SendReactionResult, { ok: true }>, onDecks: boolean): string {
  switch (result.error) {
    case 'rate-limited':
      return 'Doucement, réessaie dans un instant.'
    case 'too-early':
      // The DJ skipping their own track is not casting a vote: the words must not say so.
      return onDecks
        ? `Tu pourras passer ton morceau dans ${Math.ceil(result.retryAfterMs / 1000)} s.`
        : `Le vote pour passer s'ouvre dans ${Math.ceil(result.retryAfterMs / 1000)} s.`
    case 'not-in-room':
      return "Tu n'es plus dans la room."
    case 'network':
      return 'Pas de connexion : réessaie dans un instant.'
    case 'own-track':
      return 'Tu ne peux pas aimer ton propre morceau.'
    case 'no-track':
    case 'invalid':
      return "Action impossible pour l'instant."
  }
}

export default function ReactionButtons({
  track,
  reactions,
  mine,
  clockOffsetMs,
  onDecks,
  ownSkipHint,
  onLike,
  onSkip,
}: ReactionButtonsProps) {
  const serverNow = useServerNow(clockOffsetMs, track !== null)
  const { account } = useAccount()
  const [message, setMessage] = useState('')
  // A refusal is in the colour of refusals; "kept in your playlist" is good news.
  const [messageKind, setMessageKind] = useState<'error' | 'info'>('error')
  const [keeping, setKeeping] = useState(false)
  const [heartBurst, setHeartBurst] = useState(0)
  const messageTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(messageTimer.current), [])

  const position = track ? trackPositionSec(track, serverNow) : 0
  const opensIn = Math.max(0, Math.ceil(SKIP_PROTECTED_SEC - position))
  // Taking a vote back is always possible; casting one waits for the end of the protected seconds.
  // The DJ skipping their own track is not a vote, but the server makes them wait a few seconds too (OWN_SKIP_MIN_SEC):
  // a track that is dropped at once would not count as played, and could be queued again for nothing.
  const ownOpensIn = Math.max(0, Math.ceil(OWN_SKIP_MIN_SEC - position))
  const skipLocked = track === null || (onDecks ? ownOpensIn > 0 : opensIn > 0 && !mine.votedSkip)

  async function react(send: (value: boolean) => Promise<SendReactionResult>, value: boolean) {
    const result = await send(value)
    if (result.ok) return
    show('error', errorMessage(result, onDecks), MESSAGE_MS)
  }

  function show(kind: 'error' | 'info', text: string, forMs: number) {
    setMessageKind(kind)
    setMessage(text)
    window.clearTimeout(messageTimer.current)
    messageTimer.current = window.setTimeout(() => setMessage(''), forMs)
  }

  /** "+ Playlist": keeps the track that plays in the member's active playlist (one is made for a member who has none). */
  async function handleKeep() {
    if (!track || keeping) return
    setKeeping(true)
    const result = await keepInPlaylist(track.videoId)
    setKeeping(false)
    if (result.ok) show('info', `Gardé dans « ${result.playlistName} ».`, KEEP_MESSAGE_MS)
    else if (result.error === 'already') show('info', `Déjà dans « ${result.playlistName} ».`, KEEP_MESSAGE_MS)
    else show('error', result.message, KEEP_MESSAGE_MS)
  }

  function handleLike() {
    if (!mine.liked) setHeartBurst((count) => count + 1)
    void react(onLike, !mine.liked)
  }

  const ownHint = ownOpensIn > 0 ? `Tu pourras passer ton morceau dans ${ownOpensIn} s.` : ownSkipHint
  const hint = onDecks
    ? ownHint
    : skipLocked
      ? `Le vote pour passer s'ouvre dans ${opensIn} s.`
      : `${reactions.skipVotes} vote${reactions.skipVotes > 1 ? 's' : ''} sur ${reactions.skipRequired} nécessaires pour passer ce morceau.`

  return (
    <div className={onDecks ? 'reactions reactions--own' : 'reactions'}>
      <div className="reactions__buttons">
        <button
          type="button"
          className="reactions__button reactions__like"
          aria-pressed={mine.liked}
          aria-describedby={onDecks ? 'like-note' : undefined}
          disabled={track === null || onDecks}
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
        {onDecks ? (
          <button
            type="button"
            className="reactions__button reactions__button--own"
            aria-describedby={hint ? 'skip-hint' : undefined}
            disabled={skipLocked}
            onClick={() => void react(onSkip, true)}
          >
            <ReactionIcon kind="skip" />
            <span className="reactions__label">Passer mon morceau</span>
          </button>
        ) : (
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
        )}
        {/* Playlists are the members': a visitor has none to keep a track in. */}
        {account && (
          <button
            type="button"
            className="reactions__button reactions__keep"
            aria-label="Garder ce morceau dans ma playlist"
            title="Garder ce morceau dans ma playlist"
            disabled={track === null || keeping}
            onClick={() => void handleKeep()}
          >
            <ReactionIcon kind="plus" />
            <span className="reactions__label">Playlist</span>
          </button>
        )}
      </div>
      {onDecks ? (
        // Said in words, not only in a tooltip: a touch screen has no hover.
        <div className="reactions__notes">
          <p id="like-note" className="reactions__hint">
            Pas de J'aime sur ton propre morceau.
          </p>
          {hint && (
            <p id="skip-hint" className="reactions__hint">
              {hint}
            </p>
          )}
        </div>
      ) : (
        <p id="skip-hint" className="reactions__hint">
          {hint}
        </p>
      )}
      <p className="reactions__message" data-kind={messageKind} role="status">
        {message}
      </p>
    </div>
  )
}
