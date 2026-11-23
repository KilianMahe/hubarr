// SPDX-License-Identifier: AGPL-3.0-or-later
// Routes de la bibliothèque de films (`/api/medias/:slug/films…`, P2.3) : port de
// `MediaLibraryPageTest` (Radarr injoignable), plus le contrat de chaque route
// contre un Radarr simulé, et deux instances interrogées en parallèle.

import type {
  ArrConfigResponse,
  FilteredIdsResponse,
  LibraryWarningsResponse,
  MovieLibraryResponse,
} from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app';
import { libraryKey } from '../../../src/cache';
import type { AppDatabase } from '../../../src/db/client';
import { createInstance, type InstanceRow } from '../../../src/modules/instances/instances';
import { setSetting } from '../../../src/modules/settings/settings';
import { TestBrowser, UNUSED_DATA_DIR, createTestDatabase, createUser } from '../../helpers';

const EMAIL = 'admin@example.com';
const PASSWORD = 'password-1';
const noDns = { resolve: () => Promise.resolve<string[]>([]) };

interface Call {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

/** Radarr simulé sur une origine : réponses par « MÉTHODE chemin », appels enregistrés. */
function fakeRadarr(agent: MockAgent, origin: string) {
  const calls: Call[] = [];
  const routes = new Map<string, (call: Call) => { status: number; body?: unknown }>();
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
    callsTo(method: string, path: string) {
      return calls.filter((call) => call.method === method && call.path === path);
    },
  };
}

/** Film Radarr brut (`/api/v3/movie`), avec ce qu'il faut pour la normalisation. */
function rawMovie(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Movie ${id}`,
    sortTitle: `movie ${id}`,
    year: 2000 + id,
    monitored: true,
    hasFile: false,
    status: 'released',
    added: `2024-01-${String(id).padStart(2, '0')}T00:00:00Z`,
    genres: [],
    images: [],
    tags: [],
    sizeOnDisk: 0,
    ...overrides,
  };
}

let database: AppDatabase;
let agent: MockAgent;
let app: FastifyInstance;
let browser: TestBrowser;
let radarr: ReturnType<typeof fakeRadarr>;
let instance: InstanceRow;

beforeEach(async () => {
  database = await createTestDatabase();
  agent = new MockAgent();
  agent.disableNetConnect();
  radarr = fakeRadarr(agent, 'http://radarr.test');
  app = buildApp({ database, dataDir: UNUSED_DATA_DIR, dispatcher: agent, ...noDns });
  await createUser(database, { email: EMAIL, password: PASSWORD });
  instance = await createInstance(
    database.db,
    'radarr',
    { name: 'Films', url: 'http://radarr.test', apiKey: 'k' },
    noDns,
  );
  browser = new TestBrowser(() => app);
  expect((await browser.login({ email: EMAIL, password: PASSWORD })).statusCode).toBe(200);
});
afterEach(async () => {
  await app.close();
  await agent.close();
});

const url = (path = '') => `/api/medias/${instance.slug}/films${path}`;

describe('accès', () => {
  it('réservé aux admins, et 404 pour un slug inconnu', async () => {
    await createUser(database, { email: 'user@example.com', password: PASSWORD, role: 'user' });
    const user = new TestBrowser(() => app);
    await user.login({ email: 'user@example.com', password: PASSWORD });
    expect((await user.get(url())).statusCode).toBe(403);
    expect((await new TestBrowser(() => app).get(url())).statusCode).toBe(401);
    expect((await browser.get('/api/medias/inconnu/films')).statusCode).toBe(404);
  });

  it('Radarr injoignable : 503 propre, jamais 500 (MediaLibraryPageTest)', async () => {
    agent
      .get('http://down.test')
      .intercept({ path: () => true, method: () => true })
      .replyWithError(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))
      .persist();
    const down = await createInstance(
      database.db,
      'radarr',
      { name: 'En panne', url: 'http://down.test', apiKey: 'k' },
      noDns,
    );
    const response = await browser.get(`/api/medias/${down.slug}/films`);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'SERVICE_UNREACHABLE', service: 'radarr' });
  });
});

describe('GET /api/medias/:slug/films', () => {
  beforeEach(() => {
    radarr.on('GET', '/api/v3/movie', [
      rawMovie(1, {
        title: 'The Matrix',
        hasFile: true,
        genres: ['Action'],
        movieFile: { quality: { quality: { name: 'Bluray-1080p' } }, size: 2_147_483_648 },
        sizeOnDisk: 2_147_483_648,
      }),
      rawMovie(2, { title: 'Inception', genres: ['Sci-Fi'] }),
      rawMovie(3, { title: 'Amélie', monitored: false, genres: ['Comedy'] }),
      { title: 'Sans id' },
    ]);
  });

  it('page filtrée, facettes et statistiques sur toute la bibliothèque', async () => {
    const response = await browser.get(url('?status=missing'));
    expect(response.statusCode).toBe(200);
    const body = response.json<MovieLibraryResponse>();
    expect(body.items.map((item) => item.id)).toEqual([2]);
    expect(body.total).toBe(1);
    // Le film sans id est écarté de la liste.
    expect(body.libraryTotal).toBe(3);
    expect(body.facets.genres).toEqual(['Action', 'Comedy', 'Sci-Fi']);
    expect(body.facets.qualities).toEqual(['Bluray-1080p']);
    expect(body.stats).toEqual({ total: 3, downloaded: 1, waiting: 1, totalGb: 2 });
    expect(body.query).toMatchObject({ status: 'missing', page: 1, perPage: 200 });
    // Champs réduits : pas de titres alternatifs ni d'infos de fichier.
    expect(body.items[0]).not.toHaveProperty('alternateTitles');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('taille de page par défaut = préférence d’affichage ; `open` choisit la page', async () => {
    setSetting(database.db, 'display_page_size', '50');
    const movies = Array.from({ length: 120 }, (_, index) =>
      rawMovie(index + 1, { title: `m${String(index + 1).padStart(3, '0')}` }),
    );
    radarr.on('GET', '/api/v3/movie', movies);
    const body = (await browser.get(url('?open=110'))).json<MovieLibraryResponse>();
    expect(body.perPage).toBe(50);
    expect(body.page).toBe(3);
    expect(body.totalPages).toBe(3);
    expect(body.items.some((item) => item.id === 110)).toBe(true);
  });

  it('la bibliothèque est servie depuis le cache entre deux lectures', async () => {
    await browser.get(url());
    await browser.get(url('?q=matrix'));
    expect(radarr.callsTo('GET', '/api/v3/movie')).toHaveLength(1);
    expect(app.cache.swr.read(libraryKey('movies', instance.slug), 60_000)).not.toBeNull();
  });
});

describe('performance (critère de P2)', () => {
  it('5 000 films en cache chaud : filtre, tri et page servis sous 300 ms', async () => {
    const genres = ['Action', 'Drama', 'Comedy', 'Sci-Fi', 'Horror'];
    radarr.on(
      'GET',
      '/api/v3/movie',
      Array.from({ length: 5_000 }, (_, index) =>
        rawMovie(index + 1, {
          title: `Film ${index + 1}`,
          hasFile: index % 3 === 0,
          genres: [genres[index % genres.length]],
          sizeOnDisk: index * 1_000_000,
        }),
      ),
    );
    await browser.get(url()); // cache chaud
    const started = performance.now();
    const response = await browser.get(url('?status=missing&genre=Drama&sort=size-desc&page=2'));
    const elapsed = performance.now() - started;
    expect(response.statusCode).toBe(200);
    expect(response.json<MovieLibraryResponse>().libraryTotal).toBe(5_000);
    expect(elapsed).toBeLessThan(300);
  });
});

describe('GET /api/medias/:slug/films/warnings', () => {
  it('indexeurs actifs, santé et imports bloqués', async () => {
    radarr.on('GET', '/api/v3/indexer', [
      { id: 1, enableAutomaticSearch: false, enableInteractiveSearch: false },
    ]);
    radarr.on('GET', '/api/v3/health', [{ source: 'IndexerCheck', message: 'Aucun indexeur' }]);
    radarr.on('GET', '/api/v3/queue', {
      records: [
        { id: 7, title: 'A', trackedDownloadState: 'importBlocked' },
        { id: 8, title: 'B', trackedDownloadState: 'downloading' },
      ],
    });
    const body = (await browser.get(url('/warnings'))).json<LibraryWarningsResponse>();
    expect(body.indexerCount).toBe(0);
    expect(body.warnings).toEqual([
      { code: 'no_indexer' },
      { code: 'health', source: 'IndexerCheck', message: 'Aucun indexeur' },
      { code: 'import_blocked', count: 1 },
    ]);
  });

  it('rien à signaler', async () => {
    radarr.on('GET', '/api/v3/indexer', [{ id: 1, enableInteractiveSearch: true }]);
    radarr.on('GET', '/api/v3/health', []);
    radarr.on('GET', '/api/v3/queue', { records: [] });
    expect((await browser.get(url('/warnings'))).json()).toEqual({
      warnings: [],
      indexerCount: 1,
    });
  });
});

describe('GET /api/medias/:slug/films/filter/ids', () => {
  beforeEach(() => {
    radarr.on('GET', '/api/v3/movie', [
      rawMovie(1, { hasFile: true, genres: ['Action'] }),
      rawMovie(2, { genres: ['Action'] }),
      rawMovie(3, { monitored: false, genres: ['Action'] }),
      rawMovie(4, { genres: ['Drama'] }),
    ]);
  });

  it('ids de tout le filtre, sans pagination', async () => {
    const body = (
      await browser.get(url('/filter/ids?genre=Action&per_page=50&page=9'))
    ).json<FilteredIdsResponse>();
    expect(body).toEqual({ ids: [1, 2, 3], total: 3 });
  });

  it('`searchable_only` : seulement les films suivis sans fichier', async () => {
    const body = (
      await browser.get(url('/filter/ids?genre=Action&searchable_only=1'))
    ).json<FilteredIdsResponse>();
    expect(body).toEqual({ ids: [2], total: 1 });
  });
});

describe('actions en masse', () => {
  it('actualiser et rechercher lancent la commande avec les ids', async () => {
    radarr.on('POST', '/api/v3/command', { id: 55, name: 'RefreshMovie' }, 201);
    const refresh = await browser.post(url('/bulk/refresh'), { movieIds: [1, 2] });
    expect(refresh.json()).toEqual({ ok: true, cmdId: 55 });
    const search = await browser.post(url('/bulk/search'), { movieIds: [3] });
    expect(search.statusCode).toBe(200);
    expect(radarr.callsTo('POST', '/api/v3/command').map((call) => call.body)).toEqual([
      { movieIds: [1, 2], name: 'RefreshMovie' },
      { movieIds: [3], name: 'MoviesSearch' },
    ]);
  });

  it('sélection vide : 400 avec la clé de l’original', async () => {
    const response = await browser.post(url('/bulk/refresh'), { movieIds: [] });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'VALIDATION',
      details: [{ message: 'media.api.no_movies_selected' }],
    });
  });

  it('modifier : seuls les champs fournis partent, puis le cache est invalidé', async () => {
    radarr.on('GET', '/api/v3/movie', [rawMovie(1)]);
    radarr.on('PUT', '/api/v3/movie/editor', [], 202);
    await browser.get(url());
    const response = await browser.post(url('/bulk/edit'), {
      movieIds: [1, 2],
      monitored: false,
      tags: [4],
      applyTags: 'remove',
    });
    expect(response.json()).toEqual({ ok: true });
    expect(radarr.callsTo('PUT', '/api/v3/movie/editor')[0]?.body).toEqual({
      monitored: false,
      tags: [4],
      applyTags: 'remove',
      movieIds: [1, 2],
    });
    expect(app.cache.swr.read(libraryKey('movies', instance.slug), 60_000)).toBeNull();
  });

  it('supprimer : options transmises, cache invalidé ; une erreur de Radarr → 502', async () => {
    radarr.on('GET', '/api/v3/movie', [rawMovie(1)]);
    radarr.on('DELETE', '/api/v3/movie/editor', undefined, 200);
    await browser.get(url());
    const response = await browser.post(url('/bulk/delete'), {
      movieIds: [1],
      deleteFiles: true,
    });
    expect(response.json()).toEqual({ ok: true });
    expect(radarr.callsTo('DELETE', '/api/v3/movie/editor')[0]?.body).toEqual({
      movieIds: [1],
      deleteFiles: true,
      addImportExclusion: false,
    });
    expect(app.cache.swr.read(libraryKey('movies', instance.slug), 60_000)).toBeNull();

    radarr.on('DELETE', '/api/v3/movie/editor', { message: 'boom' }, 500);
    const failed = await browser.post(url('/bulk/delete'), { movieIds: [1] });
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toMatchObject({ code: 'UPSTREAM_ERROR', service: 'radarr' });
  });

  it('refuse une mutation sans jeton CSRF', async () => {
    browser.csrf = undefined;
    expect((await browser.post(url('/bulk/refresh'), { movieIds: [1] })).statusCode).toBe(403);
  });
});

describe('commandes', () => {
  it('tout actualiser et synchro RSS renvoient l’id de la commande', async () => {
    radarr.on('POST', '/api/v3/command', { id: 9 }, 201);
    expect((await browser.post(url('/command/refresh-all'))).json()).toEqual({
      ok: true,
      cmdId: 9,
    });
    expect((await browser.post(url('/command/rss-sync'))).json()).toEqual({ ok: true, cmdId: 9 });
    expect(radarr.callsTo('POST', '/api/v3/command').map((call) => call.body)).toEqual([
      { name: 'RefreshMovie' },
      { name: 'RssSync' },
    ]);
  });

  it('état d’une commande ; commande purgée → `unknown`', async () => {
    radarr.on('GET', '/api/v3/command/9', {
      id: 9,
      name: 'MoviesSearch',
      status: 'started',
      message: 'Searching indexers for [Dune]',
      queued: '2026-11-18T10:00:00Z',
      started: '2026-11-18T10:00:01Z',
      ended: null,
      body: { movieIds: [1] },
    });
    expect((await browser.get(url('/command/9'))).json()).toEqual({
      id: 9,
      name: 'MoviesSearch',
      status: 'started',
      message: 'Searching indexers for [Dune]',
      queued: '2026-11-18T10:00:00Z',
      started: '2026-11-18T10:00:01Z',
      ended: null,
    });
    expect((await browser.get(url('/command/10'))).json()).toMatchObject({
      id: 10,
      status: 'unknown',
    });
  });
});

describe('configuration de l’instance', () => {
  it('profils, dossiers racine, étiquettes et profil par défaut', async () => {
    radarr.on('GET', '/api/v3/qualityprofile', [{ id: 4, name: 'HD-1080p', items: [] }]);
    radarr.on('GET', '/api/v3/rootfolder', [
      { id: 1, path: '/movies', accessible: true, freeSpace: 1000, unmappedFolders: [] },
    ]);
    radarr.on('GET', '/api/v3/tag', [{ id: 2, label: 'kids' }]);
    expect((await browser.get(url('/quality-profiles'))).json()).toEqual([
      { id: 4, name: 'HD-1080p' },
    ]);
    expect((await browser.get(url('/root-folders'))).json()).toEqual([
      { id: 1, path: '/movies', accessible: true, freeSpace: 1000 },
    ]);
    const config = (await browser.get(url('/config'))).json<ArrConfigResponse>();
    expect(config).toEqual({
      qualityProfiles: [{ id: 4, name: 'HD-1080p' }],
      rootFolders: [{ id: 1, path: '/movies', accessible: true, freeSpace: 1000 }],
      tags: [{ id: 2, label: 'kids' }],
      defaultQualityProfileId: null,
    });
  });
});

describe('deux instances', () => {
  it('chaque slug interroge son instance et garde sa propre bibliothèque', async () => {
    const other = fakeRadarr(agent, 'http://radarr4k.test');
    const second = await createInstance(
      database.db,
      'radarr',
      { name: 'Films 4K', url: 'http://radarr4k.test', apiKey: 'k2' },
      noDns,
    );
    radarr.on('GET', '/api/v3/movie', [rawMovie(1, { title: 'HD' })]);
    other.on('GET', '/api/v3/movie', [rawMovie(2, { title: 'UHD' }), rawMovie(3)]);

    const [first, fourK] = await Promise.all([
      browser.get(url()),
      browser.get(`/api/medias/${second.slug}/films`),
    ]);
    expect(first.json<MovieLibraryResponse>().items.map((item) => item.title)).toEqual(['HD']);
    expect(fourK.json<MovieLibraryResponse>().libraryTotal).toBe(2);
    expect(radarr.callsTo('GET', '/api/v3/movie')).toHaveLength(1);
    expect(other.callsTo('GET', '/api/v3/movie')).toHaveLength(1);
  });
});
