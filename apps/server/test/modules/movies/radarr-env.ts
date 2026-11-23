// SPDX-License-Identifier: AGPL-3.0-or-later
// Environnement de test des routes Radarr : application, admin connecté,
// instance « Films » sur un Radarr simulé (réponses par « MÉTHODE chemin »,
// appels enregistrés). Utilisé par les tests de P2.4 à P2.7.

import type { FastifyInstance } from 'fastify';
import { MockAgent } from 'undici';
import { buildApp } from '../../../src/app';
import { libraryKey } from '../../../src/cache';
import type { AppDatabase } from '../../../src/db/client';
import { createInstance, type InstanceRow } from '../../../src/modules/instances/instances';
import { TestBrowser, UNUSED_DATA_DIR, createTestDatabase, createUser } from '../../helpers';

export const EMAIL = 'admin@example.com';
export const PASSWORD = 'password-1';
export const noDns = { resolve: () => Promise.resolve<string[]>([]) };

export interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

type Responder = (call: Call) => { status: number; body?: unknown };

export function fakeRadarr(agent: MockAgent, origin: string) {
  const calls: Call[] = [];
  const routes = new Map<string, Responder>();
  agent
    .get(origin)
    .intercept({ path: () => true, method: () => true })
    .reply((options) => {
      const url = new URL(options.path, origin);
      const raw = typeof options.body === 'string' ? options.body : '';
      const call: Call = {
        method: options.method,
        path: url.pathname,
        query: url.searchParams,
        body: raw === '' ? undefined : (JSON.parse(raw) as unknown),
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
export type FakeRadarr = ReturnType<typeof fakeRadarr>;

/** Film Radarr brut (`/api/v3/movie`), avec ce qu'il faut pour la normalisation. */
export function rawMovie(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
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

export interface RadarrEnv {
  database: AppDatabase;
  agent: MockAgent;
  app: FastifyInstance;
  browser: TestBrowser;
  radarr: FakeRadarr;
  instance: InstanceRow;
  /** URL de l'API des films de l'instance (`/api/medias/<slug>/films<path>`). */
  url(path?: string): string;
  /** La bibliothèque de l'instance est-elle en cache ? */
  libraryCached(): boolean;
  close(): Promise<void>;
}

export async function radarrEnv(): Promise<RadarrEnv> {
  const database = await createTestDatabase();
  const agent = new MockAgent();
  agent.disableNetConnect();
  const radarr = fakeRadarr(agent, 'http://radarr.test');
  const app = buildApp({ database, dataDir: UNUSED_DATA_DIR, dispatcher: agent, ...noDns });
  await createUser(database, { email: EMAIL, password: PASSWORD });
  const instance = await createInstance(
    database.db,
    'radarr',
    { name: 'Films', url: 'http://radarr.test', apiKey: 'k' },
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
    radarr,
    instance,
    url: (path = '') => `/api/medias/${instance.slug}/films${path}`,
    libraryCached: () => app.cache.swr.read(libraryKey('movies', instance.slug), 60_000) !== null,
    async close() {
      await app.close();
      await agent.close();
    },
  };
}

/** Met la bibliothèque en cache (une lecture de la page). */
export async function warmLibrary(
  env: RadarrEnv,
  movies: unknown[] = [rawMovie(1)],
): Promise<void> {
  env.radarr.on('GET', '/api/v3/movie', movies);
  const response = await env.browser.get(env.url());
  if (response.statusCode !== 200) throw new Error(`bibliothèque : ${response.statusCode}`);
}
