import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import type { RoomDetail } from '../../shared/protocol'
import { useAccount } from '../auth/useAccount'
import RoomForm from '../components/RoomForm'
import SiteHeader from '../components/SiteHeader'
import { deleteRoom, getRoom, updateRoom } from '../rooms/roomApi'
import { roomErrorMessage } from '../rooms/roomMessages'
import './RoomFormPage.css'

type Loaded = { state: 'loading' } | { state: 'ready'; room: RoomDetail } | { state: 'failed'; message: string }

function Shell({ children }: { children: ReactNode }) {
  return (
    <div>
      <SiteHeader />
      <main className="room-form-page">{children}</main>
    </div>
  )
}

/** The host changes the settings of their room, or deletes it. Anybody else is told why they cannot. */
export default function EditRoomPage() {
  const { account, status } = useAccount()

  if (status === 'ready' && !account) return <Navigate to="/connexion" replace />
  if (status !== 'ready' || !account) {
    return (
      <Shell>
        <p className="room-form-page__note" role="status">
          Chargement…
        </p>
      </Shell>
    )
  }
  return <HostEdit pseudo={account.pseudo} />
}

function HostEdit({ pseudo }: { pseudo: string }) {
  const { roomId = '' } = useParams()
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  const [note, setNote] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    let active = true
    setLoaded({ state: 'loading' })
    getRoom(roomId).then((reply) => {
      if (!active) return
      setLoaded(reply.ok ? { state: 'ready', room: reply.room } : { state: 'failed', message: roomErrorMessage(reply) })
    })
    return () => {
      active = false
    }
  }, [roomId])

  if (loaded.state === 'loading') {
    return (
      <Shell>
        <p className="room-form-page__note" role="status">
          Chargement…
        </p>
      </Shell>
    )
  }

  if (loaded.state === 'failed') {
    return (
      <Shell>
        <h1>Réglages de la room</h1>
        <p role="alert">{loaded.message}</p>
        <Link to="/rooms">Retour aux rooms</Link>
      </Shell>
    )
  }

  const { room } = loaded
  // The page cannot know who hosts a room: the server said so in `mine`, and it would refuse the change anyway.
  if (!room.mine) {
    return (
      <Shell>
        <h1>Réglages de la room</h1>
        <p role="alert">Seul l'hôte de « {room.name} » peut en changer les réglages.</p>
        <Link to="/rooms">Retour aux rooms</Link>
      </Shell>
    )
  }

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    setDeleteError('')
    const result = await deleteRoom(room.id)
    setDeleting(false)
    if (!result.ok) return setDeleteError(roomErrorMessage(result))
    // The people inside have been sent out by the server; the host goes back to the list.
    navigate('/rooms')
  }

  return (
    <Shell>
      <h1>Réglages de la room</h1>
      <p className="room-form-page__intro">
        Les personnes qui sont dans la room voient les changements tout de suite.
      </p>
      {note && (
        <p className="room-form-page__saved" role="status">
          {note}
        </p>
      )}
      <RoomForm
        key={room.id}
        initial={room}
        hostPseudo={pseudo}
        hostTitle="Tu es l'hôte"
        submitLabel="Enregistrer"
        cancelLabel="Retour à la room"
        onCancel={() => navigate(`/?room=${encodeURIComponent(room.id)}`)}
        onSubmit={async (settings) => {
          setNote('')
          const result = await updateRoom(room.id, settings)
          if (!result.ok) return result
          setNote('Les réglages sont enregistrés.')
          return { ok: true }
        }}
      >
        <section className="room-form-page__danger" aria-labelledby="delete-title">
          <h2 id="delete-title">Supprimer la room</h2>
          {confirmingDelete ? (
            <div role="group" aria-label="Confirmer la suppression">
              <p>
                Supprimer « {room.name} » ? Les personnes qui y sont seront renvoyées vers la liste des rooms, et on ne peut
                pas revenir en arrière.
              </p>
              <div className="room-form-page__confirm">
                <button type="button" className="room-form-page__delete" disabled={deleting} onClick={() => void handleDelete()}>
                  {deleting ? 'Suppression…' : 'Supprimer pour de bon'}
                </button>
                <button type="button" disabled={deleting} onClick={() => setConfirmingDelete(false)}>
                  Garder la room
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="room-form-page__delete" onClick={() => setConfirmingDelete(true)}>
              Supprimer la room
            </button>
          )}
          {deleteError && (
            <p className="room-form-page__error" role="alert">
              {deleteError}
            </p>
          )}
        </section>
      </RoomForm>
    </Shell>
  )
}
