import type { ReactNode } from 'react'
import { Link } from 'react-router'
import ToComplete from './ToComplete'
import type { LegalDocument } from './types'

/** What a card of "the data we use" says: what, what for, how long. */
function DataCard({ name, why, keptFor }: { name: string; why: string; keptFor: ReactNode }) {
  return (
    <li className="legal__card">
      <h3>{name}</h3>
      <dl>
        <div>
          <dt>Pourquoi</dt>
          <dd>{why}</dd>
        </div>
        <div>
          <dt>Combien de temps</dt>
          <dd>{keptFor}</dd>
        </div>
      </dl>
    </li>
  )
}

const external = { target: '_blank', rel: 'noopener noreferrer' } as const

// Every fact below is one the code does today. What depends on who runs the site or where it is hosted is a <ToComplete />.
export const privacy: LegalDocument = {
  title: 'Politique de confidentialité',
  draft: true,
  updated: '25 octobre 2026',
  intro: (
    <>
      <p>
        Noctune sert à écouter de la musique ensemble. Cette page explique, simplement, quelles informations le site
        utilise, pourquoi, combien de temps, et comment tu peux les voir, les corriger ou les supprimer.
      </p>
      <p>
        <strong>Entrer dans une room ne demande aucun compte.</strong> Un compte est facultatif : il sert à garder ton
        pseudo, tes playlists et à passer DJ.
      </p>
    </>
  ),
  sections: [
    {
      id: 'responsable',
      title: 'Qui est responsable de tes données ?',
      body: (
        <>
          <p>
            Noctune est édité par <ToComplete what="nom ou dénomination de l'éditeur" />, <ToComplete what="adresse postale" />.
            C'est lui qui décide de ce qui est fait de tes données (on dit le « responsable de traitement »).
          </p>
          <p>
            Pour toute question sur tes données : <ToComplete what="adresse e-mail de contact pour les données personnelles" />.
          </p>
        </>
      ),
    },
    {
      id: 'donnees',
      title: 'Les informations que le site utilise',
      body: (
        <ul className="legal__cards">
          <DataCard
            name="Ton compte (facultatif)"
            why="Te connecter et te faire reconnaître dans les rooms : ton pseudo n'est qu'à toi. Ce sont ton e-mail, ton pseudo, ton avatar et la date de création du compte. Ton pseudo et ton avatar sont visibles des autres personnes présentes dans la même room, et ton pseudo apparaît comme « hôte » sur les rooms que tu crées."
            keptFor={
              <>
                Jusqu'à ce que tu supprimes ton compte, depuis ton profil. Durée d'inactivité après laquelle un compte est
                supprimé : <ToComplete what="durée d'inactivité, ou « pas de suppression automatique »" />.
              </>
            }
          />
          <DataCard
            name="Ton mot de passe"
            why="Te connecter."
            keptFor="Il n'est jamais gardé tel quel : seule une empreinte salée (scrypt) est enregistrée, impossible à relire en clair."
          />
          <DataCard
            name="Pseudo et avatar d'un visiteur"
            why="Entrer dans une room sans compte."
            keptFor="Dans la mémoire du serveur tant que tu es dans la room. Ils ne sont jamais enregistrés."
          />
          <DataCard
            name="Cookie de session « noctune_session »"
            why="Te garder connecté. Il est strictement nécessaire au fonctionnement du compte, et inaccessible aux scripts de la page (HttpOnly)."
            keptFor="30 jours au plus. Le serveur n'en garde qu'une empreinte (SHA-256). Te déconnecter ou supprimer ton compte y met fin ; changer de mot de passe met fin aux sessions de tes autres appareils. Noctune n'utilise aucun cookie de publicité ni de suivi."
          />
          <DataCard
            name="Stockage de ton navigateur"
            why="Retenir le volume du son, le pseudo et l'avatar saisis sur l'écran d'entrée (pour l'onglet), la dernière playlist choisie, et ta réponse sur le lecteur YouTube."
            keptFor="Dans ton navigateur seulement (ta réponse sur le lecteur YouTube : 12 mois, puis redemandée). Le pseudo et l'avatar ne sont envoyés au serveur que lorsque tu entres dans une room."
          />
          <DataCard
            name="Messages du chat"
            why="Discuter dans la room."
            keptFor="Dans la mémoire du serveur seulement (les 50 derniers sont montrés à qui arrive), effacés quand la room se vide. Ils ne sont jamais écrits dans la base de données."
          />
          <DataCard
            name="Adresse IP"
            why="Limiter les tentatives de connexion et d'inscription, et les abus."
            keptFor={
              <>
                Dans la mémoire du serveur ; le site ne l'écrit pas dans sa base de données. Journaux de l'hébergeur ou du
                serveur web : <ToComplete what="ce que l'hébergeur enregistre et pour combien de temps" />.
              </>
            }
          />
          <DataCard
            name="Tes playlists"
            why="Garder tes morceaux d'une séance à l'autre : l'identifiant de la vidéo YouTube, et le titre, la chaîne et la durée donnés par YouTube."
            keptFor="Avec ton compte, et supprimées avec lui. Les informations venant de YouTube sont relues après 7 jours et ne sont jamais gardées plus de 30 jours sans relecture."
          />
          <DataCard
            name="Les rooms que tu crées"
            why="Faire exister ta room : son nom, sa description, ses styles, son ambiance et ses règles."
            keptFor="Avec ton compte, et supprimées avec lui. Les rooms de l'équipe Noctune ne sont pas des données personnelles."
          />
          <DataCard
            name="Tes statistiques d'activité (membres)"
            why="Afficher ton profil et tes badges : le nombre de morceaux passés, de J'aime reçus et donnés, ton temps d'écoute, les rooms et les styles visités, les jours où tu es venu et le nombre de messages envoyés (comptés, jamais leur texte). Rien de tout cela ne change les votes ni la file."
            keptFor="Avec ton compte, supprimées avec lui, et incluses dans le fichier de « Télécharger mes données ». Un visiteur sans compte n'a aucune statistique."
          />
        </ul>
      ),
    },
    {
      id: 'base-legale',
      title: 'Pourquoi le site a le droit de les utiliser',
      body: (
        <>
          <p>
            Pour ton compte, tes playlists, tes rooms et tes statistiques : parce que tu as demandé ce service (c'est l'exécution du contrat
            entre toi et le site).
          </p>
          <p>
            Pour limiter les abus avec l'adresse IP : <ToComplete what="base légale à confirmer par l'éditeur (intérêt légitime ?)" />.
          </p>
        </>
      ),
    },
    {
      id: 'youtube',
      title: 'YouTube',
      body: (
        <>
          <p>
            Les vidéos sont lues par le lecteur officiel de YouTube, en mode « confidentialité renforcée »
            (youtube-nocookie.com). Quand ce lecteur se charge, Google et YouTube reçoivent des informations techniques,
            comme ton adresse IP : c'est leur propre politique de confidentialité qui s'applique (
            <a href="https://policies.google.com/privacy" {...external}>
              politique de confidentialité de Google<span className="visually-hidden"> (nouvel onglet)</span>
            </a>
            ).
          </p>
          <p>
            Le site lit aussi les informations des vidéos (titre, durée) par l'API de YouTube : aucune donnée sur toi n'y
            est envoyée.
          </p>
          <p>
            <strong>Avant de charger le lecteur, Noctune te demande ton accord.</strong> Tant que tu n'as pas accepté, aucune
            requête n'est envoyée à YouTube ni à Google. Si tu refuses, tu peux entrer dans les rooms, discuter, voter et passer
            DJ, mais tu n'entends pas la musique.
          </p>
          <p>
            Ton choix est gardé 12 mois dans ton navigateur (stockage local), puis redemandé. Tu peux le changer à tout moment avec
            le lien « Gérer le lecteur YouTube » en bas de chaque page.
          </p>
        </>
      ),
    },
    {
      id: 'droits',
      title: 'Tes droits, et comment les exercer',
      body: (
        <ul>
          <li>
            <strong>Voir et récupérer tes données (accès, portabilité) :</strong> le bouton « Télécharger mes données » de ton{' '}
            <Link to="/profil">profil</Link> te donne un fichier avec ton compte, tes playlists, tes rooms et tes statistiques.
          </li>
          <li>
            <strong>Corriger (rectification) :</strong> ton pseudo et ton avatar se changent dans ton{' '}
            <Link to="/profil">profil</Link>. Pour ton e-mail, écris-nous : <ToComplete what="adresse e-mail de contact" />.
          </li>
          <li>
            <strong>Supprimer (effacement) :</strong> le bouton « Supprimer mon compte » de ton <Link to="/profil">profil</Link>{' '}
            supprime ton compte, tes playlists, tes rooms et tes statistiques, et met fin à toutes tes sessions.
          </li>
          <li>
            <strong>T'opposer ou limiter un usage :</strong> écris-nous : <ToComplete what="adresse e-mail de contact" />.
          </li>
          <li>
            <strong>Te plaindre :</strong> tu peux saisir la CNIL (
            <a href="https://www.cnil.fr/fr/plaintes" {...external}>
              cnil.fr/fr/plaintes<span className="visually-hidden"> (nouvel onglet)</span>
            </a>
            ).
          </li>
        </ul>
      ),
    },
    {
      id: 'destinataires',
      title: 'Qui reçoit tes données',
      body: (
        <>
          <p>
            L'hébergeur du site : <ToComplete what="nom de l'hébergeur" />. Google et YouTube, pour le lecteur vidéo (voir
            plus haut).
          </p>
          <p>Tes données ne sont pas vendues, et le site ne contient aucune publicité.</p>
        </>
      ),
    },
    {
      id: 'transferts',
      title: 'Hors de l\'Union européenne',
      body: (
        <p>
          Google et YouTube peuvent traiter des données hors de l'Union européenne, selon leur propre cadre de protection (voir leur
          politique). Pour l'hébergeur : <ToComplete what="pays de l'hébergement et garanties en cas de transfert hors UE" />.
        </p>
      ),
    },
    {
      id: 'securite',
      title: 'Sécurité',
      body: (
        <p>
          Les mots de passe sont gardés sous forme d'empreinte (scrypt), jamais en clair. Le site est servi en HTTPS :{' '}
          <ToComplete what="à confirmer à la mise en ligne" />. L'accès aux données est limité à l'éditeur.
        </p>
      ),
    },
    {
      id: 'mineurs',
      title: 'Mineurs',
      body: (
        <p>
          Âge minimum pour créer un compte : <ToComplete what="âge minimum" />. En France, avant 15 ans, ce type de service
          demande l'accord d'un parent.
        </p>
      ),
    },
    {
      id: 'modifications',
      title: 'Changements de cette page',
      body: (
        <p>
          La date de dernière mise à jour est en haut de la page. Les changements importants sont annoncés :{' '}
          <ToComplete what="comment les changements sont annoncés aux membres" />.
        </p>
      ),
    },
  ],
}
