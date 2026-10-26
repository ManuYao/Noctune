import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import ConsentDialog from './ConsentDialog'
import { ConsentDialogContext, type ConsentRequest } from './consentContext'
import { setConsent, type ConsentChoice } from './consentStore'

/** Holds the one consent window of the site, so that the entry screen, a room and the footer can all open it. */
export default function ConsentProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConsentRequest | null>(null)
  const api = useMemo(() => ({ ask: (next: ConsentRequest) => setRequest(next) }), [])

  function handleChoose(choice: ConsentChoice) {
    const current = request
    setConsent(choice)
    setRequest(null)
    current?.then?.()
  }

  return (
    <ConsentDialogContext.Provider value={api}>
      {children}
      <ConsentDialog request={request} onChoose={handleChoose} onDismiss={() => setRequest(null)} />
    </ConsentDialogContext.Provider>
  )
}
