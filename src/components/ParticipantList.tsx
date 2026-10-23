import type { Participant } from '../../shared/protocol'
import { AVATARS } from '../data/avatars'
import Avatar from './Avatar'
import './ParticipantList.css'

interface ParticipantListProps {
  participants: Participant[]
  selfId: string | undefined
}

export default function ParticipantList({ participants, selfId }: ParticipantListProps) {
  return (
    <section aria-labelledby="participants-title" className="participants">
      <h2 id="participants-title">Public ({participants.length})</h2>
      <ul>
        {participants.map((participant) => {
          const avatar = AVATARS.find((candidate) => candidate.id === participant.avatarId)
          return (
            <li key={participant.id}>
              {avatar && <Avatar avatar={avatar} size={40} />}
              <span>{participant.pseudo}</span>
              {participant.member && <em className="participants__member">membre</em>}
              {participant.id === selfId && <em>toi</em>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
