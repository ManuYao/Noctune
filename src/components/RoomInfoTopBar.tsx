import { useMemo, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { useAccount } from '../auth/useAccount'
import { findAvatar } from '../data/avatars'
import { entryDraftSnapshot, parseEntryDraft, subscribeEntryDraft } from '../data/entryDraft'
import Avatar from './Avatar'
import './RoomInfoTopBar.css'

/**
 * The top of the room's details on a computer (mock-up 4): the breadcrumb on the left, who the viewer is and the way to sign
 * in (or the profile) on the right. The logo is in the rail.
 */
export default function RoomInfoTopBar({ roomId, name }: { roomId: string; name: string }) {
  const { account, status } = useAccount()
  const draftText = useSyncExternalStore(subscribeEntryDraft, entryDraftSnapshot, () => '')
  const draft = useMemo(() => parseEntryDraft(draftText), [draftText])
  const avatar = findAvatar(account ? account.avatarId : draft.avatarId)
  const pseudo = account ? account.pseudo : draft.pseudo.trim() || 'Mon profil'

  return (
    <div className="info-top">
      <Crumbs roomId={roomId} name={name} />
      {status === 'ready' && (
        <div className="info-top__end">
          <Link to="/profil" className="info-top__me" aria-label={`Mon profil (${pseudo})`}>
            {avatar && <Avatar avatar={avatar} size={34} framing="icon" decorative />}
            <span className="info-top__who">
              <span className="info-top__pseudo">{pseudo}</span>
              <span className="info-top__status">{account ? 'Connecté' : 'Visiteur'}</span>
            </span>
          </Link>
          {!account && (
            <Link to="/connexion" className="info-top__login">
              Se connecter
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

/** Rooms / the room / Infos: the room leads to its entry, where the first click starts the player. */
export function Crumbs({ roomId, name }: { roomId: string; name: string }) {
  return (
    <nav className="info-crumbs" aria-label="Fil d'Ariane">
      <ol>
        <li>
          <Link to="/rooms">Rooms</Link>
        </li>
        <li className="info-crumbs__room">
          <Link to={`/?room=${encodeURIComponent(roomId)}`}>{name}</Link>
        </li>
        <li aria-current="page">Infos</li>
      </ol>
    </nav>
  )
}
