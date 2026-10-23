# Noctune

Plateforme musicale communautaire en PWA : des rooms publiques où l'on écoute le même morceau en même temps, on vote, on discute et on découvre de la musique. Pas de compte obligatoire, un pseudo et un avatar suffisent.

> Statut : en cours de conception. Les visuels ci-dessous sont des maquettes, pas encore l'application.

![Entrée](docs/banner-entree.png)

![Une room](docs/banner-room.png)

![Liste des rooms](docs/banner-rooms.png)

## Stack

- React 19, Vite, TypeScript
- PWA (`vite-plugin-pwa`)
- Serveur temps réel : Node, Socket.IO
- Comptes : PostgreSQL (pilote `pg`), mots de passe hachés avec `scrypt` (module intégré à Node), session dans un cookie

## Lancer le projet

```bash
npm install
npm run db:setup     # une seule fois : installe PostgreSQL sur D: (385 Mo) et crée les bases
npm start            # base, site et serveur temps réel ensemble, puis ouvrir http://localhost:5173
```

Ctrl+C arrête tout, base comprise (si c'est `npm start` qui l'a démarrée). Sans `npm run db:setup` le site fonctionne quand même, pour les visiteurs : seuls les comptes sont indisponibles.

Pour lancer les services séparément : `npm run dev` (site), `npm run dev:server` (serveur sur :3001), `npm run db:start` / `db:stop` / `db:status` (base), `npm run db:migrate` (met le schéma à jour).

### La base de données

En développement, PostgreSQL tourne **hors du dépôt**, dans `../noctune-postgres` (sur le même disque que le projet, jamais sur C:), uniquement joignable depuis cet ordinateur (`127.0.0.1:5433`) et avec un mot de passe. Les accès sont écrits dans `.env.local` (jamais envoyé sur git).

Pour utiliser une base hébergée à la place, il suffit de définir `DATABASE_URL` (variable d'environnement ou `.env.local`) : le code ne dépend de rien d'autre. Les tables sont créées par les fichiers de `server/migrations/`.

## Tests

```bash
npm test -w server   # serveur : règles, comptes, salles, vraie base si elle est démarrée
```

Les tests qui ont besoin de PostgreSQL utilisent la base `noctune_test` (jamais la vraie) et sont ignorés, avec un message, si elle n'est pas démarrée.
