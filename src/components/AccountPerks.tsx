import './AccountPerks.css'

// What a visitor can do, and what an account adds (mock-up 5). Only what the site does today: no history, no favourite
// rooms (the mock-up promises both, they do not exist yet).
const VISITOR = ['Écouter dans toutes les rooms', "Voter : J'aime et Passer", 'Discuter dans le chat', 'Choisir ton pseudo et ton avatar']
const MEMBER = ['Passer DJ et ajouter tes morceaux', 'Créer tes playlists', 'Créer ta propre room', 'Réserver ton pseudo', 'Garder ton profil partout']

/** The two lists of mock-up 5, side by side: "Déjà possible en visiteur" and "Avec un compte". */
export default function AccountPerks() {
  return (
    <div className="account-perks">
      <div className="account-perks__column">
        <h3 className="account-perks__title" id="perks-visitor">
          Déjà possible en visiteur
        </h3>
        <ul aria-labelledby="perks-visitor">
          {VISITOR.map((text) => (
            <li key={text}>
              <span className="account-perks__mark" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 12 12" focusable="false">
                  <path d="M2.5 6.2 L5 8.7 L9.5 3.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
      <div className="account-perks__column account-perks__column--member">
        <h3 className="account-perks__title" id="perks-member">
          Avec un compte
        </h3>
        <ul aria-labelledby="perks-member">
          {MEMBER.map((text) => (
            <li key={text}>
              <span className="account-perks__mark" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 12 12" focusable="false">
                  <path d="M6 2 V10 M2 6 H10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
