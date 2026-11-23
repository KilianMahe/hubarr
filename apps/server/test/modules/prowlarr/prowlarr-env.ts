// SPDX-License-Identifier: AGPL-3.0-or-later
// Environnement de test des routes Prowlarr (P3c) : application, admin
// connecté, Prowlarr configuré sur un faux upstream (réponses par « MÉTHODE
// chemin », appels enregistrés) ; `url()` vise `/api/prowlarr<chemin>`.

import type { FastifyInstance } from 'fastify';
import { MockAgent } from 'undici';
import { buildApp } from '../../../src/app';
import type { AppDatabase } from '../../../src/db/client';
import { applyServicePatch } from '../../../src/modules/services/config';
import { TestBrowser, UNUSED_DATA_DIR, createTestDatabase, createUser } from '../../helpers';
import { EMAIL, PASSWORD, fakeRadarr, noDns, type FakeRadarr } from '../movies/radarr-env';

export const PROWLARR_ORIGIN = 'http://prowlarr.test:9696';

export interface ProwlarrEnv {
  database: AppDatabase;
  agent: MockAgent;
  app: FastifyInstance;
  browser: TestBrowser;
  prowlarr: FakeRadarr;
  url(path?: string): string;
  close(): Promise<void>;
}

export async function prowlarrEnv(
  options: { role?: 'admin' | 'user'; configured?: boolean } = {},
): Promise<ProwlarrEnv> {
  const database = await createTestDatabase();
  const agent = new MockAgent();
  agent.disableNetConnect();
  const prowlarr = fakeRadarr(agent, PROWLARR_ORIGIN);
  const app = buildApp({ database, dataDir: UNUSED_DATA_DIR, dispatcher: agent, ...noDns });
  await createUser(database, { email: EMAIL, password: PASSWORD, role: options.role ?? 'admin' });
  if (options.configured !== false) {
    applyServicePatch(database.db, 'prowlarr', { url: PROWLARR_ORIGIN, apiKey: 'prowlarr-key' });
  }
  const browser = new TestBrowser(() => app);
  const login = await browser.login({ email: EMAIL, password: PASSWORD });
  if (login.statusCode !== 200) throw new Error(`connexion refusée (${login.statusCode})`);
  return {
    database,
    agent,
    app,
    browser,
    prowlarr,
    url: (path = '') => `/api/prowlarr${path}`,
    async close() {
      await app.close();
      await agent.close();
    },
  };
}

/** Indexeur brut de Prowlarr (`/api/v1/indexer`). */
export function rawIndexer(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Indexer ${id}`,
    definitionName: `def${id}`,
    implementation: 'Cardigann',
    implementationName: 'Cardigann',
    configContract: 'CardigannSettings',
    protocol: 'torrent',
    privacy: 'public',
    enable: true,
    redirect: false,
    supportsRss: true,
    supportsSearch: true,
    appProfileId: 1,
    priority: 25,
    tags: [],
    added: '2026-01-02T03:04:05Z',
    indexerUrls: [`https://indexer${id}.example/`],
    capabilities: {
      categories: [
        { id: 2000, name: 'Movies', subCategories: [{ id: 2040, name: 'Movies/HD' }] },
        { id: 5000, name: 'TV', subCategories: [] },
      ],
    },
    fields: [
      { name: 'definitionFile', value: `def${id}`, type: 'textbox', hidden: 'hidden' },
      { name: 'baseUrl', value: `https://indexer${id}.example/`, type: 'select' },
      { name: 'username', value: 'me', type: 'textbox', privacy: 'userName' },
      { name: 'password', value: `secret-${id}`, type: 'password', privacy: 'password' },
    ],
    ...overrides,
  };
}
