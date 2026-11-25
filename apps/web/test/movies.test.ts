// SPDX-License-Identifier: AGPL-3.0-or-later
// Bibliothèque de films (P2.3) : logique pure (URL, pagination de
// `_library_pagination.html.twig`, statut, sélection, messages de commande) et
// vue montée contre une API simulée (filtres dans l'URL, vues, actions en masse).

import {
  DEFAULT_MOVIE_LIBRARY_QUERY,
  DEFAULT_USER_PREFERENCES,
  type MovieDetail,
  type MovieLibraryItem,
  type MovieLibraryResponse,
  type TmdbCard,
  type UserPreferences,
} from '@hubarr/shared';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import {
  apiParamsOf,
  commandOutcome,
  displayStatusOf,
  downloadedCount,
  pageRange,
  paginationLinks,
  initialViewMode,
  routeQueryOf,
  searchedTitle,
  shelvesOf,
  toggleSelection,
} from '../src/features/movies/library';
import { posterUrl } from '../src/features/movies/movie-display';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settle, type FakeCall } from './helpers';

const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {});

beforeAll(async () => {
  await setLocale('en');
});
/** Vues montées, démontées après chaque test (minuteries de suivi, sondage de la file). */
const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = '';
});

function item(id: number, overrides: Partial<MovieLibraryItem> = {}): MovieLibraryItem {
  return {
    id,
    tmdbId: id,
    imdbId: null,
    title: `Movie ${id}`,
    sortTitle: `movie ${id}`,
    year: 2020,
    overview: null,
    poster: null,
    status: 'released',
    hasFile: false,
    monitored: true,
    quality: null,
    qualityProfileId: 1,
    minimumAvailability: 'released',
    tags: [],
    added: null,
    sizeOnDisk: 0,
    sizeGb: null,
    genres: [],
    runtime: null,
    ...overrides,
  };
}

describe('logique de la bibliothèque', () => {
  it('liens de pagination avec ellipses (fenêtre de 2)', () => {
    expect(paginationLinks(1, 1)).toEqual([]);
    // last = 2 : pas de doublon (bug évité par le gabarit d'origine).
    expect(paginationLinks(1, 2)).toEqual([1, 2]);
    expect(paginationLinks(6, 12)).toEqual([1, 'gap', 4, 5, 6, 7, 8, 'gap', 12]);
    expect(paginationLinks(1, 12)).toEqual([1, 2, 3, 'gap', 12]);
    expect(paginationLinks(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('plage affichée', () => {
    expect(pageRange(2, 50, 120)).toEqual({ first: 51, last: 100 });
    expect(pageRange(3, 50, 120)).toEqual({ first: 101, last: 120 });
    expect(pageRange(1, 50, 0)).toBeNull();
  });

  it('URL propre et paramètres de l’API', () => {
    const query = { ...DEFAULT_MOVIE_LIBRARY_QUERY, status: 'missing' as const, perPage: 100 };
    expect(routeQueryOf(query, 100)).toEqual({ status: 'missing' });
    expect(routeQueryOf(query, 200, 3)).toEqual({ status: 'missing', per_page: '100', page: '3' });
    expect(apiParamsOf({ ...query, page: 2 }, 42).toString()).toBe(
      'status=missing&per_page=100&page=2&open=42',
    );
  });

  it('statut affiché d’un film', () => {
    expect(displayStatusOf(item(1, { hasFile: true }))).toBe('downloaded');
    expect(displayStatusOf(item(1, { status: 'inCinemas' }))).toBe('unavailable');
    expect(displayStatusOf(item(1, { status: 'announced', monitored: false }))).toBe('unmonitored');
    expect(displayStatusOf(item(1))).toBe('missing');
  });

  it('étagères : téléchargés, manquants, non suivis ; vides retirées', () => {
    const shelves = shelvesOf([
      item(1, { hasFile: true }),
      item(2, { monitored: false }),
      item(3, { hasFile: true }),
    ]);
    expect(shelves.map((shelf) => [shelf.key, shelf.items.map((m) => m.id)])).toEqual([
      ['downloaded', [1, 3]],
      ['unmonitored', [2]],
    ]);
  });

  it('sélection : bascule, et plage avec Maj', () => {
    const ids = [10, 20, 30, 40];
    let selected = toggleSelection(new Set(), ids, 20, null, false);
    expect([...selected]).toEqual([20]);
    selected = toggleSelection(selected, ids, 40, 20, true);
    expect([...selected].sort()).toEqual([20, 30, 40]);
    selected = toggleSelection(selected, ids, 30, 40, false);
    expect([...selected].sort()).toEqual([20, 40]);
  });

  it('messages des commandes Radarr', () => {
    expect(searchedTitle('Searching indexers for [Dune: Part Two]')).toBe('Dune: Part Two');
    expect(searchedTitle('Completed')).toBeNull();
    expect(downloadedCount('Completed. 3 reports downloaded.')).toBe(3);
    expect(downloadedCount('1 report grabbed')).toBe(1);
    expect(downloadedCount('nothing')).toBe(0);
    expect(commandOutcome('Completed')).toBe('completed');
    expect(commandOutcome('failed')).toBe('failed');
    expect(commandOutcome('started')).toBe('running');
    expect(commandOutcome('unknown')).toBe('running');
  });

  it('vue d’ouverture : préférence du compte, ou grille / étendu selon la largeur', () => {
    expect(initialViewMode('table', true)).toBe('table');
    expect(initialViewMode('shelf', false)).toBe('shelf');
    expect(initialViewMode('auto', true)).toBe('grid');
    expect(initialViewMode('auto', false)).toBe('extended');
  });

  it('affiche TMDB réduite', () => {
    expect(posterUrl('https://image.tmdb.org/t/p/original/abc.jpg', 'w342')).toBe(
      'https://image.tmdb.org/t/p/w342/abc.jpg',
    );
    expect(posterUrl('https://example.org/p.jpg', 'w92')).toBe('https://example.org/p.jpg');
    expect(posterUrl(null, 'w92')).toBeNull();
  });
});

// ── Vue montée ──────────────────────────────────────────────────────────────

const RADARR_SERVICES = {
  states: { radarr: { configured: true, disabled: false } },
  instances: {
    radarr: [{ slug: 'radarr', name: 'Radarr', enabled: true, isDefault: true }],
    sonarr: [],
  },
  sidebar: {},
};

function libraryOf(items: MovieLibraryItem[], overrides: Partial<MovieLibraryResponse> = {}) {
  return {
    items,
    total: items.length,
    libraryTotal: 3,
    page: 1,
    perPage: 200,
    totalPages: 1,
    unlimited: false,
    facets: { genres: ['Action'], qualities: ['Bluray-1080p'], languages: ['French'] },
    stats: { total: 3, downloaded: 1, waiting: 1, totalGb: 12.5 },
    query: { ...DEFAULT_MOVIE_LIBRARY_QUERY },
    ...overrides,
  } satisfies MovieLibraryResponse;
}

const MOVIES = [
  item(1, { title: 'The Matrix', hasFile: true, quality: 'Bluray-1080p', sizeGb: 12.5 }),
  item(2, { title: 'Inception' }),
  item(3, { title: 'Amélie', monitored: false }),
];

async function mountMovies(
  path = '/medias/radarr/films',
  routes: Parameters<typeof fakeFetch>[0] = {},
  prefs: Partial<UserPreferences> = {},
) {
  const fetch = fakeFetch({
    'GET /api/health/services': () => ({
      body: {
        services: { radarr: true },
        instances: { radarr: [{ slug: 'radarr', name: 'Radarr', state: true }], sonarr: [] },
        ok: 1,
        total: 1,
        timestamp: '2026-11-18T12:00:00Z',
      },
    }),
    'GET /api/medias/radarr/films': () => ({ body: libraryOf(MOVIES) }),
    'GET /api/medias/radarr/films/warnings': () => ({
      body: { warnings: [{ code: 'no_indexer' }], indexerCount: 0 },
    }),
    ...routes,
  });
  const app = await mountApp(
    path,
    bootstrapOf({
      user: ADMIN,
      services: RADARR_SERVICES,
      userPreferences: { ...DEFAULT_USER_PREFERENCES, ...prefs },
    }),
  );
  mounted.push(app.wrapper);
  await settle();
  return { ...app, fetch };
}

/** Clic dans un dialogue (téléporté hors du composant monté). */
function clickIn(selector: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`introuvable : ${selector}`);
  element.click();
}

const libraryCalls = (calls: FakeCall[]) =>
  calls.filter((call) => call.method === 'GET' && call.url.startsWith('/api/medias/radarr/films?'));

describe('MoviesView', () => {
  it('alerte de santé fermée : masquée sur l’appareil tant que son texte ne change pas (V30)', async () => {
    const { wrapper } = await mountMovies();
    await wrapper.get('[data-test="movies-warning"] .v-alert__close button').trigger('click');
    await settle();
    expect(wrapper.find('[data-test="movies-warning"]').exists()).toBe(false);
    expect(
      JSON.parse(localStorage.getItem('hubarr.dismissed-alerts.radarr.radarr') ?? '[]'),
    ).toEqual([t('media.api.no_indexer')]);
    wrapper.unmount();
    mounted.length = 0;
    const again = await mountMovies();
    expect(again.wrapper.find('[data-test="movies-warning"]').exists()).toBe(false);
    localStorage.removeItem('hubarr.dismissed-alerts.radarr.radarr');
  });

  it('affiche les statistiques, l’avertissement et les films (vue du compte)', async () => {
    const { wrapper } = await mountMovies(undefined, undefined, { moviesView: 'extended' });
    expect(wrapper.find('[data-test="movies-stats"]').text()).toContain('12.5');
    expect(wrapper.find('[data-test="movies-warning"]').text()).toBe(t('media.api.no_indexer'));
    const text = wrapper.find('[data-test="movies-content"]').text();
    expect(text).toContain('The Matrix');
    expect(text).toContain('Bluray-1080p');
    expect(text).toContain(t('media.films.status.unmonitored'));
    expect(wrapper.find('[data-test="pagination-range"]').text()).toBe(
      t('media.films.pagination.range', { first: 1, last: 3, total: 3 }),
    );
  });

  it('les critères de l’URL partent à l’API ; un statut change l’URL et revient page 1', async () => {
    const { wrapper, router, fetch } = await mountMovies(
      '/medias/radarr/films?genre=Action&page=2',
    );
    expect(libraryCalls(fetch.calls)[0]?.url).toBe(
      '/api/medias/radarr/films?genre=Action&per_page=200&page=2',
    );
    await wrapper.find('[data-test="status-missing"]').trigger('click');
    await settle();
    expect(router.currentRoute.value.query).toEqual({ genre: 'Action', status: 'missing' });
    expect(libraryCalls(fetch.calls).at(-1)?.url).toBe(
      '/api/medias/radarr/films?status=missing&genre=Action&per_page=200',
    );
    // Filtre actif : les actions « filtrées » apparaissent.
    expect(wrapper.find('[data-test="search-filtered"]').exists()).toBe(true);
  });

  it('change de vue par le menu (V14), le temps de la visite seulement', async () => {
    const { wrapper } = await mountMovies();
    await wrapper.get('[data-test="movies-view-menu"]').trigger('click');
    await settle();
    document.querySelector<HTMLElement>('[data-test="view-table"]')?.click();
    await settle();
    expect(wrapper.find('.movie-table').exists()).toBe(true);
    wrapper.unmount();
    mounted.length = 0;
    // Nouvelle visite : la préférence du compte (grille par défaut sur grand écran).
    const again = await mountMovies();
    expect(again.wrapper.find('.movie-table').exists()).toBe(false);
  });

  it('s’ouvre sur le mode choisi dans les préférences du compte', async () => {
    const { wrapper } = await mountMovies(undefined, undefined, { moviesView: 'table' });
    expect(wrapper.find('.movie-table').exists()).toBe(true);
  });

  it('sélection puis suppression en masse : corps envoyé et bibliothèque rechargée', async () => {
    const { wrapper, fetch } = await mountMovies(
      '/medias/radarr/films',
      {
        'POST /api/medias/radarr/films/bulk/delete': () => ({ body: { ok: true } }),
      },
      { moviesView: 'extended' },
    );
    await wrapper.find('[data-test="movies-select-mode"]').trigger('click');
    await settle();
    const rows = wrapper.findAll('.movie-row .media-item__hit');
    expect(rows).toHaveLength(3);
    await rows[0]?.trigger('click');
    await rows[2]?.trigger('click', { shiftKey: true });
    await settle();
    expect(wrapper.find('[data-test="bulk-count"]').text()).toContain('3');

    await wrapper.find('[data-test="bulk-delete"]').trigger('click');
    await settle();
    expect(document.body.textContent).toContain('Amélie (2020)');
    const before = libraryCalls(fetch.calls).length;
    clickIn('[data-test="bulk-delete-files"] input');
    clickIn('[data-test="bulk-delete-confirm"]');
    await settle();

    const call = fetch.calls.find((c) => c.url === '/api/medias/radarr/films/bulk/delete');
    expect(call?.body).toEqual({
      movieIds: [1, 2, 3],
      deleteFiles: true,
      addImportExclusion: false,
    });
    expect(call?.headers['x-csrf-token']).toBe('csrf-1');
    expect(libraryCalls(fetch.calls).length).toBeGreaterThan(before);
    expect(wrapper.find('[data-test="movies-banner"]').text()).toBe(
      t('media.films.warnings_bulk_delete_ok', { count: 3 }),
    );
  });

  it('Radarr injoignable : pas de liste, pas d’erreur générique (la bannière s’en charge)', async () => {
    const { wrapper } = await mountMovies('/medias/radarr/films', {
      'GET /api/medias/radarr/films': () => ({
        status: 503,
        body: { code: 'SERVICE_UNREACHABLE', service: 'radarr' },
      }),
    });
    expect(wrapper.find('[data-test="movies-content"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain(t('error.generic.message'));
  });
});

function detailOf(id: number, overrides: Partial<MovieDetail> = {}): MovieDetail {
  return {
    ...item(id),
    originalTitle: null,
    fanart: null,
    certification: 'PG-13',
    studio: 'Warner',
    path: `/movies/Movie ${id}`,
    alternateTitles: [],
    rootFolderPath: '/movies',
    language: null,
    languages: [],
    collection: null,
    addedAt: null,
    inCinemasAt: null,
    digitalAt: null,
    physicalAt: null,
    ratings: null,
    ratingsImdb: 8.7,
    ratingsImdbVotes: 2_100_000,
    ratingsTmdb: 8.2,
    ratingsTmdbVotes: null,
    movieFile: null,
    title: 'The Matrix',
    year: 1999,
    runtime: 136,
    ...overrides,
  };
}

describe('Fiche film', () => {
  const detailRoutes = (overrides: Parameters<typeof fakeFetch>[0] = {}) => ({
    'GET /api/medias/radarr/films/1/detail': () => ({ body: detailOf(1) }),
    'GET /api/medias/radarr/films/1/credits': () => ({
      body: [
        {
          personName: 'Keanu Reeves',
          personTmdbId: 1,
          character: 'Neo',
          job: null,
          department: null,
          type: 'cast',
          image: null,
        },
        {
          personName: 'Lana',
          personTmdbId: 2,
          character: null,
          job: 'Writer',
          department: 'Writing',
          type: 'crew',
          image: null,
        },
        {
          personName: 'Lana',
          personTmdbId: 2,
          character: null,
          job: 'Director',
          department: 'Directing',
          type: 'crew',
          image: null,
        },
      ],
    }),
    ...overrides,
  });

  it('un clic sur une carte ouvre la page du film (D130)', async () => {
    const { wrapper, router } = await mountMovies('/medias/radarr/films', detailRoutes());
    await wrapper.find('.poster-card__hit').trigger('click');
    await settle();
    expect(router.currentRoute.value.name).toBe('radarr-movie');
    expect(router.currentRoute.value.params.id).toBe('1');
    const dialog = document.querySelector('[data-test="movie-detail"]');
    expect(dialog?.querySelector('[data-test="movie-title"]')?.textContent).toContain(
      'The Matrix (1999)',
    );
    expect(dialog?.textContent).toContain('8.7 (2.1M)');
    expect(dialog?.textContent).toContain('82%');
    expect(dialog?.textContent).toContain('2h 16min');
    // Équipe dédoublonnée, postes triés.
    expect(dialog?.textContent).toContain('Director, Writer');
    clickIn('[data-test="movie-detail-close"]');
    await settle();
    expect(router.currentRoute.value.name).toBe('radarr');
    expect(router.currentRoute.value.query).toEqual({});
  });

  it('lien profond : suivre / ne plus suivre, avec le jeton CSRF', async () => {
    const { fetch, router } = await mountMovies(
      '/medias/radarr/films?open=1',
      detailRoutes({
        'POST /api/medias/radarr/films/1/monitor': () => ({ body: { ok: true, monitored: false } }),
      }),
    );
    // L'ancien lien profond mène à la page du film.
    expect(router.currentRoute.value.name).toBe('radarr-movie');
    expect(router.currentRoute.value.params.id).toBe('1');
    clickIn('[data-test="movie-monitor"]');
    await settle();
    const call = fetch.calls.find((c) => c.url === '/api/medias/radarr/films/1/monitor');
    expect(call?.body).toEqual({ monitored: false });
    expect(call?.headers['x-csrf-token']).toBe('csrf-1');
    expect(document.querySelector('[data-test="movie-monitor"]')?.textContent).toContain(
      t('media.films.detail.follow'),
    );
  });

  it('retirer de Radarr : confirmation, fiche fermée, bannière et bibliothèque rechargée', async () => {
    const { wrapper, router, fetch } = await mountMovies(
      '/medias/radarr/films/1',
      detailRoutes({ 'POST /api/medias/radarr/films/1/delete': () => ({ body: { ok: true } }) }),
    );
    const before = libraryCalls(fetch.calls).length;
    clickIn('[data-test="movie-delete-radarr"]');
    await settle();
    clickIn('[data-test="confirm"]');
    await settle();
    expect(fetch.calls.find((c) => c.url === '/api/medias/radarr/films/1/delete')?.body).toEqual({
      deleteFiles: false,
      addImportExclusion: false,
    });
    expect(router.currentRoute.value.name).toBe('radarr');
    expect(router.currentRoute.value.query).toEqual({});
    expect(libraryCalls(fetch.calls).length).toBeGreaterThan(before);
    expect(wrapper.find('[data-test="movies-banner"]').text()).toBe(
      t('media.films.warnings_bulk_delete_ok', { count: 1 }),
    );
  });

  it('marque-page d’une carte : bascule le suivi sans ouvrir la fiche', async () => {
    const { wrapper, router, fetch } = await mountMovies('/medias/radarr/films', {
      'POST /api/medias/radarr/films/1/monitor': () => ({ body: { ok: true, monitored: false } }),
    });
    await wrapper.find('[data-test="movie-card-monitor"]').trigger('click');
    await settle();
    expect(fetch.calls.find((c) => c.url === '/api/medias/radarr/films/1/monitor')?.body).toEqual({
      monitored: false,
    });
    expect(router.currentRoute.value.query).toEqual({});
  });

  it('film inconnu : message « Film introuvable »', async () => {
    await mountMovies('/medias/radarr/films?open=1', {
      'GET /api/medias/radarr/films/1/detail': () => ({ status: 404, body: { code: 'NOT_FOUND' } }),
    });
    expect(document.querySelector('[data-test="movie-detail"]')?.textContent).toContain(
      t('media.api.movie_not_found'),
    );
  });

  it('suggestions TMDB : un titre possédé ouvre sa fiche, un autre la fiche TMDB', async () => {
    const card = (id: number, overrides: Partial<TmdbCard> = {}): TmdbCard => ({
      id,
      type: 'movie',
      title: `Suggestion ${id}`,
      year: 2001,
      release: '2001-01-01',
      overview: null,
      poster: null,
      posterHi: null,
      backdrop: null,
      vote: 7,
      voteCount: 10,
      popularity: 1,
      inLibrary: false,
      libStatus: null,
      libId: null,
      libSlug: null,
      ...overrides,
    });
    const fetch = fakeFetch({
      ...detailRoutes(),
      'GET /api/decouverte/suggestions/movie/1': () => ({
        body: {
          recommendations: [
            card(604, { inLibrary: true, libStatus: 'downloaded', libId: 2, libSlug: 'radarr' }),
          ],
          similar: [card(605)],
        },
      }),
    });
    const services = {
      ...RADARR_SERVICES,
      states: { ...RADARR_SERVICES.states, tmdb: { configured: true, disabled: false } },
    };
    const { wrapper, router } = await mountApp(
      '/medias/radarr/films/1',
      bootstrapOf({ user: ADMIN, services }),
    );
    mounted.push(wrapper);
    await settle();
    expect(wrapper.find('[data-test="suggestions-recommendations"]').text()).toContain(
      'Suggestion 604',
    );
    expect(wrapper.find('[data-test="suggestions-similar"]').text()).toContain('Suggestion 605');
    await wrapper.find('[data-test="media-card-movie-605"]').trigger('click');
    await settle();
    expect(fetch.calls.some((c) => c.url === '/api/decouverte/detail/movie/605')).toBe(true);
    await wrapper.find('[data-test="media-card-movie-604"]').trigger('click');
    await settle();
    expect(router.currentRoute.value.name).toBe('radarr-movie');
    expect(router.currentRoute.value.params.id).toBe('2');
  });

  it('sans TMDB : aucune suggestion demandée', async () => {
    const { wrapper, fetch } = await mountMovies('/medias/radarr/films/1', detailRoutes());
    expect(wrapper.find('[data-test="detail-suggestions"]').exists()).toBe(false);
    expect(fetch.calls.some((c) => c.url.startsWith('/api/decouverte/'))).toBe(false);
  });
});

describe('Fiche sur mobile', () => {
  const width = window.innerWidth;
  const setWidth = (value: number) => {
    const happy = (window as unknown as { happyDOM: { setViewport(size: object): void } }).happyDOM;
    happy.setViewport({ width: value, height: 900 });
  };
  beforeEach(() => {
    setWidth(412);
  });
  afterEach(() => {
    setWidth(width);
  });

  it('recherches et actualisation dans la page ; le bouton central ouvre l’édition', async () => {
    await mountMovies('/medias/radarr/films/1', {
      'GET /api/medias/radarr/films/1/detail': () => ({ body: detailOf(1) }),
      'GET /api/medias/radarr/films/1/credits': () => ({ body: [] }),
    });
    const detail = document.querySelector('[data-test="movie-detail"]');
    for (const id of ['movie-monitor', 'movie-search', 'movie-interactive', 'movie-refresh'])
      expect(detail?.querySelector(`[data-test="${id}"]`), id).not.toBeNull();
    expect(document.querySelector('[data-test="movie-speed-dial"]')).toBeNull();
    clickIn('[data-test="movie-edit-fab"]');
    await settle();
    // Feuille de l'édition ouverte, puis refermée par sa croix.
    const sheet = () => document.querySelector('[data-test="movie-edit"]')?.closest('.v-overlay');
    expect(sheet()?.classList.contains('v-overlay--active')).toBe(true);
    const close = sheet()?.querySelector<HTMLElement>('[data-test="dialog-close"]');
    expect(close).toBeTruthy();
    close?.click();
    await settle();
    expect(sheet()?.classList.contains('v-overlay--active') ?? false).toBe(false);
  });
});

describe('Recherche, releases et renommage (P2.5)', () => {
  const release = (guid: string, approved: boolean, extra: Record<string, unknown> = {}) => ({
    guid,
    indexerId: 4,
    title: `Release ${guid}`,
    indexer: 'Idx',
    quality: 'Bluray-1080p',
    sizeMb: 2048,
    seeders: 10,
    leechers: 1,
    protocol: 'torrent',
    age: 3,
    approved,
    rejections: approved ? [] : ['Not wanted in profile'],
    customFormatScore: 0,
    scoreDetails: [],
    customFormats: [],
    languages: ['French'],
    infoUrl: null,
    ...extra,
  });
  const base = {
    'GET /api/medias/radarr/films/1/detail': () => ({ body: detailOf(1) }),
    'GET /api/medias/radarr/films/1/credits': () => ({ body: [] }),
  };

  it('recherche interactive : liste des releases, grab avec le jeton CSRF', async () => {
    const { fetch } = await mountMovies('/medias/radarr/films?open=1', {
      ...base,
      'GET /api/medias/radarr/films/1/releases': () => ({
        body: [release('ok', true), release('ko', false)],
      }),
      'POST /api/medias/radarr/films/1/grab': () => ({ body: { ok: true } }),
    });
    clickIn('[data-test="movie-interactive"]');
    await settle();
    expect(document.querySelectorAll('[data-test="release-row"]')).toHaveLength(2);
    document.querySelector<HTMLElement>('[data-test="release-grab"]')?.click();
    await settle();
    const call = fetch.calls.find((c) => c.url === '/api/medias/radarr/films/1/grab');
    expect(call?.body).toEqual({ guid: 'ok', indexerId: 4 });
    expect(call?.headers['x-csrf-token']).toBe('csrf-1');
    expect(document.querySelector('[data-test="movie-feedback"]')?.textContent).toContain(
      t('media.films.detail.grab_launched', { title: 'Release ok' }),
    );
  });

  it('recherche interactive : ordre du serveur (pertinence), tri en trois clics, formats résumés', async () => {
    const formats = ['HDR', 'x265', 'FR', 'MULTI'].map((name) => ({ name, score: 10 }));
    await mountMovies('/medias/radarr/films?open=1', {
      ...base,
      'GET /api/medias/radarr/films/1/releases': () => ({
        body: [
          release('a', true, { customFormatScore: 10, scoreDetails: formats }),
          release('b', true, { customFormatScore: 90 }),
          release('c', false, { customFormatScore: 50 }),
        ],
      }),
    });
    clickIn('[data-test="movie-interactive"]');
    await settle();
    const order = () =>
      [...document.querySelectorAll('[data-test="release-row"] .release-list__title')].map((cell) =>
        cell.textContent.trim(),
      );
    const toolbar = () => document.querySelector('[data-test="release-toolbar"]')?.textContent;
    expect(order()).toEqual(['Release a', 'Release b', 'Release c']);
    expect(toolbar()).toContain(t('media.films.detail.sorted_by_relevance'));
    expect(toolbar()).toContain(t('media.films.detail.releases_count', { count: 3 }));
    expect(document.querySelector('[data-test="release-more-formats"]')?.textContent).toBe('+2');

    const scoreHeader = () =>
      [...document.querySelectorAll<HTMLElement>('.release-list__table th')].find(
        (th) => th.textContent.trim() === t('media.films.detail.score_col'),
      );
    scoreHeader()?.click();
    await settle();
    expect(order()).toEqual(['Release b', 'Release c', 'Release a']);
    scoreHeader()?.click();
    await settle();
    expect(order()).toEqual(['Release a', 'Release c', 'Release b']);
    scoreHeader()?.click();
    await settle();
    expect(order()).toEqual(['Release a', 'Release b', 'Release c']);

    scoreHeader()?.click();
    await settle();
    clickIn('[data-test="release-sort-relevance"]');
    await settle();
    expect(order()).toEqual(['Release a', 'Release b', 'Release c']);
  });

  it('recherche automatique sans résultat : interrogation directe puis grab de la meilleure', async () => {
    const { fetch } = await mountMovies('/medias/radarr/films?open=1', {
      ...base,
      'POST /api/medias/radarr/films/1/search': () => ({ body: { ok: true, cmdId: 5 } }),
      'GET /api/medias/radarr/films/command/5': () => ({
        body: {
          id: 5,
          name: 'MoviesSearch',
          status: 'completed',
          message: null,
          queued: null,
          started: null,
          ended: null,
        },
      }),
      'GET /api/medias/radarr/films/1/history': () => ({ body: [] }),
      'GET /api/medias/radarr/films/queue': () => ({ body: [] }),
      'GET /api/medias/radarr/films/1/releases': () => ({
        body: [release('ko', false), release('best', true)],
      }),
      'POST /api/medias/radarr/films/1/grab': () => ({ body: { ok: true } }),
    });
    clickIn('[data-test="movie-search"]');
    await vi.waitFor(
      () => {
        expect(fetch.calls.some((c) => c.url === '/api/medias/radarr/films/1/grab')).toBe(true);
      },
      { timeout: 6_000 },
    );
    await settle();
    expect(fetch.calls.find((c) => c.url === '/api/medias/radarr/films/1/grab')?.body).toEqual({
      guid: 'best',
      indexerId: 4,
    });
    expect(document.querySelector('[data-test="movie-feedback"]')?.textContent).toContain(
      t('media.films.detail.search_grab_started', { indexer: 'Idx', title: 'Release best' }),
    );
  });

  it('renommage en masse : prévisualisation puis RenameMovie pour les films à renommer', async () => {
    const { wrapper, fetch } = await mountMovies(
      '/medias/radarr/films',
      {
        'GET /api/medias/radarr/films/1/rename-preview': () => ({
          body: [{ movieFileId: 1, existingPath: 'a/old.mkv', newPath: 'a/The Matrix (1999).mkv' }],
        }),
        'GET /api/medias/radarr/films/2/rename-preview': () => ({ body: [] }),
        'POST /api/medias/radarr/films/1/rename': () => ({ body: { ok: true, cmdId: 8 } }),
      },
      { moviesView: 'extended' },
    );
    await wrapper.find('[data-test="movies-select-mode"]').trigger('click');
    await settle();
    const rows = wrapper.findAll('.movie-row .media-item__hit');
    await rows[0]?.trigger('click');
    await rows[1]?.trigger('click');
    await wrapper.find('[data-test="bulk-rename"]').trigger('click');
    await settle();
    const changes = document.querySelector('[data-test="bulk-rename-changes"]')?.textContent ?? '';
    expect(changes).toContain('old.mkv');
    expect(changes).toContain('The Matrix (1999).mkv');
    expect(document.body.textContent).toContain(
      t('media.films.bulk.films_correctly_named', { count: 1 }),
    );
    clickIn('[data-test="bulk-rename-go"]');
    await settle();
    expect(
      fetch.calls.filter((c) => c.method === 'POST' && c.url.endsWith('/rename')).map((c) => c.url),
    ).toEqual(['/api/medias/radarr/films/1/rename']);
    expect(wrapper.find('[data-test="movies-banner"]').text()).toBe(
      t('media.films.warnings_bulk_rename_ok', { count: 1 }),
    );
  });

  it('commandes en cours au chargement : bandeau de suivi', async () => {
    const { wrapper } = await mountMovies('/medias/radarr/films', {
      'GET /api/medias/radarr/films/commands/active': () => ({
        body: [
          {
            id: 3,
            name: 'MissingMoviesSearch',
            status: 'started',
            message: null,
            queued: null,
            started: null,
            ended: null,
          },
          {
            id: 4,
            name: 'RssSync',
            status: 'started',
            message: null,
            queued: null,
            started: null,
            ended: null,
          },
        ],
      }),
    });
    expect(wrapper.find('[data-test="movies-banner"]').text()).toBe(
      t('media.films.warnings_cmd_in_progress', {
        label: t('media.films.warnings_cmd_missing_search'),
      }),
    );
  });
});

describe('Ajout et suivi de personnes (P2.6)', () => {
  it('ajout : recherche différée, profil de l’instance présélectionné, corps envoyé', async () => {
    const { wrapper, fetch } = await mountMovies('/medias/radarr/films', {
      'GET /api/medias/radarr/films/lookup': () => ({
        body: [
          { ...detailOf(9), id: null, tmdbId: 603, title: 'The Matrix', year: 1999 },
          { ...detailOf(1), tmdbId: 604, title: 'Déjà là' },
        ],
      }),
      'GET /api/medias/radarr/films/config': () => ({
        body: {
          qualityProfiles: [
            { id: 1, name: 'Any' },
            { id: 4, name: 'HD-1080p' },
          ],
          rootFolders: [{ id: 1, path: '/movies', accessible: true, freeSpace: null }],
          tags: [],
          defaultQualityProfileId: 4,
        },
      }),
      'POST /api/medias/radarr/films/add': () => ({
        body: { ok: true, movie: detailOf(42, { title: 'The Matrix' }), movieId: 42 },
      }),
    });
    await wrapper.find('[data-test="movies-add"]').trigger('click');
    await settle();
    const input = document.querySelector<HTMLInputElement>('[data-test="add-movie-search"] input');
    if (input === null) throw new Error('champ de recherche introuvable');
    input.value = 'matrix';
    input.dispatchEvent(new Event('input'));
    await vi.waitFor(
      () => {
        expect(document.querySelectorAll('[data-test="add-movie-result-item"]')).toHaveLength(2);
      },
      { timeout: 3_000 },
    );
    const items = document.querySelectorAll<HTMLElement>('[data-test="add-movie-result-item"]');
    // Déjà dans Radarr : « Voir » seulement, pas d'« Ajouter ».
    expect(items[1]?.querySelector('[data-test="add-movie-pick"]')).toBeNull();
    expect(items[1]?.querySelector('[data-test="add-movie-exists"]')).not.toBeNull();
    items[0]?.querySelector<HTMLElement>('[data-test="add-movie-pick"]')?.click();
    await settle();
    // Recherche auto décochée : pas de suivi après l'ajout.
    document
      .querySelector<HTMLInputElement>('[data-test="add-movie-form"] input[type="checkbox"]')
      ?.click();
    await settle();
    clickIn('[data-test="add-movie-confirm"]');
    await settle();
    const call = fetch.calls.find((c) => c.url === '/api/medias/radarr/films/add');
    expect(call?.body).toEqual({
      tmdbId: 603,
      title: 'The Matrix',
      year: 1999,
      qualityProfileId: 4,
      rootFolderPath: '/movies',
      monitored: false,
      searchForMovie: false,
    });
    expect(call?.headers['x-csrf-token']).toBe('csrf-1');
    expect(document.querySelector('[data-test="add-movie-result"]')?.textContent).toContain(
      t('media.films.modal.added_not_monitored', { title: 'The Matrix' }),
    );
    // Compte rendu : « Voir » mène à la fiche du film ajouté.
    expect(
      document
        .querySelector<HTMLAnchorElement>('[data-test="add-movie-open"]')
        ?.getAttribute('href'),
    ).toMatch(/\/films\/42$/);
  });

  it('ajout sans recherche saisie : tendances TMDB, un clic cherche le titre et le présélectionne (V16)', async () => {
    const card = (id: number, title: string, inLibrary = false) => ({
      id,
      type: 'movie',
      title,
      year: 1999,
      release: null,
      overview: null,
      poster: null,
      posterHi: null,
      backdrop: null,
      vote: null,
      voteCount: 0,
      popularity: null,
      inLibrary,
      libStatus: null,
      libId: null,
      libSlug: null,
    });
    const { wrapper, fetch } = await mountMovies('/medias/radarr/films', {
      'GET /api/decouverte/section/trending-movies': () => ({
        body: {
          results: [card(603, 'The Matrix'), card(604, 'Déjà là', true)],
          page: 1,
          totalPages: 1,
          totalResults: 2,
        },
      }),
      'GET /api/medias/radarr/films/lookup': () => ({
        body: [{ ...detailOf(9), id: null, tmdbId: 603, title: 'The Matrix', year: 1999 }],
      }),
      'GET /api/medias/radarr/films/config': () => ({
        body: { qualityProfiles: [], rootFolders: [], tags: [], defaultQualityProfileId: null },
      }),
    });
    await wrapper.find('[data-test="movies-add"]').trigger('click');
    await settle();
    expect(document.querySelector('[data-test="add-suggestions"]')?.textContent).toContain(
      t('media.add.empty_movie_title'),
    );
    const suggestions = document.querySelectorAll<HTMLButtonElement>(
      '[data-test="add-suggestion"]',
    );
    expect(suggestions).toHaveLength(2);
    suggestions[0]?.click();
    await settle();
    expect(fetch.calls.some((c) => c.url.startsWith('/api/medias/radarr/films/lookup?'))).toBe(
      true,
    );
    expect(document.querySelector('[data-test="add-suggestions"]')).toBeNull();
    expect(document.querySelector('[data-test="add-movie-form"]')?.textContent).toContain(
      'The Matrix (1999)',
    );
  });

  it('ajout : « Voir » (fiche TMDB ou fiche Hubarr), « Retour » conserve la recherche', async () => {
    const tmdb = {
      id: 603,
      type: 'movie',
      title: 'The Matrix',
      original: 'The Matrix',
      tagline: null,
      year: 1999,
      release: '1999-03-31',
      status: 'Released',
      runtime: 136,
      genres: [],
      overview: 'Synopsis TMDB',
      vote: 8,
      voteCount: 10,
      popularity: 1,
      poster: null,
      posterPath: null,
      backdrop: null,
      homepage: null,
      imdbId: null,
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
      crew: { directors: [], writers: [], composers: [], cinematographers: [] },
      trailer: null,
      videoGallery: [],
      seasonsList: [],
      altTitles: [],
      reviews: [],
      backdrops: [],
      similar: [],
      inLibrary: false,
      libStatus: null,
      libId: null,
      libSlug: null,
    };
    const { wrapper, router } = await mountMovies('/medias/radarr/films', {
      'GET /api/medias/radarr/films/lookup': () => ({
        body: [
          { ...detailOf(9), id: null, tmdbId: 603, title: 'The Matrix', year: 1999 },
          { ...detailOf(1), tmdbId: 604, title: 'Déjà là' },
        ],
      }),
      'GET /api/medias/radarr/films/config': () => ({
        body: { qualityProfiles: [], rootFolders: [], tags: [], defaultQualityProfileId: null },
      }),
      'GET /api/decouverte/detail/movie/603': () => ({ body: tmdb }),
    });
    await wrapper.find('[data-test="movies-add"]').trigger('click');
    await settle();
    const input = document.querySelector<HTMLInputElement>('[data-test="add-movie-search"] input');
    if (input === null) throw new Error('champ de recherche introuvable');
    input.value = 'matrix';
    input.dispatchEvent(new Event('input'));
    await vi.waitFor(
      () => {
        expect(document.querySelectorAll('[data-test="add-movie-result-item"]')).toHaveLength(2);
      },
      { timeout: 3_000 },
    );
    const item = (index: number) =>
      document.querySelectorAll<HTMLElement>('[data-test="add-movie-result-item"]')[index];

    // « Voir » d'un titre absent : fiche TMDB, dont « Ajouter » ouvre le formulaire.
    item(0)?.querySelector<HTMLElement>('[data-test="add-movie-view"]')?.click();
    await settle();
    expect(document.querySelector('[data-test="tmdb-detail"]')?.textContent).toContain(
      'Synopsis TMDB',
    );
    clickIn('[data-test="detail-add"]');
    await settle();
    expect(document.querySelector('[data-test="add-movie-form"]')?.textContent).toContain(
      'The Matrix (1999)',
    );
    expect(document.querySelector('[data-test="quick-add-dialog"]')).toBeNull();

    // « Retour » : résultats et recherche conservés.
    clickIn('[data-test="add-movie-back"]');
    await settle();
    expect(document.querySelector('[data-test="add-movie-form"]')).toBeNull();
    expect(
      document.querySelector<HTMLInputElement>('[data-test="add-movie-search"] input')?.value,
    ).toBe('matrix');
    expect(document.querySelectorAll('[data-test="add-movie-result-item"]')).toHaveLength(2);

    // « Voir » d'un titre déjà dans Radarr : sa fiche Hubarr.
    item(1)?.querySelector<HTMLElement>('[data-test="add-movie-view"]')?.click();
    await settle();
    expect(router.currentRoute.value.name).toBe('radarr-movie');
    expect(router.currentRoute.value.params.id).toBe('1');
  });

  it('suivre un artiste depuis la fiche, puis ne plus le suivre', async () => {
    const { fetch } = await mountMovies('/medias/radarr/films?open=1', {
      'GET /api/medias/radarr/films/1/detail': () => ({ body: detailOf(1) }),
      'GET /api/medias/radarr/films/1/credits': () => ({
        body: [
          {
            personName: 'Keanu Reeves',
            personTmdbId: 6384,
            character: 'Neo',
            job: null,
            department: null,
            type: 'cast',
            image: null,
          },
        ],
      }),
      'GET /api/medias/radarr/films/person/following': () => ({ body: {} }),
      'POST /api/medias/radarr/films/person/follow': () => ({
        body: { ok: true, listId: 11, already: false },
      }),
      'POST /api/medias/radarr/films/person/unfollow': () => ({ body: { ok: true } }),
    });
    const button = () => document.querySelector<HTMLElement>('[data-test="person-follow"]');
    expect(button()?.getAttribute('aria-pressed')).toBe('false');
    button()?.click();
    await settle();
    expect(fetch.calls.find((c) => c.url.endsWith('/person/follow'))?.body).toEqual({
      personTmdbId: 6384,
      personName: 'Keanu Reeves',
      type: 'cast',
      job: '',
    });
    expect(button()?.getAttribute('aria-pressed')).toBe('true');
    button()?.click();
    await settle();
    expect(fetch.calls.find((c) => c.url.endsWith('/person/unfollow'))?.body).toEqual({
      listId: 11,
    });
    expect(button()?.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Pages Radarr (P2.7)', () => {
  const page = <T>(records: T[], totalRecords = records.length) => ({
    records,
    totalRecords,
    page: 1,
    pageSize: 50,
  });

  it('file d’attente : éléments, suppression avec options et jeton CSRF', async () => {
    const { wrapper, fetch } = await mountMovies('/medias/radarr/films', {
      'GET /api/medias/radarr/films/queue': () => ({
        body: [
          {
            id: 9,
            movieId: 1,
            title: 'The Matrix',
            year: 1999,
            size: 100,
            sizeleft: 40,
            status: 'downloading',
            trackedStatus: 'ok',
            trackedState: 'downloading',
            quality: 'Bluray-1080p',
            protocol: 'torrent',
            eta: null,
            indexer: null,
            downloadId: null,
            outputPath: null,
            downloadClient: null,
            statusMessages: [],
          },
        ],
      }),
      'POST /api/medias/radarr/films/queue/9/delete': () => ({ body: { ok: true } }),
    });
    expect(wrapper.find('[data-test="queue-count"]').text()).toBe('1');
    await wrapper.find('[data-test="queue-toggle"]').trigger('click');
    await settle();
    expect(wrapper.find('[data-test="queue-item"]').text()).toContain('60%');
    await wrapper.find('[data-test="queue-delete"]').trigger('click');
    await settle();
    await wrapper.find('[data-test="queue-delete-options"] input[type="checkbox"]').setValue(true);
    await wrapper.find('[data-test="queue-delete-confirm"]').trigger('click');
    await settle();
    const call = fetch.calls.find((c) => c.url === '/api/medias/radarr/films/queue/9/delete');
    expect(call?.body).toEqual({ removeFromClient: true, blocklist: false, skipRedownload: false });
    expect(call?.headers['x-csrf-token']).toBe('csrf-1');
  });

  it('manquants : lignes, navigation de l’instance, recherche de tous après confirmation', async () => {
    const { wrapper, fetch } = await mountMovies('/medias/radarr/films/manquants', {
      'GET /api/medias/radarr/films/manquants': () => ({
        body: page(
          [
            {
              id: 1,
              title: 'The Matrix',
              year: 1999,
              status: 'released',
              qualityProfile: 'HD',
              releaseDate: null,
              poster: null,
            },
            {
              id: 2,
              title: 'Dune 3',
              year: 2027,
              status: 'announced',
              qualityProfile: null,
              releaseDate: null,
              poster: null,
            },
          ],
          2,
        ),
      }),
      'POST /api/medias/radarr/films/recherche-manquants': () => ({
        body: { ok: true, cmdId: null },
      }),
    });
    expect(wrapper.find('[data-test="radarr-nav"]').exists()).toBe(true);
    const rows = wrapper.findAll('[data-test="missing-row"]');
    expect(rows).toHaveLength(2);
    // Film annoncé : pas de recherche possible.
    expect(rows[1]?.find('[data-test="missing-search"]').exists()).toBe(false);
    await wrapper.find('[data-test="missing-search-all"]').trigger('click');
    await settle();
    expect(document.body.textContent).toContain(
      t('media.films_missing.confirm_search_all', { count: 2 }),
    );
    clickIn('[data-test="confirm"]');
    await settle();
    expect(
      fetch.calls.some((c) => c.method === 'POST' && c.url.endsWith('/recherche-manquants')),
    ).toBe(true);
    expect(wrapper.find('[data-test="page-banner"]').text()).toBe(
      t('media.films_missing.launch_error'),
    );
  });

  it('historique : le filtre passe dans l’URL et à l’API', async () => {
    const { wrapper, router, fetch } = await mountMovies('/medias/radarr/films/historique', {
      'GET /api/medias/radarr/films/historique': () => ({ body: page([]) }),
    });
    expect(wrapper.text()).toContain(t('media.films_history.empty'));
    await wrapper.find('[data-test="history-filter-1"]').trigger('click');
    await settle();
    expect(router.currentRoute.value.query).toEqual({ eventType: '1' });
    expect(fetch.calls.map((call) => call.url)).toContain(
      '/api/medias/radarr/films/historique?eventType=1',
    );
  });

  it('historique : tri par colonne et recherche par titre dans l’URL et à l’API (V5)', async () => {
    const grabbed = {
      id: 1,
      movieId: 1,
      eventType: 'grabbed',
      date: null,
      quality: null,
      sourceTitle: null,
      indexer: null,
      releaseTitle: null,
      importedPath: null,
      downloadClient: null,
      protocol: null,
      reason: null,
      movie: { title: 'Matrix', year: 1999 },
    };
    const { wrapper, router, fetch } = await mountMovies(
      '/medias/radarr/films/historique?eventType=1',
      {
        'GET /api/medias/radarr/films/historique': (call) => ({
          body: page(call.url.includes('q=') ? [] : [grabbed]),
        }),
      },
    );
    const urls = () => fetch.calls.map((call) => call.url);
    // Date décroissante par défaut : colonne marquée, rien dans l'URL.
    expect(wrapper.get('th[aria-sort="descending"]').text()).toContain(
      t('media.films_history.col_date'),
    );
    await wrapper.get('[data-test="sort-title"]').trigger('click');
    await settle();
    expect(router.currentRoute.value.query).toEqual({ eventType: '1', sort: 'title' });
    await wrapper.get('[data-test="sort-title"]').trigger('click');
    await settle();
    expect(router.currentRoute.value.query).toEqual({ eventType: '1', sort: 'title', dir: 'desc' });
    expect(urls()).toContain('/api/medias/radarr/films/historique?eventType=1&sort=title&dir=desc');

    const input = wrapper.get('[data-test="history-search"] input');
    await input.setValue('dune');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await settle();
    expect(router.currentRoute.value.query).toMatchObject({ q: 'dune', sort: 'title' });
    expect(urls().at(-1)).toBe(
      '/api/medias/radarr/films/historique?eventType=1&sort=title&dir=desc&q=dune',
    );
    expect(wrapper.text()).toContain(t('media.arr_lists.no_match', { q: 'dune' }));
  });

  it('collections : recherche et filtres côté client (V6)', async () => {
    const movie = (title: string, hasFile: boolean) => ({
      tmdbId: title.length,
      title,
      year: 2000,
      poster: null,
      inLibrary: true,
      hasFile,
    });
    const collection = (id: number, title: string, monitored: boolean, files: boolean[]) => ({
      id,
      tmdbId: id,
      title,
      overview: null,
      poster: null,
      monitored,
      qualityProfileId: null,
      rootFolderPath: null,
      movies: files.map((hasFile, index) => movie(`${title} ${index + 1}`, hasFile)),
    });
    const { wrapper, router } = await mountMovies('/medias/radarr/films/collections', {
      'GET /api/medias/radarr/films/collections': () => ({
        body: [
          collection(1, 'Dune', true, [true, false]),
          collection(2, 'Matrix', false, [true]),
          collection(3, 'Alien', true, [true]),
        ],
      }),
    });
    expect(wrapper.findAll('[data-test="collection-card"]')).toHaveLength(3);
    await wrapper.get('[data-test="collections-filter-missing"]').trigger('click');
    await settle();
    expect(router.currentRoute.value.query).toEqual({ show: 'missing' });
    expect(wrapper.findAll('[data-test="collection-card"]').map((card) => card.text())).toEqual([
      expect.stringContaining('Dune'),
    ]);
    await wrapper.get('[data-test="collections-filter-unmonitored"]').trigger('click');
    await settle();
    await wrapper.get('[data-test="collections-search"] input').setValue('mat');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await settle();
    expect(router.currentRoute.value.query).toEqual({ show: 'unmonitored', q: 'mat' });
    expect(wrapper.findAll('[data-test="collection-card"]')).toHaveLength(1);
    // Statistiques : toujours sur toutes les collections.
    expect(wrapper.get('[data-test="collections-stats"]').text()).toContain('3');
  });

  it('liste de blocage : tout cocher puis supprimer la sélection', async () => {
    const entry = (id: number) => ({
      id,
      movieId: 1,
      sourceTitle: `Bad ${id}`,
      quality: null,
      date: null,
      protocol: null,
      indexer: null,
      message: null,
      languages: [],
      movie: null,
    });
    const { wrapper, fetch } = await mountMovies('/medias/radarr/films/blocklist', {
      'GET /api/medias/radarr/films/blocklist': () => ({ body: page([entry(1), entry(2)]) }),
      'POST /api/medias/radarr/films/blocklist/bulk-delete': () => ({ body: { ok: true } }),
    });
    await wrapper.find('[data-test="blocklist-check-all"] input').setValue(true);
    await settle();
    await wrapper.find('[data-test="blocklist-bulk-delete"]').trigger('click');
    await settle();
    clickIn('[data-test="confirm"]');
    await settle();
    expect(fetch.calls.find((c) => c.url.endsWith('/blocklist/bulk-delete'))?.body).toEqual({
      ids: [1, 2],
    });
  });

  it('collections : statistiques et suivi', async () => {
    const { wrapper, fetch } = await mountMovies('/medias/radarr/films/collections', {
      'GET /api/medias/radarr/films/collections': () => ({
        body: [
          {
            id: 3,
            tmdbId: 1,
            title: 'Matrix',
            overview: null,
            poster: null,
            monitored: false,
            qualityProfileId: null,
            rootFolderPath: null,
            movies: [
              { tmdbId: 1, title: 'A', year: 1999, poster: null, hasFile: true, inLibrary: true },
              { tmdbId: 2, title: 'B', year: 2003, poster: null, hasFile: false, inLibrary: false },
            ],
          },
        ],
      }),
      'POST /api/medias/radarr/films/collections/3/monitor': () => ({
        body: { ok: true, monitored: true },
      }),
    });
    expect(wrapper.find('[data-test="collections-stats"]').text()).toContain('1');
    await wrapper.find('[data-test="collection-monitor"]').trigger('click');
    await settle();
    expect(fetch.calls.find((c) => c.url.endsWith('/collections/3/monitor'))?.body).toEqual({
      monitored: true,
    });
    expect(wrapper.find('[data-test="collection-monitor"]').text()).toBe(
      t('media.films_collections.unfollow'),
    );
  });

  it('système : statut, santé et section indisponible', async () => {
    const { wrapper } = await mountMovies('/medias/radarr/radarr/systeme', {
      'GET /api/medias/radarr/radarr/systeme': () => ({
        body: {
          status: {
            version: '5.0.1',
            osName: 'ubuntu',
            osVersion: '24.04',
            runtimeVersion: '8.0',
            databaseVersion: '3.45',
            startTime: null,
            urlBase: null,
            isDocker: true,
          },
          health: [{ type: 'warning', source: 'IndexerCheck', message: 'No indexers' }],
          diskSpace: [],
          downloadClients: [],
          indexers: null,
          logs: [],
        },
      }),
    });
    expect(wrapper.find('[data-test="system-status"]').text()).toContain('5.0.1');
    expect(wrapper.find('[data-test="system-health"]').text()).toContain('No indexers');
    expect(wrapper.find('[data-test="system-disks"]').text()).toContain(
      t('media.arr_system.disk.empty'),
    );
  });
});
