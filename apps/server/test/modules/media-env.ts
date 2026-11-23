// SPDX-License-Identifier: AGPL-3.0-or-later
// Environnement de test de P4 (dashboard, calendrier, découverte, recherche) :
// deux instances Radarr (« Films » et « Films 4K »), une instance Sonarr,
// TMDB configuré sur un faux `api.themoviedb.org`, horloge fixe, utilisateur
// connecté. Chaque faux service répond par « MÉTHODE /chemin ».

import type { FastifyInstance } from 'fastify';
import { MockAgent } from 'undici';
import { buildApp } from '../../src/app';
import type { AppDatabase } from '../../src/db/client';
import { DEFAULT_TMDB_API_ORIGIN } from '../../src/integrations/tmdb/origin';
import { createInstance, type InstanceRow } from '../../src/modules/instances/instances';
import { applyServicePatch } from '../../src/modules/services/config';
import { TestBrowser, UNUSED_DATA_DIR, createTestDatabase, createUser } from '../helpers';
import { EMAIL, PASSWORD, noDns } from './movies/radarr-env';
import { fakeUpstream, type FakeUpstream } from './torrents/torrent-env';

/** 22/11/2026 12:00 UTC. */
export const NOW = Date.UTC(2026, 10, 22, 12);

export const ORIGINS = {
  radarr: 'http://radarr.test',
  radarr4k: 'http://radarr4k.test',
  sonarr: 'http://sonarr.test',
  seerr: 'http://seerr.test',
  tmdb: DEFAULT_TMDB_API_ORIGIN,
} as const;

export interface MediaEnv {
  database: AppDatabase;
  agent: MockAgent;
  app: FastifyInstance;
  browser: TestBrowser;
  up: Record<keyof typeof ORIGINS, FakeUpstream>;
  radarr: InstanceRow;
  radarr4k: InstanceRow;
  sonarr: InstanceRow;
  close(): Promise<void>;
}

export async function mediaEnv(
  options: { role?: 'admin' | 'user'; tmdb?: boolean; timezone?: string } = {},
): Promise<MediaEnv> {
  const database = await createTestDatabase();
  const agent = new MockAgent();
  agent.disableNetConnect();
  const up = Object.fromEntries(
    Object.entries(ORIGINS).map(([id, origin]) => [id, fakeUpstream(agent, origin)]),
  ) as Record<keyof typeof ORIGINS, FakeUpstream>;
  const app = buildApp({
    database,
    dataDir: UNUSED_DATA_DIR,
    dispatcher: agent,
    now: () => NOW,
    ...noDns,
  });
  await createUser(database, { email: EMAIL, password: PASSWORD, role: options.role ?? 'admin' });
  const radarr = await createInstance(
    database.db,
    'radarr',
    { name: 'Films', url: ORIGINS.radarr, apiKey: 'k1' },
    noDns,
  );
  const radarr4k = await createInstance(
    database.db,
    'radarr',
    { name: 'Films 4K', url: ORIGINS.radarr4k, apiKey: 'k2' },
    noDns,
  );
  const sonarr = await createInstance(
    database.db,
    'sonarr',
    { name: 'Séries', url: ORIGINS.sonarr, apiKey: 'k3' },
    noDns,
  );
  if (options.tmdb !== false) applyServicePatch(database.db, 'tmdb', { apiKey: 'tmdb-key' });
  // Aucune liste par défaut : une bibliothèque vide plutôt qu'un 404.
  for (const id of ['radarr', 'radarr4k'] as const) {
    up[id].on('GET /api/v3/movie', { body: [] });
    up[id].on('GET /api/v3/calendar', { body: [] });
  }
  up.sonarr.on('GET /api/v3/series', { body: [] });
  up.sonarr.on('GET /api/v3/calendar', { body: [] });
  const browser = new TestBrowser(() => app);
  const login = await browser.login({ email: EMAIL, password: PASSWORD });
  if (login.statusCode !== 200) throw new Error(`connexion refusée (${login.statusCode})`);
  return {
    database,
    agent,
    app,
    browser,
    up,
    radarr,
    radarr4k,
    sonarr,
    async close() {
      await app.close();
      await agent.close();
    },
  };
}

/** Film Radarr brut. */
export function movie(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    tmdbId: 500 + id,
    title: `Movie ${id}`,
    sortTitle: `movie ${id}`,
    year: 2000 + id,
    monitored: true,
    hasFile: false,
    status: 'released',
    added: `2024-01-${String((id % 28) + 1).padStart(2, '0')}T00:00:00Z`,
    genres: [],
    images: [],
    tags: [],
    sizeOnDisk: 0,
    ...overrides,
  };
}

/** Série Sonarr brute. */
export function series(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Series ${id}`,
    sortTitle: `series ${id}`,
    year: 2000 + id,
    tvdbId: 1000 + id,
    tmdbId: 9000 + id,
    status: 'continuing',
    monitored: true,
    seriesType: 'standard',
    added: `2024-02-${String((id % 28) + 1).padStart(2, '0')}T00:00:00Z`,
    genres: [],
    images: [],
    tags: [],
    seasons: [],
    statistics: { episodeCount: 10, episodeFileCount: 5, totalEpisodeCount: 10, sizeOnDisk: 0 },
    ...overrides,
  };
}

/** Épisode du calendrier Sonarr brut (série incluse). */
export function calendarEpisode(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    seriesId: 1,
    seasonNumber: 1,
    episodeNumber: id,
    title: `Episode ${id}`,
    airDate: '2026-11-23',
    airDateUtc: '2026-11-23T20:00:00Z',
    hasFile: false,
    monitored: true,
    runtime: 45,
    series: { id: 1, title: 'Series 1', tvdbId: 1001, network: 'HBO', genres: [], images: [] },
    ...overrides,
  };
}
