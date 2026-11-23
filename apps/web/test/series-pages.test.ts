// SPDX-License-Identifier: AGPL-3.0-or-later
// Pages Sonarr (P3a.3) : logique de la file d'attente (doublons « déjà
// importés », motifs d'import, séries sorties) et vues montées (file avec
// nettoyage et import, manquants, cutoff, historique, liste de blocage, système).

import type { SeriesQueueItem } from '@hubarr/shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import {
  classifyQueueWarnings,
  formatImportReasons,
  seriesLeftQueue,
} from '../src/features/series/series-queue';
import { settle } from './helpers';
import { cleanupMounted, clickIn, mountSeries } from './series-fixtures';

const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {});

beforeAll(async () => {
  await setLocale('en');
});
afterEach(cleanupMounted);

function queueItem(id: number, overrides: Partial<SeriesQueueItem> = {}): SeriesQueueItem {
  return {
    id,
    seriesId: 2,
    episodeId: 20 + id,
    seriesTitle: 'Severance',
    episode: `S01E0${id} — Episode`,
    size: 1_000,
    sizeleft: 250,
    status: 'downloading',
    trackedStatus: 'ok',
    trackedState: 'downloading',
    quality: 'WEBDL-1080p',
    protocol: 'torrent',
    eta: null,
    indexer: null,
    downloadId: `hash${id}`,
    outputPath: `/dl/${id}`,
    downloadClient: null,
    statusMessages: [],
    ...overrides,
  };
}

describe('logique de la file', () => {
  it('doublons « déjà importés » et imports en attente', () => {
    const { stale, blocked } = classifyQueueWarnings([
      queueItem(1),
      queueItem(2, {
        trackedStatus: 'warning',
        statusMessages: [{ title: 'x.mkv', messages: ['Episode file already imported at …'] }],
      }),
      queueItem(3, {
        trackedStatus: 'warning',
        statusMessages: [{ title: 'y.mkv', messages: ['Invalid season or episode'] }],
      }),
      queueItem(4, { trackedStatus: 'error', statusMessages: [] }),
    ]);
    expect(stale.map((item) => item.id)).toEqual([2]);
    expect(blocked.map((item) => item.id)).toEqual([3, 4]);
  });

  it('motifs regroupés, préfixe du fichier retiré, trois au plus', () => {
    expect(
      formatImportReasons([
        'a.mkv: Invalid season or episode',
        'b.mkv: Invalid season or episode',
        'c.mkv: Existing file',
        'no preview for X',
        'd.mkv: Sample',
        'e.mkv: Locked',
      ]),
    ).toBe('2× Invalid season or episode, Existing file, no preview for X, +2 more');
  });

  it('séries sorties de la file', () => {
    expect(seriesLeftQueue(new Set([1, 2]), [queueItem(1, { seriesId: 2 })])).toEqual([1]);
  });
});

describe('File d’attente', () => {
  it('éléments, puis import des bloqués avec bilan et motifs', async () => {
    const { wrapper, fetch } = await mountSeries('/medias/sonarr/series', {
      'GET /api/medias/sonarr/series/queue': () => ({
        body: [
          queueItem(1),
          queueItem(2, {
            trackedStatus: 'warning',
            statusMessages: [{ title: 'E02.mkv', messages: ['No match'] }],
          }),
        ],
      }),
      'POST /api/medias/sonarr/series/queue/import': () => ({
        body: {
          ok: true,
          cmdId: 3,
          imported: 1,
          skipped: 1,
          reasons: ['E03.mkv: Existing file'],
        },
      }),
    });
    expect(wrapper.find('[data-test="series-queue-count"]').text()).toBe('2');
    await wrapper.find('[data-test="series-queue-toggle"]').trigger('click');
    expect(wrapper.findAll('[data-test="series-queue-row"]')).toHaveLength(2);
    expect(wrapper.find('[data-test="series-queue-warnings"]').text()).toContain(
      t('media.series.queue.warning_imports_pending', { count: 1 }),
    );
    await wrapper.find('[data-test="series-queue-import"]').trigger('click');
    await settle();
    const call = fetch.calls.find((c) => c.url.endsWith('/queue/import'));
    expect(call?.body).toEqual({ items: [{ path: '/dl/2', downloadId: 'hash2' }] });
    expect(call?.headers['x-csrf-token']).toBe('csrf-1');
    expect(wrapper.find('[data-test="series-banner"]').text()).toBe(
      t('media.series.queue.import_partial_tpl', {
        IMPORTED: 1,
        TOTAL: 2,
        SKIPPED: 1,
        REASONS: 'Existing file',
      }),
    );
  });

  it('onglet « File d’attente » (V18) : dépliée, fiche de la série, actualiser et scanner', async () => {
    const { wrapper, fetch } = await mountSeries('/medias/sonarr/series/file-attente', {
      'GET /api/medias/sonarr/series/queue': () => ({ body: [queueItem(1)] }),
      'POST /api/medias/sonarr/series/2/refresh': () => ({ body: { ok: true, cmdId: 5 } }),
      'POST /api/medias/sonarr/series/2/rescan': () => ({ body: { ok: true, cmdId: 6 } }),
    });
    expect(wrapper.find('[data-test="series-queue-toggle"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-test="series-queue-row"]')).toHaveLength(1);
    expect(wrapper.get('[data-test="series-queue-open"]').attributes('href')).toBe(
      '/medias/sonarr/series/2',
    );
    await wrapper.get('[data-test="series-queue-refresh"]').trigger('click');
    await wrapper.get('[data-test="series-queue-rescan"]').trigger('click');
    await settle();
    const posts = fetch.calls.filter((call) => call.method === 'POST').map((call) => call.url);
    expect(posts).toEqual(
      expect.arrayContaining([
        '/api/medias/sonarr/series/2/refresh',
        '/api/medias/sonarr/series/2/rescan',
      ]),
    );
  });

  it('onglet « File d’attente » vide : message dédié', async () => {
    const { wrapper } = await mountSeries('/medias/sonarr/series/file-attente', {
      'GET /api/medias/sonarr/series/queue': () => ({ body: [] }),
    });
    expect(wrapper.text()).toContain(t('media.queue_page.empty'));
  });

  it('suppression après confirmation : client vidé, sans liste de blocage', async () => {
    const { wrapper, fetch } = await mountSeries('/medias/sonarr/series', {
      'GET /api/medias/sonarr/series/queue': () => ({ body: [queueItem(1)] }),
      'POST /api/medias/sonarr/series/queue/1/delete': () => ({ body: { ok: true } }),
    });
    await wrapper.find('[data-test="series-queue-toggle"]').trigger('click');
    await wrapper.find('[data-test="series-queue-delete"]').trigger('click');
    await settle();
    clickIn('[data-test="confirm"]');
    await settle();
    expect(fetch.calls.find((c) => c.url.endsWith('/queue/1/delete'))?.body).toEqual({
      removeFromClient: true,
      blocklist: false,
    });
  });
});

describe('Pages de l’instance', () => {
  it('manquants : lignes, navigation, recherche d’un épisode et de tous', async () => {
    const { wrapper, fetch } = await mountSeries('/medias/sonarr/series/manquants', {
      'GET /api/medias/sonarr/series/manquants': () => ({
        body: {
          records: [
            {
              id: 7,
              seriesId: 2,
              seriesTitle: 'Severance',
              seasonNumber: 2,
              episodeNumber: 5,
              title: 'Trojan’s Horse',
              airDate: '2025-02-14',
              airDateUtc: null,
              quality: null,
            },
          ],
          totalRecords: 120,
          page: 1,
          pageSize: 50,
        },
      }),
      'POST /api/medias/sonarr/series/episode/search': () => ({ body: { ok: true, cmdId: 1 } }),
      'POST /api/medias/sonarr/series/command/missing-search': () => ({
        body: { ok: true, cmdId: 2 },
      }),
    });
    expect(wrapper.find('[data-test="sonarr-nav"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="missing-row"]').text()).toContain('S02E05');
    expect(wrapper.find('[data-test="arr-pager"]').text()).toContain(
      t('media.series_missing.pagination_summary_tpl', { page: 1, total: 3 }),
    );
    await wrapper.find('[data-test="missing-search"]').trigger('click');
    await settle();
    expect(fetch.calls.find((c) => c.url.endsWith('/episode/search'))?.body).toEqual({
      episodeIds: [7],
    });
    await wrapper.find('[data-test="search-all-missing"]').trigger('click');
    await settle();
    expect(wrapper.find('[data-test="missing-banner"]').text()).toBe(
      t('media.series_missing.search_launched'),
    );
  });

  it('cutoff et historique : qualité actuelle, évènement traduit', async () => {
    const { wrapper, router } = await mountSeries('/medias/sonarr/series/cutoff', {
      'GET /api/medias/sonarr/series/cutoff': () => ({
        body: {
          records: [
            {
              id: 8,
              seriesId: 2,
              seriesTitle: 'Severance',
              seasonNumber: 1,
              episodeNumber: 1,
              title: 'Good News About Hell',
              airDate: null,
              airDateUtc: null,
              quality: 'HDTV-720p',
            },
          ],
          totalRecords: 1,
          page: 1,
          pageSize: 50,
        },
      }),
      'GET /api/medias/sonarr/series/historique': () => ({
        body: {
          records: [
            {
              id: 1,
              seriesId: 2,
              episodeId: 3,
              eventType: 'downloadFolderImported',
              date: null,
              quality: null,
              sourceTitle: 'Severance.S01E01',
              episode: { seasonNumber: 1, episodeNumber: 1, title: null },
              series: { title: 'Severance' },
              indexer: null,
              releaseTitle: null,
              importedPath: null,
              downloadClient: null,
              protocol: null,
              reason: null,
            },
          ],
          totalRecords: 1,
          page: 1,
          pageSize: 50,
        },
      }),
    });
    expect(wrapper.find('[data-test="cutoff-row"]').text()).toContain('HDTV-720p');
    await router.push('/medias/sonarr/series/historique');
    await settle();
    expect(wrapper.find('[data-test="history-row"]').text()).toContain(
      t('media.series_history.event_imported'),
    );
  });

  it('cutoff : profil de qualité et recherche dans l’URL et à l’API (V6)', async () => {
    const { wrapper, router, fetch } = await mountSeries('/medias/sonarr/series/cutoff', {
      'GET /api/medias/sonarr/series/cutoff': () => ({
        body: { records: [], totalRecords: 0, page: 1, pageSize: 50 },
      }),
      'GET /api/medias/sonarr/series/config': () => ({
        body: {
          qualityProfiles: [{ id: 4, name: 'HD-1080p' }],
          rootFolders: [],
          tags: [],
          defaultQualityProfileId: null,
        },
      }),
    });
    expect(wrapper.text()).toContain(t('media.series_cutoff.empty'));
    await router.push({ query: { profile: '4' } });
    await settle();
    expect(fetch.calls.map((call) => call.url)).toContain(
      '/api/medias/sonarr/series/cutoff?profile=4',
    );
    expect(wrapper.text()).toContain(t('media.arr_lists.no_match_filters'));
    await wrapper.get('[data-test="cutoff-search"] input').setValue('sev');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await settle();
    expect(router.currentRoute.value.query).toEqual({ profile: '4', q: 'sev' });
    expect(fetch.calls.at(-1)?.url).toBe('/api/medias/sonarr/series/cutoff?q=sev&profile=4');
  });

  it('liste de blocage : tout cocher puis supprimer la sélection', async () => {
    const { wrapper, fetch } = await mountSeries('/medias/sonarr/series/blocklist', {
      'GET /api/medias/sonarr/series/blocklist': () => ({
        body: {
          records: [4, 5].map((id) => ({
            id,
            seriesId: 2,
            seriesTitle: 'Severance',
            sourceTitle: `Release ${id}`,
            quality: 'SD',
            date: null,
            protocol: 'torrent',
            indexer: null,
            message: null,
            languages: [],
          })),
          totalRecords: 2,
          page: 1,
          pageSize: 50,
        },
      }),
      'POST /api/medias/sonarr/series/blocklist/bulk-delete': () => ({ body: { ok: true } }),
    });
    await wrapper.find('[data-test="blocklist-check-all"] input').trigger('click');
    await settle();
    await wrapper.find('[data-test="blocklist-bulk-delete"]').trigger('click');
    await settle();
    expect(document.body.textContent).toContain(
      t('media.series_blocklist.confirm_bulk_delete_tpl', { count: 2 }),
    );
    clickIn('[data-test="confirm"]');
    await settle();
    expect(fetch.calls.find((c) => c.url.endsWith('/blocklist/bulk-delete'))?.body).toEqual({
      ids: [4, 5],
    });
  });

  it('système : statut et section indisponible', async () => {
    const { wrapper } = await mountSeries('/medias/sonarr/series/systeme', {
      'GET /api/medias/sonarr/series/systeme': () => ({
        body: {
          status: {
            version: '4.0.20.3014',
            osName: 'linux',
            osVersion: null,
            runtimeVersion: null,
            databaseVersion: null,
            startTime: null,
            urlBase: null,
            isDocker: true,
          },
          health: [],
          diskSpace: null,
          downloadClients: [],
          indexers: [],
          logs: [],
        },
      }),
    });
    expect(wrapper.text()).toContain(t('media.arr_system.title_sonarr'));
    expect(wrapper.find('[data-test="system-status"]').text()).toContain('4.0.20.3014');
  });
});
