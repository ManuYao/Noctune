import { Link } from 'react-router'
import ToComplete from './ToComplete'
import type { LegalDocument } from './types'

// The French law on trust in the digital economy (LCEN) asks for these headings. Everything that names a person, a company
// or a host is a <ToComplete />: it is the operator's to fill in.
export const notice: LegalDocument = {
  title: 'Mentions légales',
  draft: true,
  updated: '25 octobre 2026',
  intro: <p>Les informations que la loi demande sur le site Noctune et sur la personne qui le publie.</p>,
  sections: [
    {
      id: 'editeur',
      title: 'Éditeur du site',
      body: (
        <ul>
          <li>
            Nom ou dénomination : <ToComplete what="nom ou dénomination" />
          </li>
          <li>
            Adresse : <ToComplete what="adresse postale" />
          </li>
          <li>
            Adresse e-mail : <ToComplete what="adresse e-mail de contact" />
          </li>
          <li>
            Directeur de la publication : <ToComplete what="nom du directeur de la publication" />
          </li>
        </ul>
      ),
    },
    {
      id: 'hebergeur',
      title: 'Hébergeur',
      body: (
        <ul>
          <li>
            Nom : <ToComplete what="nom de l'hébergeur" />
          </li>
          <li>
            Adresse : <ToComplete what="adresse de l'hébergeur" />
          </li>
          <li>
            Téléphone : <ToComplete what="téléphone de l'hébergeur" />
          </li>
        </ul>
      ),
    },
    {
      id: 'propriete',
      title: 'Propriété intellectuelle',
      body: (
        <>
          <p>
            Le nom Noctune, le logo et les illustrations du site appartiennent à l'éditeur. Les vidéos appartiennent à leurs
            propriétaires : Noctune ne les héberge pas, elles sont affichées par le lecteur officiel de YouTube.
          </p>
          <p>Les membres gardent leurs droits sur ce qu'ils écrivent.</p>
        </>
      ),
    },
    {
      id: 'responsabilite',
      title: 'Responsabilité et signalement',
      body: (
        <>
          <p>
            Les messages, les noms et descriptions de rooms et les morceaux sont ajoutés par les membres : l'éditeur ne les
            contrôle pas avant qu'ils apparaissent. Il retire les contenus manifestement illicites dès qu'il en a
            connaissance.
          </p>
          <p>
            Pour signaler un contenu illicite : <ToComplete what="adresse e-mail ou formulaire pour signaler un contenu" />. Les
            règles de vie commune sont dans les <Link to="/regles">règles de la communauté</Link>.
          </p>
        </>
      ),
    },
    {
      id: 'donnees',
      title: 'Données personnelles',
      body: (
        <p>
          La façon dont le site utilise tes informations est expliquée dans la{' '}
          <Link to="/confidentialite">politique de confidentialité</Link>.
        </p>
      ),
    },
    {
      id: 'droit',
      title: 'Droit applicable',
      body: <p>Le site est soumis au droit français.</p>,
    },
    {
      id: 'contact',
      title: 'Contact',
      body: (
        <p>
          Pour toute question : <ToComplete what="adresse e-mail de contact" />.
        </p>
      ),
    },
  ],
}
