// SPDX-License-Identifier: AGPL-3.0-or-later
// Démarrage du serveur : environnement validé, base préparée (garde « ancienne
// base Doctrine », sauvegarde, migrations), puis écoute HTTP.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APP_NAME } from '@hubarr/shared';
import { buildApp } from './app';
import { loadEnv } from './config/env';
import { prepareDatabase } from './db/migrate';
import { MIGRATIONS_FOLDER } from './db/paths';
import { setTmdbApiOrigin } from './integrations/tmdb/origin';

async function start() {
  const env = loadEnv();
  const prepared = await prepareDatabase({
    dataDir: env.HUBARR_DATA_DIR,
    migrationsFolder: MIGRATIONS_FOLDER,
  });
  return { env, ...prepared };
}

const { env, database, report } = await start().catch((error: unknown) => {
  // Erreurs de démarrage attendues (environnement, base refusée) : message seul, sans pile.
  console.error(
    `${APP_NAME} ne peut pas démarrer : ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});

// Dans l'image, main.js est à la racine de /app, à côté de public/ (front) et
// docs/ (documentation). En développement, ces dossiers n'existent pas.
const existing = (relative: string): string | undefined => {
  const path = fileURLToPath(new URL(relative, import.meta.url));
  return existsSync(path) ? path : undefined;
};
setTmdbApiOrigin(env.HUBARR_TMDB_API_URL);
const webRoot = existing('./public');
const docsRoot = existing('./docs');

const app = buildApp({
  logger: { level: env.HUBARR_LOG_LEVEL },
  trustProxy: env.HUBARR_TRUST_PROXY,
  basePath: env.HUBARR_BASE_PATH,
  frameAncestors: env.HUBARR_FRAME_ANCESTORS,
  version: env.HUBARR_VERSION,
  database,
  dataDir: env.HUBARR_DATA_DIR,
  ...(webRoot === undefined ? {} : { webRoot }),
  ...(docsRoot === undefined ? {} : { docsRoot }),
});
if (report.applied > 0) {
  app.log.warn({ applied: report.applied, backup: report.backupFile }, 'migrations appliquées');
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, 'arrêt demandé');
  await app.close();
  process.exit(0);
}

process.once('SIGINT', (signal) => void shutdown(signal));
process.once('SIGTERM', (signal) => void shutdown(signal));

try {
  await app.listen({ port: env.HUBARR_PORT, host: env.HUBARR_HOST });
  console.log(
    `${APP_NAME} ${env.HUBARR_VERSION} écoute sur http://${env.HUBARR_HOST}:${String(env.HUBARR_PORT)}`,
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
