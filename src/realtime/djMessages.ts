import { LINEUP_MAX, type AddTrackResult, type DjNotice, type DjResult } from '../../shared/protocol'
import { formatSpan, formatWait } from '../data/duration'
import type { MyPlace } from './djQueue'

/** What a DJ call can come back with when it did not work: the server's refusal, or no answer at all. */
export type DjFailure = Exclude<AddTrackResult | DjResult, { ok: true }> | { ok: false; error: 'network' }

/** Every refusal says why, with its numbers: a DJ whose track is refused must know what to change. */
export function djErrorMessage(failure: DjFailure): string {
  switch (failure.error) {
    case 'too-long':
      return `Ce morceau est trop long pour cette room : ${formatSpan(failure.maxSec)} au maximum.`
    case 'recently-played':
      return failure.retryAfterSec === null
        ? 'Ce morceau a déjà été joué dans cette room, et elle ne rejoue jamais un morceau.'
        : `Ce morceau a été joué récemment dans cette room. Il pourra revenir dans ${formatSpan(failure.retryAfterSec)}.`
    case 'rate-limited':
      return `Doucement ! Réessaie dans ${Math.max(1, Math.ceil(failure.retryAfterMs / 1000))} s.`
    case 'invalid-link':
      return "Ce lien n'est pas une vidéo YouTube. Colle l'adresse d'une vidéo (youtube.com/watch… ou youtu.be/…)."
    case 'not-found':
      return 'Cette vidéo est introuvable ou privée.'
    case 'not-embeddable':
      return "Le propriétaire de cette vidéo ne permet pas de la lire en dehors de YouTube."
    case 'unavailable':
      return "Cette vidéo ne peut pas être lue ici (direct, restriction d'âge ou vidéo bloquée)."
    case 'already-queued':
      return 'Ce morceau est déjà dans la file de cette room.'
    case 'queue-full':
      return 'La file est complète : réessaie quand un DJ sera parti.'
    case 'lineup-full':
      return `Tu as déjà ${LINEUP_MAX} morceaux en attente : retire-en un pour en ajouter.`
    case 'no-such-track':
      return "Ce morceau n'est plus dans ta file."
    case 'not-in-queue':
      return "Tu n'es pas dans la file."
    case 'members-only':
      return 'Il faut un compte pour passer DJ.'
    case 'not-in-room':
      return "Tu n'es plus dans la room. Retourne à l'entrée pour la rejoindre."
    case 'service-unavailable':
      return "L'ajout de morceaux ne marche pas pour l'instant. Réessaie dans un moment."
    case 'server-error':
      return 'Le serveur a eu un souci. Réessaie dans un instant.'
    case 'network':
      return 'Pas de connexion : vérifie ta connexion et réessaie.'
    case 'invalid':
      return "Ce lien n'est pas valide."
  }
}

/** Where the viewer stands, in a sentence. `djs` counts the DJ on the decks; `waitSec` is `estimateWaitSec`. */
export function turnMessage(place: MyPlace | null, djs: number, waitSec: number): string {
  if (place?.onDecks) return 'Tu es à la console.'
  if (place) {
    const rank = place.position === 0 ? 'Tu es le prochain' : `Tu es n°${(place.position ?? 0) + 1} dans la file`
    return `${rank} : ton tour dans ${formatWait(waitSec)}.`
  }
  return djs === 0
    ? 'La file est vide : ton morceau démarre tout de suite.'
    : `Si tu rejoins : ton tour dans ${formatWait(waitSec)}.`
}

/** What the "Passer mon morceau" button of the DJ on the decks leads to: always something, even the room's own music. */
export function ownSkipHint(othersCanPlay: boolean, hasNextTrack: boolean): string {
  if (othersCanPlay) return 'Le DJ suivant prend la main.'
  return hasNextTrack ? 'Ton prochain morceau démarre.' : 'La sélection de la room prend le relais.'
}

/** What a DJ is told, by the server, about their own turn. */
export function djNoticeMessage(notice: DjNotice): string {
  switch (notice.kind) {
    case 'track-dropped':
      return notice.reason === 'too-long'
        ? `Ton morceau « ${notice.title} » a été retiré de ta file : il est trop long pour cette room.`
        : `Ton morceau « ${notice.title} » a été retiré de ta file : il a été joué récemment dans cette room.`
    case 'skipped':
      return "Ton tour est passé : tu n'avais aucun morceau à jouer. Ajoutes-en un pour garder ta place."
    case 'removed':
      return "Tu n'es plus dans la file : tes deux derniers tours sont passés sans morceau à jouer."
  }
}
