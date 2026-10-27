import {
  PLAYLISTS_MAX,
  PLAYLIST_NAME_MAX,
  PLAYLIST_TRACKS_MAX,
  type PlaylistFailure,
  type TrackStatus,
} from '../../shared/protocol'
import { formatClock, formatSpan } from '../data/duration'

/** What a playlist call can come back with when it did not work: the server's refusal, or no answer at all. */
export type PlaylistCallFailure = PlaylistFailure | { ok: false; error: 'network' }

/** Every refusal says why, with its numbers: whoever is refused must know what to change. */
export function playlistErrorMessage(failure: PlaylistCallFailure): string {
  if (failure.error === 'rate-limited') return `Doucement ! Réessaie dans ${Math.max(1, Math.ceil(failure.retryAfterSec))} s.`
  switch (failure.error) {
    case 'not-signed-in':
      return 'Connecte-toi pour utiliser tes playlists.'
    case 'forbidden':
      return 'Cette demande a été refusée. Recharge la page et réessaie.'
    case 'bad-request':
      return "Cette demande n'est pas valide."
    case 'no-database':
      return "Les playlists ne marchent pas pour l'instant : le serveur tourne sans base de données."
    case 'playlist-not-found':
      return "Cette playlist n'existe plus."
    case 'track-not-found':
      return "Ce morceau n'est plus dans la playlist."
    case 'invalid-name':
      return `Le nom d'une playlist fait de 1 à ${PLAYLIST_NAME_MAX} caractères, sans caractère invisible.`
    case 'name-taken':
      return 'Tu as déjà une playlist avec ce nom.'
    case 'playlists-full':
      return `Tu as déjà ${PLAYLISTS_MAX} playlists : supprime-en une pour en créer une autre.`
    case 'playlist-full':
      return `Cette playlist contient déjà ${PLAYLIST_TRACKS_MAX} morceaux : retire-en un pour en ajouter.`
    case 'already-in-playlist':
      return 'Ce morceau est déjà dans cette playlist.'
    case 'invalid-link':
      return "Ce lien n'est pas une vidéo YouTube. Colle l'adresse d'une vidéo (youtube.com/watch… ou youtu.be/…)."
    case 'not-found':
      return 'Cette vidéo est introuvable ou privée.'
    case 'not-embeddable':
      return 'Le propriétaire de cette vidéo ne permet pas de la lire en dehors de YouTube.'
    case 'not-music':
      return "Ce n'est pas un contenu musical : Noctune ne passe que de la musique."
    case 'unavailable':
      return "Cette vidéo ne peut pas être lue ici (direct, restriction d'âge ou vidéo bloquée)."
    case 'service-unavailable':
      return "YouTube ne répond pas pour l'instant. Réessaie dans un moment."
    case 'server-error':
      return 'Le serveur a eu un souci. Réessaie dans un instant.'
    case 'network':
      return 'Pas de connexion : vérifie ta connexion et réessaie.'
  }
}

/** What the room says about a playlist track, in words. Null when the room would take it. */
export function verdictText(status: TrackStatus): string | null {
  switch (status.state) {
    case 'ok':
      return null
    case 'too-long':
      return `Trop long · max ${formatClock(status.maxSec)}`
    case 'recently-played':
      return status.retryAfterSec === null
        ? 'Déjà joué ici · cette room ne rejoue jamais un morceau'
        : `Joué récemment · revient dans ${formatSpan(status.retryAfterSec)}`
    case 'queued':
      return 'Déjà dans la file'
    case 'unavailable':
      return 'Indisponible'
    case 'not-music':
      return 'Pas de la musique'
  }
}
