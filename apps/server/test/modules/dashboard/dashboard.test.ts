// SPDX-License-Identifier: AGPL-3.0-or-later
// Tableau de bord (P4.1) : port de `DashboardControllerTest` (bibliothèques
// du cache partagé marquées par instance, aperçus rapides TMDB et
// bibliothèque, pastilles de santé par instance, Transmission non configuré,
// mise en avant) ; cartes indépendantes et masquées sans service.

import type {
  DashboardHealth,
  DashboardHero,
  DashboardPage,
  DashboardRecent,
  DashboardRequests,
  DashboardTransmission,
  DashboardUpcoming,
  QuickLookDetail,
} from '@hubarr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { deleteInstance } from '../../../src/modules/instances/instances';
import { applyServicePatch } from '../../../src/modules/services/config';
import { saveDashboardLayout } from '../../../src/modules/settings/preferences';
import { calendarEpisode, mediaEnv, movie, series, type MediaEnv } from '../media-env';

let env: MediaEnv | undefined;
afterEach(async () => {
  await env?.close();
  env = undefined;
});

const fanart = (url: string) => [{ coverType: 'fanart', remoteUrl: url }];

describe('page', () => {
  it('mise en page, services utilisables et watchlist sans appel aux services', async () => {
    env = await mediaEnv({ role: 'user' });
    saveDashboardLayout(env.database.db, { order: ['recent', 'upcoming'], hidden: ['health'] });
    await env.browser.post('/api/decouverte/watchlist/toggle', {
      tmdbId: 1,
      type: 'tv',
      title: 'Show',
      posterPath: '/s.jpg',
    });
    const page = (await env.browser.get('/api/tableau-de-bord')).json<DashboardPage>();
    expect(page.layout.slice(0, 3)).toEqual([
      { key: 'recent', visible: true },
      { key: 'upcoming', visible: true },
      // Section ajoutée en P5d.1, après les sorties dans l'ordre par défaut.
      { key: 'queue', visible: true },
    ]);
    expect(page.layout.find((s) => s.key === 'health')?.visible).toBe(false);
    expect(page.configured).toMatchObject({
      radarr: true,
      sonarr: true,
      tmdb: true,
      seerr: false,
      emby: false,
    });
    expect(page.watchlist).toEqual([
      {
        tmdbId: 1,
        mediaType: 'tv',
        title: 'Show',
        poster: 'https://image.tmdb.org/t/p/w342/s.jpg',
        year: null,
        vote: null,
      },
    ]);
  });
});

describe('cartes', () => {
  it('prochaines sorties : 7 jours, sortie la plus proche, dédoublonnées entre instances', async () => {
    env = await mediaEnv();
    const shared = movie(1, {
      tmdbId: 603,
      inCinemas: '2026-09-01T00:00:00Z',
      physicalRelease: '2026-11-27T00:00:00Z',
      digitalRelease: '2026-11-24T00:00:00Z',
    });
    env.up.radarr.on('GET /api/v3/calendar', { body: [shared] });
    env.up.radarr4k.on('GET /api/v3/calendar', {
      body: [{ ...shared, id: 50 }, movie(2, { inCinemas: '2026-11-01T00:00:00Z' })],
    });
    env.up.sonarr.on('GET /api/v3/calendar', {
      body: [
        calendarEpisode(1),
        calendarEpisode(2, { airDate: '2026-12-05', airDateUtc: '2026-12-05T20:00:00Z' }),
      ],
    });
    const data = (
      await env.browser.get('/api/tableau-de-bord/widget/upcoming')
    ).json<DashboardUpcoming>();
    expect(data).toMatchObject({ available: true, today: '2026-11-22', days: 7 });
    expect(data.items).toEqual([
      expect.objectContaining({
        type: 'episode',
        day: '2026-11-23',
        episodeCode: 'S01E01',
        network: 'HBO',
      }),
      expect.objectContaining({
        type: 'movie',
        id: 1,
        day: '2026-11-24',
        releaseKind: 'digital',
        slug: env.radarr.slug,
      }),
    ]);
  });

  it('derniers ajouts : toutes instances, du plus récent au plus ancien', async () => {
    env = await mediaEnv();
    env.up.radarr.on('GET /api/v3/movie', {
      body: [movie(1, { added: '2026-11-01T00:00:00Z', hasFile: true })],
    });
    env.up.radarr4k.on('GET /api/v3/movie', {
      body: [movie(2, { added: '2026-11-10T00:00:00Z' })],
    });
    env.up.sonarr.on('GET /api/v3/series', {
      body: [series(3, { added: '2026-11-05T00:00:00Z', network: 'HBO' })],
    });
    const data = (
      await env.browser.get('/api/tableau-de-bord/widget/recent')
    ).json<DashboardRecent>();
    expect(data.items.map((i) => [i.type, i.id, i.slug])).toEqual([
      ['movie', 2, env.radarr4k.slug],
      ['series', 3, env.sonarr.slug],
      ['movie', 1, env.radarr.slug],
    ]);
    expect(data.items[2]?.downloaded).toBe(true);
  });

  it('affiches et fond TMDB ramenés à la taille affichée (P5d.1, V22)', async () => {
    env = await mediaEnv();
    const images = [
      { coverType: 'poster', remoteUrl: 'https://image.tmdb.org/t/p/original/p.jpg' },
      { coverType: 'fanart', remoteUrl: 'https://image.tmdb.org/t/p/original/f.jpg' },
    ];
    env.up.radarr.on('GET /api/v3/movie', { body: [movie(1, { images })] });
    env.up.radarr4k.on('GET /api/v3/movie', { body: [] });
    env.up.sonarr.on('GET /api/v3/series', {
      body: [
        series(3, {
          images: [{ coverType: 'poster', remoteUrl: 'https://artworks.thetvdb.com/p.jpg' }],
        }),
      ],
    });
    const recent = (
      await env.browser.get('/api/tableau-de-bord/widget/recent')
    ).json<DashboardRecent>();
    expect(recent.items.map((item) => item.poster)).toEqual(
      expect.arrayContaining([
        'https://image.tmdb.org/t/p/w342/p.jpg',
        // Hors TMDB : inchangée.
        'https://artworks.thetvdb.com/p.jpg',
      ]),
    );
    const hero = (await env.browser.get('/api/tableau-de-bord/widget/hero')).json<DashboardHero>();
    expect(hero.spotlight?.url).toBe('https://image.tmdb.org/t/p/w1280/f.jpg');
  });

  it('une carte en panne n’affecte pas les autres', async () => {
    env = await mediaEnv();
    env.up.radarr.on('GET /api/v3/movie', { status: 500, text: 'boom' });
    env.up.radarr4k.on('GET /api/v3/movie', { status: 500, text: 'boom' });
    env.up.sonarr.on('GET /api/v3/series', { body: [series(3)] });
    const recent = await env.browser.get('/api/tableau-de-bord/widget/recent');
    expect(recent.statusCode).toBe(200);
    expect(recent.json<DashboardRecent>().items.map((i) => i.type)).toEqual(['series']);
    const hero = (await env.browser.get('/api/tableau-de-bord/widget/hero')).json<DashboardHero>();
    expect(hero.stats).toEqual({ films: null, series: 1 });
  });

  it('cartes masquées sans service (bibliothèques, Seerr, TMDB, Transmission, Emby, activité)', async () => {
    env = await mediaEnv({ tmdb: false });
    for (const row of [env.radarr, env.radarr4k, env.sonarr]) deleteInstance(env.database.db, row);
    for (const card of ['recent', 'upcoming', 'requests', 'recommendations', 'emby', 'plex']) {
      const body = (await env.browser.get(`/api/tableau-de-bord/widget/${card}`)).json<{
        available: boolean;
      }>();
      expect(body.available, card).toBe(false);
    }
    const trs = (
      await env.browser.get('/api/tableau-de-bord/widget/transmission')
    ).json<DashboardTransmission>();
    expect(trs).toEqual({ available: false, error: false, stats: null, active: [] });
  });

  it('bandeau : film de la bibliothèque avec fanart, statistiques, sorties à 7 jours', async () => {
    env = await mediaEnv();
    env.up.radarr.on('GET /api/v3/movie', {
      body: [
        movie(1, {
          images: fanart('https://img/fan.jpg'),
          hasFile: true,
          genres: ['A', 'B', 'C', 'D'],
        }),
      ],
    });
    env.up.sonarr.on('GET /api/v3/series', { body: [series(1), series(2)] });
    env.up.sonarr.on('GET /api/v3/calendar', { body: [calendarEpisode(1)] });
    env.up.tmdb.on('GET /3/trending/all/week', { body: { results: [] } });
    const hero = (await env.browser.get('/api/tableau-de-bord/widget/hero')).json<DashboardHero>();
    expect(hero.spotlight).toMatchObject({
      source: 'library',
      url: 'https://img/fan.jpg',
      badge: 'in_library',
      genres: ['A', 'B', 'C'],
      ref: { kind: 'library', type: 'movie', slug: env.radarr.slug, id: 1 },
    });
    expect(hero.stats).toEqual({ films: 1, series: 2 });
    expect(hero.upcomingCount).toBe(1);
  });

  it('bandeau : à défaut, première tendance avec image de fond', async () => {
    env = await mediaEnv();
    env.up.tmdb.on('GET /3/trending/all/week', {
      body: {
        results: [
          { id: 1, media_type: 'tv', name: 'Sans fond' },
          {
            id: 2,
            media_type: 'tv',
            name: 'Show',
            backdrop_path: '/b.jpg',
            first_air_date: '2025-01-01',
          },
        ],
      },
    });
    const hero = (await env.browser.get('/api/tableau-de-bord/widget/hero')).json<DashboardHero>();
    expect(hero.spotlight).toMatchObject({
      source: 'tmdb',
      url: 'https://image.tmdb.org/t/p/w1280/b.jpg',
      year: 2025,
      badge: 'trending',
      ref: { kind: 'tmdb', type: 'tv', id: 2 },
    });
  });

  it('santé : une pastille par instance active, services non configurés absents', async () => {
    env = await mediaEnv();
    for (const id of ['radarr', 'radarr4k', 'sonarr'] as const)
      env.up[id].on('GET /api/v3/system/status', { body: {} });
    env.up.tmdb.on('GET /3/configuration', { body: {} });
    const health = (
      await env.browser.get('/api/tableau-de-bord/widget/health')
    ).json<DashboardHealth>();
    expect(health.chips.map((c) => [c.id, c.name, c.status])).toEqual([
      ['radarr', 'Films', 'up'],
      ['radarr', 'Films 4K', 'up'],
      ['sonarr', 'Séries', 'up'],
      ['tmdb', 'TMDb', 'up'],
    ]);
  });

  it('demandes Seerr en attente, enrichies par TMDB', async () => {
    env = await mediaEnv();
    applyServicePatch(env.database.db, 'seerr', { url: 'http://seerr.test', apiKey: 's' });
    env.up.seerr.on('GET /api/v1/request', (call) => {
      expect(call.query.get('filter')).toBe('pending');
      expect(call.query.get('take')).toBe('5');
      return {
        body: {
          results: [
            {
              id: 4,
              type: 'movie',
              media: { tmdbId: 603, mediaType: 'movie' },
              requestedBy: { displayName: 'Alice' },
              createdAt: '2026-11-20T10:00:00Z',
            },
            { id: 5, media: {} },
          ],
        },
      };
    });
    env.up.tmdb.on('GET /3/movie/603', {
      body: { id: 603, title: 'The Matrix', poster_path: '/m.jpg' },
    });
    const data = (
      await env.browser.get('/api/tableau-de-bord/widget/requests')
    ).json<DashboardRequests>();
    expect(data.items).toEqual([
      {
        id: 4,
        type: 'movie',
        tmdbId: 603,
        title: 'The Matrix',
        poster: 'https://image.tmdb.org/t/p/w185/m.jpg',
        requestedBy: 'Alice',
        requestedAt: '2026-11-20T10:00:00Z',
      },
    ]);
  });
});

describe('aperçu rapide', () => {
  it('bibliothèque : film de l’instance demandée, état et dates de sortie', async () => {
    env = await mediaEnv();
    env.up.radarr.on('GET /api/v3/movie', {
      body: [movie(7, { title: 'Ailleurs', hasFile: false })],
    });
    env.up.radarr4k.on('GET /api/v3/movie', {
      body: [
        movie(7, {
          title: 'Ici',
          runtime: 120,
          inCinemas: '2026-01-01T00:00:00Z',
          digitalRelease: '2026-12-01T00:00:00Z',
          hasFile: true,
        }),
      ],
    });
    const ql = (
      await env.browser.get(`/api/tableau-de-bord/quicklook/movie/${env.radarr4k.slug}/7`)
    ).json<QuickLookDetail>();
    expect(ql).toMatchObject({
      title: 'Ici',
      runtime: 120,
      status: 'downloaded',
      radarrId: 7,
      action: { kind: 'manage', type: 'movie', slug: env.radarr4k.slug, id: 7 },
      releaseDates: [
        { kind: 'cinema', date: '2026-01-01', upcoming: false },
        { kind: 'digital', date: '2026-12-01', upcoming: true },
      ],
    });
    expect(
      (await env.browser.get(`/api/tableau-de-bord/quicklook/series/${env.sonarr.slug}/999`))
        .statusCode,
    ).toBe(404);
  });

  it('bibliothèque : série terminée → date de fin', async () => {
    env = await mediaEnv();
    env.up.sonarr.on('GET /api/v3/series', {
      body: [
        series(1, {
          status: 'ended',
          ended: true,
          firstAired: '2010-01-01T00:00:00Z',
          previousAiring: '2015-06-01T00:00:00Z',
          network: 'AMC',
        }),
      ],
    });
    const ql = (
      await env.browser.get(`/api/tableau-de-bord/quicklook/series/${env.sonarr.slug}/1`)
    ).json<QuickLookDetail>();
    expect(ql).toMatchObject({
      airStatus: 'ended',
      network: 'AMC',
      sonarrId: 1,
      status: 'monitored',
    });
    expect(ql.releaseDates.map((c) => c.kind)).toEqual(['first_aired', 'ended']);
  });

  it('TMDB : « Gérer » si le titre est dans une bibliothèque, sinon « Découvrir » ; extras', async () => {
    env = await mediaEnv();
    env.up.radarr4k.on('GET /api/v3/movie', { body: [movie(9, { tmdbId: 603, hasFile: true })] });
    env.up.tmdb.on('GET /3/movie/603', {
      body: {
        id: 603,
        title: 'The Matrix',
        release_date: '1999-03-30',
        runtime: 136,
        imdb_id: 'tt0133093',
        credits: { cast: [{ name: 'Keanu', profile_path: '/k.jpg' }] },
        videos: { results: [{ site: 'YouTube', key: 'abc', type: 'Trailer', official: true }] },
        'watch/providers': {
          results: { US: { flatrate: [{ provider_name: 'Max', logo_path: '/max.png' }] } },
        },
        release_dates: {
          results: [
            {
              iso_3166_1: 'US',
              release_dates: [
                { type: 3, release_date: '1999-03-31T00:00:00.000Z' },
                { type: 4, release_date: '2027-01-01T00:00:00.000Z' },
              ],
            },
          ],
        },
      },
    });
    env.up.tmdb.on('GET /3/tv/1399', {
      body: {
        id: 1399,
        name: 'GoT',
        status: 'Ended',
        number_of_seasons: 8,
        networks: [{ name: 'HBO' }],
      },
    });
    const movieQl = (
      await env.browser.get('/api/tableau-de-bord/quicklook/tmdb/movie/603')
    ).json<QuickLookDetail>();
    expect(movieQl).toMatchObject({
      year: 1999,
      runtime: 136,
      status: 'downloaded',
      inLibrary: true,
      radarrId: 9,
      action: { kind: 'manage', type: 'movie', slug: env.radarr4k.slug, id: 9 },
      cast: [{ name: 'Keanu', profile: 'https://image.tmdb.org/t/p/w185/k.jpg' }],
      providers: [{ name: 'Max', logo: 'https://image.tmdb.org/t/p/w92/max.png' }],
      trailerKey: 'abc',
      imdbId: 'tt0133093',
      releaseDates: [
        { kind: 'cinema', date: '1999-03-31', upcoming: false },
        { kind: 'digital', date: '2027-01-01', upcoming: true },
      ],
    });
    const tvQl = (
      await env.browser.get('/api/tableau-de-bord/quicklook/tmdb/tv/1399')
    ).json<QuickLookDetail>();
    expect(tvQl).toMatchObject({
      network: 'HBO',
      seasons: 8,
      airStatus: 'ended',
      inLibrary: false,
      status: null,
      action: { kind: 'discover', type: 'tv', id: 1399 },
    });
    expect((await env.browser.get('/api/tableau-de-bord/quicklook/tmdb/movie/1')).statusCode).toBe(
      404,
    );
  });
});
