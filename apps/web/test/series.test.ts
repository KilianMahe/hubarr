// SPDX-License-Identifier: AGPL-3.0-or-later
// Bibliothèque de séries (P3a.1) : logique pure (URL, état affiché d'une
// série, étagères, vue mémorisée) et vue montée contre une API simulée
// (filtres dans l'URL, calendrier, actions filtrées, masse, ajout).

import { DEFAULT_SERIES_LIBRARY_QUERY, byteUnits, type Series } from '@hubarr/shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { VSelect } from 'vuetify/components';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import {
  readSeriesViewMode,
  seriesApiParamsOf,
  seriesDisplayState,
  seriesRouteQueryOf,
  seriesShelvesOf,
  seriesSize,
  seriesStateTitle,
} from '../src/features/series/library';
import { settle, type FakeCall } from './helpers';
import {
  SERIES,
  cleanupMounted,
  clickIn,
  mountSeries,
  seriesItem,
  seriesLibraryOf,
} from './series-fixtures';

const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {});

beforeAll(async () => {
  await setLocale('en');
});
afterEach(cleanupMounted);

describe('logique de la bibliothèque de séries', () => {
  it('URL propre et paramètres de l’API', () => {
    const query = {
      ...DEFAULT_SERIES_LIBRARY_QUERY,
      network: 'HBO',
      sort: 'percent-desc' as const,
    };
    expect(seriesRouteQueryOf(query, 200, 3)).toEqual({
      network: 'HBO',
      sort: 'percent-desc',
      page: '3',
    });
    expect(seriesApiParamsOf({ ...query, page: 2 }, 9).toString()).toBe(
      'network=HBO&sort=percent-desc&per_page=200&page=2&open=9',
    );
  });

  it('état affiché dans l’ordre de l’original', () => {
    expect(seriesDisplayState(seriesItem(1, { monitored: false, episodeFileCount: 0 }))).toBe(
      'unmonitored',
    );
    expect(seriesDisplayState(seriesItem(1, { status: 'upcoming' }))).toBe('upcoming');
    expect(seriesDisplayState(seriesItem(1, { percent: 100 }))).toBe('upToDate');
    expect(seriesDisplayState(seriesItem(1, { percent: 100, status: 'ended' }))).toBe('complete');
    expect(seriesDisplayState(seriesItem(1))).toBe('missing');
    expect(seriesDisplayState(seriesItem(1, { episodeCount: 0, percent: 0 }))).toBe('unmonitored');
    expect(seriesStateTitle(t, seriesItem(1))).toBe(
      t('media.series.status.missing_tpl', { count: 10 }),
    );
  });

  it('étagères : un animé suivi figure aussi dans son statut ; non suivies à part', () => {
    const shelves = seriesShelvesOf([
      seriesItem(1, { seriesType: 'anime' }),
      seriesItem(2, { status: 'ended' }),
      seriesItem(3, { monitored: false, seriesType: 'anime' }),
    ]);
    expect(shelves.map((shelf) => [shelf.key, shelf.items.map((item) => item.id)])).toEqual([
      ['continuing', [1]],
      ['anime', [1, 3]],
      ['ended', [2]],
      ['unmonitored', [3]],
    ]);
  });

  it('vue mémorisée propre aux séries, taille lisible', () => {
    localStorage.setItem('hubarr.series-view', 'table');
    expect(readSeriesViewMode('grid', localStorage)).toBe('table');
    localStorage.setItem('hubarr.series-view', 'bogus');
    expect(readSeriesViewMode('grid', localStorage)).toBe('grid');
    expect(seriesSize(t, 1_610_612_736)).toBe(`1.5 ${t('media.series.stats.gb_suffix')}`);
    // Au-delà de 1 024 Go : en To (P5d.5, V29).
    expect(seriesSize(t, 1.5 * 1024 ** 4)).toBe(`1.5 ${byteUnits(i18n.global.locale.value).TB}`);
    expect(seriesSize(t, 5_242_880)).toBe(`5 ${t('media.series.stats.mo_suffix')}`);
  });
});

const libraryCalls = (calls: FakeCall[]) =>
  calls.filter(
    (call) => call.method === 'GET' && call.url.startsWith('/api/medias/sonarr/series?'),
  );

describe('SeriesView', () => {
  it('statistiques, avertissement et séries ; prochains épisodes dans leur onglet (V17)', async () => {
    localStorage.setItem('hubarr.series-view', 'extended');
    const { wrapper } = await mountSeries('/medias/sonarr/series', {
      'GET /api/medias/sonarr/series': () => ({
        body: seriesLibraryOf(SERIES, {
          calendar: [
            {
              id: 50,
              seriesId: 2,
              tvdbId: null,
              tmdbId: null,
              seriesTitle: 'Severance',
              poster: null,
              fanart: null,
              season: 2,
              episode: 3,
              title: 'Who Is Alive?',
              overview: null,
              airDate: '2099-01-01',
              airDateUtc: '2099-01-01T02:00:00Z',
              hasFile: false,
              monitored: true,
              runtime: 50,
              network: 'Apple TV+',
              genres: [],
            },
          ],
        }),
      }),
    });
    expect(wrapper.find('[data-test="series-stats"]').text()).toContain('42.5');
    expect(wrapper.find('[data-test="series-warning"]').text()).toBe(
      t('media.import.blocked_warning', { count: 2 }),
    );
    const text = wrapper.find('[data-test="series-content"]').text();
    expect(text).toContain('The Wire');
    expect(text).toContain(t('media.series.status.ended'));
    expect(wrapper.find('[data-test="series-calendar"]').exists()).toBe(false);
  });

  it('les critères de l’URL partent à l’API ; un statut change l’URL et revient page 1', async () => {
    const { wrapper, router, fetch } = await mountSeries(
      '/medias/sonarr/series?network=HBO&page=2',
    );
    expect(libraryCalls(fetch.calls)[0]?.url).toBe(
      '/api/medias/sonarr/series?network=HBO&per_page=200&page=2',
    );
    await wrapper.find('[data-test="status-anime"]').trigger('click');
    await settle();
    expect(router.currentRoute.value.query).toEqual({ network: 'HBO', status: 'anime' });
    expect(wrapper.find('[data-test="search-filtered"]').exists()).toBe(true);
  });

  it('rechercher les filtrés : séries avec épisodes manquants, confirmation, une recherche par série', async () => {
    const { wrapper, fetch } = await mountSeries('/medias/sonarr/series?status=missing', {
      'GET /api/medias/sonarr/series/filter/ids': () => ({ body: { ids: [2, 5], total: 2 } }),
      'POST /api/medias/sonarr/series/2/search': () => ({ body: { ok: true, cmdId: 1, count: 3 } }),
      'POST /api/medias/sonarr/series/5/search': () => ({ body: { ok: true, cmdId: 2, count: 1 } }),
    });
    await wrapper.find('[data-test="search-filtered"]').trigger('click');
    await settle();
    const ids = fetch.calls.find((call) => call.url.includes('/filter/ids'));
    expect(ids?.url).toContain('searchable_only=1');
    expect(document.body.textContent).toContain(
      t('media.series.warnings.confirm_search_filtered_tpl', { count: 2 }),
    );
    clickIn('[data-test="confirm"]');
    await settle();
    expect(
      fetch.calls
        .filter((call) => call.method === 'POST' && call.url.endsWith('/search'))
        .map((call) => call.url),
    ).toEqual(['/api/medias/sonarr/series/2/search', '/api/medias/sonarr/series/5/search']);
    expect(wrapper.find('[data-test="series-banner"]').text()).toBe(
      t('media.series.warnings.search_launched_tpl', { count: 2 }),
    );
  });

  it('sélection puis édition en masse : seuls les champs choisis partent', async () => {
    localStorage.setItem('hubarr.series-view', 'extended');
    const { wrapper, fetch } = await mountSeries('/medias/sonarr/series', {
      'GET /api/medias/sonarr/sonarr/quality-profiles': () => ({ body: [{ id: 1, name: 'HD' }] }),
      'GET /api/medias/sonarr/sonarr/root-folders': () => ({ body: [] }),
      'GET /api/medias/sonarr/sonarr/tags-json': () => ({ body: [] }),
      'POST /api/medias/sonarr/series/bulk/edit': () => ({ body: { ok: true } }),
    });
    await wrapper.find('[data-test="series-select-mode"]').trigger('click');
    await settle();
    const rows = wrapper.findAll('.series-row .media-item__hit');
    await rows[0]?.trigger('click');
    await rows[1]?.trigger('click');
    await wrapper.find('[data-test="bulk-edit"]').trigger('click');
    await settle();
    // Type de série : « Anime » (le menu de Vuetify ne s'ouvre pas sous jsdom).
    const typeSelect = wrapper
      .findAllComponents(VSelect)
      .find((select) => select.props('label') === t('media.series.bulk.edit_type'));
    typeSelect?.vm.$emit('update:modelValue', 'anime');
    await settle();
    clickIn('[data-test="bulk-edit-save"]');
    await settle();
    const call = fetch.calls.find((c) => c.url === '/api/medias/sonarr/series/bulk/edit');
    expect(call?.body).toEqual({ seriesIds: [1, 2], seriesType: 'anime' });
    expect(call?.headers['x-csrf-token']).toBe('csrf-1');
    expect(wrapper.find('[data-test="series-banner"]').text()).toBe(
      t('media.series.warnings.modified_ok_tpl', { count: 2 }),
    );
  });

  it('marque-page d’une carte : bascule le suivi et relit la bibliothèque', async () => {
    const { wrapper, fetch } = await mountSeries('/medias/sonarr/series', {
      'POST /api/medias/sonarr/series/3/monitor': () => ({ body: { ok: true, monitored: true } }),
    });
    const before = libraryCalls(fetch.calls).length;
    await wrapper.findAll('[data-test="series-card-monitor"]')[2]?.trigger('click');
    await settle();
    expect(fetch.calls.find((call) => call.url.endsWith('/3/monitor'))?.body).toEqual({
      monitored: true,
    });
    expect(libraryCalls(fetch.calls).length).toBeGreaterThan(before);
  });

  it('ajout : recherche différée, profil de l’instance présélectionné, corps envoyé', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const found: Series = {
        ...seriesItem(0),
        id: null,
        tvdbId: 334824,
        title: 'Dark',
        seriesType: 'standard',
        imdbId: null,
        tmdbId: null,
        fanart: null,
        banner: null,
        certification: null,
        airTime: null,
        path: null,
        rootFolderPath: null,
        seasonFolder: true,
        monitorNewItems: 'all',
        ratings: null,
        seasons: [],
        firstAired: null,
        previousAiring: null,
      };
      const { wrapper, fetch } = await mountSeries('/medias/sonarr/series', {
        'GET /api/medias/sonarr/series': () => ({
          body: seriesLibraryOf(SERIES, { defaultQualityProfileId: 7 }),
        }),
        'GET /api/medias/sonarr/sonarr/quality-profiles': () => ({
          body: [
            { id: 1, name: 'Any' },
            { id: 7, name: 'HD-1080p' },
          ],
        }),
        'GET /api/medias/sonarr/sonarr/root-folders': () => ({
          body: [{ id: 1, path: '/tv', accessible: true, freeSpace: null }],
        }),
        'GET /api/medias/sonarr/sonarr/tags-json': () => ({ body: [] }),
        'GET /api/medias/sonarr/series/lookup': () => ({ body: [found] }),
        'POST /api/medias/sonarr/series/add': () => ({
          body: { ok: true, series: { ...found, id: 99 } },
        }),
      });
      await wrapper.find('[data-test="series-add"]').trigger('click');
      await settle();
      const input = document.querySelector<HTMLInputElement>(
        '[data-test="add-series-search"] input',
      );
      if (input === null) throw new Error('champ de recherche absent');
      input.value = 'dark';
      input.dispatchEvent(new Event('input'));
      await vi.advanceTimersByTimeAsync(450);
      await settle();
      expect(fetch.calls.some((call) => call.url.includes('/lookup?term=dark'))).toBe(true);
      clickIn('[data-test="add-series-result-item"] [data-test="add-series-pick"]');
      await settle();
      clickIn('[data-test="add-series-confirm"]');
      await settle();
      const call = fetch.calls.find((c) => c.url === '/api/medias/sonarr/series/add');
      expect(call?.body).toMatchObject({
        tvdbId: 334824,
        qualityProfileId: 7,
        rootFolderPath: '/tv',
        seriesType: 'standard',
        monitor: 'all',
        seasonFolder: true,
        searchForMissing: false,
      });
      expect(document.body.textContent).toContain(t('media.series.modal.added_success'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('Sonarr injoignable : pas de liste, pas d’erreur générique', async () => {
    const { wrapper } = await mountSeries('/medias/sonarr/series', {
      'GET /api/medias/sonarr/series': () => ({
        status: 503,
        body: { code: 'SERVICE_UNREACHABLE', service: 'sonarr' },
      }),
    });
    expect(wrapper.find('[data-test="series-content"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain(t('error.generic.message'));
  });
});
