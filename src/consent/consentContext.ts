import { createContext, useContext } from 'react'

/**
 * Why the window is opened: the visitor is about to enter a room, the room has no player and they want it, or they came
 * to look at (and maybe change) their choice.
 */
export type ConsentIntent = 'enter' | 'enable' | 'manage'

export interface ConsentRequest {
  intent: ConsentIntent
  /** Called right after the visitor chose, from the click itself (so a room's player still starts from a user gesture). */
  then?: () => void
}

export interface ConsentDialogApi {
  ask: (request: ConsentRequest) => void
}

export const ConsentDialogContext = createContext<ConsentDialogApi | null>(null)

export function useConsentDialog(): ConsentDialogApi {
  const api = useContext(ConsentDialogContext)
  if (!api) throw new Error('useConsentDialog must be used inside a ConsentProvider')
  return api
}
