import {
  ROOMS_PER_MEMBER_MAX,
  ROOM_DESCRIPTION_MAX,
  ROOM_NAME_MAX,
  ROOM_NAME_MIN,
  ROOM_STYLES_MAX,
} from '../../shared/protocol'
import type { RoomCallFailure } from './roomApi'

/** The part of the form a refusal is about, so that the message sits next to it. Null: it concerns the whole form. */
export type RoomField = 'name' | 'description' | 'styles' | 'theme' | 'rules'

export function roomErrorField(failure: RoomCallFailure): RoomField | null {
  switch (failure.error) {
    case 'invalid-name':
    case 'name-taken':
      return 'name'
    case 'invalid-description':
      return 'description'
    case 'invalid-styles':
      return 'styles'
    case 'invalid-theme':
      return 'theme'
    case 'invalid-rules':
      return 'rules'
    default:
      return null
  }
}

/** Every refusal says why, with its numbers: whoever is refused must know what to change. */
export function roomErrorMessage(failure: RoomCallFailure): string {
  if (failure.error === 'rate-limited') return `Doucement ! Réessaie dans ${Math.max(1, Math.ceil(failure.retryAfterSec))} s.`
  switch (failure.error) {
    case 'not-signed-in':
      return 'Connecte-toi pour gérer tes rooms.'
    case 'forbidden':
      return 'Cette demande a été refusée. Recharge la page et réessaie.'
    case 'bad-request':
      return "Cette demande n'est pas valide."
    case 'no-database':
      return "Les rooms de membres ne marchent pas pour l'instant : le serveur tourne sans base de données."
    case 'room-not-found':
      return "Cette room n'existe pas ou n'existe plus."
    case 'not-host':
      return "Seul l'hôte de la room peut la modifier."
    case 'invalid-name':
      return `Le nom d'une room fait de ${ROOM_NAME_MIN} à ${ROOM_NAME_MAX} caractères, sans caractère invisible, et ne peut pas se faire passer pour l'équipe.`
    case 'name-taken':
      return 'Une room porte déjà ce nom. Choisis-en un autre.'
    case 'invalid-description':
      return `La description fait ${ROOM_DESCRIPTION_MAX} caractères au plus, sur une seule ligne, sans lien ni caractère invisible.`
    case 'invalid-styles':
      return `Choisis de 1 à ${ROOM_STYLES_MAX} styles de musique.`
    case 'invalid-theme':
      return 'Choisis une ambiance parmi celles proposées.'
    case 'invalid-rules':
      return 'Ces règles ne sont pas permises : choisis parmi les valeurs proposées.'
    case 'too-many-rooms':
      return `Tu animes déjà ${ROOMS_PER_MEMBER_MAX} rooms : supprime-en une pour en créer une autre.`
    case 'rooms-full':
      return "Le site a atteint, pour l'instant, son nombre maximum de rooms de membres. Réessaie plus tard."
    case 'server-error':
      return 'Le serveur a eu un souci. Réessaie dans un instant.'
    case 'network':
      return 'Pas de connexion : vérifie ta connexion et réessaie.'
  }
}
