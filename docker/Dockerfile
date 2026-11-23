# syntax=docker/dockerfile:1.7
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Dockerfile unique de Hubarr, plusieurs cibles :
#   dev      environnement de développement (sources montées en volume)
#   build    installation figée + build de tous les paquets
#   runtime  image finale minimale, non-root (cible par défaut)
#   e2e      Playwright et ses navigateurs
#
# Le contexte de build est la racine du dépôt.

ARG NODE_VERSION=24.22.3
ARG PNPM_VERSION=12.21.0
ARG PLAYWRIGHT_VERSION=1.65.1

# ---------------------------------------------------------------------------
# base : Node + pnpm (corepack), commun à toutes les cibles Node
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
ENV COREPACK_HOME=/opt/corepack \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/opt/pnpm
RUN corepack enable \
 && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
 && pnpm --version \
 && chmod -R a+rX "${COREPACK_HOME}"

# ---------------------------------------------------------------------------
# dev : outils de build natifs, utilisateur aligné sur l'UID/GID de l'hôte
# ---------------------------------------------------------------------------
FROM base AS dev
ARG HOST_UID=1000
ARG HOST_GID=1000
# python3/make/g++ : compilation des modules natifs (better-sqlite3, argon2)
# si aucun binaire précompilé musl n'est disponible.
RUN apk add --no-cache bash git python3 make g++ shadow \
 && groupmod -o -g "${HOST_GID}" node \
 && usermod -o -u "${HOST_UID}" -g "${HOST_GID}" node \
 && mkdir -p /app /pnpm-store /data \
      /app/node_modules \
      /app/apps/server/node_modules \
      /app/apps/web/node_modules \
      /app/packages/shared/node_modules \
      /app/e2e/mocks/node_modules \
      /app/e2e/playwright/node_modules \
      /app/docs/node_modules \
 && chown -R node:node /app /pnpm-store /data /home/node
# Les points de montage ci-dessus existent dans l'image avec le bon
# propriétaire : les volumes nommés en héritent à leur création.
USER node
WORKDIR /app
RUN pnpm config set store-dir /pnpm-store --global
CMD ["sh"]

# ---------------------------------------------------------------------------
# build : installation figée (lockfile) puis build de tous les paquets
# ---------------------------------------------------------------------------
FROM base AS build
RUN apk add --no-cache python3 make g++
WORKDIR /src
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=hubarr-pnpm,target=/pnpm-store \
    pnpm config set store-dir /pnpm-store --global && pnpm fetch
COPY . .
RUN --mount=type=cache,id=hubarr-pnpm,target=/pnpm-store \
    pnpm install --frozen-lockfile --offline \
 && pnpm -r build \
 && pnpm --filter @hubarr/server --prod deploy /out \
 && sh docker/prune-native.sh /out/node_modules

# ---------------------------------------------------------------------------
# runtime : image finale (non-root, tini, tzdata)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
ARG HUBARR_VERSION=0.0.0-local
# `hubarr <commande>` : CLI d'administration (`docker exec -it hubarr hubarr user:reset-password <email>`),
# exécutée sous PUID:PGID comme le serveur pour ne pas créer de fichiers root dans /data.
# su-exec : abandon des droits root au démarrage (PUID/PGID, docker/entrypoint.sh).
RUN apk add --no-cache tini tzdata su-exec \
 && mkdir -p /data && chown node:node /data \
 && printf '#!/bin/sh\nif [ "$(id -u)" = 0 ]; then exec su-exec "${PUID:-1000}:${PGID:-1000}" node /app/cli.js "$@"; fi\nexec node /app/cli.js "$@"\n' > /usr/local/bin/hubarr \
 && chmod 755 /usr/local/bin/hubarr
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/hubarr-entrypoint
ENV NODE_ENV=production \
    HUBARR_VERSION=${HUBARR_VERSION} \
    HUBARR_PORT=7070 \
    HUBARR_DATA_DIR=/data
WORKDIR /app
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./
COPY --from=build --chown=node:node /src/apps/web/dist ./public
COPY --from=build --chown=node:node /src/docs/.vitepress/dist ./docs
USER node
# Garde-fou des binaires natifs : le build échoue si better-sqlite3
# ou argon2 ne se chargent pas dans l'image finale (sans outils de compilation).
RUN node --input-type=module <<'EOF'
import { createRequire } from 'node:module';
const require = createRequire('/app/main.js');
const Database = require('better-sqlite3');
const argon2 = require('argon2');
const db = new Database(':memory:');
const { v } = db.prepare('select sqlite_version() as v').get();
db.close();
const hash = await argon2.hash('hubarr', { type: argon2.argon2id });
if (!(await argon2.verify(hash, 'hubarr'))) throw new Error('argon2 : vérification échouée');
console.log(`binaires natifs OK : SQLite ${v}, argon2id, ${process.platform}/${process.arch}`);
EOF
VOLUME ["/data"]
EXPOSE 7070
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "/app/healthcheck.js"]
# Démarrage en root le temps d'ajuster /data, puis Hubarr tourne sous PUID:PGID.
USER root
ENV PUID=1000 \
    PGID=1000
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/hubarr-entrypoint"]
CMD ["node", "/app/main.js"]

# ---------------------------------------------------------------------------
# e2e : Playwright (version alignée sur @playwright/test)
# ---------------------------------------------------------------------------
# Navigateurs fournis par l'image ; `@playwright/test` (même version, pur JS)
# vient du node_modules du workspace, monté par le service `e2e` : ni pnpm ni
# corepack ne sont nécessaires (l'image n'a pas corepack).
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble AS e2e
WORKDIR /app
CMD ["sh"]

# Cible par défaut : l'image de production.
FROM runtime
