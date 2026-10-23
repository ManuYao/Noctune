# Noctune

Plateforme musicale communautaire en PWA, inspirée des salons d'écoute collective type SuperPlug Room / plug.dj. Des utilisateurs rejoignent des rooms publiques, écoutent ensemble, votent, chattent et découvrent de la musique en temps réel.

Statut : squelette technique en place (Vite + React + PWA + serveur Socket.IO vide), aucune fonctionnalité codée. **Phase actuelle : maquettes PC terminées et parcours mobile principal dessiné (version à valider).** Ne rien lancer côté code tant que l'utilisateur n'a pas validé les maquettes. Rien n'est figé : ne pas présenter comme décidé ce qui est marqué « à définir » ou « à confirmer ».

Nom : **Noctune** (choisi). Le dossier du projet s'appelle encore `MusicWeb`, c'est sans incidence. Le nom affiché, le titre de la page, le manifest PWA et les noms de package utilisent Noctune.

## Principes produit

- Spontanéité : entrer dans une room en quelques secondes, **sans compte obligatoire** (pseudo + avatar).
- Découverte musicale et interaction sociale en temps réel. Plateforme totalement communautaire.
- Reprendre les mécanismes éprouvés des plateformes existantes plutôt que de tout réinventer.
- PC d'abord (écran large), mobile ensuite avec une refonte de l'UX tactile, pas une simple réduction (le survol n'existe pas au tactile). Le socle fonctionnel reste commun.

## Maquettes PC (Design Claude, canvas « MusicWeb - Maquettes PC »)

Lien : https://claude.ai/artifact/S4LYFrtTbxXUGH22feoBx3 (privé, 1440×900 par écran).

| N° | Écran | Contenu clé |
|---|---|---|
| 1 | Entrée | Pseudo, grille de 8 avatars, room proposée, bouton « Entrer dans la room » (ce clic lance le lecteur) |
| 2 | Liste des rooms | Recherche, filtres par genre, tri, « Place DJ libre », cartes avec scène, survol détaillé |
| 2b | Créer une room | Nom, description, styles, ambiance, règles (durée max, anti-doublon, DJ max), aperçu de la carte |
| 3 | Room (visiteur) | Scène, file des DJ, participants, chat, barre morceau (J'aime, Passer, volume), « Passer DJ » verrouillé |
| 3b | Room (connecté) | Idem, avec place dans la file et « Quitter la file » |
| 3c | Passer DJ | Fenêtre : ma playlist, recherche YouTube, lien YouTube, règles de la room, « Rejoindre la file » |
| 4 | Infos de la room | Description, chiffres, équipe, règles, top du mois, rooms similaires |
| 5 / 5b | Profil visiteur / connecté | Avatar et pseudo, invitation à créer un compte ; playlists, avatar, réglages |
| 7 | Règles de la communauté | 6 règles, échelle de sanctions, signalement |
| 8 | Mentions légales | Texte en Lorem ipsum, à remplacer avant mise en ligne |

Tout le contenu des maquettes (pseudos, morceaux, chiffres, textes) est de l'exemple.

## Maquettes mobile (même canvas, 3e rangée, 390×844)

Périmètre dessiné : le parcours principal seulement. Profil, créer une room, infos de la room, règles et mentions légales ne sont pas encore adaptés (ils reprendront les mêmes principes).

| N° | Écran | Contenu clé |
|---|---|---|
| M1 | Entrée | En-tête (logo, « Se connecter »), scène réduite, pseudo, grille d'avatars 4×2, room proposée avec « Changer », bouton « Entrer dans la room » (lance le lecteur) |
| M2 | Liste des rooms | Recherche, filtres en défilement horizontal, cartes verticales avec scène et bouton « Rejoindre », barre d'onglets en bas (Rooms, Créer, Profil) |
| M3 | Room (visiteur) | Scène en haut, bandeau morceau (J'aime, Passer 3/8), onglets Chat / File / Public, champ de message, « Passer DJ · compte requis » |
| M3b | Room (connecté, onglet File) | File d'attente avec place de l'utilisateur, « Ton morceau », « Quitter la file » |
| M4 | Passer DJ | Feuille plein écran depuis le bas : règles de la room, onglets Ma playlist / YouTube / Lien, morceaux refusés avec motif, « Rejoindre la file » |

Principes mobile :
- **Room : scène et vidéo en haut, onglets en bas (Chat, File, Public).** Le lecteur vidéo reste visible en permanence (condition du lecteur tiers).
- Aucune interaction ne dépend du survol. Cibles tactiles de 44 px minimum, 48 px pour les champs et boutons principaux.
- « Passer DJ » devient une feuille qui monte du bas (et non une fenêtre centrée).
- Le bouton de lecture lancé à l'entrée reste obligatoire (autoplay mobile encore plus strict). La lecture en arrière-plan reste limitée : à traiter côté PWA.
- La scène animée est réduite (moins d'avatars) pour la performance ; prévoir un mode sans animation.

## Décisions prises pendant les maquettes

- **Modèle de DJ : à tour de rôle (façon plug.dj).** Une file de DJ par room ; chacun passe son morceau à son tour ; une « place DJ libre » est indiquée sur les cartes. Temps d'attente estimé affiché (exemple : ~12 min, calculé par room).
- **Durée max d'un morceau : propre à chaque room.** Pas de valeur globale. Fixée par l'hôte (ex. lo-fi : 7 min ; un salon rock progressif peut accepter 15 min ou plus, jusqu'à « sans limite »). À indiquer dans la description de la room et vérifier côté serveur.
- Autres règles par room : délai anti-doublon (1 h, 2 h, 4 h, jamais), nombre max de DJ dans la file (5 à 50).
- Pas de compte obligatoire : le visiteur choisit pseudo + avatar, écoute, vote (J'aime, Passer) et chatte. Il ne peut pas passer DJ ni ajouter de morceau.
- **Vote « Passer » (décidé) :** le morceau saute quand plus de 50 % des participants connectés votent « Passer ». Le DJ en cours ne compte pas, les visiteurs peuvent voter, les 30 premières secondes du morceau sont protégées. Calcul côté serveur.
- **File des DJ (décidé) :** un DJ déconnecté ou sans morceau est sauté ; après 2 sauts de suite il sort de la file. Après son morceau, un DJ repasse en fin de file (rotation).
- **Chat visiteurs (décidé) :** ouvert, avec limite de débit (1 message / 3 s), pas de liens, modération par l'hôte.
- Ajout d'un morceau (compte requis) : playlist personnelle, recherche YouTube ou lien YouTube. Morceaux refusés avec un motif visible (trop long, déjà joué récemment).
- **Création de room (décidé) : tout membre connecté peut créer une room et en devient l'hôte** (modère le chat et la file).
- **Idée à étudier, non décidée : « crews » payants.** Une offre payante pour créer des groupes statiques (crews) en plus des rooms publiques. Modèle, prix et périmètre à définir ; ne rien coder pour l'instant.
- **Sanctions (décidé), une seule échelle partout :** 1 avertissement, 2 mute chat 10 min, 3 exclusion de la room 24 h (ces trois par l'hôte), 4 bannissement de la plateforme (équipe Noctune uniquement). L'hôte peut aussi retirer un morceau de la file.
- **Visiteurs sans compte (décidé) :** mute et exclusion s'appliquent à la session, avec un blocage léger par IP ou empreinte d'appareil (point RGPD à traiter).
- **Signalement (décidé) :** bouton « Signaler » sur chaque message du chat et chaque morceau de la file (mobile : appui long ou menu « ⋯ »). Motifs : spam, harcèlement, contenu inapproprié, morceau hors-sujet, autre. Le signalement va d'abord à l'hôte, qui traite ou escalade à l'équipe. L'auteur est prévenu que c'est pris en compte, sans voir la sanction.
- **À créer en dev (plus tard, pas avant validation des maquettes) :** événement serveur `report:create` (room, cible, motif) limité en débit ; composant `ReportButton` ; menu de modération de l'hôte (mute, exclusion, retirer un morceau), à dessiner dans les maquettes.
- Entrées manquantes à ajouter : bouton « Créer une room » dans l'en-tête de la liste des rooms ; « Mentions légales » et « Règles » en pied de page.

## Permissions

| Action | Visiteur | Connecté |
|---|---|---|
| Rejoindre une room, écouter, chatter | oui | oui |
| Likes, votes | oui | oui |
| Passer DJ, ajouter un morceau | non | oui |
| Playlists, historique, rooms favorites | non | oui |
| Créer une room | non | oui |
| Profil gardé sur tous les appareils | non | oui |

Le chat ouvert aux visiteurs reste à confirmer (spam, modération) : les maquettes le montrent ouvert.

## Direction artistique (validée sur les maquettes)

- Ambiance « club de nuit » illustrée : salon avec néons, faisceaux lumineux animés, écran vidéo encadré de néon, enceintes, scène, sol en perspective. Semi-animée (avatars qui rebondent, faisceaux qui balancent, égaliseur, cœurs flottants). Une scène par room.
- **Polices : Unbounded (titres, logo) + Figtree (texte).** À intégrer au moment du dev. Alternatives testées : Syne, Dela Gothic One, Bricolage Grotesque.
- **Avatars** : personnage rond avec casque audio, 4 formes (antenne, oreilles, houppette, classique), couleur du corps et du casque personnalisables. 8 avatars de départ : Pulse, Mango, Moss, Cloud, Grape, Ember, Lemon, Mist. Contour #16142B.
- **Palette par défaut « Néon nuit »** : fond #0E0B1F, mur #17123A, mur 2 #221B52, sol #120E2E, scène #2A2260, texte #F4F1FF, texte secondaire #B4AED6, bordure #2E2756, bordure de champ #7A70B8, accent #FF3D81 (rose), accent 2 #3DE0FF (cyan, éléments DJ), texte sur accent #0E0B1F.
- Autres ambiances prévues, choisies par room : « Sunset club » (accent #FF8A3D, #FFD166), « Vinyle clair » (clair, accent #3B4CFF, #FF5C8A), « Jungle » (accent #B6FF3D, #2DD4A7).
- Accessibilité : vrais boutons et champs, `aria-pressed`, `aria-label` sur les icônes seules, cibles de 44 px, contraste ≥ 4,5:1, animations désactivables (`prefers-reduced-motion` + réglage).
- Les maquettes sont de l'illustration SVG/CSS : la scène 3D (Three.js) reste une piste à confirmer, pas une obligation.

## Interface PC

Écran de room : scène à gauche (940×704), colonne droite (file des DJ, participants, chat), barre du bas (morceau en cours, progression, J'aime, Passer avec compteur de votes, playlist, volume, « Passer DJ »). Rail de navigation à gauche (Rooms, La room, Playlist, Historique, Règles). Les autres pages utilisent un en-tête simple (logo + navigation).

## Contraintes techniques à garder en tête

- La source audio est la vidéo d'un service tiers (YouTube en premier choix probable), intégrée via son lecteur officiel. Respecter ses conditions : lecteur visible, pas de masquage ni d'extraction audio.
- La synchronisation se fait côté serveur (morceau courant + horodatage de départ). Chaque client se cale dessus.
- Temps réel via WebSocket. L'état d'une room (file, votes, présence) vit sur le serveur, jamais dans les clients.
- Les quotas des API tierces (ex. recherche YouTube) sont limités : privilégier les appels peu coûteux et mettre en cache.
- Les visiteurs anonymes imposent anti-spam, limitation de débit et modération dès le départ.
- Sur mobile, la lecture en arrière-plan avec un lecteur intégré est limitée : à traiter en phase 2.
- Autoplay : les navigateurs bloquent le son tant que l'utilisateur n'a pas interagi avec la page. À l'entrée sur le site, l'utilisateur saisit son pseudo et choisit son avatar, puis valide par un bouton. Ce clic doit lancer le lecteur de la room. Ne pas lancer de lecture avant cette interaction.
- Les règles de room (durée max, doublons, taille de file) sont vérifiées côté serveur à l'ajout et au passage du morceau.

## Modération, légal, données

À traiter pendant la conception : modération des rooms et du chat, contenus inappropriés, droits d'ajout de vidéos, protection des utilisateurs, RGPD, droits de diffusion des contenus de services tiers (CGU, mentions légales, procédure de signalement). Maquettes déjà faites : règles de la communauté, mentions légales (provisoires), bloc « Un souci ? ». Procédure de signalement détaillée à concevoir.

## Skills du projet

Installés dans `.claude/skills/` (relus avant installation) :

- `websocket-engineer` : tout code de room, présence, chat, synchronisation, Redis.
- `frontend-design` : conception de l'interface, direction artistique.
- `threejs-fundamentals`, `threejs-shaders`, `threejs-react-three-fiber`, `threejs-animation` : scène 3D de la room.
- `audio-router` (aiguille vers `audio-playback`, `audio-analysis`, `audio-reactive`) : audio et visuels réactifs. Le lecteur YouTube n'expose pas l'audio brut, donc l'analyse ne s'applique pas à ses morceaux.
- `webapp-testing` : tests dans un vrai navigateur (Playwright).
- `motion-framer`, `rive-interactive` : animations de l'interface et des avatars.
- `pwa-development` : manifest, service worker, particularités iOS.

## Stack

- Front (racine) : React 19, Vite, TypeScript, `vite-plugin-pwa` (service worker auto-généré), `socket.io-client`, `react-router` (routage), `@fontsource-variable/unbounded` + `figtree` (polices auto-hébergées, pas de Google Fonts : RGPD et hors ligne).
- Étape 2 faite (présence en temps réel) : contrat d'événements typé dans `shared/protocol.ts` (importé par le front et le serveur) ; serveur : `Room` en mémoire + `registerRoomHandlers` (validation de tout ce que envoie le client, pseudo unique par room sans tenir compte de la casse, morceaux factices tournant côté serveur) ; front : `src/realtime/` (`socket`, hook `useRoom` avec réinscription après reconnexion). Vérifié avec deux navigateurs et un redémarrage du serveur. Typage du serveur : `npx tsc -p server --noEmit`. Les compteurs « en ligne » de la liste des rooms restent factices (à brancher sur le serveur).
- Étape 1 faite : tokens CSS (`src/styles/tokens.css`, ambiances via `[data-theme]`), composant `Avatar`, écrans Entrée / Liste des rooms / Room (placeholder) avec données factices dans `src/data/`. Les compteurs de rooms viennent de la même source (incohérence de la maquette supprimée).
- Serveur temps réel (`server/`, workspace npm) : Node, Socket.IO, `tsx`.
- Données : PostgreSQL / Redis plus tard, pas encore en place.
- Style : CSS simple pour l'instant, à décider (les maquettes utilisent des variables de thème : prévoir des tokens CSS).

## Commandes

```bash
npm run dev          # front sur http://localhost:5173 (proxy Socket.IO vers :3001)
npm run dev:server   # serveur temps réel sur :3001
npm run build        # tsc + build de production (génère le service worker)
```

**Disque C: interdit** : le cache npm est redirigé vers `.npm-cache/` via `.npmrc`. Ne rien télécharger ni cloner sur C:, utiliser `.tmp/` sur D: puis le supprimer.

## Conventions

- Échanges avec l'utilisateur en français. Code, variables et commentaires en anglais.
- Composants React en fonctions avec hooks, un composant par fichier, PascalCase.
- Respecter le style du code existant avant d'introduire un nouveau pattern.
- Ne pas ajouter de dépendance sans en discuter.
- Toute règle serveur (votes, permissions, file, durée max) est vérifiée côté serveur, jamais seulement côté client.

## Checklist avant mise en ligne

Référence visuelle : maquette PC (`Maquette/MusicWeb - Maquettes PC.html` et captures `Maquette/*.png`). Mobile : seul le parcours principal est dessiné (voir « Maquettes mobile »), le reste est hors périmètre pour l'instant. Ces points sont à réaliser dans le code et à valider avant de publier le site.

Incohérences à supprimer dans l'implémentation :
- [x] Compteurs de rooms : entrée et liste calculent depuis les mêmes données (`src/data/rooms.ts`).
- [ ] Sanctions : décidé (voir « Décisions »). Reste à aligner les textes des pages Infos et Règles sur l'échelle à 4 niveaux.
- [ ] Signalement : décidé (voir « Décisions »). Reste à dessiner le bouton « Signaler » dans la room (PC et mobile) et le menu de modération de l'hôte.

Écrans manquants :
- [ ] Connexion (e-mail, mot de passe, mot de passe oublié, Google).
- [ ] Historique et Playlist (présents dans la barre latérale, sans page dédiée).
- [ ] Confidentialité (lien en pied de page, sans page).
- [ ] Bandeau cookies (RGPD, consentement avant intégration YouTube).
- [ ] Confirmation de suppression de compte.
- [ ] Outils de modération dans la room (mute, exclusion, retirer un morceau).
- [ ] Liste complète des participants (« Voir tout »).

États manquants :
- [ ] Room vide (aucun participant ou aucun morceau).
- [ ] Vidéo indisponible (supprimée, privée, bloquée selon le pays).
- [ ] Connexion perdue et reconnexion en cours.
- [ ] Chat muet : l'utilisateur voit pourquoi il ne peut pas écrire.
- [ ] File complète (limite de DJ atteinte).
- [ ] Limite de débit dans le chat (anti-spam).
- [ ] Recherche sans résultat (liste des rooms, recherche YouTube).
- [x] Pseudo déjà pris ou invalide à l'entrée (invalide : vérifié à l'entrée et par le serveur ; déjà pris : message sur l'écran de la room, avec retour à l'entrée).
- [~] Connexion perdue et reconnexion en cours : bannière simple sur l'écran de la room, à dessiner dans les maquettes.

Points à décider :
- [x] Vote pour passer : décidé (majorité des présents, voir « Décisions »). Reste à expliquer la règle dans l'interface (« 3/8 »).
- [ ] Contrastes : texte gris sur fond sombre, mentions légales très pâles, à tester.
- [ ] « Réduire les animations » : vérifier que la room le respecte.
- [ ] Mobile : vote « Passer » en simple bouton ou avec un geste (non tranché).
- [ ] Mobile : adapter les écrans secondaires (profil, créer une room, infos de la room, règles, mentions légales) et les écrans/états manquants ci-dessus.

## Points ouverts

Crews payants (idée, modèle à définir) ; procédure de signalement détaillée (traitement par l'équipe, délais) ; nom définitif ; textes légaux réels ; scène 2D illustrée ou 3D ; écrans mobile secondaires et lecture en arrière-plan sur mobile (phase 2) ; droits de diffusion ; version « Créer une room » : entrée depuis la liste des rooms.
