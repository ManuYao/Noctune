import { useState } from 'react'
import ModDialog from '../moderation/ModDialog'
import { useInstallPrompt } from './installPrompt'

/** The phone icon of the room header: opens the "install Noctune" invitation. Absent once the app is installed. */
export default function InstallButton({ className }: { className: string }) {
  const [open, setOpen] = useState(false)
  const { installed, ios, canPrompt, install } = useInstallPrompt()
  if (installed) return null

  return (
    <>
      <button type="button" className={className} aria-label="Installer Noctune" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="3" width="10" height="18" rx="2.5" />
          <path d="M12 8 V13 M9.8 11 L12 13.2 L14.2 11" />
        </svg>
      </button>
      <ModDialog open={open} onClose={() => setOpen(false)} titleId="install-title" title="Installe Noctune sur ton téléphone">
        <ul className="mod-hint">
          <li>Une icône sur ton écran d'accueil : tu rouvres ta room en un tap.</li>
          <li>Plein écran, sans barre d'adresse ni onglets : plus simple, plus immersif.</li>
          <li>Gratuit, instantané, sans magasin d'applications.</li>
        </ul>
        {canPrompt ? (
          <div className="mod-actions__row">
            <button
              type="button"
              className="mod-btn"
              data-autofocus=""
              onClick={async () => {
                await install()
                setOpen(false)
              }}
            >
              Installer maintenant
            </button>
            <button type="button" className="mod-btn" onClick={() => setOpen(false)}>
              Plus tard
            </button>
          </div>
        ) : (
          <>
            <p className="mod-hint">
              {ios
                ? 'Sur iPhone : touche le bouton Partager de Safari (le carré avec une flèche), puis « Sur l\'écran d\'accueil ».'
                : 'Ouvre le menu de ton navigateur (les trois points), puis « Installer l\'application » ou « Ajouter à l\'écran d\'accueil ».'}
            </p>
            <div className="mod-actions__row">
              <button type="button" className="mod-btn" data-autofocus="" onClick={() => setOpen(false)}>
                Compris
              </button>
            </div>
          </>
        )}
      </ModDialog>
    </>
  )
}
