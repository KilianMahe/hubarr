// SPDX-License-Identifier: AGPL-3.0-or-later
// Démarrage du serveur de faux upstreams (service `mocks` de compose.dev.yml).

import { buildMocks } from './app';

const port = Number(process.env.MOCKS_PORT ?? 7171);
const app = buildMocks();

process.once('SIGINT', () => void app.close());
process.once('SIGTERM', () => void app.close());

await app.listen({ port, host: '0.0.0.0' });
console.log(`mocks écoute sur le port ${String(port)}`);
