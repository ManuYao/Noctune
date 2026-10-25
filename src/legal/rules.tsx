import { Link } from 'react-router'
import ToComplete from './ToComplete'
import type { LegalDocument } from './types'

const RULES = [
  {
    title: 'Respect avant tout',
    text: "Pas d'insultes, de harcèlement ni de discrimination. On peut ne pas aimer un morceau sans en vouloir à celui qui le passe.",
  },
  {
    title: 'Pas de spam',
    text: 'Pas de messages répétés, de publicité ni de liens non sollicités. Un message suffit, et le chat reste lisible pour tout le monde.',
  },
  {
    title: 'Respecte la room',
    text: 'Chaque salon a son style et ses propres règles, comme la durée maximale des morceaux. Elles sont affichées dans la fenêtre « Passer DJ » avant que tu lances ton morceau.',
  },
  {
    title: 'Contenus interdits',
    text: "Pas de haine, de violence gratuite ni de contenus sexuels explicites, que ce soit dans un morceau, une vidéo ou le chat.",
  },
  {
    title: 'Pseudo et avatar',
    text: "Pas d'usurpation d'identité ni de pseudo injurieux. Ton pseudo reste visible de tous dans les rooms.",
  },
  {
    title: 'Vie privée',
    text: "Ne partage pas d'informations personnelles (adresse, téléphone…), ni les tiennes ni celles des autres.",
  },
]

const SANCTIONS = [
  { title: 'Avertissement', text: 'Un rappel des règles, visible par toi seul.' },
  { title: 'Mute 10 min', text: 'Tu ne peux plus écrire dans le chat pendant 10 minutes.' },
  { title: 'Exclusion', text: 'Tu quittes la room pendant 24 heures.' },
  { title: 'Bannissement', text: "Tu ne peux plus utiliser Noctune, en cas d'abus répété ou grave." },
]

// The tools described here (warning, mute, exclusion, the "Signaler" button) are the intended final text: they are built
// in the moderation step, which must be done before the site goes live.
export const rules: LegalDocument = {
  title: 'Règles de la communauté',
  updated: '25 octobre 2026',
  wide: true,
  intro: <p>Six règles simples pour que chaque room reste un bon endroit où écouter ensemble.</p>,
  sections: [
    {
      id: 'six-regles',
      title: 'Les six règles',
      body: (
        <ul className="legal__cards">
          {RULES.map((rule) => (
            <li key={rule.title} className="legal__card">
              <h3>{rule.title}</h3>
              <p>{rule.text}</p>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: 'sanctions',
      title: "Si les règles ne sont pas respectées",
      body: (
        <>
          <p>
            Les sanctions vont de la plus légère à la plus lourde, avec la même échelle partout. Les trois premières sont
            décidées par l'hôte de la room ; le bannissement de la plateforme l'est par l'équipe Noctune seulement.
            L'hôte peut aussi retirer un morceau de la file.
          </p>
          <ol className="legal__ladder">
            {SANCTIONS.map((sanction) => (
              <li key={sanction.title} className="legal__step">
                <strong>{sanction.title}</strong>
                <span>{sanction.text}</span>
              </li>
            ))}
          </ol>
        </>
      ),
    },
    {
      id: 'hote',
      title: "Le rôle de l'hôte",
      body: (
        <p>
          Celui qui crée une room en devient l'hôte. Il modère le chat et la file des DJ, et choisit les règles de sa room : la
          durée maximale d'un morceau, le temps avant qu'un même morceau puisse revenir, et le nombre de DJ dans la file.
          Ces règles s'affichent dans la fenêtre « Passer DJ » de la room.
        </p>
      ),
    },
    {
      id: 'musique',
      title: 'La musique que tu passes',
      body: (
        <p>
          Ne passe que de la musique que tu as le droit de partager. Les morceaux sont lus par le lecteur officiel de YouTube,
          à partir de vidéos que tu choisis : Noctune ne les héberge pas.
        </p>
      ),
    },
    {
      id: 'signaler',
      title: 'Un souci ? Signale-le',
      body: (
        <>
          <p>
            Un message ou un morceau pose problème ? Signale-le avec le bouton « Signaler » du message du chat ou du morceau
            de la file. Les motifs : spam, harcèlement, contenu inapproprié, morceau hors-sujet, autre.
          </p>
          <p>
            Le signalement va d'abord à l'hôte de la room, qui le traite ou le transmet à l'équipe. Tu es prévenu que ton
            signalement est pris en compte, sans voir la sanction décidée.
          </p>
          <p className="legal__note">
            Pour joindre l'équipe Noctune : <ToComplete what="adresse e-mail ou formulaire de contact de l'équipe" />. Voir
            aussi la <Link to="/confidentialite">politique de confidentialité</Link> et les{' '}
            <Link to="/mentions-legales">mentions légales</Link>.
          </p>
        </>
      ),
    },
  ],
}
