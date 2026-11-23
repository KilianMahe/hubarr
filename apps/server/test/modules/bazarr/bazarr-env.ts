// SPDX-License-Identifier: AGPL-3.0-or-later
// Environnement de test de Bazarr (P3c.4) : application, admin connecté,
// Bazarr configuré sur un faux upstream (corps JSON ou formulaire
// enregistrés), une instance Radarr et une Sonarr (badges permis).

import type { FastifyInstance } from 'fastify';
import { MockAgent } from 'undici';
import { buildApp } from '../../../src/app';
import type { AppDatabase } from '../../../src/db/client';
import { createInstance } from '../../../src/modules/instances/instances';
import { applyServicePatch } from '../../../src/modules/services/config';
import { TestBrowser, UNUSED_DATA_DIR, createTestDatabase, createUser } from '../../helpers';
import { EMAIL, PASSWORD, noDns } from '../movies/radarr-env';

export const BAZARR_ORIGIN = 'http://bazarr.test:6767';

export interface BazarrCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}
type Responder = (call: BazarrCall) => { status: number; body?: unknown };

export function fakeBazarr(agent: MockAgent, origin = BAZARR_ORIGIN) {
  const calls: BazarrCall[] = [];
  const routes = new Map<string, Responder>();
  agent
    .get(origin)
    .intercept({ path: () => true, method: () => true })
    .reply((options) => {
      const url = new URL(options.path, origin);
      const raw = typeof options.body === 'string' ? options.body : '';
      let body: unknown;
      if (raw !== '') {
        try {
          body = JSON.parse(raw) as unknown;
        } catch {
          body = Object.fromEntries(new URLSearchParams(raw));
        }
      }
      const headers = Object.fromEntries(
        Object.entries((options.headers ?? {}) as Record<string, string>).map(([k, v]) => [
          k.toLowerCase(),
          v,
        ]),
      );
      const call = {
        method: options.method,
        path: url.pathname,
        query: url.searchParams,
        body,
        headers,
      };
      calls.push(call);
      const responder = routes.get(`${call.method} ${call.path}`);
      const response = responder ? responder(call) : { status: 404, body: { message: 'NotFound' } };
      return {
        statusCode: response.status,
        data: response.body === undefined ? '' : JSON.stringify(response.body),
        responseOptions: { headers: { 'content-type': 'application/json' } },
      };
    })
    .persist();
  return {
    calls,
    on(method: string, path: string, body?: unknown, status = 200) {
      routes.set(`${method} ${path}`, () => ({ status, body }));
    },
    onCall(method: string, path: string, responder: Responder) {
      routes.set(`${method} ${path}`, responder);
    },
    callsTo(method: string, path: string) {
      return calls.filter((call) => call.method === method && call.path === path);
    },
  };
}
export type FakeBazarr = ReturnType<typeof fakeBazarr>;

export interface BazarrEnv {
  database: AppDatabase;
  agent: MockAgent;
  app: FastifyInstance;
  browser: TestBrowser;
  bazarr: FakeBazarr;
  url(path?: string): string;
  close(): Promise<void>;
}

export async function bazarrEnv(
  options: { role?: 'admin' | 'user'; configured?: boolean; instances?: number } = {},
): Promise<BazarrEnv> {
  const database = await createTestDatabase();
  const agent = new MockAgent();
  agent.disableNetConnect();
  const bazarr = fakeBazarr(agent);
  const app = buildApp({ database, dataDir: UNUSED_DATA_DIR, dispatcher: agent, ...noDns });
  await createUser(database, { email: EMAIL, password: PASSWORD, role: options.role ?? 'admin' });
  if (options.configured !== false) {
    applyServicePatch(database.db, 'bazarr', { url: BAZARR_ORIGIN, apiKey: 'bazarr-key' });
  }
  for (let i = 0; i < (options.instances ?? 1); i += 1) {
    await createInstance(
      database.db,
      'radarr',
      { name: `Films ${i}`, url: `http://radarr${i}.test`, apiKey: 'k' },
      noDns,
    );
    await createInstance(
      database.db,
      'sonarr',
      { name: `Séries ${i}`, url: `http://sonarr${i}.test`, apiKey: 'k' },
      noDns,
    );
  }
  const browser = new TestBrowser(() => app);
  const login = await browser.login({ email: EMAIL, password: PASSWORD });
  if (login.statusCode !== 200) throw new Error(`connexion refusée (${login.statusCode})`);
  return {
    database,
    agent,
    app,
    browser,
    bazarr,
    url: (path = '') => `/api/bazarr${path}`,
    async close() {
      await app.close();
      await agent.close();
    },
  };
}

/** Film Bazarr brut (`/api/movies`). */
export function bazarrMovie(radarrId: number, overrides: Record<string, unknown> = {}) {
  return {
    radarrId,
    title: `Movie ${radarrId}`,
    year: 2020,
    profileId: 1,
    subtitles: [{ code2: 'en', name: 'English', hi: false, forced: false }],
    missing_subtitles: [{ code2: 'fr', name: 'French' }],
    ...overrides,
  };
}

/** Série Bazarr brute (`/api/series`). */
export function bazarrSeries(sonarrSeriesId: number, overrides: Record<string, unknown> = {}) {
  return {
    sonarrSeriesId,
    title: `Series ${sonarrSeriesId}`,
    year: '2019',
    profileId: 1,
    episodeFileCount: 10,
    episodeMissingCount: 3,
    missing_subtitles: [{ code2: 'fr' }],
    ...overrides,
  };
}
