import type { Participant } from '../../shared/protocol'
import { findAvatar } from '../data/avatars'
import { useModeration } from '../moderation/moderationContext'
import MoreButton from '../moderation/MoreButton'
import Avatar from './Avatar'
import './ParticipantList.css'

interface ParticipantListProps {
  participants: Participant[]
  selfId: string | undefined
  /** The id of a title that already names the list (a window's): the list then has no title of its own. */
  labelledBy?: string
}

export default function ParticipantList({ participants, selfId, labelledBy }: ParticipantListProps) {
  const moderation = useModeration()
  return (
    <section aria-labelledby={labelledBy ?? 'participants-title'} className="participants">
      {!labelledBy && <h2 id="participants-title">Public ({participants.length})</h2>}
      <ul>
        {participants.map((participant) => {
          const avatar = findAvatar(participant.avatarId)
          return (
            <li key={participant.id}>
              {avatar && <Avatar avatar={avatar} size={40} framing="icon" decorative />}
              <span className="participants__name">{participant.pseudo}</span>
              {participant.member && <em className="participants__member">membre</em>}
              {participant.id === selfId && <em>toi</em>}
              {/* Only the host moderates the audience: warn, mute, exclude. */}
              {moderation?.isHost && participant.id !== selfId && (
                <MoreButton
                  className="participants__more"
                  label={`Actions de l'hôte sur ${participant.pseudo}`}
                  onClick={() => moderation.openActions({ kind: 'person', participantId: participant.id, pseudo: participant.pseudo })}
                />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
