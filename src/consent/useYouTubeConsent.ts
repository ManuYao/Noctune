import { useSyncExternalStore } from 'react'
import { getConsent, subscribeConsent, type ConsentChoice } from './consentStore'

/** The visitor's answer about the YouTube player (null: not answered yet), kept up to date across tabs. */
export function useYouTubeConsent(): { choice: ConsentChoice | null } {
  const choice = useSyncExternalStore(subscribeConsent, () => getConsent(), () => null)
  return { choice }
}
