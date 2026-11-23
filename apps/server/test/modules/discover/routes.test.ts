// SPDX-License-Identifier: AGPL-3.0-or-later
// Routes de la découverte (P4.4) : garde TMDB, sections enrichies de l'état
// en bibliothèque, résolution pour l'ajout rapide (propriétaires sur toutes
// les instances, candidats), fiche détaillée, watchlist (`TmdbControllerTest`,
// `TmdbClientFailureCacheTest`, `TmdbClientRegionPriorityTest`).

import type { ResolvedMedia, TmdbDetail, TmdbPage, WatchlistItem } from '@hubarr/shared';
import { afterEach, describe, expect, it } from 'vitest';
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
