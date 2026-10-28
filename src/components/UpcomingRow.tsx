import type { UpcomingTrack } from '../../shared/protocol'
import { findAvatar } from '../data/avatars'
import { formatClock, formatWait, formatWaitShort } from '../data/duration'
import { useModeration } from '../moderation/moderationContext'
import MoreButton from '../moderation/MoreButton'
import Avatar from './Avatar'
import TrackCover from './TrackCover'
import './DjQueueRow.css'
import './UpcomingRow.css'

interface UpcomingRowProps {
  item: UpcomingTrack
  isSelf: boolean
  /** Seconds before it starts, counted from the end of the track on air. */
  etaSec: number
  /** An absent DJ stands before it: that turn may be skipped, so this is the latest it can start. */
  latest: boolean
  /** Null: no "⋯" on this row (not the DJ's next track, or no way to act on it). */
  action: { entryId: string; trackId: string; participantId: string | null } | null
}

/** One track of the order to come: its rank, its cover, what it is, who plays it and about when. */
export default function UpcomingRow({ item, isSelf, etaSec, latest, action }: UpcomingRowProps) {
  const moderation = useModeration()
  const avatar = findAvatar(item.avatarId)
  const { track } = item
  const classes = ['dj-row', 'up-row']
  if (isSelf) classes.push('dj-row--self')
  if (item.away) classes.push('dj-row--away')
  const eta = `${latest ? '≤ ' : ''}${formatWaitShort(etaSec)}`

  return (
    <li className={classes.join(' ')}>
      <span className="dj-row__badge" aria-hidden="true">
        {item.position}
      </span>
      <TrackCover seed={track.videoId} size={40} />
      <span className="dj-row__who">
        <span className="dj-row__name up-row__title" title={`${track.title} — ${track.artist}`}>
          {track.title}
        </span>
        <span className="dj-row__detail">
          {track.artist} · {formatClock(track.durationSec)}
        </span>
        <span className="up-row__dj">
          {avatar && <Avatar avatar={avatar} size={18} framing="icon" decorative />}
          <span className="up-row__pseudo">{item.pseudo}</span>
          {isSelf && <span className="up-row__flag up-row__flag--self">toi</span>}
          {item.away && <span className="up-row__flag">absent</span>}
        </span>
      </span>
      <span className="dj-row__tag up-row__eta" aria-hidden="true">
        {eta}
      </span>
      <span className="visually-hidden">
        {`Numéro ${item.position}, ${track.title} de ${track.artist}, durée ${formatClock(track.durationSec)}. Passé par ${isSelf ? 'toi' : item.pseudo}${item.away ? ', actuellement absent' : ''}. ${latest ? 'Au plus tard dans ' : 'Dans '}${formatWait(etaSec)}.`}
      </span>
      {moderation && action && !isSelf && (
        <MoreButton
          className="dj-row__more"
          label={`Actions sur le prochain morceau de ${item.pseudo}`}
          onClick={() =>
            moderation.openActions({
              kind: 'track',
              entryId: action.entryId,
              trackId: action.trackId,
              pseudo: item.pseudo,
              title: track.title,
              participantId: action.participantId,
              playing: false,
            })
          }
        />
      )}
    </li>
  )
}
