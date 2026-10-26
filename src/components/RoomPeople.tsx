import { useState } from 'react'
import type { Participant } from '../../shared/protocol'
import { findAvatar } from '../data/avatars'
import ModDialog from '../moderation/ModDialog'
import Avatar from './Avatar'
import ParticipantList from './ParticipantList'
import './RoomPeople.css'

interface RoomPeopleProps {
  participants: Participant[]
  selfId: string | undefined
  /** Participant id of the DJ on the decks: first, with a cyan ring. */
  djId: string | null
}

// Five faces and a "+N" tile, as drawn; six faces when there is nobody more.
const FACES = 5

/**
 * "Dans la room" (mock-ups 3 and 3b): a few faces, the DJ first, and the whole list in a window ("Voir tout"), where the
 * host finds their tools for each person.
 */
export default function RoomPeople({ participants, selfId, djId }: RoomPeopleProps) {
  const [open, setOpen] = useState(false)
  // The DJ first, then everybody in the order they came in (as drawn, the viewer is not put forward).
  const ordered = [...participants.filter((p) => p.id === djId), ...participants.filter((p) => p.id !== djId)]
  const shown = ordered.length <= FACES + 1 ? ordered : ordered.slice(0, FACES)
  const more = ordered.length - shown.length

  return (
    <section className="room-people" aria-labelledby="room-people-title">
      <div className="room-people__head">
        <h2 id="room-people-title">
          Dans la room
          <span className="room-people__count">
            {participants.length}
            <span className="visually-hidden"> {participants.length > 1 ? 'personnes' : 'personne'}</span>
          </span>
        </h2>
        <button type="button" className="room-people__all" aria-haspopup="dialog" onClick={() => setOpen(true)}>
          Voir tout
        </button>
      </div>
      <ul className="room-people__faces">
        {shown.map((participant) => {
          const avatar = findAvatar(participant.avatarId)
          return (
            <li key={participant.id}>
              <span className={participant.id === djId ? 'room-people__ring room-people__ring--dj' : 'room-people__ring'}>
                {avatar && <Avatar avatar={avatar} size={34} framing="icon" decorative />}
              </span>
              <span className="room-people__name">
                {participant.pseudo}
                {participant.id === djId && <span className="visually-hidden"> (à la console)</span>}
                {participant.id === selfId && <span className="visually-hidden"> (toi)</span>}
              </span>
            </li>
          )
        })}
        {more > 0 && (
          <li>
            <span className="room-people__ring room-people__ring--more">+{more}</span>
            <span className="room-people__name">{more > 1 ? 'autres' : 'autre'}</span>
          </li>
        )}
      </ul>
      <ModDialog open={open} onClose={() => setOpen(false)} titleId="room-people-dialog-title" title={`Dans la room (${participants.length})`}>
        <ParticipantList participants={participants} selfId={selfId} labelledBy="room-people-dialog-title" />
      </ModDialog>
    </section>
  )
}
