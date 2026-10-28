import { reloadForUpdate, useUpdateReady } from './updateWatcher'
import './UpdateBanner.css'

/** A newer version of Noctune is ready and this page is a room: say so, and let the member choose when to reload. */
export default function UpdateBanner() {
  const ready = useUpdateReady()
  return (
    <div className="update-banner" role="status" aria-live="polite">
      {ready && (
        <>
          <span>Une nouvelle version de Noctune est prête.</span>
          <button type="button" onClick={reloadForUpdate}>
            Recharger
          </button>
        </>
      )}
    </div>
  )
}
