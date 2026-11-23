// SPDX-License-Identifier: AGPL-3.0-or-later
// Environnement de test des routes Sonarr : application, admin connecté,
// instance « Séries » sur un Sonarr simulé (réponses par « MÉTHODE chemin »,
// appels enregistrés). Calqué sur l'environnement Radarr (`radarr-env.ts`).

import type { FastifyInstance } from 'fastify';
import { MockAgent } from 'undici';
import { buildApp } from '../../../src/app';
import { libraryKey } from '../../../src/cache';
import type { AppDatabase } from '../../../src/db/client';
import { createInstance, type InstanceRow } from '../../../src/modules/instances/instances';
import { TestBrowser, UNUSED_DATA_DIR, createTestDatabase, createUser } from '../../helpers';
import { EMAIL, PASSWORD, fakeRadarr as fakeArrServer, noDns } from '../movies/radarr-env';

export type FakeSonarr = ReturnType<typeof fakeArrServer>;

/** Série Sonarr brute (`/api/v3/series`), avec ce qu'il faut pour la normalisation. */
export function rawSeries(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Series ${id}`,
    sortTitle: `series ${id}`,
    year: 2000 + id,
    tvdbId: 1000 + id,
    status: 'continuing',
    monitored: true,
    seriesType: 'standard',
    added: `2024-01-${String((id % 28) + 1).padStart(2, '0')}T00:00:00Z`,
    genres: [],
    images: [],
    tags: [],
    seasons: [
      { seasonNumber: 1, monitored: true, statistics: { episodeCount: 10, episodeFileCount: 5 } },
    ],
    statistics: { episodeCount: 10, episodeFileCount: 5, totalEpisodeCount: 10, sizeOnDisk: 0 },
    ...overrides,
  };
}

/** Épisode Sonarr brut (`/api/v3/episode`). */
export function rawEpisode(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    seriesId: 1,
    seasonNumber: 1,
    episodeNumber: id,
    title: `Episode ${id}`,
    airDate: '2020-01-01',
    airDateUtc: '2020-01-01T20:00:00Z',
    hasFile: false,
    monitored: true,
    episodeFileId: 0,
    ...overrides,
  };
}

export interface SonarrEnv {
  database: AppDatabase;
  agent: MockAgent;
  app: FastifyInstance;
  browser: TestBrowser;
  sonarr: FakeSonarr;
  instance: InstanceRow;
  /** URL de l'API des séries de l'instance (`/api/medias/<slug>/series<path>`). */
  url(path?: string): string;
  /** URL de l'API de configuration (`/api/medias/<slug>/sonarr<path>`). */
  sonarrUrl(path: string): string;
  libraryCached(): boolean;
  close(): Promise<void>;
}

export async function sonarrEnv(): Promise<SonarrEnv> {
  const database = await createTestDatabase();
  const agent = new MockAgent();
  agent.disableNetConnect();
  const sonarr = fakeArrServer(agent, 'http://sonarr.test');
  const app = buildApp({ database, dataDir: UNUSED_DATA_DIR, dispatcher: agent, ...noDns });
  await createUser(database, { email: EMAIL, password: PASSWORD });
  const instance = await createInstance(
    database.db,
    'sonarr',
    { name: 'Séries', url: 'http://sonarr.test', apiKey: 'k' },
    noDns,
  );
  const browser = new TestBrowser(() => app);
  const login = await browser.login({ email: EMAIL, password: PASSWORD });
  if (login.statusCode !== 200) throw new Error(`connexion refusée (${login.statusCode})`);
  return {
    database,
    agent,
    app,
    browser,
    sonarr,
    instance,
    url: (path = '') => `/api/medias/${instance.slug}/series${path}`,
    sonarrUrl: (path) => `/api/medias/${instance.slug}/sonarr${path}`,
    libraryCached: () => app.cache.swr.read(libraryKey('series', instance.slug), 60_000) !== null,
    async close() {
      await app.close();
      await agent.close();
    },
  };
}

/** Met la bibliothèque en cache (une lecture de la page). */
export async function warmSeries(
  env: SonarrEnv,
  series: unknown[] = [rawSeries(1)],
): Promise<void> {
  env.sonarr.on('GET', '/api/v3/series', series);
  env.sonarr.on('GET', '/api/v3/calendar', []);
  const response = await env.browser.get(env.url());
  if (response.statusCode !== 200) throw new Error(`bibliothèque : ${response.statusCode}`);
}
