// SPDX-License-Identifier: AGPL-3.0-or-later
// Découverte (P4.4), calendrier (P4.2) et recherche globale (P4.5) : logique
// pure et écrans montés (recherche avec correction, fiche par l'URL,
// watchlist, ajout rapide, calendrier et bannière, résultats de la barre du
// haut).

import type { BootstrapServices, CalendarEvent, OnlineSearchHit, TmdbCard } from '@hubarr/shared';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/app/plugins/i18n';
import {
  eventTitle,
  matchEvent,
  monthGrid,
  startOfWeek,
} from '../src/features/calendar/calendar-api';
import { countdownDays, parseDetail } from '../src/features/discover/discover-api';
import { posterPathOf } from '../src/features/discover/useWatchlist';
import { addRecentSearch, resolvedFromHit } from '../src/features/search/search';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settle, type FakeHandler } from './helpers';

beforeAll(async () => {
  await setLocale('en');
});
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = '';
});

const services: BootstrapServices = {
  states: {
    radarr: { configured: true, disabled: false },
    sonarr: { configured: true, disabled: false },
    tmdb: { configured: true, disabled: false },
  },
  instances: {
    radarr: [{ slug: 'films', name: 'Films', enabled: true, isDefault: true }],
    sonarr: [{ slug: 'tv', name: 'Séries', enabled: true, isDefault: true }],
  },
  sidebar: {},
};

function card(id: number, overrides: Partial<TmdbCard> = {}): TmdbCard {
  return {
    id,
    type: 'movie',
    title: `Movie ${id}`,
    year: 2020,
    release: '2020-01-01',
    overview: null,
    poster: null,
    posterHi: null,
    backdrop: null,
    vote: 7,
    voteCount: 100,
    popularity: 10,
    inLibrary: false,
    libStatus: null,
    libId: null,
    libSlug: null,
    ...overrides,
  };
}

describe('logique', () => {
  it('fiche dans l’URL, compte à rebours, chemin d’affiche', () => {
    expect(parseDetail('movie/603')).toEqual({ type: 'movie', id: 603 });
    expect(parseDetail('tv/1')).toEqual({ type: 'tv', id: 1 });
    expect(parseDetail('person/1')).toBeNull();
    const now = new Date('2026-11-22T00:00:00Z');
    expect(countdownDays('2026-11-25', now)).toBe(3);
    expect(countdownDays('2020-01-01', now)).toBeNull();
    expect(countdownDays('2028-01-01', now)).toBeNull();
    expect(posterPathOf('https://image.tmdb.org/t/p/w342/abc.jpg')).toBe('/abc.jpg');
    expect(posterPathOf(null)).toBeNull();
  });

  it('calendrier : filtres, titres, grille du mois commençant le lundi', () => {
    const film = {
      type: 'film',
      releaseType: 'digital',
      title: 'X',
      hasFile: false,
      monitored: true,
    } as CalendarEvent;
    const ep = {
      type: 'episode',
      releaseType: 'episode',
      seriesTitle: 'Show',
      season: 1,
      episode: 2,
      hasFile: true,
      monitored: true,
    } as CalendarEvent;
    expect(matchEvent(film, 'digital', 'all')).toBe(true);
    expect(matchEvent(film, 'episode', 'all')).toBe(false);
    expect(matchEvent(ep, 'all', 'available')).toBe(true);
    expect(matchEvent(film, 'all', 'missing')).toBe(false);
    expect(eventTitle(ep)).toBe('Show S01E02');
    expect(startOfWeek('2026-11-22')).toBe('2026-11-16');
    const grid = monthGrid(2026, 10);
    expect(grid[0]?.day).toBe('2026-10-26');
    expect(grid.length % 7).toBe(0);
    expect(grid.filter((c) => c.inMonth)).toHaveLength(30);
  });

  it('recherches récentes et ajout rapide sans TMDB', () => {
    expect(addRecentSearch(['du', 'matrix'], 'dune')).toEqual(['dune', 'matrix']);
    expect(addRecentSearch(['a', 'b', 'c', 'd', 'e'], 'zz')).toHaveLength(5);
    expect(addRecentSearch(['dune'], 'd')).toEqual(['dune']);
    const hit: OnlineSearchHit = {
      type: 'serie',
      id: 81189,
      tmdbId: null,
      tvdbId: 81189,
      title: 'BB',
      year: 2008,
      poster: null,
      hasFile: false,
      inLibrary: false,
    };
    expect(resolvedFromHit(hit, services)).toMatchObject({
      type: 'serie',
      tvdbId: 81189,
      candidates: [{ slug: 'tv', isDefault: true }],
    });
  });
});

function discoverRoutes(extra: Record<string, FakeHandler> = {}): Record<string, FakeHandler> {
  return {
    'GET /api/health/services': () => ({
      body: { services: {}, instances: { radarr: [], sonarr: [] } },
    }),
    'GET /api/decouverte': () => ({
      body: {
        error: false,
        heroMovie: card(1, { backdrop: 'b', title: 'Hero Movie' }),
        heroTv: null,
        trending: [
          card(2, {
            title: 'Trending One',
            inLibrary: true,
            libStatus: 'downloaded',
            libId: 5,
            libSlug: 'films',
          }),
        ],
        popMovies: [],
        popTv: [],
        upcoming: [],
        onAir: [],
        topMovies: [],
        topTv: [],
      },
    }),
    'GET /api/decouverte/mes-recommandations': () => ({
      body: { results: [], movies: [], tv: [], seeds: 0 },
    }),
    'GET /api/decouverte/watchlist/status': () => ({ body: { keys: [] } }),
    'GET /api/decouverte/genres/movie': () => ({ body: { genres: [{ id: 28, name: 'Action' }] } }),
    'GET /api/decouverte/genres/tv': () => ({ body: { genres: [] } }),
    ...extra,
  };
}

const detail = {
  id: 2,
  type: 'movie',
  title: 'Trending One',
  original: 'Trending One',
  tagline: null,
  year: 2020,
  release: '2020-01-01',
  status: 'Released',
  runtime: 120,
  genres: ['Action'],
  overview: 'Long synopsis',
  vote: 7,
  voteCount: 100,
  popularity: 10,
  poster: null,
  posterPath: null,
  backdrop: null,
  homepage: null,
  imdbId: 'tt1',
  tvdbId: null,
  networks: [],
  seasons: null,
  episodes: null,
  episodeRuntime: null,
  inProduction: null,
  lastAirDate: null,
  nextEpisode: null,
  lastEpisode: null,
  creators: [],
  originalLanguage: 'en',
  spokenLanguages: [],
  countries: [],
  companies: [],
  collection: null,
  budget: 0,
  revenue: 0,
  keywords: [],
  certification: null,
  providers: null,
  cast: [],
  crew: { directors: ['Jane'], writers: [], composers: [], cinematographers: [] },
  trailer: null,
  videoGallery: [],
  seasonsList: [],
  altTitles: [],
  reviews: [],
  backdrops: [],
  similar: [],
  inLibrary: true,
  libStatus: 'downloaded',
  libId: 5,
  libSlug: 'films',
};

describe('découverte', () => {
  it('accueil, puis recherche corrigée avec retour à la requête exacte', async () => {
    const { calls } = fakeFetch(
      discoverRoutes({
        'GET /api/decouverte/recherche': (call) => ({
          body: call.url.includes('exact=1')
            ? {
                mode: 'search',
                best: null,
                bestPerson: null,
                results: [],
                people: [],
                total: 0,
                suggestion: null,
                correctedFrom: null,
                correctedTo: null,
              }
            : {
                mode: 'search',
                best: {
                  ...card(157336, { title: 'Interstellar' }),
                  genres: ['Science-Fiction'],
                  originalTitle: null,
                },
                bestPerson: null,
                results: [card(3)],
                people: [],
                total: 2,
                suggestion: null,
                correctedFrom: 'interstelar',
                correctedTo: 'Interstellar',
              },
        }),
      }),
    );
    const { wrapper } = await mountApp('/decouverte', bootstrapOf({ user: ADMIN, services }));
    mounted.push(wrapper);
    await settle();
    expect(wrapper.text()).toContain('Hero Movie');
    expect(wrapper.find('[data-test="media-card-movie-2"] [data-test="lib-status"]').exists()).toBe(
      true,
    );
    await wrapper.get('[data-test="discover-search"] input').setValue('interstelar');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await settle();
    expect(wrapper.get('[data-test="best-match"]').text()).toContain('Interstellar');
    expect(wrapper.get('[data-test="corrected"]').text()).toContain('interstelar');
    await wrapper.get('[data-test="corrected"] a').trigger('click');
    await settle();
    expect(
      calls.some((c) => c.url.includes('/api/decouverte/recherche') && c.url.includes('exact=1')),
    ).toBe(true);
  });

  it('fiche ouverte par l’URL, ajout à la watchlist', async () => {
    const { calls } = fakeFetch(
      discoverRoutes({
        'GET /api/decouverte/detail/movie/2': () => ({ body: detail }),
        'POST /api/decouverte/watchlist/toggle': () => ({
          body: { action: 'added', tmdbId: 2, type: 'movie', id: 1 },
        }),
      }),
    );
    const { wrapper } = await mountApp(
      '/decouverte?detail=movie/2',
      bootstrapOf({ user: ADMIN, services }),
    );
    mounted.push(wrapper);
    await settle();
    const sheet = document.querySelector('[data-test="tmdb-detail"]');
    expect(sheet?.textContent).toContain('Long synopsis');
    expect(sheet?.textContent).toContain('Jane');
    document.querySelector<HTMLElement>('[data-test="detail-watchlist"]')?.click();
    await settle();
    const toggle = calls.find((c) => c.url === '/api/decouverte/watchlist/toggle');
    expect(toggle?.body).toMatchObject({ tmdbId: 2, type: 'movie', title: 'Trending One' });
    expect(toggle?.headers['x-csrf-token']).toBe('csrf-1');
  });

  it('ajout rapide : résolution, instance et profil par défaut, envoi', async () => {
    const { calls } = fakeFetch(
      discoverRoutes({
        'GET /api/decouverte/resolve/movie/1': () => ({
          body: {
            type: 'film',
            id: 1,
            tmdbId: 1,
            title: 'Hero Movie',
            year: 2020,
            poster: null,
            inLibrary: false,
            instances: [],
            candidates: [
              { slug: 'films', name: 'Films', isDefault: true, defaultQualityProfileId: 4 },
            ],
          },
        }),
        'GET /api/medias/films/films/config': () => ({
          body: {
            qualityProfiles: [
              { id: 1, name: 'Any' },
              { id: 4, name: 'HD' },
            ],
            rootFolders: [{ id: 1, path: '/movies', accessible: true, freeSpace: 0 }],
            tags: [],
            defaultQualityProfileId: null,
          },
        }),
        'POST /api/medias/films/films/add': () => ({
          body: { ok: true, movie: {}, movieId: 9 },
          status: 500,
        }),
      }),
    );
    const { wrapper } = await mountApp('/decouverte', bootstrapOf({ user: ADMIN, services }));
    mounted.push(wrapper);
    await settle();
    const { openQuickAdd } = await import('../src/app/overlays');
    openQuickAdd({ tmdb: { type: 'movie', id: 1 } });
    await settle();
    expect(document.querySelector('[data-test="quick-add-dialog"]')?.textContent).toContain(
      'Hero Movie',
    );
    document.querySelector<HTMLElement>('[data-test="qa-submit"]')?.click();
    await settle();
    const add = calls.find((c) => c.url === '/api/medias/films/films/add');
    expect(add?.body).toMatchObject({
      tmdbId: 1,
      qualityProfileId: 4,
      rootFolderPath: '/movies',
      minimumAvailability: 'released',
      searchForMovie: true,
    });
  });
});

describe('calendrier', () => {
  it('vue jour d’après l’URL, bannière Sonarr injoignable, aperçu au clic', async () => {
    const event: CalendarEvent = {
      type: 'film',
      releaseType: 'cinema',
      date: '2026-11-25',
      airDateUtc: null,
      title: 'Matrix',
      seriesTitle: null,
      season: null,
      episode: null,
      year: 1999,
      poster: null,
      fanart: null,
      overview: 'Neo',
      status: 'released',
      hasFile: false,
      monitored: true,
      id: 7,
      runtime: 120,
      studio: 'WB',
      network: null,
      genres: [],
      certification: null,
      instanceSlug: 'films',
      instanceName: 'Films',
    };
    fakeFetch({
      'GET /api/health/services': () => ({
        body: { services: {}, instances: { radarr: [], sonarr: [] } },
      }),
      'GET /api/calendrier': () => ({
        body: {
          events: [event],
          totalFilms: 1,
          totalEpisodes: 0,
          radarrFailed: false,
          sonarrFailed: true,
          radarrConfigured: true,
          sonarrConfigured: true,
        },
      }),
      'GET /api/tableau-de-bord/quicklook/movie/films/7': () => ({
        status: 404,
        body: { code: 'NOT_FOUND' },
      }),
    });
    const { wrapper } = await mountApp(
      '/calendrier?view=day&date=2026-11-25',
      bootstrapOf({ user: ADMIN, services }),
    );
    mounted.push(wrapper);
    await settle();
    expect(wrapper.get('[data-test="calendar-banner"]').text()).toContain('Sonarr');
    const events = wrapper.findAll('[data-test="calendar-event"]');
    expect(events).toHaveLength(1);
    expect(events[0]?.text()).toContain('Matrix');
    await wrapper.get('[data-test="view-month"]').trigger('click');
    await settle();
    expect(wrapper.find('[data-test="calendar-month"]').text()).toContain('Matrix');
    expect(localStorage.getItem('hubarr.calendar-view')).toBe('month');
  });
});

describe('recherche globale', () => {
  it('bibliothèques puis en ligne, filtre, aperçu au clic', async () => {
    fakeFetch({
      'GET /api/health/services': () => ({
        body: { services: {}, instances: { radarr: [], sonarr: [] } },
      }),
      'GET /api/medias/films/search': () => ({
        body: [
          {
            type: 'film',
            id: 7,
            title: 'The Matrix',
            originalTitle: null,
            year: 1999,
            hasFile: true,
            poster: null,
            inLibrary: true,
            instance: { slug: 'films', name: 'Films' },
          },
        ],
      }),
      'GET /api/medias/films/search/online': () => ({
        body: [
          {
            type: 'serie',
            id: 81189,
            tmdbId: 1396,
            tvdbId: 81189,
            title: 'Matrix Show',
            year: 2008,
            poster: null,
            hasFile: false,
            inLibrary: false,
          },
        ],
      }),
      'GET /api/tableau-de-bord/quicklook/movie/films/7': () => ({
        status: 404,
        body: { code: 'NOT_FOUND' },
      }),
      'GET /api/decouverte/watchlist/status': () => ({ body: { keys: [] } }),
    });
    const { wrapper } = await mountApp('/profil', bootstrapOf({ user: ADMIN, services }));
    mounted.push(wrapper);
    await settle();
    await wrapper.get('[data-test="global-search"] input').setValue('matrix');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await settle();
    const results = document.querySelector('[data-test="global-search-results"]');
    expect(results?.textContent).toContain('The Matrix');
    expect(results?.textContent).toContain('Matrix Show');
    expect(localStorage.getItem('hubarr.search-recent')).toBe('["matrix"]');
    document.querySelector<HTMLElement>('[data-test="search-hit-local"]')?.click();
    await settle();
    expect(document.querySelector('[data-test="quicklook"]')).not.toBeNull();
  });
});
