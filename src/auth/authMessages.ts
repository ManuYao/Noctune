import { PASSWORD_MIN, PSEUDO_MAX, PSEUDO_MIN, type AuthError } from '../../shared/protocol'
import type { AuthCallResult } from './authApi'

type Refused = Extract<AuthCallResult, { ok: false }>

function waitText(seconds: number): string {
  if (seconds < 90) return `${seconds} s`
  return `${Math.ceil(seconds / 60)} minutes`
}

const MESSAGES: Record<Exclude<AuthError, 'rate-limited'> | 'network', string> = {
  'invalid-email': 'Cette adresse e-mail ne semble pas valide.',
  'weak-password': `Choisis un mot de passe d'au moins ${PASSWORD_MIN} caractères (une phrase fait très bien l'affaire).`,
  'invalid-pseudo': `Choisis un pseudo de ${PSEUDO_MIN} à ${PSEUDO_MAX} caractères, sans caractère invisible.`,
  'invalid-avatar': 'Choisis un avatar.',
  'email-taken': 'Un compte existe déjà avec cette adresse. Connecte-toi plutôt.',
  'pseudo-taken': 'Ce pseudo est déjà pris. Choisis-en un autre.',
  'bad-credentials': 'E-mail ou mot de passe incorrect.',
  'bad-request': 'Quelque chose a échoué. Recharge la page et réessaie.',
  forbidden: 'Cette demande a été refusée. Recharge la page et réessaie.',
  unavailable: "Les comptes ne sont pas disponibles pour l'instant. Tu peux quand même écouter sans compte.",
  busy: 'Le serveur est très sollicité. Réessaie dans un instant.',
  'server-error': 'Le serveur a eu un souci. Réessaie dans un instant.',
  network: 'Impossible de joindre le serveur. Vérifie ta connexion et réessaie.',
}

/** The sentence to show for a refusal from the accounts API. */
export function authMessage(refusal: Refused): string {
  if (refusal.error === 'rate-limited') return `Trop de tentatives. Réessaie dans ${waitText(refusal.retryAfterSec)}.`
  return MESSAGES[refusal.error]
}

/** Which field a refusal is about, so that the page can mark it and put the cursor there. */
export function authField(error: Refused['error']): 'email' | 'password' | 'pseudo' | 'avatar' | null {
  switch (error) {
    case 'invalid-email':
    case 'email-taken':
      return 'email'
    case 'weak-password':
      return 'password'
    case 'invalid-pseudo':
    case 'pseudo-taken':
      return 'pseudo'
    case 'invalid-avatar':
      return 'avatar'
    default:
      return null
  }
}
