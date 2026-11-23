# Développer Hubarr

Guide des contributeurs : environnement, conventions, tests et publication. L'organisation du code est décrite dans [Architecture technique](./architecture.md).

## Environnement : tout dans Docker

Seuls **Docker Engine**, **Docker Compose v2**, `git` et `make` sont nécessaires. Node, pnpm, Playwright et les navigateurs vivent dans des conteneurs ; ne lancez pas `node` ou `pnpm` sur la machine hôte.

```sh
git clone https://github.com/KilianMahe/hubarr.git
cd Hubarr
make hooks   # une fois : make check-fast au commit, make check au push
make dev     # API :7070, front :5173, faux services :7171, doc :5174
```

Ouvrez `http://localhost:5173`. Le front (Vite) et l'API (`tsx watch`) se rechargent à chaud ; la base de développement vit dans `data-dev/`. Les **faux services** (`e2e/mocks`) imitent Radarr, Sonarr, Prowlarr, Bazarr, Seerr, les clients de téléchargement, Tautulli, Tracearr, Emby et TMDB : renseignez par exemple `http://mocks:7171/radarr` avec la clé `e2e-radarr-key`. `make stack` ajoute une vraie stack (Radarr, Sonarr, Prowlarr, qBittorrent, SABnzbd) pour tester contre les applications réelles.

## Commandes

| Commande                                     | Effet                                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `make dev`, `make stack`, `make down`        | Environnement de développement (avec ou sans vraie stack)                         |
| `make install`                               | Installe les dépendances (après un changement de `package.json`)                  |
| `make sh`                                    | Shell dans le conteneur `server`                                                  |
| `make lint`, `make typecheck`, `make test`   | ESLint + Prettier, types, tests Vitest                                            |
| `make check-fast`                            | Lint + types (hook pre-commit)                                                    |
| `make check`                                 | Lint + types + tests + licences (hook pre-push)                                   |
| `make e2e`                                   | Build de l'image puis Playwright en desktop et mobile (`GREP=motif` pour filtrer) |
| `make screenshots`                           | Régénère les captures de la documentation et du README                            |
| `make build`, `make prod`                    | Image `hubarr:local` et lancement comme en production                             |
| `make db-generate NAME=…`, `make db-migrate` | Migration Drizzle depuis `schema.ts`, application                                 |
| `make openapi SERVICE=radarr`                | Régénère les types d'un service depuis sa spécification OpenAPI                   |
| `make docs`                                  | Build de la documentation                                                         |
| `make publish VERSION=x.y.z`                 | Pousse `naroner/hubarr:x.y.z` et `latest` sur Docker Hub                          |
| `make release VERSION=x.y.z`                 | Publication locale (voir plus bas)                                                |
| `make help`                                  | Toutes les cibles                                                                 |

## Conventions

- **TypeScript strict**, pas de `any` ni de `@ts-ignore` sans justification.
- **Contrats dans `packages/shared`** : tout endpoint déclare ses schémas zod dans `packages/shared/src/schemas` ; le front infère ses types de ces mêmes schémas.
- **Aucun texte en dur** dans le front : clés i18n, en français et en anglais (`packages/shared/src/i18n`). La règle ESLint `no-raw-text` le vérifie.
- **Erreurs d'API** au format `{ code, message?, service?, details? }` ; messages traduits côté client.
- **Sécurité** : `requireRole('admin')` sur les modules d'administration, jeton CSRF sur toutes les mutations, aucune URL de service exposée au navigateur (images proxifiées).
- **Licence** : en-tête `// SPDX-License-Identifier: AGPL-3.0-or-later` dans chaque fichier source (règle ESLint, corrigible par `make lint-fix`). Dépendances acceptées : MIT, Apache-2.0, ISC, BSD (vérifié par `tools/check-licenses.js`).
- **Factoriser** : un seul module pour l'administration Radarr/Sonarr, une seule vue pour les clients torrent.
- Documentation et commentaires de haut niveau en **français**, code et identifiants en **anglais**.
- **Commits** au format Conventional Commits, en français, avec une portée : `feat(radarr): …`, `fix(auth): …`.

## Ajouter une intégration

1. **Client** dans `apps/server/src/integrations/<service>`, sur `integrations/http` (délais, disjoncteur, authentification, `UpstreamError`). Types générés depuis OpenAPI quand le service en publie une, schémas zod sinon.
2. **Configuration** : déclarer le service dans `packages/shared/src/constants/services.ts` (champs, test de connexion).
3. **Schémas** des endpoints dans `packages/shared/src/schemas/<service>.ts`.
4. **Module** Fastify dans `apps/server/src/modules/<service>` : routes, garde de service, rôle, invalidation du cache après mutation.
5. **Écran** dans `apps/web/src/features/<service>`, routes dans `app/router`, entrée du tiroir, clés i18n FR et EN.
6. **Faux service** dans `e2e/mocks/src/<service>` et test Playwright.
7. **Fiche** dans `docs/` (et `docs/fr/`).

## Tests

- **Vitest** : `apps/server/test` (routes via `fastify.inject`, clients contre `MockAgent`, cache, base en mémoire) et `apps/web/test` (composants avec `@vue/test-utils`). Lancer un sous-ensemble : `docker compose -f compose.dev.yml run --rm server sh -c 'cd apps/server && pnpm exec vitest run test/modules/web'`.
- **Playwright** : l'image de production réelle (`e2e-app`, base neuve en mémoire), la même image sous un préfixe de chemin (`e2e-app-prefix`) et les faux services (`e2e-mocks`). Deux projets, desktop (1440 px) et mobile (Pixel 7), plus des contrôles d'accessibilité.
- Il n'y a pas de CI : les hooks git (`make hooks`) sont le garde-fou. Ne les contournez pas.

## Publier une version

```sh
make release VERSION=1.2.0
```

La cible vérifie que l'arbre est propre, lance `make check` et `make e2e`, reporte la section « Non publié » du `CHANGELOG.md` sous la nouvelle version, crée le commit et le tag `v1.2.0`, puis construit l'image et l'étiquette `hubarr:local`, `naroner/hubarr:1.2.0` et `naroner/hubarr:latest`. Publiez ensuite avec `make publish VERSION=1.2.0` (Docker Hub) et `make publish-github VERSION=1.2.0` (dépôt public GitHub, un commit par version).
Enfin, `GITHUB_TOKEN=… make github-release VERSION=1.2.0` crée la page de release GitHub à partir du changelog (`DRY_RUN=1` pour un aperçu), et `DOCKERHUB_TOKEN=… make dockerhub-description` (jeton de portée « Read, Write, Delete ») met à jour la description Docker Hub depuis `docker/DOCKERHUB.md`.
