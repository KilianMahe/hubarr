# Developing Hubarr

Contributor guide: environment, conventions, tests and releases. The code layout is described in [Technical architecture](./architecture.md).

## Environment: everything in Docker

Only **Docker Engine**, **Docker Compose v2**, `git` and `make` are needed. Node, pnpm, Playwright and the browsers live in containers; do not run `node` or `pnpm` on the host.

```sh
git clone https://github.com/KilianMahe/hubarr.git
cd Hubarr
make hooks   # once: make check-fast on commit, make check on push
make dev     # API :7070, front end :5173, fake services :7171, docs :5174
```

Open `http://localhost:5173`. The front end (Vite) and the API (`tsx watch`) hot reload; the development database lives in `data-dev/`. The **fake services** (`e2e/mocks`) mimic Radarr, Sonarr, Prowlarr, Bazarr, Seerr, the download clients, Tautulli, Tracearr, Emby and TMDB: for example, enter `http://mocks:7171/radarr` with the key `e2e-radarr-key`. `make stack` adds a real stack (Radarr, Sonarr, Prowlarr, qBittorrent, SABnzbd) to test against the actual applications.

## Commands

| Command                                      | Effect                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `make dev`, `make stack`, `make down`        | Development environment (with or without a real stack)                               |
| `make install`                               | Install dependencies (after a `package.json` change)                                 |
| `make sh`                                    | Shell in the `server` container                                                      |
| `make lint`, `make typecheck`, `make test`   | ESLint + Prettier, types, Vitest tests                                               |
| `make check-fast`                            | Lint + types (pre-commit hook)                                                       |
| `make check`                                 | Lint + types + tests + licenses (pre-push hook)                                      |
| `make e2e`                                   | Build the image then run Playwright on desktop and mobile (`GREP=pattern` to filter) |
| `make screenshots`                           | Regenerate the documentation and README screenshots                                  |
| `make build`, `make prod`                    | `hubarr:local` image and production-like run                                         |
| `make db-generate NAME=…`, `make db-migrate` | Drizzle migration from `schema.ts`, apply                                            |
| `make openapi SERVICE=radarr`                | Regenerate a service's types from its OpenAPI specification                          |
| `make docs`                                  | Build the documentation                                                              |
| `make publish VERSION=x.y.z`                 | Push `naroner/hubarr:x.y.z` and `latest` to Docker Hub                               |
| `make release VERSION=x.y.z`                 | Local release (see below)                                                            |
| `make help`                                  | Every target                                                                         |

## Conventions

- **Strict TypeScript**, no `any` or `@ts-ignore` without a justification.
- **Contracts in `packages/shared`**: every endpoint declares its zod schemas in `packages/shared/src/schemas`; the front end infers its types from the same schemas.
- **No hard-coded text** in the front end: i18n keys, in French and English (`packages/shared/src/i18n`). The `no-raw-text` ESLint rule enforces it.
- **API errors** shaped as `{ code, message?, service?, details? }`; messages translated client side.
- **Security**: `requireRole('admin')` on administration modules, CSRF token on every mutation, no service URL exposed to the browser (proxied images).
- **License**: `// SPDX-License-Identifier: AGPL-3.0-or-later` header in every source file (ESLint rule, fixable with `make lint-fix`). Accepted dependency licenses: MIT, Apache-2.0, ISC, BSD (checked by `tools/check-licenses.js`).
- **Factor out**: one module for Radarr/Sonarr administration, one view for the torrent clients.
- High-level documentation and comments in **French**, code and identifiers in **English**.
- **Commits** follow Conventional Commits, in French, with a scope: `feat(radarr): …`, `fix(auth): …`.

## Adding an integration

1. **Client** in `apps/server/src/integrations/<service>`, on `integrations/http` (timeouts, circuit breaker, authentication, `UpstreamError`). Types generated from OpenAPI when the service publishes a spec, zod schemas otherwise.
2. **Configuration**: declare the service in `packages/shared/src/constants/services.ts` (fields, connection test).
3. **Schemas** of the endpoints in `packages/shared/src/schemas/<service>.ts`.
4. **Fastify module** in `apps/server/src/modules/<service>`: routes, service guard, role, cache invalidation after mutations.
5. **Screen** in `apps/web/src/features/<service>`, routes in `app/router`, drawer entry, FR and EN i18n keys.
6. **Fake service** in `e2e/mocks/src/<service>` and a Playwright test.
7. **Page** in `docs/` (and `docs/fr/`).

## Tests

- **Vitest**: `apps/server/test` (routes via `fastify.inject`, clients against `MockAgent`, cache, in-memory database) and `apps/web/test` (components with `@vue/test-utils`). To run a subset: `docker compose -f compose.dev.yml run --rm server sh -c 'cd apps/server && pnpm exec vitest run test/modules/web'`.
- **Playwright**: the real production image (`e2e-app`, fresh in-memory database), the same image under a path prefix (`e2e-app-prefix`) and the fake services (`e2e-mocks`). Two projects, desktop (1440 px) and mobile (Pixel 7), plus accessibility checks.
- There is no CI: git hooks (`make hooks`) are the safety net. Do not bypass them.

## Releasing

```sh
make release VERSION=1.2.0
```

The target checks that the tree is clean, runs `make check` and `make e2e`, moves the "Unreleased" section of `CHANGELOG.md` under the new version, creates the commit and the `v1.2.0` tag, then builds the image and tags it `hubarr:local`, `naroner/hubarr:1.2.0` and `naroner/hubarr:latest`. Then publish with `make publish VERSION=1.2.0` (Docker Hub) and `make publish-github VERSION=1.2.0` (public GitHub repository, one commit per release).
Finally, `GITHUB_TOKEN=… make github-release VERSION=1.2.0` creates the GitHub release page from the changelog (`DRY_RUN=1` previews it), and `DOCKERHUB_TOKEN=… make dockerhub-description` (token scope "Read, Write, Delete") updates the Docker Hub description from `docker/DOCKERHUB.md`.
