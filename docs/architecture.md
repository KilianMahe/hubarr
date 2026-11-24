# Technical architecture

This page describes **how Hubarr is built**: components, flows, data, security and operations. It is meant for people who host Hubarr and want to understand what runs, and for those who want to contribute (see also [Developing Hubarr](./development.md)).

## Overview

```
            Browser (Vue 3 SPA, PWA)
                       │  HTTPS (through your reverse proxy)
                       ▼
   ┌───────────────── hubarr container ─────────────────┐
   │  Node.js 24 · Fastify 5                            │
   │  ├─ /            built front end (Vite) + index.html│
   │  ├─ /docs        documentation (VitePress)          │
   │  ├─ /api/*       JSON API, SSE stream /api/events   │
   │  ├─ SWR cache, refresh queue, pollers               │
   │  └─ SQLite (better-sqlite3) ── /data/hubarr.db      │
   └──────────┬─────────────────────────────────────────┘
              │ HTTP(S), server side only
              ▼
   Radarr · Sonarr · Prowlarr · Bazarr · Seerr · qBittorrent · Transmission
   Deluge · SABnzbd · NZBGet · Gluetun · Tautulli · Tracearr · Emby · TMDB
```

A **single Node process** serves the front end, the documentation and the API. There is no external database, no Redis and no separate worker: the cache, the refresh queue and real time live in the process. The browser never contacts a service directly; only TMDB images load from `image.tmdb.org`, other images (Plex, Emby, Tracearr) go through a Hubarr proxy.

## Software stack

| Layer         | Choice                                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server        | Node.js 24, **Fastify 5**, **zod 4** (validation and serialization), **Drizzle ORM** + **better-sqlite3**, **argon2id** (passwords), undici (outgoing HTTP) |
| Front end     | **Vue 3.5** + Vite, **Vuetify 4** (Material), Vue Router, Pinia, **TanStack Query**, vue-i18n with ICU messages (`intl-messageformat`)                      |
| Documentation | VitePress, bilingual, embedded in the image                                                                                                                 |
| Language      | Strict TypeScript everywhere (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)                                                           |
| Packaging     | Single Docker image (`node:24-alpine`, `tini`, server under `PUID:PGID`, never root)                                                                        |

## Repository layout

A **pnpm** monorepo:

```
apps/server         Fastify API, CLI, serving of the front end and docs
  src/app.ts          assembly: plugins, modules, routes
  src/plugins/        sessions, CSRF, setup guard, access control, headers
  src/modules/<x>/    one module per domain (movies, series, torrents, seerr…)
  src/integrations/   one client per service, on a shared HTTP layer
  src/cache/          SWR cache, refresh queue, refreshers
  src/live/           shared reads and real-time pollers
  src/db/             Drizzle schema, SQL migrations, opening and backup
  src/cli/            `hubarr` command (password reset…)
apps/web            Vue SPA
  src/app/            boot, router, API client, stores, theme, i18n
  src/components/     shared components and design system
  src/features/<x>/   one folder per screen or domain
packages/shared     single source of contracts: zod schemas, types, i18n, themes
docs                VitePress documentation (EN at the root, FR under /fr/)
e2e                 fake services (mocks) and Playwright tests
docker              multi-stage Dockerfile and build scripts
tools               translation conversion, OpenAPI types, licenses, ESLint rules
```

**`packages/shared` is the single source of contracts**: every endpoint declares its zod schemas (parameters, body, response) in `packages/shared/src/schemas`. The server uses them to validate input and serialize output (a key outside the schema never leaves), the front end to type its calls and validate responses. A contract change therefore breaks compilation on both sides.

## Server

### Request lifecycle

1. **`rewriteUrl`** strips the optional path prefix (`HUBARR_BASE_PATH`).
2. **Sessions**: the `hubarr_session` cookie resolves to a session and a user.
3. **CSRF**: every mutation requires the session's `x-csrf-token` header; cross-site `Sec-Fetch-Site` requests or foreign `Origin` headers are refused.
4. **Setup guard**: until the wizard is complete, the API answers `409 SETUP_REQUIRED`.
5. **Access control**: every route requires a session unless declared `access: 'public'`; administration modules add `requireRole('admin')`.
6. **Service guard**: a route of an unconfigured or disabled service answers with an explicit error.
7. **Route**: zod validation, call to the service, response serialized by its schema.

Errors always look like `{ code, message?, service?, details? }`; the front end translates the `code`.

### Modules and API conventions

Each domain is a Fastify plugin in `src/modules/<domain>`. The API path is `/api` followed by the path of the matching page (for example `/api/medias/films/films/7` for the page shown at `/medias/films/films/7`). Page addresses thus stay readable and stable.

### Integrations

Each service has its client in `src/integrations/<service>`, built on a shared layer (`integrations/http`):

- per-call connection and response **timeouts**;
- a **circuit breaker per service and per instance**: a connection failure marks the service unreachable for 10 s, and further calls fail immediately instead of waiting for the timeout;
- **authentication strategies**: API key (header or query), Basic auth, Bearer token, and client-specific sessions (qBittorrent and Deluge cookies, Transmission token);
- an **SSRF guard**: schemes other than `http(s)` and link-local addresses are refused, including after DNS resolution, checked again on every connection (DNS rebinding);
- **typed errors** (`UpstreamError`) mapped to API codes (`SERVICE_UNREACHABLE`, `UPSTREAM_ERROR`…).

Radarr, Sonarr and Prowlarr clients are typed from their OpenAPI specifications (`make openapi`); other responses are validated with zod. Radarr and Sonarr administration share a single module parameterized by instance kind, and the three torrent clients share one view thanks to adapters that declare their capabilities.

### Cache and refresh

- **Stale-while-revalidate cache**: expensive data (libraries, Bazarr index, search vocabulary) is served from cache; stale data is served at once and refreshed in the background.
- **In-process refresh queue** (2 concurrent jobs, de-duplicated by key): a refresh never runs inside the request that asks for it.
- **Invalidation**: a mutation (add, delete, torrent action…) invalidates the related entries so the next read shows its effect.

### Real time

`GET /api/events?topics=…` opens a **Server-Sent Events** stream multiplexed per tab. Each topic (`downloads.qbittorrent`, `queue.radarr.films`…) has a **shared poller** that only runs while a subscriber exists and broadcasts each read to all of them. Five tabs open on the same page therefore trigger a single call to the service per interval. A failure doubles the interval (up to 2 minutes). Without SSE, the front end falls back to plain polling.

### Database

SQLite in WAL mode in `HUBARR_DATA_DIR` (`/data/hubarr.db`). Five tables:

| Table              | Content                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `user`             | Accounts: e-mail, argon2id hash, role, name, avatar                                                   |
| `session`          | Sessions: SHA-256 hash of the token, data, sliding expiry                                             |
| `setting`          | Key-value settings as validated JSON (preferences, theme, dashboard, setup state)                     |
| `service_instance` | One row per service or instance: type, slug, name, URL, credentials, options, default, enabled, order |
| `watchlist_item`   | TMDB watchlist and its notes                                                                          |

SQL migrations (Drizzle) run **at startup**, after a `hubarr.db.bak` copy. The server refuses to start on a database newer than itself (downgrade) or on a foreign database.

## Front end

- **Boot**: `GET /api/bootstrap` returns the user, the CSRF token, the language, the theme and the setup state; language and theme are applied before the first render (no color flash).
- **Data**: TanStack Query for every read (cache, refetches, invalidation after mutations); the API client adds the CSRF token, replays once a request refused for an expired token and maps errors.
- **Navigation**: page addresses are those shown in the browser bar; router guards handle setup, login, role and unavailable services.
- **Interface**: Vuetify 4, mobile first. Navigation drawer, top bar, bottom bar and per-service action button on mobile; a route declares its bottom bar tabs (`meta.bottomNav`, filtered by an optional `visible` condition), which also give the **Home** group its tabs at the top on a computer (`app/home-tabs.ts`); dark theme by default, 17 palettes, per-service accent. Icons are **Material Symbols** (Rounded style, Apache-2.0): only the paths in use are kept in `apps/web/src/components/symbols.ts`, drawn by a Vuetify icon set (`app/plugins/material-symbols.ts`) that also covers Vuetify's own icons. To add an icon, copy the path of `rounded/<name>.svg` (or `<name>-fill.svg`) from `@material-symbols/svg-400` into that file.
- **Translations**: FR/EN JSON catalogs in ICU format in `packages/shared/src/i18n`, loaded per language. An ESLint rule forbids hard-coded text in components.
- **Persistent cache**: an allowlist of TanStack Query queries (dashboard, Discover, calendar, Radarr/Sonarr libraries and pages) is saved to IndexedDB (`app/query-persist.ts`, `@tanstack/query-persist-client-core`) and restored before mounting, then revalidated; a thin bar at the top shows the refresh. The cache key combines `HUBARR_VERSION` and the user id, with a 24-hour maximum age; it is cleared from memory and storage as soon as the session ends or changes user. Logs, settings, profile and real-time feeds are never persisted; images are not stored (only their URLs: public TMDB ones, or Hubarr's image proxy), and no address of the user's services is kept.
- **PWA**: manifest, icons and a service worker (`public/sw.js`) that only caches the application shell, never data.

## Security

- **Passwords** hashed with argon2id; **sessions** use a random 256-bit token of which only the hash is stored; `HttpOnly`, `SameSite=Lax` cookie, `Secure` over HTTPS.
- **CSRF**: synchronizer token on every mutation, login included, plus `Sec-Fetch-Site` and `Origin` checks.
- **Login throttling**: 5 attempts in 15 minutes per account and IP, 25 per IP, and 50 per account whatever the IP (a client trusted as a proxy can change its `X-Forwarded-For` at will). Checking the current password from the profile has the same 5-attempt limit.
- **Headers**: strict CSP (`script-src 'self'`, no inline script in the application), configurable `frame-ancestors` (`HUBARR_FRAME_ANCESTORS`), `X-Content-Type-Options`, `Referrer-Policy`, HSTS, `Permissions-Policy`.
- **Service secrets** stored server side and never sent back to the browser; an import that changes the origin (scheme, host, port) of a service clears its stored secrets.
- **Image proxy** restricted to the expected paths of each service.
- **Reverse proxy**: `X-Forwarded-*` and `X-Forwarded-Prefix` are only trusted from the addresses in `HUBARR_TRUST_PROXY`.

## Docker image and operations

The multi-stage `docker/Dockerfile` produces the final image:

1. **build**: install locked dependencies, build the front end (Vite), the server (tsup) and the documentation (VitePress);
2. **prune**: `pnpm deploy --prod` keeps runtime dependencies only; native binaries (SQLite, argon2) are loaded during the build, which fails if they are missing;
3. **runtime**: `node:24-alpine`, `tini`, `/data` volume, port 7070, `HEALTHCHECK` on `/api/health`. The entrypoint hands `/data` to `PUID:PGID` (1000 by default) then starts Hubarr under that identity with `su-exec`: the server never runs as root, and the application code belongs to root, read-only for the server.

The image is published on Docker Hub (`naroner/hubarr`, amd64); `make build` builds it from source for the machine's architecture. All configuration goes through environment variables (see [Installation](./installation.md#environment-variables)). Logs go to standard output (level `HUBARR_LOG_LEVEL`), secrets masked; the last 1,000 entries are also kept in memory for the **Logs** page (`GET /api/admin/logs`, level `HUBARR_LOG_BUFFER_LEVEL`).

**Backup**: Hubarr's whole state lives in the folder mounted on `/data` (database, automatic backup, avatars). The settings JSON export also carries the service configuration to another install.

## Quality

- **Vitest** for the server (services, HTTP clients against mock agents, cache, routes via `fastify.inject`) and the front end (components, composables).
- **Playwright** against the real production image and a **fake services** server (`e2e/mocks`), on desktop and mobile, with accessibility checks.
- **ESLint** (type-aware rules, SPDX license header, no hard-coded text), **Prettier**, `vue-tsc`, and dependency license checks.
- These checks run in Docker through `make check` and `make e2e`, and a git hook runs lint and type checks before every commit.
