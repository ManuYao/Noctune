# Publier la bêta de Noctune (gratuit, sans Netlify)

Noctune a besoin de deux choses qu'un hébergeur de sites statiques (Netlify, GitHub Pages) ne donne pas : un **serveur Node qui reste allumé** (le temps réel des rooms) et une **base PostgreSQL**. Ce tutoriel utilise :

- **Render** (plan gratuit) pour le serveur, qui sert aussi le site : une seule adresse, donc les cookies de connexion et le temps réel marchent.
- **Neon** (plan gratuit) pour la base PostgreSQL.

Les deux plans gratuits ont des limites (voir « Ce qu'il faut savoir »). Les écrans des sites changent : si un nom de bouton diffère, cherche le plus proche. **Si l'un des deux te demande une carte bancaire, arrête-toi** : on en parle avant.

## Ce qu'il faut avant

- Le code poussé sur GitHub (c'est le cas : `ManuYao/Noctune`).
- Ta clé YouTube (`YOUTUBE_API_KEY`, dans `.env.local`). Sans elle le site marche, mais les DJ ne peuvent pas ajouter de morceaux.
- 30 à 45 minutes.

## Étape 1 : la base sur Neon

1. Crée un compte sur neon.com (connexion GitHub possible), puis un projet : nom `noctune`, région **Europe** (Francfort si proposée).
2. Sur la page du projet, ouvre « Connect » et copie l'adresse de connexion (« connection string »). Elle commence par `postgresql://` et finit par `?sslmode=require`. **C'est un secret** : ne la mets dans aucun fichier du dépôt ni dans un message.
3. Crée les tables, depuis ton PC, dans PowerShell, à la racine du projet (remplace l'adresse par la tienne, entre guillemets) :

   ```powershell
   $env:DATABASE_URL = "postgresql://...ta-chaine-neon...?sslmode=require"
   npm run db:migrate
   Remove-Item Env:DATABASE_URL
   ```

   Tu dois voir les migrations `001` à `009` appliquées. Cela n'écrit que dans Neon : ta base locale n'est pas touchée (la variable d'environnement prend le dessus sur `.env.local` pendant cette commande seulement).

## Étape 2 : le service sur Render

1. Crée un compte sur render.com, connecte ton GitHub et autorise le dépôt `Noctune`.
2. « New » puis « Web Service », choisis le dépôt, branche `main`, puis :
   - **Region** : Frankfurt (la même zone que Neon).
   - **Runtime** : Node.
   - **Build Command** : `npm ci --include=dev && npm run build`
   - **Start Command** : `npm run start:prod`
   - **Instance type** : **Free**.
   - **Health Check Path** (dans les réglages avancés) : `/healthz`
3. Variables d'environnement (« Environment ») :

   | Nom | Valeur |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | l'adresse Neon de l'étape 1 |
   | `APP_ORIGIN` | l'adresse https de ton service, une fois connue (voir plus bas) |
   | `TRUST_PROXY` | `1` |
   | `YOUTUBE_API_KEY` | ta clé |

   Render donne le port tout seul (`PORT`). Ne mets pas `DATABASE_SSL` sauf si la connexion échoue avec une erreur de certificat.
4. Lance la création. Le premier déploiement prend quelques minutes. Render te donne une adresse du type `https://noctune-xxxx.onrender.com`.
5. **Retourne dans « Environment »**, mets cette adresse exacte (https, sans `/` final) dans `APP_ORIGIN`, enregistre : le service redémarre. Sans cette valeur, la connexion et l'inscription sont refusées.

## Étape 3 : vérifier

1. Ouvre `https://ton-adresse.onrender.com/healthz` : tu dois lire `ok`.
2. Ouvre l'adresse principale : écran d'entrée, liste des rooms.
3. Crée un compte, entre dans une room, regarde que la musique démarre, ouvre le site sur ton téléphone.
4. Clique sur « Confidentialité » : tu dois voir « En cours de rédaction » (voulu pour la bêta).
5. Teste à deux : toi et un ami dans la même room (le chat et la présence doivent se voir).

## Étape 4 : partager

Donne l'adresse à tes amis en précisant que c'est une **bêta** : le site peut être lent au premier chargement (réveil), des choses sont « en cours », et leur adresse e-mail est enregistrée avec leur compte (la page Confidentialité n'est pas encore écrite). Ne publie pas l'adresse ailleurs.

## Mettre à jour plus tard

Chaque `git push` sur `main` redéploie le site tout seul (c'est le réglage par défaut de Render). Si tu ajoutes une migration (`server/migrations/0xx_*.sql`), applique-la **avant** de pousser, avec la même commande qu'à l'étape 1.

## Ce qu'il faut savoir (limites du gratuit)

- **Réveil** : Render endort le service après 15 minutes sans trafic, et le réveil prend environ une minute ([source](https://render.com/docs/free)). Le premier ami qui arrive attend.
- **Rooms vides après un sommeil** : l'état des rooms (chat, file des DJ, votes) est en mémoire. Quand le service dort ou redémarre, tout repart de zéro. Les comptes, playlists et rooms de membres sont, eux, en base.
- **Heures** : 750 heures gratuites par mois (un service allumé en permanence en consomme environ 730).
- **Neon dort aussi** : après 5 minutes sans requête, la base se met en veille ([source](https://neon.com/pricing)) ; la première requête après réveil est plus lente et peut échouer une fois (le serveur coupe à 5 s) : recharge la page. Stockage gratuit : 0,5 Go, largement assez pour une bêta.
- **Pas de base Render** : leur PostgreSQL gratuit expire au bout de 30 jours, c'est pourquoi on prend Neon.
- **Domaine** : l'adresse `onrender.com` suffit pour la bêta. Un nom de domaine à toi se paie (quelques euros par an) : on en reparle avant, quand la micro-entreprise existe.

## Si ça ne marche pas

- **Page blanche ou erreur au déploiement** : onglet « Logs » du service sur Render ; envoie-moi les dernières lignes (sans l'adresse Neon).
- **Inscription ou connexion refusée** : `APP_ORIGIN` ne correspond pas exactement à l'adresse du site.
- **Erreur de base de données au démarrage** : vérifie `DATABASE_URL` ; si l'erreur parle de certificat, ajoute `DATABASE_SSL` = `no-verify` en dernier recours.
- **Tous les visiteurs semblent avoir la même adresse (limites trop strictes)** : `TRUST_PROXY` manque (valeur `1`).

## Alternatives plus tard

Un petit serveur loué (VPS) évite le sommeil et garde les rooms vivantes, pour quelques euros par mois : à décider avec toi quand le site sort de la bêta. Netlify ne pourra servir que le site seul, pas le temps réel.
