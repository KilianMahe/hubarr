// SPDX-License-Identifier: AGPL-3.0-or-later
// Pages Sonarr (P3a.3) : file d'attente (suppression, grab, import des
// téléchargements bloqués, relecture des clients), manquants, cutoff,
// historique, liste de blocage, système, import par lot.

import type {
  ArrSystemResponse,
  QueueImportResponse,
  SeriesBlocklistPage,
  WantedEpisodePage,
} from '@hubarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rawSeries, sonarrEnv, warmSeries, type SonarrEnv } from './sonarr-env';

let env: SonarrEnv;
beforeEach(async () => {
  env = await sonarrEnv();
});
afterEach(async () => {
  await env.close();
});

describe('file d’attente (n° 201 à 206)', () => {
  it('file normalisée', async () => {
    env.sonarr.on('GET', '/api/v3/queue', {
      records: [
        {
          id: 3,
          seriesId: 1,
          series: { title: 'Dark' },
          episode: { seasonNumber: 1, episodeNumber: 2, title: 'Lies' },
          size: 100,
          sizeleft: 25,
          status: 'downloading',
        },
      ],
    });
    const response = await env.browser.get(env.url('/queue'));
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: 3,
        seriesTitle: 'Dark',
        episode: 'S01E02 — Lies',
        sizeleft: 25,
      }),
    ]);
    const call = env.sonarr.callsTo('GET', '/api/v3/queue')[0];
    expect(call?.query.get('includeEpisode')).toBe('true');
  });

  it('suppression avec options, grab, grab groupé, relecture des clients', async () => {
    env.sonarr.on('DELETE', '/api/v3/queue/3');
    env.sonarr.on('POST', '/api/v3/queue/grab/3', {});
    env.sonarr.on('POST', '/api/v3/queue/grab/bulk', {});
    env.sonarr.on('POST', '/api/v3/command', { id: 1 });
    await env.browser.post(env.url('/queue/3/delete'), { removeFromClient: true });
    const deletion = env.sonarr.callsTo('DELETE', '/api/v3/queue/3')[0];
    expect(deletion?.query.get('removeFromClient')).toBe('true');
    expect(deletion?.query.get('blocklist')).toBe('false');
    await env.browser.post(env.url('/queue/3/grab'));
    await env.browser.post(env.url('/queue/grab/bulk'), { ids: [3, 4] });
    expect(env.sonarr.callsTo('POST', '/api/v3/queue/grab/bulk')[0]?.body).toEqual({ ids: [3, 4] });
    await env.browser.post(env.url('/queue/refresh'));
    expect(env.sonarr.callsTo('POST', '/api/v3/command')[0]?.body).toEqual({
      name: 'RefreshMonitoredDownloads',
    });
  });

  it('import des bloqués : bilan de l’aperçu, commande `ManualImport`, cache invalidé', async () => {
    await warmSeries(env);
    env.sonarr.on('GET', '/api/v3/manualimport', [
      { path: '/dl/E01.mkv', series: { id: 1 }, episodes: [{ id: 11 }], rejections: [] },
      { path: '/dl/E02.mkv', episodes: [{ id: 12 }], rejections: [{ reason: 'Existing file' }] },
    ]);
    env.sonarr.on('POST', '/api/v3/command', { id: 40 });
    const response = await env.browser.post(env.url('/queue/import'), {
      items: [
        { path: '/dl/Show', downloadId: 'hash' },
        { path: '/dl/Show', downloadId: 'hash' },
      ],
    });
    expect(response.json<QueueImportResponse>()).toEqual({
      ok: true,
      cmdId: 40,
      imported: 1,
      skipped: 1,
      reasons: ['E02.mkv: Existing file'],
    });
    expect(env.sonarr.callsTo('GET', '/api/v3/manualimport')).toHaveLength(1);
    expect(env.libraryCached()).toBe(false);
  });

  it('import : rien d’importable → bilan en échec (200) ; aucun élément → 400', async () => {
    env.sonarr.on('GET', '/api/v3/manualimport', []);
    const nothing = await env.browser.post(env.url('/queue/import'), {
      items: [{ path: '/dl/Empty', downloadId: '' }],
    });
    expect(nothing.statusCode).toBe(200);
    expect(nothing.json<QueueImportResponse>()).toMatchObject({
      ok: false,
      imported: 0,
      skipped: 1,
    });
    const empty = await env.browser.post(env.url('/queue/import'), {
      items: [{ path: ' ', downloadId: '' }],
    });
    expect(empty.statusCode).toBe(400);
    expect(JSON.stringify(empty.json())).toContain('media.api.no_file');
  });
});

describe('manquants, cutoff (n° 154, 155)', () => {
  it('épisodes manquants : série, code, date locale ; tri et requête de l’original', async () => {
    env.sonarr.on('GET', '/api/v3/wanted/missing', {
      totalRecords: 120,
      records: [
        {
          id: 7,
          seriesId: 1,
          seasonNumber: 2,
          episodeNumber: 5,
          title: 'Five',
          airDate: '2024-03-03',
          airDateUtc: '2024-03-04T01:00:00Z',
          series: { title: 'Dark' },
        },
      ],
    });
    const body = (await env.browser.get(env.url('/manquants?page=3'))).json<WantedEpisodePage>();
    expect(body).toEqual({
      records: [
        {
          id: 7,
          seriesId: 1,
          seriesTitle: 'Dark',
          seasonNumber: 2,
          episodeNumber: 5,
          title: 'Five',
          airDate: '2024-03-03',
          airDateUtc: '2024-03-04T01:00:00.000Z',
          quality: null,
        },
      ],
      totalRecords: 120,
      page: 3,
      pageSize: 50,
    });
    const query = env.sonarr.callsTo('GET', '/api/v3/wanted/missing')[0]?.query;
    expect([query?.get('page'), query?.get('sortKey'), query?.get('monitored')]).toEqual([
      '3',
      'airDateUtc',
      'true',
    ]);
  });

  it('cutoff : qualité actuelle du fichier (demandée à Sonarr)', async () => {
    env.sonarr.on('GET', '/api/v3/wanted/cutoff', {
      totalRecords: 1,
      records: [
        {
          id: 8,
          seasonNumber: 1,
          episodeNumber: 1,
          series: { title: 'Dark' },
          episodeFile: { quality: { quality: { name: 'HDTV-720p' } } },
        },
      ],
    });
    const body = (await env.browser.get(env.url('/cutoff'))).json<WantedEpisodePage>();
    expect(body.records[0]?.quality).toBe('HDTV-720p');
    expect(
      env.sonarr.callsTo('GET', '/api/v3/wanted/cutoff')[0]?.query.get('includeEpisodeFile'),
    ).toBe('true');
  });
});

describe('historique, liste de blocage (n° 156 à 159)', () => {
  it('historique paginé avec série et épisode', async () => {
    env.sonarr.on('GET', '/api/v3/history', {
      totalRecords: 1,
      records: [
        {
          id: 1,
          eventType: 'grabbed',
          series: { title: 'Dark' },
          episode: { seasonNumber: 1, episodeNumber: 1 },
        },
      ],
    });
    const body = (await env.browser.get(env.url('/historique'))).json<{ records: unknown[] }>();
    expect(body.records).toEqual([
      expect.objectContaining({ eventType: 'grabbed', series: { title: 'Dark' } }),
    ]);
    const query = env.sonarr.callsTo('GET', '/api/v3/history')[0]?.query;
    expect([query?.get('includeSeries'), query?.get('sortDirection')]).toEqual([
      'true',
      'descending',
    ]);
  });

  it('liste de blocage : titre de la série tiré de la bibliothèque s’il manque', async () => {
    await warmSeries(env, [rawSeries(1, { title: 'Dark' })]);
    env.sonarr.on('GET', '/api/v3/blocklist', {
      totalRecords: 1,
      records: [
        { id: 4, seriesId: 1, sourceTitle: 'Dark.S01', quality: { quality: { name: 'SD' } } },
      ],
    });
    const body = (await env.browser.get(env.url('/blocklist'))).json<SeriesBlocklistPage>();
    expect(body.records[0]).toMatchObject({ id: 4, seriesTitle: 'Dark', quality: 'SD' });
  });

  it('tri et recherche par titre de série (P5c.5, V5) ; rien trouvé → page vide', async () => {
    await warmSeries(env, [rawSeries(1, { title: 'Dark' }), rawSeries(2, { title: 'Darkwing' })]);
    env.sonarr.on('GET', '/api/v3/history', { totalRecords: 0, records: [] });
    env.sonarr.on('GET', '/api/v3/blocklist', { totalRecords: 0, records: [] });
    await env.browser.get(env.url('/historique?q=DARK&sort=title'));
    const history = env.sonarr.callsTo('GET', '/api/v3/history')[0]?.query;
    expect(history?.getAll('seriesIds')).toEqual(['1', '2']);
    expect([history?.get('sortKey'), history?.get('sortDirection')]).toEqual([
      'series.sortTitle',
      'ascending',
    ]);
    await env.browser.get(env.url('/blocklist?sort=indexer&dir=desc'));
    const blocklist = env.sonarr.callsTo('GET', '/api/v3/blocklist')[0]?.query;
    expect([blocklist?.get('sortKey'), blocklist?.get('sortDirection')]).toEqual([
      'indexer',
      'descending',
    ]);
    expect(blocklist?.has('seriesIds')).toBe(false);
    const none = (await env.browser.get(env.url('/blocklist?q=nope'))).json<SeriesBlocklistPage>();
    expect(none.totalRecords).toBe(0);
    expect(env.sonarr.callsTo('GET', '/api/v3/blocklist')).toHaveLength(1);
  });

  it('cutoff filtré par titre de série et profil (P5c.5, V6)', async () => {
    const episode = (id: number, title: string, profile: number) => ({
      id,
      seriesId: id,
      seasonNumber: 1,
      episodeNumber: id,
      series: { title, qualityProfileId: profile },
    });
    env.sonarr.on('GET', '/api/v3/wanted/cutoff', {
      totalRecords: 3,
      records: [episode(1, 'Dark', 4), episode(2, 'Dark', 1), episode(3, 'Brume', 4)],
    });
    const body = (
      await env.browser.get(env.url('/cutoff?q=dark&profile=4'))
    ).json<WantedEpisodePage>();
    expect(body.records.map((record) => record.id)).toEqual([1]);
    expect(body.totalRecords).toBe(1);
    expect(env.sonarr.callsTo('GET', '/api/v3/wanted/cutoff')[0]?.query.get('pageSize')).toBe(
      '2000',
    );
  });

  it('suppression unitaire et groupée', async () => {
    env.sonarr.on('DELETE', '/api/v3/blocklist/4');
    env.sonarr.on('DELETE', '/api/v3/blocklist/bulk');
    await env.browser.post(env.url('/blocklist/4/delete'));
    await env.browser.post(env.url('/blocklist/bulk-delete'), { ids: [4, 5] });
    expect(env.sonarr.callsTo('DELETE', '/api/v3/blocklist/bulk')[0]?.body).toEqual({
      ids: [4, 5],
    });
    expect(
      (await env.browser.post(env.url('/blocklist/bulk-delete'), { ids: [] })).statusCode,
    ).toBe(400);
  });
});

describe('système, import par lot (n° 160, 167)', () => {
  it('sections indépendantes : une section en échec vaut `null`', async () => {
    env.sonarr.on('GET', '/api/v3/system/status', { version: '4.0.20.3014', osName: 'linux' });
    env.sonarr.on('GET', '/api/v3/health', [{ type: 'warning', source: 'X', message: 'Y' }]);
    env.sonarr.on('GET', '/api/v3/diskspace', [{ path: '/tv', freeSpace: 1, totalSpace: 2 }]);
    env.sonarr.on('GET', '/api/v3/downloadclient', { message: 'boom' }, 500);
    env.sonarr.on('GET', '/api/v3/indexer', [{ name: 'Idx', enableRss: true }]);
    env.sonarr.on('GET', '/api/v3/log', {
      records: [{ time: '2026-11-21T10:00:00Z', level: 'info', message: 'ok' }],
    });
    const body = (await env.browser.get(env.url('/systeme'))).json<ArrSystemResponse>();
    expect(body.status?.version).toBe('4.0.20.3014');
    expect(body.downloadClients).toBeNull();
    expect(body.indexers).toEqual([
      {
        name: 'Idx',
        enableRss: true,
        enableAutomaticSearch: false,
        enableInteractiveSearch: false,
      },
    ]);
    expect(body.logs?.[0]).toMatchObject({ level: 'info', message: 'ok' });
  });

  it('import par lot : ressources transmises telles quelles, cache invalidé ; liste vide → 400', async () => {
    await warmSeries(env);
    env.sonarr.on('POST', '/api/v3/series/import', []);
    const series = [{ title: 'Dark', tvdbId: 1, rootFolderPath: '/tv', qualityProfileId: 1 }];
    expect((await env.browser.post(env.url('/import/batch'), series)).json()).toEqual({ ok: true });
    expect(env.sonarr.callsTo('POST', '/api/v3/series/import')[0]?.body).toEqual(series);
    expect(env.libraryCached()).toBe(false);
    const empty = await env.browser.post(env.url('/import/batch'), []);
    expect(empty.statusCode).toBe(400);
  });
});
