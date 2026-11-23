// SPDX-License-Identifier: AGPL-3.0-or-later
// Sonde du HEALTHCHECK Docker (`node /app/healthcheck.js`, sans curl dans
// l'image) : sortie 0 si `GET /api/health` répond 200 dans les 4 secondes.

const port = process.env.HUBARR_PORT ?? '7070';
const configuredHost = process.env.HUBARR_HOST ?? '';
// Une écoute sur toutes les interfaces se joint par la boucle locale.
const host = ['', '0.0.0.0', '::'].includes(configuredHost) ? '127.0.0.1' : configuredHost;
const url = `http://${host.includes(':') ? `[${host}]` : host}:${port}/api/health`;

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
  process.exit(response.status === 200 ? 0 : 1);
} catch {
  process.exit(1);
}
