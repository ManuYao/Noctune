import type { ModAction, ReportReason } from '../../shared/protocol'
import type { SendModResult, SendReportResult } from '../realtime/useRoom'

export const REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam',
  harassment: 'Harcèlement',
  inappropriate: 'Contenu inapproprié',
  'off-topic': 'Morceau hors-sujet',
  other: 'Autre',
}

/** "Morceau hors-sujet" only makes sense for a track, "Harcèlement" only for what somebody wrote. */
export const CHAT_REASONS: ReportReason[] = ['spam', 'harassment', 'inappropriate', 'other']
export const TRACK_REASONS: ReportReason[] = ['inappropriate', 'off-topic', 'spam', 'other']

/** The ladder, lightest first: the host may take any step, the screen suggests the next one. */
export const LADDER: ModAction[] = ['warn', 'mute', 'exclude']

export const ACTION_LABELS: Record<ModAction, string> = {
  warn: 'Avertir',
  mute: 'Mute 10 min',
  exclude: 'Exclure 24 h',
}

/** What was done, in a few words, for the list of past steps ("avertissement, mute 10 min"). */
export const ACTION_DONE_WORDS: Record<ModAction, string> = {
  warn: 'avertissement',
  mute: 'mute 10 min',
  exclude: 'exclusion 24 h',
}

/** The small note once the host did something. Nouns, not participles: nobody is assumed to be a "he" or a "she". */
export function actionDoneText(action: ModAction | 'remove', pseudo: string, options: { playing?: boolean } = {}): string {
  switch (action) {
    case 'warn':
      return `Avertissement envoyé à ${pseudo}.`
    case 'mute':
      return `${pseudo} : mute de 10 min.`
    case 'exclude':
      return `${pseudo} : exclusion de 24 h.`
    case 'remove':
      return options.playing ? `Morceau de ${pseudo} coupé.` : `Morceau de ${pseudo} retiré de la file.`
  }
}

/** What an action does, said before it is confirmed. */
export function actionDescription(
  action: ModAction | 'remove',
  pseudo: string,
  options: { visitor?: boolean; title?: string; playing?: boolean } = {},
): string {
  switch (action) {
    case 'warn':
      return `${pseudo} recevra un avertissement, visible par cette personne seulement.`
    case 'mute':
      return `${pseudo} ne pourra plus écrire dans le chat pendant 10 minutes. Cette personne pourra toujours écouter, voter et passer sa musique.`
    case 'exclude':
      return options.visitor
        ? `${pseudo} devra quitter la room et ne pourra pas y revenir pendant 24 heures. Un visiteur est reconnu à son adresse : cela peut toucher quelqu'un qui partage sa connexion.`
        : `${pseudo} devra quitter la room et ne pourra pas y revenir pendant 24 heures, depuis aucun appareil.`
    case 'remove':
      return options.playing
        ? `Le morceau « ${options.title ?? ''} » s'arrête tout de suite et le DJ suivant prend la main, avec un message pour en informer ${pseudo}.`
        : `Le morceau « ${options.title ?? ''} » sera retiré de la file de ${pseudo}, avec un message pour l'en informer.`
  }
}

const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000))

export function reportErrorMessage(result: Exclude<SendReportResult, { ok: true }>): string {
  switch (result.error) {
    case 'rate-limited':
      return `Doucement ! Tu pourras signaler à nouveau dans ${seconds(result.retryAfterMs)} s.`
    case 'not-in-room':
      return "Tu n'es plus dans la room."
    case 'invalid':
      return "Ce signalement n'est pas valide."
    case 'no-such-target':
      return "Ce message ou ce morceau n'existe plus : il est trop tard pour le signaler."
    case 'own-target':
      return 'Tu ne peux pas signaler ton propre message ou ton propre morceau.'
    case 'already-reported':
      return "Tu l'as déjà signalé : ton signalement est bien arrivé."
    case 'server-error':
      return 'Le serveur a eu un souci. Réessaie dans un instant.'
    case 'network':
      return 'Pas de connexion : vérifie ta connexion et réessaie.'
  }
}

export function modErrorMessage(result: Exclude<SendModResult, { ok: true }>): string {
  switch (result.error) {
    case 'rate-limited':
      return `Doucement ! Réessaie dans ${seconds(result.retryAfterMs)} s.`
    case 'not-in-room':
      return "Tu n'es plus dans la room."
    case 'not-host':
      return "Seul l'hôte de la room peut faire ça."
    case 'invalid':
      return "Cette action n'est pas valide."
    case 'no-such-person':
      return 'Cette personne a déjà quitté la room.'
    case 'no-such-report':
      return "Ce signalement n'existe plus (déjà traité ?)."
    case 'no-such-track':
      return "Ce morceau n'est plus dans la file."
    case 'self':
      return 'Tu ne peux pas te sanctionner toi-même.'
    case 'server-error':
      return 'Le serveur a eu un souci. Réessaie dans un instant.'
    case 'network':
      return 'Pas de connexion : vérifie ta connexion et réessaie.'
  }
}

/** How long ago a report came, roughly: it is something to read at a glance. */
export function ageText(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  return `il y a ${Math.floor(minutes / 60)} h`
}
