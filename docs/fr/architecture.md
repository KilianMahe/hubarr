# Architecture technique

Cette page décrit **comment Hubarr est construit** : composants, flux, données, sécurité et exploitation. Elle s'adresse aux personnes qui hébergent Hubarr et veulent comprendre ce qui tourne, et à celles qui veulent y contribuer (voir aussi [Développer Hubarr](./developpement.md)).

## Vue d'ensemble

```
            Navigateur (SPA Vue 3, PWA)
                       │  HTTPS (via votre reverse proxy)
                       ▼
   ┌───────────────── Conteneur hubarr ─────────────────┐
   │  Node.js 24 · Fastify 5                            │
   │  ├─ /            front buildé (Vite) + index.html   │
   │  ├─ /docs        documentation (VitePress)          │
   │  ├─ /api/*       API JSON, flux SSE /api/events     │
   │  ├─ cache SWR, file de rafraîchissement, pollers    │
   │  └─ SQLite (better-sqlite3) ── /data/hubarr.db      │
   └──────────┬─────────────────────────────────────────┘
              │ HTTP(S) côté serveur uniquement
              ▼
   Radarr · Sonarr · Prowlarr · Bazarr · Seerr · qBittorrent · Transmission
   Deluge · SABnzbd · NZBGet · Gluetun · Tautulli · Tracearr · Emby · TMDB
```

Un **seul processus Node** sert le front, la documentation et l'API. Il n'y a ni base externe, ni Redis, ni worker séparé : le cache, la file de rafraîchissement et le temps réel vivent dans le processus. Le navigateur ne contacte jamais un service directement ; seules les images de TMDB sont chargées depuis `image.tmdb.org`, les autres images (Plex, Emby, Tracearr) passent par un proxy de Hubarr.

## Pile logicielle

| Couche          | Choix                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serveur         | Node.js 24, **Fastify 5**, **zod 4** (validation et sérialisation), **Drizzle ORM** + **better-sqlite3**, **argon2id** (mots de passe), undici (HTTP sortant) |
| Front           | **Vue 3.5** + Vite, **Vuetify 4** (Material), Vue Router, Pinia, **TanStack Query**, vue-i18n avec messages ICU (`intl-messageformat`)                        |
| Documentation   | VitePress, bilingue, embarquée dans l'image                                                                                                                   |
| Langage         | TypeScript strict partout (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)                                                                |
| Conditionnement | Image Docker unique (`node:24-alpine`, `tini`, serveur sous `PUID:PGID`, jamais root)                                                                         |

## Organisation du dépôt

Monorepo **pnpm** :

```
apps/server         API Fastify, CLI, service du front et de la doc
  src/app.ts          assemblage : plugins, modules, routes
  src/plugins/        sessions, CSRF, garde d'installation, contrôle d'accès, en-têtes
  src/modules/<x>/    un module par domaine (movies, series, torrents, seerr…)
  src/integrations/   un client par service, sur un socle HTTP commun
  src/cache/          cache SWR, file de rafraîchissement, refreshers
  src/live/           lectures partagées et pollers du temps réel
  src/db/             schéma Drizzle, migrations SQL, ouverture et sauvegarde
  src/cli/            commande `hubarr` (réinitialisation du mot de passe…)
apps/web            SPA Vue
  src/app/            démarrage, routeur, client API, stores, thème, i18n
  src/components/     composants partagés et design system
  src/features/<x>/   un dossier par écran ou domaine
packages/shared     source unique des contrats : schémas zod, types, i18n, thèmes
docs                documentation VitePress (EN à la racine, FR sous /fr/)
e2e                 faux services (mocks) et tests Playwright
docker              Dockerfile multi-étapes et scripts de build
tools               conversion des traductions, types OpenAPI, licences, règles ESLint
```

**`packages/shared` est la source unique des contrats** : chaque endpoint déclare ses schémas zod (paramètres, corps, réponse) dans `packages/shared/src/schemas`. Le serveur s'en sert pour valider les entrées et sérialiser les sorties (une clé hors schéma ne sort jamais), le front pour typer ses appels et valider les réponses. Un changement de contrat casse donc la compilation des deux côtés.

## Serveur

### Cycle d'une requête

1. **`rewriteUrl`** retire le préfixe de chemin éventuel (`HUBARR_BASE_PATH`).
2. **Sessions** : le cookie `hubarr_session` est résolu en session et en utilisateur.
3. **CSRF** : toute mutation exige l'en-tête `x-csrf-token` de la session ; les requêtes `Sec-Fetch-Site` cross-site ou d'une `Origin` étrangère sont refusées.
4. **Garde d'installation** : tant que l'assistant n'est pas terminé, l'API répond `409 SETUP_REQUIRED`.
5. **Contrôle d'accès** : chaque route déclare sa politique, sans quoi le serveur refuse de démarrer : `config.access` vaut `public` (sans session), `user` (tout compte connecté : routes personnelles, et pages qui agrègent plusieurs services et filtrent selon `request.access`), `admin` (posée sur tout un module par `guardAdminModule()`) ou `service` (posée par `guardServiceModule()` ; une route qui ne déclare aucun service reste réservée aux administrateurs), ou bien la route déclare `config.service`. Les droits sont vérifiés en `onRequest`, avant la validation et avant l'état de la configuration du service : un compte sans droit reçoit 403 sans rien apprendre du format attendu, de la configuration du service ni de l'existence d'un slug. `test/plugins/route-policies.test.ts` appelle toutes les routes : 401 sans session, 403 pour un compte sans droit, et la liste des routes `user` est figée.
6. **Garde de service** : une route d'un service non configuré ou désactivé répond par une erreur explicite. Elle vérifie ensuite le droit du compte sur le service (et sur l'instance Radarr/Sonarr) : lecture pour `GET`, écriture sinon, sauf `config.permission` déclaré par la route (`read` pour une recherche envoyée en `POST`, `admin` pour les réglages d'un service). Les pages qui agrègent plusieurs services (tableau de bord, calendrier, recherche, découverte, sujets temps réel, bootstrap) ne lisent que ce que le compte peut lire (`request.access`).
7. **Route** : validation zod, appel au service, réponse sérialisée par son schéma.

Les erreurs ont toujours la forme `{ code, message?, service?, details? }` ; le front traduit le `code`.

### Modules et conventions d'API

Chaque domaine est un plugin Fastify dans `src/modules/<domaine>`. Le chemin d'API est `/api` suivi du chemin de la page correspondante (par exemple `/api/medias/films/films/7` pour la fiche affichée sur `/medias/films/films/7`). Les adresses des pages restent ainsi lisibles et stables.

### Intégrations

Chaque service a son client dans `src/integrations/<service>`, construit sur un socle commun (`integrations/http`) :

- **délais** de connexion et de réponse par appel ;
- **disjoncteur par service et par instance** : un échec de connexion marque le service injoignable pendant 10 s, les appels suivants échouent aussitôt au lieu d'attendre le délai ;
- **stratégies d'authentification** : clé d'API (en-tête ou paramètre), authentification Basic, jeton Bearer, et les sessions propres à certains clients (cookie de qBittorrent et Deluge, jeton de Transmission) ;
- **garde anti-SSRF** : schémas autres que `http(s)` et adresses de lien local refusés, y compris après résolution DNS, revérifiée à chaque connexion (rebinding DNS) ;
- **erreurs typées** (`UpstreamError`) converties en codes d'API (`SERVICE_UNREACHABLE`, `UPSTREAM_ERROR`…).

Les clients de Radarr, Sonarr et Prowlarr sont typés à partir de leurs spécifications OpenAPI (`make openapi`) ; les autres réponses sont validées par zod. L'administration de Radarr et de Sonarr partage un seul module paramétré par le type d'instance, et les trois clients torrent partagent une seule vue grâce à des adaptateurs qui déclarent leurs capacités.

### Cache et rafraîchissement

- **Cache « stale-while-revalidate »** : les données coûteuses (bibliothèques, index de Bazarr, vocabulaire de recherche) sont servies depuis le cache ; une donnée périmée est servie aussitôt et rafraîchie en arrière-plan.
- **File de rafraîchissement** en processus (2 tâches en parallèle, déduplication par clé) : un rafraîchissement ne tourne jamais pendant la requête qui le demande.
- **Invalidation** : une mutation (ajout, suppression, action sur un torrent…) invalide les entrées concernées pour que la lecture suivante montre son effet.

### Temps réel

`GET /api/events?topics=…` ouvre un flux **Server-Sent Events** multiplexé par onglet. Chaque sujet (`downloads.qbittorrent`, `queue.radarr.films`…) a un **poller partagé** qui ne tourne que tant qu'un abonné existe et diffuse chaque relecture à tous. Cinq onglets ouverts sur la même page ne déclenchent donc qu'un appel au service par intervalle. Un échec double l'intervalle (jusqu'à 2 minutes). Sans SSE, le front se replie sur un polling classique.

### Base de données

SQLite en mode WAL dans `HUBARR_DATA_DIR` (`/data/hubarr.db`). Tables principales :

| Table              | Contenu                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `user`             | Comptes : e-mail, empreinte argon2id, rôle, nom, avatar, préférences d'affichage                           |
| `user_permission`  | Accès d'un compte non administrateur : service, instance Radarr/Sonarr, niveau (`read`, `write`)           |
| `session`          | Sessions : empreinte SHA-256 du jeton, données, échéance glissante                                         |
| `setting`          | Réglages clé-valeur en JSON validé (préférences, thème, tableau de bord, état de l'installation)           |
| `service_instance` | Une ligne par service ou instance : type, slug, nom, URL, identifiants, options, défaut, activation, ordre |
| `watchlist_item`   | Watchlist TMDB et ses notes                                                                                |

Les migrations SQL (Drizzle) s'appliquent **au démarrage**, après une copie `hubarr.db.bak`. Le serveur refuse de démarrer sur une base plus récente que lui (retour arrière) ou sur une base étrangère.

## Front

- **Démarrage** : `GET /api/bootstrap` fournit l'utilisateur, le jeton CSRF, la langue, le thème et l'état de l'installation ; la langue et le thème sont appliqués avant le premier rendu (aucun flash de couleur).
- **Données** : TanStack Query pour toutes les lectures (cache, relectures, invalidation après mutation) ; le client API ajoute le jeton CSRF, rejoue une fois une requête refusée pour jeton expiré et convertit les erreurs.
- **Navigation** : les adresses des pages sont celles affichées dans la barre du navigateur ; des gardes de routeur gèrent l'installation, la connexion, le rôle et les services indisponibles.
- **Interface** : Vuetify 4, mobile d'abord. Tiroir de navigation, barre du haut, barre basse et bouton d'action par service sur mobile ; une route déclare les onglets de sa barre basse (`meta.bottomNav`, filtrés par une condition `visible` facultative), qui donnent aussi au groupe **Accueil** ses onglets en haut sur ordinateur (`app/home-tabs.ts`) ; thème sombre par défaut, 17 palettes, accent par service. Les icônes sont des **Material Symbols** (style Rounded, Apache-2.0) : seuls les tracés utilisés sont conservés dans `apps/web/src/components/symbols.ts`, dessinés par un jeu d'icônes Vuetify (`app/plugins/material-symbols.ts`) qui couvre aussi les icônes internes de Vuetify. Pour ajouter une icône, recopier dans ce fichier le tracé de `rounded/<nom>.svg` (ou `<nom>-fill.svg`) de `@material-symbols/svg-400`.
- **Traductions** : catalogues JSON FR/EN au format ICU dans `packages/shared/src/i18n`, chargés par langue. Une règle ESLint interdit tout texte en dur dans les composants.
- **Cache persistant** : une liste blanche de requêtes TanStack Query (tableau de bord, découverte, calendrier, bibliothèques et fiches Radarr/Sonarr) est enregistrée dans IndexedDB (`app/query-persist.ts`, `@tanstack/query-persist-client-core`) et restaurée avant le montage, puis revalidée ; un fin liseré en haut signale le rafraîchissement. La clé de cache combine `HUBARR_VERSION` et l'identifiant de l'utilisateur, avec une durée maximale de 24 h ; le cache est vidé (mémoire et stockage) dès que la session se ferme ou change d'utilisateur. Journaux, paramètres, profil et flux temps réel ne sont jamais persistés ; les images elles-mêmes ne sont pas stockées (seulement leurs URL : publiques de TMDB, ou du proxy d'images de Hubarr), et aucune adresse des services de l'utilisateur n'est gardée.
- **PWA** : manifeste, icônes et service worker (`public/sw.js`) qui ne met en cache que la coquille de l'application, jamais les données.

## Sécurité

- **Mots de passe** hachés en argon2id ; **sessions** par jeton aléatoire de 256 bits dont seule l'empreinte est stockée ; cookie `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS.
- **CSRF** : jeton de synchronisation sur toutes les mutations, connexion comprise, plus contrôle de `Sec-Fetch-Site` et `Origin`.
- **Limitation** de la connexion : 5 tentatives en 15 minutes par compte et IP, 25 par IP, et 50 par compte quelle que soit l'IP (un client reconnu comme proxy peut changer son `X-Forwarded-For` à volonté). Une IP depuis laquelle le compte s'est connecté dans les 30 derniers jours échappe à cette dernière limite : des essais venus d'ailleurs ne peuvent pas bloquer le compte. La vérification du mot de passe actuel depuis le profil a la même limite de 5 essais.
- **En-têtes** : CSP stricte (`script-src 'self'`, aucun script inline dans l'application), `frame-ancestors` configurable (`HUBARR_FRAME_ANCESTORS`), `X-Content-Type-Options`, `Referrer-Policy`, HSTS, `Permissions-Policy`.
- **Secrets des services** stockés côté serveur et jamais renvoyés au navigateur ; un import qui change l'origine (schéma, hôte, port) d'un service efface ses secrets enregistrés.
- **Proxy d'images** borné aux chemins attendus de chaque service.
- **Reverse proxy** : `X-Forwarded-*` et `X-Forwarded-Prefix` ne sont pris en compte que depuis les adresses de `HUBARR_TRUST_PROXY`.

## Image Docker et exploitation

Le `docker/Dockerfile` multi-étapes produit l'image finale :

1. **build** : installation des dépendances verrouillées, build du front (Vite), du serveur (tsup) et de la documentation (VitePress) ;
2. **prune** : `pnpm deploy --prod` ne garde que les dépendances d'exécution ; les binaires natifs (SQLite, argon2) sont chargés pendant le build, qui échoue s'ils sont absents ;
3. **runtime** : `node:24-alpine`, `tini`, volume `/data`, port 7070, `HEALTHCHECK` sur `/api/health`. Le point d'entrée attribue `/data` à `PUID:PGID` (1000 par défaut) puis lance Hubarr sous cette identité avec `su-exec` : le serveur ne tourne jamais en root, et le code de l'application appartient à root, en lecture seule pour le serveur.

L'image est publiée sur Docker Hub (`naroner/hubarr`, amd64) ; `make build` la construit depuis les sources pour l'architecture de la machine. Toute la configuration passe par des variables d'environnement (voir [Installation](./installation.md#variables-d-environnement)). Les journaux sortent sur la sortie standard (niveau `HUBARR_LOG_LEVEL`), secrets masqués ; les 1 000 dernières entrées sont aussi gardées en mémoire pour la page **Journaux** (`GET /api/admin/logs`, niveau `HUBARR_LOG_BUFFER_LEVEL`).

**Sauvegarde** : tout l'état de Hubarr tient dans le dossier monté sur `/data` (base, sauvegarde automatique, avatars). L'export JSON des paramètres permet aussi de transporter la configuration des services.

## Qualité

- **Vitest** pour le serveur (services, clients HTTP contre des agents simulés, cache, routes via `fastify.inject`) et le front (composants, composables).
- **Playwright** contre l'image de production réelle et un serveur de **faux services** (`e2e/mocks`), en desktop et en mobile, avec contrôles d'accessibilité.
- **ESLint** (règles typées, en-tête de licence SPDX, aucun texte en dur), **Prettier**, `vue-tsc`, et vérification des licences des dépendances.
- Ces contrôles tournent dans Docker via `make check` et `make e2e`, et un hook git lance le lint et les types avant chaque commit.
