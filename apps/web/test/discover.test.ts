// SPDX-License-Identifier: AGPL-3.0-or-later
// Découverte (P4.4), calendrier (P4.2) et recherche globale (P4.5) : logique
// pure et écrans montés (recherche avec correction, fiche par l'URL,
// watchlist, ajout rapide, calendrier et bannière, résultats de la barre du
// haut).

import type { BootstrapServices, CalendarEvent, OnlineSearchHit, TmdbCard } from '@hubarr/shared';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import {
  eventTitle,
  matchEvent,
  monthGrid,
  startOfWeek,
} from '../src/features/calendar/calendar-api';
import {
  countdownDays,
  effectiveDiscoverTab,
  explorerYearBounds,
  parseDetail,
  parseDiscoverTab,
  popularYears,
} from '../src/features/discover/discover-api';
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

  it('années de « Populaires en » : de l’an prochain à la plus ancienne', () => {
    const years = popularYears(new Date('2026-11-24T12:00:00Z'), 2020);
    expect(years).toEqual([2027, 2026, 2025, 2024, 2023, 2022, 2021, 2020]);
  });

  it('sous-onglets : URL, « Pour vous » par défaut, « Tendances » s’il est vide', () => {
    expect(parseDiscoverTab('par-annee')).toBe('par-annee');
    expect(parseDiscoverTab('inconnu')).toBeNull();
    expect(parseDiscoverTab(undefined)).toBeNull();
    expect(parseDiscoverTab(['tendances'])).toBeNull();
    const empty = { settled: true, empty: true };
    expect(effectiveDiscoverTab(null, { settled: false, empty: true })).toBe('pour-vous');
    expect(effectiveDiscoverTab(null, { settled: true, empty: false })).toBe('pour-vous');
    expect(effectiveDiscoverTab(null, empty)).toBe('tendances');
    expect(effectiveDiscoverTab('pour-vous', empty)).toBe('pour-vous');
    expect(effectiveDiscoverTab('mieux-notes', empty)).toBe('mieux-notes');
  });

  it('explorateur : l’année précise l’emporte sur la décennie', () => {
    expect(explorerYearBounds(null, null)).toEqual({});
    expect(explorerYearBounds(1990, null)).toEqual({ year_min: 1990, year_max: 1999 });
    expect(explorerYearBounds(null, 2024)).toEqual({ year_min: 2024, year_max: 2024 });
    expect(explorerYearBounds(1990, 2024)).toEqual({ year_min: 2024, year_max: 2024 });
  });

  it('calendrier : filtres, titres, grille du mois commençant le lundi', () => {
    const film = {
      type: 'film',
      releaseType: 'digital',
      title: 'X',
      hasFile: false,
      monitored: true,
      downloadStatus: 'missing',
    } as CalendarEvent;
    const ep = {
      type: 'episode',
      releaseType: 'episode',
      seriesTitle: 'Show',
      season: 1,
      episode: 2,
      hasFile: true,
      monitored: true,
      downloadStatus: 'downloaded',
    } as CalendarEvent;
    expect(matchEvent(film, 'digital', 'all')).toBe(true);
    expect(matchEvent(film, 'episode', 'all')).toBe(false);
    // Filtre de statut : statut de téléchargement calculé par le serveur.
    expect(matchEvent(ep, 'all', 'downloaded')).toBe(true);
    expect(matchEvent(ep, 'all', 'missing')).toBe(false);
    expect(matchEvent(film, 'all', 'missing')).toBe(true);
    expect(matchEvent(film, 'digital', 'upcoming')).toBe(false);
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
        topMovies: [card(71, { title: 'Top Movie' })],
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
  it('suggestions : regardés (Tracearr), dossiers racine, populaires de l’année', async () => {
    const year = new Date().getFullYear();
    const { calls } = fakeFetch(
      discoverRoutes({
        'GET /api/decouverte/regardes': () => ({
          body: { linked: true, seeds: 2, results: [card(41, { title: 'Because Watched' })] },
        }),
        'GET /api/decouverte/dossiers': () => ({
          body: {
            folders: [
              {
                key: 'radarr:films:/movies/kids',
                service: 'radarr',
                instance: 'Films',
                label: 'kids',
                path: '/movies/kids',
                results: [card(51, { title: 'Kids Pick' })],
              },
            ],
          },
        }),
        [`GET /api/decouverte/annee/${year}`]: () => ({
          body: {
            year,
            movies: [card(61, { title: 'Year Movie' })],
            tv: [card(62, { type: 'tv', title: 'Year Show' })],
          },
        }),
      }),
    );
    const { wrapper, router } = await mountApp(
      '/decouverte',
      bootstrapOf({ user: ADMIN, services }),
    );
    mounted.push(wrapper);
    await settle();
    // « Pour vous » par défaut : seules ses requêtes partent.
    expect(wrapper.get('[data-test="discover-tab-pour-vous"]').classes()).toContain('text-primary');
    expect(calls.some((c) => c.url === '/api/decouverte')).toBe(false);
    expect(calls.some((c) => c.url.includes('/api/decouverte/annee/'))).toBe(false);
    expect(wrapper.find('[data-test="discover-by-year"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="discover-watched"]').text()).toContain('Because Watched');
    const folder = wrapper.get('[data-test="discover-folder"]');
    expect(folder.text()).toContain('For “kids”');
    expect(folder.text()).toContain('Films folder');
    expect(folder.text()).toContain('Kids Pick');
    await wrapper.get('[data-test="discover-tab-par-annee"]').trigger('click');
    await settle();
    expect(router.currentRoute.value.query.onglet).toBe('par-annee');
    expect(wrapper.find('[data-test="discover-watched"]').exists()).toBe(false);
    const byYear = wrapper.get('[data-test="discover-by-year"]');
    expect(byYear.text()).toContain(`Popular in ${year}`);
    expect(byYear.text()).toContain('Year Movie');
    await byYear.get('[data-test="by-year-tv"]').trigger('click');
    await settle();
    expect(wrapper.get('[data-test="discover-by-year"]').text()).toContain('Year Show');
    expect(calls.filter((c) => c.url.includes('/api/decouverte/annee/'))).toHaveLength(1);
    expect(calls.some((c) => c.url === '/api/decouverte')).toBe(false);

    // Les mieux notés : les sections notées de l'accueil TMDB, sans les tendances.
    await wrapper.get('[data-test="discover-tab-mieux-notes"]').trigger('click');
    await settle();
    expect(router.currentRoute.value.query.onglet).toBe('mieux-notes');
    expect(wrapper.text()).toContain('Top Movie');
    expect(wrapper.text()).not.toContain('Trending One');
    expect(wrapper.text()).not.toContain('Hero Movie');
  });

  it('onglet de l’URL : « Tendances » sans les requêtes de « Pour vous »', async () => {
    const { calls } = fakeFetch(discoverRoutes());
    const { wrapper } = await mountApp(
      '/decouverte?onglet=tendances',
      bootstrapOf({ user: ADMIN, services }),
    );
    mounted.push(wrapper);
    await settle();
    expect(wrapper.text()).toContain('Hero Movie');
    expect(wrapper.text()).toContain('Trending One');
    expect(wrapper.text()).not.toContain('Top Movie');
    expect(calls.some((c) => c.url.startsWith('/api/decouverte/mes-recommandations'))).toBe(false);
    expect(calls.some((c) => c.url.startsWith('/api/decouverte/regardes'))).toBe(false);
    expect(calls.some((c) => c.url.startsWith('/api/decouverte/dossiers'))).toBe(false);
  });

  it('sans compte Tracearr ni dossier : pas de rangée vide', async () => {
    fakeFetch(
      discoverRoutes({
        'GET /api/decouverte/regardes': () => ({ body: { linked: false, seeds: 0, results: [] } }),
        'GET /api/decouverte/dossiers': () => ({ body: { folders: [] } }),
      }),
    );
    const { wrapper } = await mountApp('/decouverte', bootstrapOf({ user: ADMIN, services }));
    mounted.push(wrapper);
    await settle();
    // « Pour vous » n'a rien à montrer : « Tendances » s'affiche.
    expect(wrapper.get('[data-test="discover-tab-tendances"]').classes()).toContain('text-primary');
    expect(wrapper.text()).toContain('Hero Movie');
    expect(wrapper.find('[data-test="discover-watched"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="discover-folder"]').exists()).toBe(false);
  });

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
      downloadStatus: 'missing',
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
    // Statut de téléchargement : étiquette et liseré de sa couleur (thème).
    expect(events[0]?.get('[data-test="calendar-event-status"]').text()).toBe(
      i18n.global.t('calendar.status.missing'),
    );
    expect(events[0]?.attributes('style')).toContain('--v-theme-error');
    // Filtre par statut : « À venir » masque la sortie manquante.
    await wrapper.get('[data-test="calendar-status-upcoming"]').trigger('click');
    await settle();
    expect(wrapper.findAll('[data-test="calendar-event"]')).toHaveLength(0);
    await wrapper.get('[data-test="calendar-status-all"]').trigger('click');
    await settle();
    await wrapper.get('[data-test="view-month"]').trigger('click');
    await settle();
    expect(wrapper.find('[data-test="calendar-month"]').text()).toContain('Matrix');
    expect(localStorage.getItem('hubarr.calendar-view')).toBe('month');
    // Les sorties de la case ne s'ouvrent pas : le clic choisit le jour.
    const block = wrapper.get('[data-test="calendar-month"] .cal-block');
    expect(block.element.tagName).toBe('SPAN');
    await block.trigger('click');
    await settle();
    expect(document.querySelector('[data-test="quicklook"]')).toBeNull();
    expect(wrapper.find('[data-test="calendar-day"]').text()).toContain('Matrix');
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
