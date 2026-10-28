# Publier la bêta de Noctune (gratuit)

**À la fin** : une adresse `https://noctune-xxxx.onrender.com` que tes amis ouvrent dans leur navigateur.

Noctune a besoin de deux choses qu'un hébergeur de sites statiques (Netlify, GitHub Pages) ne donne pas : un **serveur Node toujours allumé** (le temps réel des rooms) et une **base PostgreSQL**. On prend deux services gratuits :

| Service | Rôle | Ce que tu y fais |
|---|---|---|
| **Neon** | la base PostgreSQL (comptes, playlists, rooms de membres) | créer un projet, copier une adresse secrète |
| **Render** | le serveur, qui sert aussi le site (une seule adresse, donc cookies et temps réel marchent) | créer un service, coller des variables |

**Si l'un des deux te demande une carte bancaire, arrête-toi** et dis-le-moi. Leurs écrans changent : si un nom de bouton diffère, prends le plus proche.

## Avant de commencer

- [ ] Le code est sur GitHub (`ManuYao/Noctune`, déjà fait). Pense à `git push` si tu as des commits en local.
- [ ] Ta clé YouTube : ouvre `.env.local` à la racine du projet, la ligne `YOUTUBE_API_KEY=...`. Sans elle le site marche mais les DJ ne peuvent pas ajouter de morceaux.
- [ ] 30 à 45 minutes.

Garde un bloc-notes ouvert : tu vas copier deux valeurs dedans (**A** = adresse Neon, **B** = adresse Render).

---

## Étape 1 : la base sur Neon

1. Va sur **neon.com**, crée un compte (« Continue with GitHub » est le plus simple).
2. Crée un projet : nom `noctune`, région **Europe (Frankfurt)**. Laisse le reste par défaut.
3. Sur la page du projet, clique sur **Connect**. Une fenêtre affiche une adresse.
   - **Désactive « Connection pooling »** (interrupteur dans la fenêtre). On veut l'adresse *directe* : dans l'adresse, le nom de l'hôte ne doit **pas** contenir `-pooler`. Avec l'adresse « pooler », les migrations échouent.
   - Copie l'adresse complète. Elle ressemble à :
     `postgresql://utilisateur:motdepasse@ep-quelquechose.eu-central-1.aws.neon.tech/neondb?sslmode=require`
   - Colle-la dans ton bloc-notes, étiquette **A**.
   - **A est un secret** : jamais dans un fichier du dépôt, jamais dans un message ni une capture.
4. Crée les tables. Dans PowerShell, à la racine du projet (`D:\DEV\React\MusicWeb`), tape ces trois lignes, en remplaçant le contenu des guillemets par **A** :

   ```powershell
   $env:DATABASE_URL = "COLLE-A-ICI"
   npm run db:migrate
   Remove-Item Env:DATABASE_URL
   ```

   **Ce que tu dois voir** : la liste des migrations appliquées (`001` à `011` à ce jour), sans message d'erreur. Cela n'écrit que dans Neon : ta base locale n'est pas touchée (la variable posée dans PowerShell passe avant `.env.local`, le temps de la commande ; la 3e ligne l'efface).

---

## Étape 2 : le serveur sur Render

### 2a. Créer le service

1. Va sur **render.com**, crée un compte avec GitHub et autorise le dépôt `Noctune` (« Only select repositories » suffit).
2. **New +** puis **Web Service**, choisis le dépôt `Noctune`.
3. Remplis le formulaire, champ par champ (ce qui n'est pas listé reste par défaut, **Root Directory vide**) :

   | Champ | Valeur |
   |---|---|
   | Name | `noctune` (ou autre : il fait partie de l'adresse) |
   | Language | `Node` |
   | Branch | `main` |
   | Region | `Frankfurt (EU Central)` |
   | Build Command | `npm ci --include=dev && npm run build` |
   | Start Command | `npm run start:prod` |
   | Instance Type | **Free** |

4. Descends jusqu'à **Environment Variables** et ajoute ces 6 lignes (« Add Environment Variable » pour chacune) :

   | Nom | Valeur |
   |---|---|
   | `NODE_VERSION` | `24` |
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | **A** (l'adresse Neon) |
   | `TRUST_PROXY` | `1` |
   | `YOUTUBE_API_KEY` | ta clé YouTube |
   | `APP_ORIGIN` | `https://temporaire.invalid` (on la corrige juste après, voir 2b) |

5. Dans **Advanced**, mets **Health Check Path** à `/healthz`.
6. Clique **Create Web Service**. Le premier déploiement prend 3 à 6 minutes : suis l'onglet **Logs**. Il est fini quand tu lis une ligne `Serveur temps réel sur :...` puis « Your service is live ».

### 2b. Corriger `APP_ORIGIN` (étape obligatoire)

Tant que `APP_ORIGIN` n'est pas la vraie adresse, la connexion et l'inscription sont refusées.

1. En haut de la page du service, Render affiche l'adresse (`https://noctune-xxxx.onrender.com`). Copie-la dans ton bloc-notes, étiquette **B**.
2. Menu **Environment**, modifie `APP_ORIGIN` : colle **B** exactement, en `https://`, **sans `/` à la fin**. Enregistre (« Save, rebuild, and deploy » ou « Save and deploy »).
3. Attends que le service redevienne « Live » (1 à 2 minutes).

---

## Étape 3 : vérifier

1. Ouvre `B/healthz` (par exemple `https://noctune-xxxx.onrender.com/healthz`) : la page affiche `ok`.
2. Ouvre **B** : écran d'entrée et liste des rooms.
3. Crée un compte, entre dans une room, vérifie que la musique démarre. Ouvre aussi **B** sur ton téléphone.
4. Clique sur « Confidentialité » en bas de page : une petite fenêtre « En cours de rédaction » (voulu pour la bêta).
5. Avec un ami (ou deux onglets, dont un en navigation privée) : entrez dans la même room, le chat et la liste des présents doivent se voir.

Si une de ces vérifications échoue, va à « Si ça ne marche pas » en bas.

## Étape 4 : partager

Donne **B** à tes amis en précisant que c'est une **bêta** :
- le premier chargement peut prendre une minute (le service se réveille) ;
- des choses sont « en cours » ;
- leur adresse e-mail est enregistrée avec leur compte, et la page Confidentialité n'est pas encore écrite.

Ne publie pas l'adresse ailleurs.

---

## Mettre à jour plus tard

Chaque `git push` sur `main` redéploie tout seul. Si tu ajoutes une migration (`server/migrations/0xx_*.sql`), applique-la **avant** de pousser, avec les trois lignes PowerShell de l'étape 1.4 (elles n'appliquent que celles qui manquent : tu peux les relancer sans risque).

**Plus simple : le faire faire au serveur.** Ajoute une variable d'environnement sur Render : `MIGRATE_ON_START` = `1`. À chaque démarrage, le serveur applique lui-même les migrations qui manquent et l'écrit dans les logs (`[base] migrations appliquées au démarrage : …`). Si l'adresse de la base passe par le « pooler » de Neon, cela échoue (voir l'étape 1.3) : le serveur le dit dans les logs et continue.

**Comment savoir si la base est en retard.** Au démarrage, le serveur écrit dans les logs une ligne `[base] MIGRATIONS EN ATTENTE : …` si des migrations manquent. Sans elles, certaines fonctions échouent sans bruit : par exemple les notifications de trophées (migration `011`) et le filtre « musique seulement » (`010`).

## Ce qu'il faut savoir (limites du gratuit)

- **Sommeil de Render** : après 15 minutes sans visite, le service s'endort ; le réveil prend environ une minute ([source](https://render.com/docs/free)). Le premier ami qui arrive attend.
- **Les rooms repartent de zéro après un sommeil ou un redémarrage** : chat, file des DJ et votes sont en mémoire. Les comptes, playlists et rooms de membres sont en base, donc conservés.
- **Heures** : 750 heures gratuites par mois, soit un service allumé en continu (environ 730 h).
- **Neon dort aussi** : après 5 minutes sans requête ([source](https://neon.com/pricing)). La première requête est plus lente et peut échouer une fois (le serveur abandonne à 5 s) : recharge la page. Stockage gratuit : 0,5 Go, très large pour une bêta.
- **Pas de base Render** : leur PostgreSQL gratuit expire au bout de 30 jours, d'où Neon.
- **Domaine** : l'adresse `onrender.com` suffit. Un nom de domaine à toi coûte quelques euros par an : on en reparle quand la micro-entreprise existe.

## Si ça ne marche pas

| Symptôme | Cause probable | Quoi faire |
|---|---|---|
| Le déploiement échoue | erreur de build | onglet **Logs** sur Render, copie-moi les 30 dernières lignes (sans **A**) |
| Boucle de redémarrage, log `[base] base inaccessible` | **A** fausse, ou migrations pas faites | revérifie `DATABASE_URL` sur Render, puis refais l'étape 1.4 |
| Même erreur avec le mot « certificat » | problème SSL | ajoute la variable `DATABASE_SSL` = `no-verify`, en dernier recours |
| `migrate` échoue avec une erreur de verrou | adresse « pooler » | reprends l'étape 1.3 : adresse directe, sans `-pooler` |
| Inscription ou connexion refusée | `APP_ORIGIN` ≠ adresse du site | refais l'étape 2b (https, pas de `/` final) |
| Les limites semblent trop strictes pour tout le monde | `TRUST_PROXY` manque | ajoute `TRUST_PROXY` = `1` |
| Page très lente la première fois | service ou base endormis | normal, attends une minute et recharge |

## Alternatives plus tard

Un petit serveur loué (VPS) évite le sommeil et garde les rooms vivantes, pour quelques euros par mois : à décider avec toi quand le site sort de la bêta. Netlify ne pourrait servir que le site seul, pas le temps réel.
