// SPDX-License-Identifier: AGPL-3.0-or-later
// Fiche série (P3a.2) : logique pure (saisons, étiquettes des releases,
// historique, gestionnaire de fichiers) et dialogue monté contre une API
// simulée (lien profond, suivi, épisodes, recherche interactive, renommage,
// fichiers, édition, suppression, page n° 195 et redirection de `?open=`).

import type { Episode, EpisodeFile, SeriesDetail, SeriesRelease } from '@hubarr/shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import {
  episodeStatus,
  fileRowsOf,
  historyEventLabel,
  monitorRange,
  queuedEpisodes,
  releaseLabels,
  rowChanges,
  seasonGroups,
} from '../src/features/series/series-detail';
import { settle } from './helpers';
import { SERIES, cleanupMounted, clickIn, mountSeries, seriesItem } from './series-fixtures';

const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {});

beforeAll(async () => {
  await setLocale('en');
});
afterEach(cleanupMounted);

function episode(id: number, overrides: Partial<Episode> = {}): Episode {
  return {
    id,
    seriesId: 2,
    seasonNumber: 1,
    episodeNumber: id,
    title: `Episode ${id}`,
    airDate: '2024-01-01',
    airDateUtc: '2024-01-01T20:00:00.000Z',
    overview: null,
    hasFile: false,
    monitored: true,
    episodeFileId: 0,
    runtime: 50,
    ...overrides,
  };
}

function file(id: number, overrides: Partial<EpisodeFile> = {}): EpisodeFile {
  return {
    id,
    seriesId: 2,
    seasonNumber: 1,
    relativePath: `Season 01/E${id}.mkv`,
    path: null,
    size: 1_073_741_824,
    dateAdded: null,
    quality: { id: 3, name: 'WEBDL-1080p' },
    qualityVersion: 1,
    languages: [{ id: 2, name: 'French' }],
    releaseGroup: 'GRP',
    releaseType: 'singleEpisode',
    indexerFlags: 0,
    customFormats: [],
    customFormatScore: 15,
    mediaInfo: null,
    ...overrides,
  };
}

function release(overrides: Partial<SeriesRelease> = {}): SeriesRelease {
  return {
    guid: 'g1',
    indexerId: 1,
    title: 'Severance.S01.1080p',
    indexer: 'Idx',
    quality: 'WEBDL-1080p',
    sizeMb: 2048,
    seeders: 12,
    leechers: 1,
    protocol: 'torrent',
    age: 3,
    approved: true,
    rejections: [],
    customFormatScore: 0,
    scoreDetails: [],
    customFormats: [],
    languages: ['English'],
    infoUrl: null,
    fullSeason: true,
    episodeRequested: true,
    seasonNumber: 1,
    episodeNumbers: [],
    mappedSeasonNumber: null,
    mappedEpisodeNumbers: [],
    releaseGroup: 'GRP',
    ...overrides,
  };
}

describe('logique de la fiche', () => {
  it('état d’un épisode : présent, manquant, à venir, non suivi', () => {
    const now = Date.parse('2024-06-01T00:00:00Z');
    expect(episodeStatus(episode(1, { hasFile: true }), now)).toBe('downloaded');
    expect(episodeStatus(episode(2), now)).toBe('missing');
    expect(episodeStatus(episode(3, { airDateUtc: '2024-07-01T20:00:00Z' }), now)).toBe('upcoming');
    expect(episodeStatus(episode(4, { airDateUtc: null }), now)).toBe('upcoming');
    expect(episodeStatus(episode(5, { monitored: false }), now)).toBe('unmonitored');
    // Dans la file de Sonarr : en téléchargement, même non suivi ou à venir.
    expect(episodeStatus(episode(6), now, true)).toBe('downloading');
    expect(episodeStatus(episode(7, { monitored: false }), now, true)).toBe('downloading');
    expect(episodeStatus(episode(8, { hasFile: true }), now, true)).toBe('downloaded');
  });

  it('épisodes en file : ceux de la série, progression la plus avancée', () => {
    const item = (seriesId: number, episodeId: number | null, size: number, sizeleft: number) => ({
      seriesId,
      episodeId,
      size,
      sizeleft,
    });
    const queued = queuedEpisodes(
      [
        item(2, 1, 100, 58),
        item(2, 1, 100, 10),
        item(2, 2, 0, 0),
        item(3, 4, 100, 0),
        item(2, null, 1, 0),
      ],
      2,
    );
    expect([...queued]).toEqual([
      [1, 90],
      [2, null],
    ]);
  });

  it('saisons : la plus récente d’abord, progression et suivi', () => {
    const groups = seasonGroups([
      episode(1, { hasFile: true }),
      episode(2),
      episode(3, { seasonNumber: 2, monitored: false }),
    ]);
    expect(
      groups.map((group) => [group.seasonNumber, group.files, group.total, group.monitored]),
    ).toEqual([
      [2, 0, 1, false],
      [1, 1, 2, true],
    ]);
    expect(groups[1]?.percent).toBe(50);
  });

  it('épisodes d’une saison : le dernier en premier, spéciaux compris (V20)', () => {
    const groups = seasonGroups([
      episode(1, { episodeNumber: 1 }),
      episode(2, { episodeNumber: 3 }),
      episode(3, { episodeNumber: 2 }),
      episode(4, { seasonNumber: 0, episodeNumber: 1 }),
      episode(5, { seasonNumber: 0, episodeNumber: 2 }),
    ]);
    expect(groups.map((group) => group.episodes.map((item) => item.episodeNumber))).toEqual([
      [3, 2, 1],
      [2, 1],
    ]);
  });

  it('plage de suivi au Maj+clic', () => {
    expect(monitorRange([1, 2, 3, 4], 1, 3)).toEqual([1, 2, 3]);
    expect(monitorRange([1, 2, 3, 4], 4, 2)).toEqual([2, 3, 4]);
    expect(monitorRange([1, 2, 3, 4], null, 2)).toEqual([2]);
  });

  it('étiquettes des releases : pack, épisodes, numérotation TVDB', () => {
    const labels = releaseLabels(t, [
      release(),
      release({ guid: 'g2', fullSeason: false, episodeNumbers: [2, 3] }),
      release({
        guid: 'g3',
        fullSeason: false,
        episodeNumbers: [1],
        mappedSeasonNumber: 2,
        mappedEpisodeNumbers: [5, 6, 7, 8],
      }),
    ]);
    expect(labels).toEqual({
      g1: t('media.label.season_prefix', { number: 1 }),
      g2: '1x2, 1x3',
      g3: '1x1 · TVDB 2x5-8',
    });
  });

  it('évènements de Sonarr v4 traduits, inconnus rendus tels quels', () => {
    expect(historyEventLabel(t, 'downloadFolderImported')).toBe(
      t('media.series_history.event_imported'),
    );
    expect(historyEventLabel(t, 'weird')).toBe('weird');
  });

  it('gestionnaire : métadonnées et réattribution distinguées ; saison sans épisode refusée', () => {
    const episodes = [episode(1, { hasFile: true, episodeFileId: 10 }), episode(2)];
    const [original] = fileRowsOf([file(10)], episodes);
    if (original === undefined) throw new Error('ligne absente');
    expect(original.episodeNumber).toBe(1);
    expect(rowChanges(original, { ...original }, episodes)).toEqual({
      update: null,
      reassign: null,
    });
    expect(
      rowChanges(original, { ...original, releaseGroup: 'NEW', episodeNumber: 2 }, episodes),
    ).toEqual({ update: { fileId: 10, releaseGroup: 'NEW' }, reassign: { episodeId: 2 } });
    expect(
      rowChanges(original, { ...original, seasonNumber: 2, episodeNumber: null }, episodes)
        .reassign,
    ).toBe('missing');
  });
});

// ── Dialogue monté ──────────────────────────────────────────────────────────

function detailOf(overrides: Partial<SeriesDetail> = {}): SeriesDetail {
  return {
    ...seriesItem(2, { title: 'Severance', network: 'Apple TV+' }),
    tmdbId: null,
    imdbId: null,
    fanart: null,
    banner: null,
    certification: 'TV-MA',
    airTime: null,
    path: '/tv/Severance',
    rootFolderPath: '/tv',
    seasonFolder: true,
    monitorNewItems: 'all',
    ratings: 8.7,
    seasons: [],
    firstAired: null,
    previousAiring: null,
    ...overrides,
  };
}

const EPISODES = [
  episode(1, { hasFile: true, episodeFileId: 10 }),
  episode(2),
  episode(3, { seasonNumber: 2 }),
];

function detailRoutes(overrides: Parameters<typeof mountSeries>[1] = {}) {
  return {
    'GET /api/medias/sonarr/series/2/info': () => ({ body: detailOf() }),
    'GET /api/medias/sonarr/series/2/episodes': () => ({ body: EPISODES }),
    'GET /api/medias/sonarr/series/2/files': () => ({ body: [file(10)] }),
    ...overrides,
  };
}

describe('Fiche série', () => {
  it('un clic sur une carte ouvre la page de la série ; saisons et épisodes', async () => {
    const { wrapper, router } = await mountSeries('/medias/sonarr/series', detailRoutes());
    await wrapper.findAll('.poster-card__hit')[1]?.trigger('click');
    await settle();
    expect(router.currentRoute.value.name).toBe('sonarr-series');
    expect(router.currentRoute.value.params.id).toBe('2');
    const dialog = document.querySelector('[data-test="series-detail"]');
    expect(dialog?.textContent).toContain('Severance');
    expect(dialog?.textContent).toContain('Apple TV+');
    // Saison 2 ouverte (la plus récente) : un épisode.
    expect(document.querySelectorAll('[data-test="episode-row"]')).toHaveLength(1);
    expect(dialog?.textContent).toContain(t('media.series.detail.season_tpl', { n: 1 }));
  });

  it('un épisode dans la file de Sonarr est « en téléchargement », pas manquant', async () => {
    let queue: unknown[] = [
      { seriesId: 2, episodeId: 3, size: 100, sizeleft: 58 },
      { seriesId: 9, episodeId: 2, size: 100, sizeleft: 0 },
    ].map((item, index) => ({
      id: index + 1,
      seriesTitle: 'Severance',
      episode: 'S02E01',
      status: 'downloading',
      trackedStatus: 'ok',
      trackedState: 'downloading',
      quality: 'WEBDL-1080p',
      protocol: 'torrent',
      eta: null,
      indexer: null,
      downloadId: null,
      outputPath: null,
      downloadClient: null,
      statusMessages: [],
      ...item,
    }));
    let episodesRead = 0;
    const { queryClient } = await mountSeries(
      '/medias/sonarr/series/2',
      detailRoutes({
        'GET /api/medias/sonarr/series/queue': () => ({ body: queue }),
        'GET /api/medias/sonarr/series/2/episodes': () => {
          episodesRead += 1;
          return { body: EPISODES };
        },
      }),
    );
    const status = () => document.querySelector('[data-test="episode-row"] .episode__status');
    expect(status()?.textContent.trim()).toBe(
      t('media.series_detail.episode.status_downloading_progress', { progress: 42 }),
    );
    expect(status()?.classList.contains('text-primary')).toBe(true);
    // Sorti de la file (importé) : les épisodes sont relus.
    const before = episodesRead;
    queue = [];
    await queryClient.invalidateQueries({ queryKey: ['sonarr', 'sonarr', 'queue'] });
    await settle();
    expect(episodesRead).toBeGreaterThan(before);
    expect(status()?.textContent.trim()).toBe(t('media.series_detail.episode.status_missing'));
  });

  it('mobile : recherche et actualisation dans la page, le reste dans le speed-dial', async () => {
    const happy = (window as unknown as { happyDOM: { setViewport(size: object): void } }).happyDOM;
    const width = window.innerWidth;
    happy.setViewport({ width: 412, height: 900 });
    try {
      await mountSeries('/medias/sonarr/series/2', detailRoutes());
      const detail = document.querySelector('[data-test="series-detail"]');
      for (const id of ['series-monitor', 'series-search-missing', 'series-refresh'])
        expect(detail?.querySelector(`[data-test="${id}"]`), id).not.toBeNull();
      expect(detail?.querySelector('[data-test="series-edit-open"]')).toBeNull();
      clickIn('[data-test="series-speed-dial"]');
      await settle();
      expect(document.querySelector('[data-test="series-edit-open"]')).not.toBeNull();
      expect(document.querySelectorAll('[data-test="series-search-missing"]')).toHaveLength(1);
    } finally {
      happy.setViewport({ width, height: 900 });
    }
  });

  it('page n° 195 : `/medias/:slug/series/:id` est la fiche (D130)', async () => {
    const { router } = await mountSeries('/medias/sonarr/series/2', detailRoutes());
    expect(router.currentRoute.value.name).toBe('sonarr-series');
    expect(document.querySelector('[data-test="series-title"]')?.textContent).toContain(
      'Severance',
    );
  });

  it('suivi de la série, puis d’une saison, avec le jeton CSRF', async () => {
    const { fetch } = await mountSeries(
      '/medias/sonarr/series?open=2',
      detailRoutes({
        'POST /api/medias/sonarr/series/2/monitor': () => ({
          body: { ok: true, monitored: false },
        }),
        'POST /api/medias/sonarr/series/season/monitor': () => ({ body: { ok: true } }),
      }),
    );
    clickIn('[data-test="series-monitor"]');
    await settle();
    const monitor = fetch.calls.find((call) => call.url.endsWith('/2/monitor'));
    expect(monitor?.body).toEqual({ monitored: false });
    expect(monitor?.headers['x-csrf-token']).toBe('csrf-1');
    clickIn('[data-test="season-monitor"]');
    await settle();
    expect(fetch.calls.find((call) => call.url.endsWith('/season/monitor'))?.body).toEqual({
      seriesId: 2,
      seasonNumber: 2,
      monitored: false,
    });
  });

  it('rechercher les manquants : rien à chercher → message traduit', async () => {
    await mountSeries(
      '/medias/sonarr/series?open=2',
      detailRoutes({
        'POST /api/medias/sonarr/series/2/search': () => ({
          body: { ok: true, cmdId: null, count: 0 },
        }),
      }),
    );
    clickIn('[data-test="series-search-missing"]');
    await settle();
    expect(document.querySelector('[data-test="series-detail-banner"]')?.textContent).toContain(
      t('media.api.no_missing_episodes'),
    );
  });

  it('recherche interactive d’une saison : étiquettes, grab avec le jeton CSRF', async () => {
    const { fetch } = await mountSeries(
      '/medias/sonarr/series?open=2',
      detailRoutes({
        'GET /api/medias/sonarr/series/2/season/2/releases': () => ({ body: [release()] }),
        'POST /api/medias/sonarr/series/release/grab': () => ({ body: { ok: true } }),
      }),
    );
    clickIn('[data-test="season-menu"]');
    await settle();
    clickIn('[data-test="season-interactive"]');
    await settle();
    expect(document.querySelector('[data-test="release-label"]')?.textContent).toContain(
      t('media.label.season_prefix', { number: 1 }),
    );
    clickIn('[data-test="release-row"] button');
    await settle();
    const grab = fetch.calls.find((call) => call.url.endsWith('/release/grab'));
    expect(grab?.body).toEqual({ guid: 'g1', indexerId: 1 });
    expect(document.querySelector('[data-test="series-detail-banner"]')?.textContent).toContain(
      t('media.series.detail.download_started'),
    );
    clickIn('[data-test="series-panel-back"]');
    await settle();
    expect(document.querySelector('[data-test="series-seasons"]')).not.toBeNull();
  });

  it('renommage de la série : propositions cochées, `RenameFiles` suivi jusqu’au bilan', async () => {
    const { fetch } = await mountSeries(
      '/medias/sonarr/series?open=2',
      detailRoutes({
        'GET /api/medias/sonarr/series/2/rename': () => ({
          body: [
            {
              episodeFileId: 10,
              seasonNumber: 1,
              episodeNumbers: [1],
              existingPath: 'a.mkv',
              newPath: 'b.mkv',
            },
          ],
        }),
        'POST /api/medias/sonarr/series/2/rename': () => ({ body: { ok: true, cmdId: 5 } }),
        'GET /api/medias/sonarr/series/command/5': () => ({
          body: {
            id: 5,
            name: 'RenameFiles',
            status: 'completed',
            message: null,
            queued: null,
            started: null,
            ended: null,
          },
        }),
      }),
    );
    clickIn('[data-test="series-rename-open"]');
    await settle();
    expect(document.querySelector('[data-test="series-rename"]')?.textContent).toContain('S01E01');
    clickIn('[data-test="series-rename-go"]');
    await new Promise((resolve) => setTimeout(resolve, 2_200));
    await settle();
    expect(
      fetch.calls.find((call) => call.method === 'POST' && call.url.endsWith('/2/rename'))?.body,
    ).toEqual({
      fileIds: [10],
    });
    expect(document.querySelector('[data-test="series-rename-feedback"]')?.textContent).toContain(
      t('media.series.detail.rename_done_tpl', { count: 1 }),
    );
  });

  it('édition : changements envoyés, fiche mise à jour', async () => {
    const { fetch } = await mountSeries(
      '/medias/sonarr/series?open=2',
      detailRoutes({
        'GET /api/medias/sonarr/sonarr/quality-profiles': () => ({ body: [{ id: 1, name: 'HD' }] }),
        'GET /api/medias/sonarr/sonarr/root-folders': () => ({ body: [] }),
        'GET /api/medias/sonarr/sonarr/tags-json': () => ({ body: [] }),
        'POST /api/medias/sonarr/series/2/edit': () => ({
          body: { ok: true, series: detailOf({ seasonFolder: false }) },
        }),
      }),
    );
    clickIn('[data-test="series-edit-open"]');
    await settle();
    clickIn('[data-test="series-edit-save"]');
    await settle();
    expect(fetch.calls.find((call) => call.url.endsWith('/2/edit'))?.body).toEqual({
      monitored: true,
      monitorNewItems: 'all',
      seasonFolder: true,
      qualityProfileId: 1,
      seriesType: 'standard',
      path: '/tv/Severance',
      tags: [],
    });
    expect(document.querySelector('[data-test="series-detail-banner"]')?.textContent).toContain(
      t('media.series.detail.series_updated'),
    );
  });

  it('retirer de Sonarr : confirmation, fiche fermée, bannière et bibliothèque relue', async () => {
    const { wrapper, router, fetch } = await mountSeries(
      '/medias/sonarr/series?open=2',
      detailRoutes({
        'POST /api/medias/sonarr/series/2/delete': () => ({ body: { ok: true } }),
      }),
    );
    clickIn('[data-test="series-delete"]');
    await settle();
    clickIn('[data-test="bulk-delete-files"] input');
    clickIn('[data-test="bulk-delete-confirm"]');
    await settle();
    expect(fetch.calls.find((call) => call.url.endsWith('/2/delete'))?.body).toEqual({
      deleteFiles: true,
      addImportExclusion: false,
    });
    expect(router.currentRoute.value.query.open).toBeUndefined();
    expect(wrapper.find('[data-test="series-banner"]').text()).toBe(
      t('media.series.warnings.delete_ok_tpl', { count: 1 }),
    );
  });

  it('série inconnue : message « Série introuvable »', async () => {
    await mountSeries(
      '/medias/sonarr/series?open=2',
      detailRoutes({
        'GET /api/medias/sonarr/series/2/info': () => ({
          status: 404,
          body: { code: 'NOT_FOUND' },
        }),
      }),
    );
    expect(document.querySelector('[data-test="series-detail"]')?.textContent).toContain(
      t('media.api.series_not_found'),
    );
  });

  it('l’ancien lien `?open=` mène à la page ; « Retour » ramène à la bibliothèque', async () => {
    const { router } = await mountSeries('/medias/sonarr/series?open=2', detailRoutes());
    expect(router.currentRoute.value.name).toBe('sonarr-series');
    expect(router.currentRoute.value.params.id).toBe('2');
    clickIn('[data-test="series-detail-close"]');
    await settle();
    expect(router.currentRoute.value.name).toBe('sonarr');
    expect(document.body.textContent).toContain(SERIES[0]?.title ?? '');
  });
});
