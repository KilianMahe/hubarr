// SPDX-License-Identifier: AGPL-3.0-or-later
// Client Sonarr : port de `SonarrClientTest` (import manuel depuis la file
// d'attente) et contrat des appels de bibliothèque repris de
// `SonarrClient.php` (chemins, requêtes, corps), plus la normalisation.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SonarrClient } from '../../../src/integrations/sonarr/client';
import {
  normalizeCalendarEntry,
  normalizeSeries,
  normalizeSeriesQueueRecord,
} from '../../../src/integrations/sonarr/normalize';
import type { SonarrSeriesResource } from '../../../src/integrations/sonarr/types';
import { fakeArr, type FakeArr } from '../arr/fake-arr';

let fake: FakeArr;
let client: SonarrClient;

beforeEach(() => {
  fake = fakeArr('sonarr', 'series');
  client = new SonarrClient(fake.http);
});

afterEach(async () => {
  await fake.agent.close();
});

const rawWire = {
  id: 7,
  title: 'The Wire',
  sortTitle: 'Wire',
  year: 2002,
  tvdbId: 79126,
  status: 'ended',
  ended: true,
  monitored: true,
  seriesType: 'standard',
  network: 'HBO',
  genres: ['Crime', 'Drama'],
  ratings: { votes: 10, value: 9.3 },
  added: '2024-03-01T10:00:00Z',
  images: [
    { coverType: 'poster', remoteUrl: 'https://artworks.thetvdb.com/p.jpg' },
    { coverType: 'fanart', remoteUrl: 'https://artworks.thetvdb.com/f.jpg' },
  ],
  statistics: {
    episodeCount: 60,
    episodeFileCount: 45,
    totalEpisodeCount: 62,
    sizeOnDisk: 2_147_483_648,
  },
  seasons: [
    {
      seasonNumber: 0,
      monitored: false,
      statistics: { episodeCount: 0, episodeFileCount: 0, totalEpisodeCount: 2 },
    },
    {
      seasonNumber: 1,
      monitored: true,
      statistics: { episodeCount: 13, episodeFileCount: 13, totalEpisodeCount: 13, sizeOnDisk: 9 },
    },
  ],
} satisfies SonarrSeriesResource;

describe('normalisation', () => {
  it('série : statistiques, pourcentage, images distantes, dates ISO', () => {
    const series = normalizeSeries(rawWire);
    expect(series).toMatchObject({
      id: 7,
      title: 'The Wire',
      sortTitle: 'wire',
      poster: 'https://artworks.thetvdb.com/p.jpg',
      fanart: 'https://artworks.thetvdb.com/f.jpg',
      banner: null,
      episodeCount: 60,
      episodeFileCount: 45,
      percent: 75,
      sizeOnDisk: 2_147_483_648,
      sizeGb: 2,
      ratings: 9.3,
      seasonCount: 2,
      addedAt: '2024-03-01T10:00:00.000Z',
      monitorNewItems: 'all',
      seasonFolder: true,
    });
    expect(series.seasons).toEqual([
      expect.objectContaining({ seasonNumber: 0, percent: 0, totalEpisodeCount: 2 }),
      expect.objectContaining({ seasonNumber: 1, percent: 100, sizeOnDisk: 9 }),
    ]);
  });

  it('série vide : valeurs par défaut de l’original', () => {
    expect(normalizeSeries({})).toMatchObject({
      id: null,
      title: '—',
      status: 'unknown',
      seriesType: 'standard',
      percent: 0,
      sizeGb: null,
      seasons: [],
    });
  });

  it('file : code d’épisode, ou titre de la release sans épisode', () => {
    expect(
      normalizeSeriesQueueRecord({
        id: 1,
        seriesId: 7,
        series: { title: 'The Wire' },
        episode: { seasonNumber: 1, episodeNumber: 3, title: 'The Buys' },
        size: 100,
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        sizeleft: 40,
        trackedDownloadState: 'importBlocked',
      }),
    ).toMatchObject({
      seriesTitle: 'The Wire',
      episode: 'S01E03 — The Buys',
      trackedState: 'importBlocked',
      trackedStatus: 'ok',
    });
    expect(normalizeSeriesQueueRecord({ title: 'Release.S02' }).episode).toBe('Release.S02');
  });

  it('calendrier : date locale de diffusion conservée (issue #26)', () => {
    const entry = normalizeCalendarEntry({
      id: 5,
      seriesId: 7,
      seasonNumber: 2,
      episodeNumber: 1,
      title: 'Ebb Tide',
      airDate: '2024-01-15',
      airDateUtc: '2024-01-16T02:00:00Z',
      series: { title: 'The Wire', tvdbId: 79126, network: 'HBO' },
    });
    expect(entry).toMatchObject({
      airDate: '2024-01-15',
      airDateUtc: '2024-01-16T02:00:00.000Z',
      seriesTitle: 'The Wire',
      tvdbId: 79126,
      network: 'HBO',
    });
    expect(normalizeCalendarEntry({ airDateUtc: '2024-01-16T02:00:00Z' }).airDate).toBe(
      '2024-01-16',
    );
  });
});

describe('séries', () => {
  it('bibliothèque normalisée, délai élargi accepté', async () => {
    fake.on('GET', '/api/v3/series', [rawWire]);
    const series = await client.seriesList(30_000);
    expect(series[0]).toMatchObject({ id: 7, title: 'The Wire' });
  });

  it('suppression : fichiers et exclusion en requête', async () => {
    fake.on('DELETE', '/api/v3/series/7');
    await client.deleteSeries(7, { deleteFiles: true });
    expect(fake.last().query.get('deleteFiles')).toBe('true');
    expect(fake.last().query.get('addImportListExclusion')).toBe('false');
  });

  it('éditeur de masse : ids et champs dans le corps', async () => {
    fake.on('PUT', '/api/v3/series/editor');
    await client.bulkUpdateSeries([1, 2], { monitored: false, tags: [3], applyTags: 'add' });
    expect(fake.last().body).toEqual({
      monitored: false,
      tags: [3],
      applyTags: 'add',
      seriesIds: [1, 2],
    });
  });

  it('suppression de masse sur l’éditeur (`addImportListExclusion`)', async () => {
    fake.on('DELETE', '/api/v3/series/editor');
    await client.bulkDeleteSeries([4], { deleteFiles: true, addImportExclusion: true });
    expect(fake.last().body).toEqual({
      seriesIds: [4],
      deleteFiles: true,
      addImportListExclusion: true,
    });
  });

  it('suivi d’une saison : relit la série et ne change que la saison visée', async () => {
    fake.on('GET', '/api/v3/series/7', rawWire);
    fake.on('PUT', '/api/v3/series/7', rawWire);
    await client.setSeasonMonitored(7, 0, true);
    const body = fake.last().body as SonarrSeriesResource;
    expect(body.seasons?.map((season) => season.monitored)).toEqual([true, true]);
  });

  it('historique d’une série : liste paginée filtrée par `seriesIds`', async () => {
    fake.on('GET', '/api/v3/history', { records: [{ id: 1, eventType: 'grabbed' }] });
    await expect(client.seriesHistory(7)).resolves.toHaveLength(1);
    expect(fake.last().query.get('seriesIds')).toBe('7');
    expect(fake.last().query.get('includeEpisode')).toBe('true');
    expect(fake.last().query.get('pageSize')).toBe('100');
  });
});

describe('commandes', () => {
  it('renommage : `RenameFiles` pour une sélection, sinon `RenameSeries`', async () => {
    fake.on('POST', '/api/v3/command', { id: 9 });
    await expect(client.executeRename(7, [11, 12])).resolves.toBe(9);
    expect(fake.last().body).toEqual({ name: 'RenameFiles', seriesId: 7, files: [11, 12] });
    await client.executeRename(7);
    expect(fake.last().body).toEqual({ name: 'RenameSeries', seriesIds: [7] });
  });

  it('recherches de saison, d’épisodes, de tous les manquants', async () => {
    fake.on('POST', '/api/v3/command', { id: 1 });
    await client.searchSeason(7, 2);
    expect(fake.last().body).toEqual({ name: 'SeasonSearch', seriesId: 7, seasonNumber: 2 });
    await client.searchEpisodes([3, 4]);
    expect(fake.last().body).toEqual({ name: 'EpisodeSearch', episodeIds: [3, 4] });
    await client.searchAllMissing();
    expect(fake.last().body).toEqual({ name: 'MissingEpisodeSearch' });
  });

  it('réattribution d’un fichier : `ManualImport` en mode auto', async () => {
    fake.on('POST', '/api/v3/command', { id: 4 });
    await client.reassignEpisodeFile({ id: 50, path: '/tv/a.mkv' }, 7, [101]);
    expect(fake.last().body).toMatchObject({
      name: 'ManualImport',
      importMode: 'auto',
      files: [{ path: '/tv/a.mkv', seriesId: 7, episodeIds: [101], episodeFileId: 50 }],
    });
  });
});

// ── Port de SonarrClientTest (import manuel depuis la file) ─────────────────

describe('import manuel depuis la file', () => {
  it('transmet la charge enrichie par l’aperçu', async () => {
    fake.on('GET', '/api/v3/manualimport', [
      {
        path: '/dl/Show.S01E01.mkv',
        folderName: 'Show.S01',
        series: { id: 42 },
        episodes: [{ id: 1001 }, { id: 1002 }],
        releaseGroup: 'GROUP',
        quality: { quality: { id: 7, name: 'WEBDL-1080p' }, revision: { version: 1 } },
        languages: [{ id: 5, name: 'French' }],
        rejections: [],
      },
    ]);
    fake.on('POST', '/api/v3/command', { id: 999 });
    const outcome = await client.manualImportFromQueueItems([
      { path: '/dl/Show.S01', downloadId: '' },
    ]);
    expect(outcome).toEqual({ ok: true, cmdId: 999, imported: 1, skipped: 0, reasons: [] });
    const body = fake.last().body as { importMode: string; files: Record<string, unknown>[] };
    expect(body.importMode).toBe('auto');
    expect(body.files).toHaveLength(1);
    expect(body.files[0]).toMatchObject({
      seriesId: 42,
      episodeIds: [1001, 1002],
      releaseGroup: 'GROUP',
      quality: { quality: { id: 7 } },
      languages: [{ name: 'French' }],
    });
  });

  it('préfère le `downloadId` au dossier, et le transmet à la commande', async () => {
    fake.on('GET', '/api/v3/manualimport', [
      {
        path: '/dl/Show/01.Soiree.des.debutants.mkv',
        series: { id: 5 },
        episodes: [{ id: 333 }],
        rejections: [],
        downloadId: 'abc123',
      },
    ]);
    fake.on('POST', '/api/v3/command', { id: 7 });
    const outcome = await client.manualImportFromQueueItems([{ path: '', downloadId: 'abc123' }]);
    expect(outcome.ok).toBe(true);
    const preview = fake.calls.find((call) => call.path === '/api/v3/manualimport');
    expect(preview?.query.get('downloadId')).toBe('abc123');
    expect(preview?.query.get('folder')).toBeNull();
    expect(preview?.query.get('filterExistingFiles')).toBe('false');
    expect((fake.last().body as { files: { downloadId: string }[] }).files[0]?.downloadId).toBe(
      'abc123',
    );
  });

  it('un seul aperçu pour des éléments qui partagent le même `downloadId`', async () => {
    fake.on('GET', '/api/v3/manualimport', [
      { path: '/dl/E01.mkv', series: { id: 5 }, episodes: [{ id: 101 }], rejections: [] },
      { path: '/dl/E02.mkv', series: { id: 5 }, episodes: [{ id: 102 }], rejections: [] },
    ]);
    fake.on('POST', '/api/v3/command', { id: 1 });
    const items = Array.from({ length: 7 }, () => ({ path: '/dl/Show.S01', downloadId: 'shared' }));
    const outcome = await client.manualImportFromQueueItems(items);
    expect(outcome).toMatchObject({ ok: true, imported: 2 });
    expect(fake.calls.filter((call) => call.path === '/api/v3/manualimport')).toHaveLength(1);
  });

  it('ignore les fichiers refusés et en donne la raison', async () => {
    fake.on('GET', '/api/v3/manualimport', [
      {
        path: '/dl/Bad.mkv',
        episodes: [{ id: 1 }],
        rejections: [{ reason: 'Existing file on disk' }],
      },
    ]);
    const outcome = await client.manualImportFromQueueItems([{ path: '/dl/Bad', downloadId: '' }]);
    expect(outcome).toEqual({
      ok: false,
      cmdId: null,
      imported: 0,
      skipped: 1,
      reasons: ['Bad.mkv: Existing file on disk'],
    });
    expect(fake.calls.some((call) => call.path === '/api/v3/command')).toBe(false);
  });

  it('ignore les fichiers sans épisode reconnu', async () => {
    fake.on('GET', '/api/v3/manualimport', [
      { path: '/dl/Unknown.mkv', episodes: [], rejections: [] },
    ]);
    const outcome = await client.manualImportFromQueueItems([
      { path: '/dl/Unknown', downloadId: '' },
    ]);
    expect(outcome.ok).toBe(false);
    expect(outcome.reasons[0]).toContain('no episode match');
  });

  it('aperçu vide (ou en échec) : « no preview »', async () => {
    fake.on('GET', '/api/v3/manualimport', []);
    const outcome = await client.manualImportFromQueueItems([
      { path: '/dl/Empty', downloadId: '' },
    ]);
    expect(outcome).toMatchObject({ ok: false, skipped: 1 });
    expect(outcome.reasons[0]).toContain('no preview for Empty');
  });

  it('ignore les éléments vides sans interroger Sonarr', async () => {
    const outcome = await client.manualImportFromQueueItems([
      { path: '', downloadId: '' },
      { path: '   ', downloadId: '' },
    ]);
    expect(outcome).toMatchObject({ ok: false, skipped: 2 });
    expect(fake.calls).toHaveLength(0);
  });

  it('commande refusée par Sonarr : bilan en échec', async () => {
    fake.on('GET', '/api/v3/manualimport', [
      { path: '/dl/Show.S01E01.mkv', episodes: [{ id: 1 }], rejections: [], series: { id: 1 } },
    ]);
    fake.on('POST', '/api/v3/command', { message: 'nope' }, 400);
    const outcome = await client.manualImportFromQueueItems([
      { path: '/dl/Show.S01', downloadId: '' },
    ]);
    expect(outcome).toMatchObject({ ok: false, cmdId: null, imported: 0 });
    expect(outcome.reasons).toContain('Sonarr command rejected');
  });
});
