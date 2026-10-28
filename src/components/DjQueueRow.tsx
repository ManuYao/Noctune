import type { DjQueueEntry, Track } from '../../shared/protocol'
import { findAvatar } from '../data/avatars'
import { formatClock } from '../data/duration'
import { useModeration } from '../moderation/moderationContext'
import MoreButton from '../moderation/MoreButton'
import Avatar from './Avatar'
import './DjQueueRow.css'

interface DjQueueRowProps {
  entry: DjQueueEntry
  /** Place among the waiting DJs (1 plays next). Null for the DJ on the decks. */
  rank: number | null
  isSelf: boolean
  /** The track on air: what the DJ on the decks is playing. */
  nowPlaying: Track | null
  /** The viewer's own wait, for their row ("~12 min"). */
  selfWait: string | null
}

/** One DJ of the queue, as in mock-ups 3 and 3b: their place, their face, their next track and its length. */
export default function DjQueueRow({ entry, rank, isSelf, nowPlaying, selfWait }: DjQueueRowProps) {
  const moderation = useModeration()
  const avatar = findAvatar(entry.avatarId)
  const away = entry.participantId === null
  const onDecks = rank === null
  // What a report or the host's action points at: the track on air for the DJ on the decks, the next one for the others.
  const playing = onDecks ? moderation?.nowPlaying : null
  const aimed = onDecks ? (playing ? { id: playing.id, title: playing.title } : null) : entry.next
  const classes = ['dj-row']
  if (onDecks) classes.push('dj-row--decks')
  if (isSelf) classes.push('dj-row--self')
  if (away) classes.push('dj-row--away')

  let detail: string
  if (onDecks && nowPlaying) detail = `${nowPlaying.title} — ${nowPlaying.artist}`
  else if (away) detail = 'Hors ligne'
  else if (entry.next) detail = `${entry.next.title} — ${entry.next.artist}`
  else detail = 'Aucun morceau en attente'

  let tag: string | null = null
  if (onDecks) tag = 'En cours'
  else if (isSelf && selfWait) tag = selfWait
  else if (entry.next && !away) tag = formatClock(entry.next.durationSec)

  return (
    <li className={classes.join(' ')}>
      <span className="dj-row__badge" aria-hidden="true">
        {rank ?? ''}
      </span>
      {avatar && <Avatar avatar={avatar} size={30} framing="icon" decorative />}
      <span className="dj-row__who">
        <span className="dj-row__name">
          {entry.pseudo}
          {isSelf && ' (toi)'}
          {away && onDecks && ' (hors ligne)'}
        </span>
        <span className="dj-row__detail" title={detail}>
          {detail}
        </span>
      </span>
      {tag && <span className="dj-row__tag">{tag}</span>}
      {/* A track of a DJ: anybody can report it, the host can take it out (or cut it, when it is on air). */}
      {moderation && aimed && !isSelf && (
        <MoreButton
          className="dj-row__more"
          label={onDecks ? `Actions sur le morceau en cours de ${entry.pseudo}` : `Actions sur le prochain morceau de ${entry.pseudo}`}
          onClick={() =>
            moderation.openActions({
              kind: 'track',
              entryId: entry.id,
              trackId: aimed.id,
              pseudo: entry.pseudo,
              title: aimed.title,
              participantId: entry.participantId,
              playing: onDecks,
            })
          }
        />
      )}
    </li>
  )
}
