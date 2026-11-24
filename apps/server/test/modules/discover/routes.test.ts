// SPDX-License-Identifier: AGPL-3.0-or-later
// Routes de la découverte (P4.4) : garde TMDB, sections enrichies de l'état
// en bibliothèque, résolution pour l'ajout rapide (propriétaires sur toutes
// les instances, candidats), fiche détaillée, watchlist (`TmdbControllerTest`,
// `TmdbClientFailureCacheTest`, `TmdbClientRegionPriorityTest`).

import type {
  FolderSuggestions,
  PopularByYear,
  ResolvedMedia,
  TmdbDetail,
  TmdbPage,
  TmdbSuggestions,
  WatchedSuggestions,
  WatchlistItem,
} from '@hubarr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { tracearrWatch, users } from '../../../src/db/schema';
import { regionPriority } from '../../../src/integrations/tmdb/client';
import { applyServicePatch } from '../../../src/modules/services/config';
import { mediaEnv, movie, series, type MediaEnv } from '../media-env';

let env: MediaEnv | undefined;
afterEach(async () => {
  await env?.close();
  env = undefined;
});

const tmdbPage = (results: unknown[], totalPages = 1) => ({
  body: { page: 1, total_pages: totalPages, total_results: results.length, results },
});

describe('priorité des régions TMDB', () => {
  it('langue, région explicite, chaîne commune, pays de la réponse sans doublon', () => {
    expect(regionPriority('fr')[0]).toBe('FR');
    expect(regionPriority('en').slice(0, 2)).toEqual(['US', 'GB']);
    expect(regionPriority('en_US')[0]).toBe('US');
    expect(regionPriority('fr-FR')[0]).toBe('FR');
    expect(regionPriority('en_GB')[0]).toBe('GB');
    expect(regionPriority('fr-CA')[0]).toBe('CA');
    expect(regionPriority('pt_BR')[0]).toBe('BR');
    // Une langue n'est jamais prise pour un pays (« sv » n'est pas le Salvador).
    expect(regionPriority('sv')[0]).toBe('FR');
    expect(regionPriority('sv')).not.toContain('SV');
    const order = regionPriority('fr', ['JP', 'FR', 'DE']);
    expect(order).toContain('JP');
    expect(new Set(order).size).toBe(order.length);
    expect(regionPriority('')).not.toContain('');
  });
});

describe('garde et sections', () => {
  it('TMDB non configuré → 409', async () => {
    env = await mediaEnv({ tmdb: false });
    expect((await env.browser.get('/api/decouverte/section/trending')).statusCode).toBe(409);
    expect((await env.browser.get('/api/decouverte/watchlist/status')).statusCode).toBe(409);
  });

  it('section paginée, état en bibliothèque sur toutes les instances, utilisateur simple autorisé', async () => {
    env = await mediaEnv({ role: 'user' });
    env.up.radarr4k.on('GET /api/v3/movie', { body: [movie(1, { tmdbId: 603, hasFile: true })] });
    env.up.sonarr.on('GET /api/v3/series', { body: [series(1, { tmdbId: 1399 })] });
    env.up.tmdb.on('GET /3/movie/popular', (call) => {
      expect(call.query.get('page')).toBe('2');
      expect(call.query.get('api_key')).toBe('tmdb-key');
      expect(call.query.get('language')).toBe('en-US');
      return tmdbPage(
        [
          {
            id: 603,
            title: 'The Matrix',
            release_date: '1999-03-30',
            poster_path: '/m.jpg',
            vote_average: 8.24,
          },
        ],
        9,
      );
    });
    const page = (
      await env.browser.get('/api/decouverte/section/popular-movies?page=2')
    ).json<TmdbPage>();
    expect(page.totalPages).toBe(9);
    expect(page.results[0]).toMatchObject({
      id: 603,
      type: 'movie',
      year: 1999,
      vote: 8.2,
      poster: 'https://image.tmdb.org/t/p/w342/m.jpg',
      inLibrary: true,
      libStatus: 'downloaded',
      libSlug: env.radarr4k.slug,
    });
    expect((await env.browser.get('/api/decouverte/section/bogus')).statusCode).toBe(400);
  });

  it('un appel TMDB en échec n’est pas gardé en cache ; un succès l’est', async () => {
    env = await mediaEnv();
    let calls = 0;
    env.up.tmdb.on('GET /3/genre/movie/list', () => {
      calls += 1;
      return calls === 1
        ? { status: 500, text: 'boom' }
        : { body: { genres: [{ id: 28, name: 'Action' }] } };
    });
    expect((await env.browser.get('/api/decouverte/genres/movie')).json()).toEqual({ genres: [] });
    expect((await env.browser.get('/api/decouverte/genres/movie')).json()).toEqual({
      genres: [{ id: 28, name: 'Action' }],
    });
    await env.browser.get('/api/decouverte/genres/movie');
    expect(calls).toBe(2);
  });
});

describe('résolution pour l’ajout rapide', () => {
  it('film : propriétaires de toutes les instances et candidats', async () => {
    env = await mediaEnv();
    env.up.radarr.on('GET /api/v3/movie', { body: [movie(7, { tmdbId: 603, hasFile: true })] });
    env.up.radarr4k.on('GET /api/v3/movie', {
      body: [movie(9, { tmdbId: 603, monitored: false })],
    });
    env.up.tmdb.on('GET /3/movie/603', {
      body: { id: 603, title: 'The Matrix', release_date: '1999-03-30' },
    });
    const resolved = (
      await env.browser.get('/api/decouverte/resolve/movie/603')
    ).json<ResolvedMedia>();
    expect(resolved).toMatchObject({ type: 'film', tmdbId: 603, year: 1999, inLibrary: true });
    expect(resolved.instances).toEqual([
      { slug: env.radarr.slug, name: 'Films', id: 7, status: 'downloaded' },
      { slug: env.radarr4k.slug, name: 'Films 4K', id: 9, status: 'unmonitored' },
    ]);
    expect(resolved.candidates.map((c) => c.slug)).toEqual([env.radarr.slug, env.radarr4k.slug]);
  });

  it('série : id TheTVDB exigé (422), anime détecté', async () => {
    env = await mediaEnv();
    env.up.tmdb.on('GET /3/tv/1', { body: { id: 1, name: 'Sans TVDB', external_ids: {} } });
    const missing = await env.browser.get('/api/decouverte/resolve/tv/1');
    expect(missing.statusCode).toBe(422);
    expect(missing.json()).toMatchObject({
      code: 'VALIDATION',
      details: [{ message: 'decouverte.error.not_found_thetvdb' }],
    });
    env.up.tmdb.on('GET /3/tv/2', {
      body: {
        id: 2,
        name: 'Anime',
        external_ids: { tvdb_id: 1001 },
        genres: [{ id: 16 }],
        origin_country: ['JP'],
        first_air_date: '2020-04-01',
      },
    });
    env.up.sonarr.on('GET /api/v3/series', { body: [series(1, { tmdbId: 0 })] });
    const resolved = (await env.browser.get('/api/decouverte/resolve/tv/2')).json<ResolvedMedia>();
    expect(resolved).toMatchObject({
      type: 'serie',
      id: 1001,
      tvdbId: 1001,
      seriesType: 'anime',
      inLibrary: true,
    });
    expect((await env.browser.get('/api/decouverte/resolve/movie/404')).statusCode).toBe(404);
  });
});

describe('fiche détaillée', () => {
  it('bande-annonce, équipe, plateformes et classification selon la langue', async () => {
    env = await mediaEnv();
    env.up.tmdb.on('GET /3/movie/27205', {
      body: {
        id: 27205,
        title: 'Inception',
        original_title: 'Inception',
        release_date: '2010-07-15',
        runtime: 148,
        genres: [{ id: 28, name: 'Action' }],
        videos: {
          results: [
            { site: 'YouTube', key: 'teaser', type: 'Teaser', official: true, iso_639_1: 'en' },
            { site: 'YouTube', key: 'trailer', type: 'Trailer', official: true, iso_639_1: 'en' },
            { site: 'Vimeo', key: 'x', type: 'Trailer' },
          ],
        },
        credits: {
          cast: [{ name: 'Leonardo', character: 'Cobb', profile_path: '/l.jpg' }],
          crew: [
            { job: 'Director', name: 'Christopher Nolan' },
            { job: 'Screenplay', name: 'Christopher Nolan' },
          ],
        },
        'watch/providers': {
          results: {
            FR: { flatrate: [{ provider_name: 'Canal' }] },
            US: { flatrate: [{ provider_name: 'Max' }] },
          },
        },
        release_dates: {
          results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] }],
        },
      },
    });
    env.up.tmdb.on('GET /3/movie/27205/similar', tmdbPage([{ id: 1, title: 'Interstellar' }]));
    const d = (await env.browser.get('/api/decouverte/detail/movie/27205')).json<TmdbDetail>();
    expect(d.trailer).toEqual({ key: 'trailer', name: 'Trailer' });
    expect(d.videoGallery.map((v) => v.key)).toEqual(['teaser']);
    expect(d.crew.directors).toEqual(['Christopher Nolan']);
    expect(d.crew.writers).toEqual(['Christopher Nolan']);
    // Langue des métadonnées par défaut en-US : les États-Unis d'abord.
    expect(d.providers?.country).toBe('US');
    expect(d.certification).toBe('[US] PG-13');
    expect(d.similar[0]).toMatchObject({ id: 1, type: 'movie' });
  });
});

describe('suggestions de la fiche', () => {
  it('recommandations puis similaires, marqués en bibliothèque, sans le titre ni doublon', async () => {
    env = await mediaEnv({ role: 'user' });
    env.up.sonarr.on('GET /api/v3/series', { body: [series(1, { tmdbId: 1399 }), series(2)] });
    env.up.tmdb.on(
      'GET /3/tv/1399/recommendations',
      tmdbPage([
        { id: 9002, name: 'Owned' },
        { id: 1399, name: 'Self' },
        { id: 66732, name: 'Stranger Things' },
      ]),
    );
    env.up.tmdb.on(
      'GET /3/tv/1399/similar',
      tmdbPage([
        { id: 66732, name: 'Stranger Things' },
        { id: 1396, name: 'Breaking Bad' },
      ]),
    );
    const s = (
      await env.browser.get('/api/decouverte/suggestions/tv/1399')
    ).json<TmdbSuggestions>();
    expect(s.recommendations.map((c) => c.id)).toEqual([9002, 66732]);
    expect(s.recommendations[0]).toMatchObject({
      type: 'tv',
      inLibrary: true,
      libId: 2,
      libSlug: env.sonarr.slug,
    });
    expect(s.recommendations[1]).toMatchObject({ inLibrary: false, libId: null });
    expect(s.similar.map((c) => c.id)).toEqual([1396]);
  });

  it('TMDB non configuré → 409', async () => {
    env = await mediaEnv({ tmdb: false });
    expect((await env.browser.get('/api/decouverte/suggestions/movie/603')).statusCode).toBe(409);
  });
});

describe('suggestions personnelles (lot 8)', () => {
  it('une rangée par dossier racine, pondérée, sans les titres possédés, calcul en cache', async () => {
    env = await mediaEnv({ role: 'user' });
    env.up.radarr.on('GET /api/v3/movie', {
      body: [
        movie(1, { tmdbId: 501, rootFolderPath: '/movies', added: '2024-01-01T00:00:00Z' }),
        movie(2, { tmdbId: 502, rootFolderPath: '/movies/', added: '2025-01-01T00:00:00Z' }),
        movie(3, { tmdbId: 503, rootFolderPath: null, path: '/kids/Film (2020)' }),
      ],
    });
    env.up.sonarr.on('GET /api/v3/series', {
      body: [series(1, { tmdbId: 1399, rootFolderPath: '/tv' })],
    });
    let calls = 0;
    env.up.tmdb.on('GET /3/movie/501/recommendations', () => {
      calls += 1;
      return tmdbPage([
        { id: 502, title: 'Possédé' },
        { id: 700, title: 'Une fois', vote_average: 9 },
        { id: 701, title: 'Deux fois' },
      ]);
    });
    env.up.tmdb.on('GET /3/movie/502/recommendations', tmdbPage([{ id: 701, title: 'Deux fois' }]));
    env.up.tmdb.on('GET /3/movie/503/recommendations', tmdbPage([{ id: 800, title: 'Enfants' }]));
    env.up.tmdb.on('GET /3/tv/1399/recommendations', tmdbPage([{ id: 66732, name: 'Série' }]));

    const first = (await env.browser.get('/api/decouverte/dossiers')).json<FolderSuggestions>();
    expect(
      first.folders.map((f) => [f.service, f.instance, f.label, f.results.map((c) => c.id)]),
    ).toEqual([
      ['radarr', 'Films', 'kids', [800]],
      ['radarr', 'Films', 'movies', [701, 700]],
      ['sonarr', 'Séries', 'tv', [66732]],
    ]);
    expect(first.folders[1]?.results[0]).toMatchObject({ type: 'movie', inLibrary: false });
    await env.browser.get('/api/decouverte/dossiers');
    expect(calls).toBe(1);
  });

  it('dossiers : TMDB non configuré → 409', async () => {
    env = await mediaEnv({ tmdb: false });
    expect((await env.browser.get('/api/decouverte/dossiers')).statusCode).toBe(409);
  });

  it('d’après les lectures récentes : sans les titres vus, les possédés marqués', async () => {
    env = await mediaEnv({ role: 'user' });
    const unlinked = (await env.browser.get('/api/decouverte/regardes')).json<WatchedSuggestions>();
    expect(unlinked).toEqual({ linked: false, seeds: 0, results: [] });

    const db = env.database.db;
    db.update(users).set({ tracearrUserId: 'u1' }).run();
    const play = (
      recordId: string,
      mediaType: 'movie' | 'episode',
      tmdbId: number,
      day: number,
      watched = true,
    ) => ({
      tracearrUserId: 'u1',
      recordId,
      mediaType,
      tmdbId,
      tvdbId: null,
      season: mediaType === 'episode' ? 1 : null,
      episode: mediaType === 'episode' ? day : null,
      watchedAt: new Date(Date.UTC(2026, 10, day)),
      percent: watched ? 100 : 10,
      watched,
    });
    db.insert(tracearrWatch)
      .values([
        play('m1', 'movie', 603, 20),
        play('e1', 'episode', 1399, 19),
        play('e2', 'episode', 1399, 18),
        play('m2', 'movie', 604, 21, false),
      ])
      .run();
    env.up.radarr.on('GET /api/v3/movie', { body: [movie(1, { tmdbId: 605, hasFile: true })] });
    env.up.tmdb.on(
      'GET /3/movie/603/recommendations',
      tmdbPage([
        { id: 603, title: 'Lui-même' },
        { id: 604, title: 'Commencé, pas vu' },
        { id: 605, title: 'Possédé' },
      ]),
    );
    env.up.tmdb.on(
      'GET /3/tv/1399/recommendations',
      tmdbPage([
        { id: 1399, name: 'Vue' },
        { id: 1396, name: 'Breaking Bad' },
      ]),
    );
    const s = (await env.browser.get('/api/decouverte/regardes')).json<WatchedSuggestions>();
    expect(s.linked).toBe(true);
    expect(s.seeds).toBe(2);
    expect(s.results.map((c) => `${c.type}_${c.id}`)).toEqual([
      'movie_604',
      'movie_605',
      'tv_1396',
    ]);
    expect(s.results[1]).toMatchObject({ inLibrary: true, libStatus: 'downloaded' });
  });

  it('populaires d’une année : films et séries triés par popularité, bornes de l’année', async () => {
    env = await mediaEnv({ role: 'user' });
    env.up.radarr.on('GET /api/v3/movie', { body: [movie(1, { tmdbId: 11, hasFile: true })] });
    env.up.tmdb.on('GET /3/discover/movie', (call) => {
      expect(call.query.get('primary_release_year')).toBe('2024');
      expect(call.query.get('sort_by')).toBe('popularity.desc');
      return tmdbPage([{ id: 11, title: 'Possédé', release_date: '2024-05-01' }]);
    });
    env.up.tmdb.on('GET /3/discover/tv', (call) => {
      expect(call.query.get('first_air_date_year')).toBe('2024');
      return tmdbPage([{ id: 22, name: 'Série 2024' }]);
    });
    const y = (await env.browser.get('/api/decouverte/annee/2024')).json<PopularByYear>();
    expect(y.year).toBe(2024);
    expect(y.movies[0]).toMatchObject({ id: 11, type: 'movie', year: 2024, inLibrary: true });
    expect(y.tv[0]).toMatchObject({ id: 22, type: 'tv', inLibrary: false });
    expect((await env.browser.get('/api/decouverte/annee/1800')).statusCode).toBe(400);
    const tooLate = new Date().getUTCFullYear() + 2;
    expect((await env.browser.get(`/api/decouverte/annee/${tooLate}`)).statusCode).toBe(400);
  });
});

describe('animés', () => {
  it('explorateur et recherche : genre Animation ajouté, langue originale japonaise', async () => {
    env = await mediaEnv({ role: 'user' });
    env.up.tmdb.on('GET /3/discover/tv', (call) => {
      expect(call.query.get('with_genres')).toBe('35,16');
      expect(call.query.get('with_original_language')).toBe('ja');
      return tmdbPage([{ id: 31, name: 'Animé', genre_ids: [16, 35], original_language: 'ja' }]);
    });
    const page = (
      await env.browser.get('/api/decouverte/filter?type=tv&genres=35&anime=1')
    ).json<TmdbPage>();
    expect(page.results.map((c) => c.id)).toEqual([31]);

    env.up.tmdb.on('GET /3/discover/movie', (call) => {
      expect(call.query.get('with_genres')).toBe('16');
      expect(call.query.get('with_original_language')).toBe('ja');
      return tmdbPage([{ id: 41, title: 'Film animé', genre_ids: [16], original_language: 'ja' }]);
    });
    env.up.tmdb.on('GET /3/discover/tv', (call) => {
      expect(call.query.get('with_genres')).toBe('16');
      return tmdbPage([]);
    });
    const browse = (await env.browser.get('/api/decouverte/recherche?anime=1')).json<{
      mode: string;
      results: { id: number }[];
    }>();
    expect(browse.mode).toBe('discover');
    expect(browse.results.map((c) => c.id)).toEqual([41]);

    // Recherche par texte : seuls les animés sont gardés.
    env.up.tmdb.on(
      'GET /3/search/multi',
      tmdbPage([
        { id: 51, media_type: 'tv', name: 'Naruto', genre_ids: [16], original_language: 'ja' },
        {
          id: 52,
          media_type: 'movie',
          title: 'Naruto US',
          genre_ids: [16],
          original_language: 'en',
        },
      ]),
    );
    const found = (
      await env.browser.get('/api/decouverte/recherche?q=naruto&anime=1&exact=1')
    ).json<{ best: { id: number } | null; results: { id: number }[] }>();
    const ids = [found.best?.id, ...found.results.map((c) => c.id)].filter(Boolean);
    expect(ids).toEqual([51]);
  });
});

describe('watchlist', () => {
  it('ajout, statut, notes, retrait (CSRF exigé), 404 sur un id inconnu', async () => {
    env = await mediaEnv({ role: 'user' });
    const toggle = {
      tmdbId: 603,
      type: 'movie',
      title: 'The Matrix',
      posterPath: '/m.jpg',
      vote: 8.2,
      year: 1999,
    };
    const added = await env.browser.post('/api/decouverte/watchlist/toggle', toggle);
    expect(added.json()).toMatchObject({ action: 'added', tmdbId: 603, type: 'movie' });
    const id = added.json<{ id: number }>().id;
    expect((await env.browser.get('/api/decouverte/watchlist/status')).json()).toEqual({
      keys: ['movie_603'],
    });

    expect(
      (await env.browser.post(`/api/decouverte/watchlist/notes/${id}`, { notes: 'À voir' }))
        .statusCode,
    ).toBe(200);
    const list = (await env.browser.get('/api/decouverte/watchlist')).json<{
      items: WatchlistItem[];
    }>();
    expect(list.items[0]).toMatchObject({
      tmdbId: 603,
      notes: 'À voir',
      poster: 'https://image.tmdb.org/t/p/w342/m.jpg',
      inLibrary: false,
    });

    expect(
      (await env.browser.post('/api/decouverte/watchlist/toggle', toggle)).json(),
    ).toMatchObject({ action: 'removed' });
    expect((await env.browser.post(`/api/decouverte/watchlist/remove/${id}`, {})).statusCode).toBe(
      404,
    );
    expect(
      (await env.browser.post('/api/decouverte/watchlist/toggle', { tmdbId: 0, type: 'movie' }))
        .statusCode,
    ).toBe(400);
    const csrf = env.browser.csrf;
    env.browser.csrf = undefined;
    expect((await env.browser.post('/api/decouverte/watchlist/toggle', toggle)).statusCode).toBe(
      403,
    );
    env.browser.csrf = csrf;
  });

  it('désactiver TMDB ferme aussi la watchlist (garde commune des routes tmdb_*)', async () => {
    env = await mediaEnv();
    applyServicePatch(env.database.db, 'tmdb', { enabled: false });
    expect((await env.browser.get('/api/decouverte/watchlist')).statusCode).toBe(409);
  });
});
