import type { PlaylistSummary } from '../../shared/protocol'
import PlaylistCover from './PlaylistCover'
import './PlaylistPick.css'

const titles = (count: number) => `${count} titre${count > 1 ? 's' : ''}`

/**
 * A playlist in a list (mock-up 5b, "Mes playlists"): its cover, its name and number of titles, and "Active" or
 * "Choisir". A toggle button: pressing it makes the playlist the active one.
 */
export default function PlaylistPick({ playlist, active, onSelect }: { playlist: PlaylistSummary; active: boolean; onSelect: () => void }) {
  return (
    <button type="button" className="playlist-pick" aria-pressed={active} onClick={onSelect}>
      <PlaylistCover seed={playlist.id} />
      <span className="playlist-pick__text">
        <span className="playlist-pick__name">{playlist.name}</span>
        <span className="playlist-pick__meta">{titles(playlist.trackCount)}</span>
      </span>
      {/* The button's pressed state says it already. */}
      <span className="playlist-pick__badge" aria-hidden="true">
        {active ? 'Active' : 'Choisir'}
      </span>
    </button>
  )
}
