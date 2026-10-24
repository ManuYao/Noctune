import type { DjQueueEntry } from '../../shared/protocol'
import { AVATARS } from '../data/avatars'
import { formatClock } from '../data/duration'
import Avatar from './Avatar'
import './DjQueueRow.css'

interface DjQueueRowProps {
  entry: DjQueueEntry
  /** Place among the waiting DJs (1 plays next). Null for the DJ on the decks. */
  rank: number | null
  isSelf: boolean
}

export default function DjQueueRow({ entry, rank, isSelf }: DjQueueRowProps) {
  const avatar = AVATARS.find((candidate) => candidate.id === entry.avatarId)
  const away = entry.participantId === null
  const onDecks = rank === null
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
    </li>
  )
}
