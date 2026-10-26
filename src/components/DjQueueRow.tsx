import type { DjQueueEntry } from '../../shared/protocol'
import { AVATARS } from '../data/avatars'
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
}

export default function DjQueueRow({ entry, rank, isSelf }: DjQueueRowProps) {
  const moderation = useModeration()
  const avatar = AVATARS.find((candidate) => candidate.id === entry.avatarId)
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
  if (away) detail = 'Hors ligne'
  else if (entry.next) detail = `${onDecks ? 'Ensuite : ' : ''}♪ ${entry.next.title} · ${formatClock(entry.next.durationSec)}`
  else detail = 'Aucun morceau en attente'

  return (
    <li className={classes.join(' ')}>
      <span className="dj-row__rank" aria-hidden="true">
        {rank ?? '♪'}
      </span>
      {avatar && <Avatar avatar={avatar} size={32} />}
      <div className="dj-row__who">
        <span className="dj-row__name">
          <span className="dj-row__pseudo">{entry.pseudo}</span>
          {isSelf && <em>toi</em>}
          {onDecks && <em className="dj-row__decks">À la console</em>}
        </span>
        <span className="dj-row__detail">{detail}</span>
      </div>
      {/* A track of a DJ: anybody can report it, the host can take it out (or cut it, when it is on air). */}
      {moderation && aimed && !isSelf && (
        <MoreButton
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
