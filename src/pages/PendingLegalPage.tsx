import { Link } from 'react-router'
import { PENDING_TEXT, PENDING_TITLE } from '../legal/pending'
import './PageKit.css'

/** What a legal page shows while its text is not written (see `legal/pending.ts`). */
export default function PendingLegalPage() {
  return (
    <main className="kit-page">
      <h1>{PENDING_TITLE}</h1>
      <p>{PENDING_TEXT}</p>
      <p>
        <Link to="/rooms">Retour aux rooms</Link>
      </p>
    </main>
  )
}
