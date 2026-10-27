import PendingLink from '../components/PendingLink'
import { useEffect, useRef } from 'react'
import type { ConsentIntent, ConsentRequest } from './consentContext'
import { getConsentDate, type ConsentChoice } from './consentStore'
import { useYouTubeConsent } from './useYouTubeConsent'
import './ConsentDialog.css'

interface ConsentDialogProps {
  request: ConsentRequest | null
  onChoose: (choice: ConsentChoice) => void
  /** Escape: no choice was made. */
  onDismiss: () => void
}

// Both buttons weigh the same (same size, same look): refusing must be as easy as accepting.
const BUTTONS: Record<ConsentIntent, { accept: string; refuse: string }> = {
  enter: { accept: 'Accepter et entrer', refuse: 'Refuser et entrer sans le lecteur' },
  enable: { accept: 'Activer le lecteur YouTube', refuse: 'Garder le lecteur désactivé' },
  manage: { accept: 'Accepter', refuse: 'Refuser' },
}

function currentChoiceText(choice: ConsentChoice | null): string {
  if (choice === null) return "Tu n'as pas encore fait de choix."
  const date = getConsentDate()
  const when = date ? ` le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''
  return choice === 'accepted' ? `Ton choix actuel : lecteur activé (accepté${when}).` : `Ton choix actuel : lecteur désactivé (refusé${when}).`
}

/**
 * The consent window: a native modal dialog (focus kept inside, the page behind inert). Escape closes it without a choice;
 * a click beside it does not, so that nobody answers by accident.
 */
export default function ConsentDialog({ request, onChoose, onDismiss }: ConsentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const { choice } = useYouTubeConsent()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (request && !dialog.open) {
      dialog.showModal()
      // On the title, not on the first link: the window is read from its start.
      titleRef.current?.focus()
    } else if (!request && dialog.open) {
      dialog.close()
    }
  }, [request])

  const labels = BUTTONS[request?.intent ?? 'manage']

  return (
    <dialog ref={dialogRef} className="consent-dialog" aria-labelledby="consent-title" aria-describedby="consent-text" onClose={onDismiss}>
      {request && (
        <div className="consent-dialog__sheet">
          <h2 id="consent-title" ref={titleRef} tabIndex={-1}>
            Le lecteur YouTube
          </h2>
          <div id="consent-text" className="consent-dialog__text">
            <p>
              Pour écouter la musique, Noctune affiche le lecteur de YouTube, un service de Google. Dès qu'il se charge, Google et
              YouTube reçoivent des informations techniques, comme ton adresse IP. Noctune utilise le mode « confidentialité
              renforcée » (youtube-nocookie.com).
            </p>
            <p>Si tu refuses, tu peux entrer dans les rooms, discuter, voter et passer DJ, mais tu n'entends pas la musique.</p>
            <p>
              Ton choix est gardé 12 mois dans ton navigateur. Tu peux le changer à tout moment avec le lien « Gérer le lecteur
              YouTube » en bas de chaque page.
            </p>
            <p>
              {/* On its own line: a link as tall as a touch target inside a sentence would stretch the line it sits on. */}
              <PendingLink page="confidentialite" newTab>Politique de confidentialité<span className="visually-hidden"> (nouvel onglet)</span></PendingLink>
            </p>
            {request.intent === 'manage' && (
              <p className="consent-dialog__current" role="status">
                {currentChoiceText(choice)}
              </p>
            )}
          </div>
          <div className="consent-dialog__buttons">
            <button type="button" className="consent-dialog__choice" onClick={() => onChoose('accepted')}>
              {labels.accept}
            </button>
            <button type="button" className="consent-dialog__choice" onClick={() => onChoose('refused')}>
              {labels.refuse}
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
