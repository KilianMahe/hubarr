// SPDX-License-Identifier: AGPL-3.0-or-later
// Pages Radarr (P2.7) : file d'attente, manquants, cutoff, historique, liste de
// blocage, collections, système, contre un Radarr simulé.

import type {
  ArrSystemResponse,
  BlocklistPage,
  CutoffPage,
  HistoryPage,
  MissingPage,
  MovieCollection,
} from '@hubarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoteUser } from '../../helpers';
import { EMAIL, rawMovie, radarrEnv, warmLibrary, type RadarrEnv } from './radarr-env';

let env: RadarrEnv;
beforeEach(async () => {
  env = await radarrEnv();
});
afterEach(async () => {
  await env.close();
});

const poster = {
  coverType: 'poster',
  remoteUrl: 'https://image.tmdb.org/t/p/original/p.jpg',
  url: '/MediaCover/p.jpg',
};

describe('file d’attente', () => {
  it('refresh-downloads lance RefreshMonitoredDownloads', async () => {
    env.radarr.on('POST', '/api/v3/command', { id: 1 });
    expect((await env.browser.post(env.url('/command/refresh-downloads'))).json()).toEqual({
      ok: true,
    });
    expect(env.radarr.callsTo('POST', '/api/v3/command')[0]?.body).toEqual({
      name: 'RefreshMonitoredDownloads',
    });
  });

  it('refresh-downloads ouvert au droit de lecture ; import refusé', async () => {
    demoteUser(env.database, EMAIL, { [`radarr:${env.instance.slug}`]: 'read' });
    env.radarr.on('POST', '/api/v3/command', { id: 1 });
    expect((await env.browser.post(env.url('/command/refresh-downloads'))).statusCode).toBe(200);
    expect((await env.browser.post(env.url('/queue/9/import'))).statusCode).toBe(403);
    expect(env.radarr.callsTo('POST', '/api/v3/command')).toHaveLength(1);
  });

  it('import forcé : import manuel du dossier de sortie avec qualité et langues de la file', async () => {
    env.radarr.on('GET', '/api/v3/queue', {
      records: [
        {
          id: 9,
          movieId: 1,
          outputPath: '/downloads/Movie',
          quality: { quality: { id: 7, name: 'Bluray-1080p' } },
          languages: [{ id: 2, name: 'French' }],
        },
        { id: 10, movieId: 2 },
      ],
    });
    env.radarr.on('POST', '/api/v3/command', { id: 33 });
    const response = await env.browser.post(env.url('/queue/9/import'));
    expect(response.json()).toEqual({ ok: true, cmdId: 33 });
    expect(env.radarr.callsTo('POST', '/api/v3/command')[0]?.body).toEqual({
      name: 'ManualImport',
      importMode: 'move',
      files: [
        {
          path: '/downloads/Movie',
          movieId: 1,
          quality: { quality: { id: 7, name: 'Bluray-1080p' } },
          languages: [{ id: 2, name: 'French' }],
        },
      ],
    });
    // Sans dossier de sortie, ou absent de la file : 404.
    expect((await env.browser.post(env.url('/queue/10/import'))).statusCode).toBe(404);
    expect((await env.browser.post(env.url('/queue/99/import'))).statusCode).toBe(404);
  });

  it('import manuel : aperçu par downloadId, import des fichiers choisis (qualité corrigée)', async () => {
    env.radarr.on('GET', '/api/v3/queue', {
      records: [
        { id: 9, movieId: 1, downloadId: 'HASH9', outputPath: '/downloads/Movie' },
        { id: 10, movieId: 2 },
      ],
    });
    const quality = {
      quality: { id: 7, name: 'Bluray-1080p' },
      revision: { version: 2, real: 0, isRepack: false },
    };
    env.radarr.on('GET', '/api/v3/manualimport', [
      {
        path: '/downloads/Movie/movie.mkv',
        relativePath: 'movie.mkv',
        folderName: 'Movie',
        size: 1000,
        movie: { id: 1, title: 'Film', year: 2020 },
        quality,
        languages: [{ id: 2, name: 'French' }],
        releaseGroup: 'GRP',
        downloadId: 'HASH9',
        indexerFlags: 1,
        rejections: [{ reason: 'Not an upgrade', type: 'permanent' }],
      },
      { path: '/downloads/Movie/sample.mkv', size: 10, movie: { id: 0 }, rejections: [] },
    ]);
    const preview = await env.browser.get(env.url('/queue/9/manual-import'));
    expect(env.radarr.callsTo('GET', '/api/v3/manualimport')[0]?.query.get('downloadId')).toBe(
      'HASH9',
    );
    expect(preview.json()).toEqual({
      files: [
        {
          path: '/downloads/Movie/movie.mkv',
          name: 'movie.mkv',
          size: 1000,
          quality: { id: 7, name: 'Bluray-1080p' },
          languages: [{ id: 2, name: 'French' }],
          releaseGroup: 'GRP',
          rejections: ['Not an upgrade'],
          movie: { id: 1, title: 'Film', year: 2020 },
        },
        {
          path: '/downloads/Movie/sample.mkv',
          name: 'sample.mkv',
          size: 10,
          quality: null,
          languages: [],
          releaseGroup: null,
          rejections: [],
          movie: null,
        },
      ],
    });

    env.radarr.on('GET', '/api/v3/qualitydefinition', [
      { id: 50, quality: { id: 9, name: 'Remux-1080p', source: 'bluray', resolution: 1080 } },
    ]);
    env.radarr.on('POST', '/api/v3/command', { id: 44 });
    const response = await env.browser.post(env.url('/queue/9/manual-import'), {
      files: [
        {
          path: '/downloads/Movie/movie.mkv',
          movieId: 3,
          qualityId: 9,
          languages: [{ id: 1, name: 'English' }],
          releaseGroup: null,
        },
      ],
    });
    expect(response.json()).toEqual({ ok: true, cmdId: 44 });
    expect(env.radarr.callsTo('POST', '/api/v3/command')[0]?.body).toEqual({
      name: 'ManualImport',
      importMode: 'auto',
      files: [
        {
          path: '/downloads/Movie/movie.mkv',
          folderName: 'Movie',
          movieId: 3,
          quality: {
            quality: { id: 9, name: 'Remux-1080p', source: 'bluray', resolution: 1080 },
            revision: { version: 2, real: 0, isRepack: false },
          },
          languages: [{ id: 1, name: 'English' }],
          releaseGroup: '',
          indexerFlags: 1,
          downloadId: 'HASH9',
          customFormats: [],
          customFormatScore: 0,
        },
      ],
    });
  });

  it('import manuel : fichier hors du téléchargement → 400 ; élément inconnu → 404', async () => {
    env.radarr.on('GET', '/api/v3/queue', {
      records: [{ id: 9, movieId: 1, downloadId: 'HASH9' }, { id: 10 }],
    });
    env.radarr.on('GET', '/api/v3/manualimport', [{ path: '/downloads/Movie/movie.mkv' }]);
    env.radarr.on('GET', '/api/v3/qualitydefinition', []);
    const body = {
      files: [{ path: '/etc/passwd', movieId: 1, qualityId: 1, languages: [], releaseGroup: null }],
    };
    const refused = await env.browser.post(env.url('/queue/9/manual-import'), body);
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({
      code: 'VALIDATION',
      message: 'media.api.manual_import_unknown_file',
    });
    expect(env.radarr.callsTo('POST', '/api/v3/command')).toHaveLength(0);
    expect((await env.browser.get(env.url('/queue/10/manual-import'))).statusCode).toBe(404);
    expect((await env.browser.get(env.url('/queue/99/manual-import'))).statusCode).toBe(404);
    expect(
      (await env.browser.post(env.url('/queue/9/manual-import'), { files: [] })).statusCode,
    ).toBe(400);
  });

  it('suppression avec options, grab, grab groupé', async () => {
    env.radarr.on('DELETE', '/api/v3/queue/9');
    await env.browser.post(env.url('/queue/9/delete'), { removeFromClient: true, blocklist: true });
    const call = env.radarr.callsTo('DELETE', '/api/v3/queue/9')[0];
    expect(call?.query.get('removeFromClient')).toBe('true');
    expect(call?.query.get('blocklist')).toBe('true');
    expect(call?.query.get('skipRedownload')).toBe('false');

    env.radarr.on('POST', '/api/v3/queue/grab/9', {});
    expect((await env.browser.post(env.url('/queue/9/grab'))).json()).toEqual({ ok: true });
    env.radarr.on('POST', '/api/v3/queue/grab/bulk', {});
    await env.browser.post(env.url('/queue/grab/bulk'), { ids: [9, 10] });
    expect(env.radarr.callsTo('POST', '/api/v3/queue/grab/bulk')[0]?.body).toEqual({
      ids: [9, 10],
    });
    expect((await env.browser.post(env.url('/queue/grab/bulk'), { ids: [] })).statusCode).toBe(400);
  });
});

describe('manquants, cutoff', () => {
  it('manquants : nom du profil, date numérique à défaut de salles, page transmise', async () => {
    env.radarr.on('GET', '/api/v3/wanted/missing', {
      totalRecords: 120,
      records: [
        rawMovie(1, {
          qualityProfileId: 4,
          digitalRelease: '2024-05-01T00:00:00Z',
          inCinemas: '2024-01-01T00:00:00Z',
          images: [poster],
        }),
        rawMovie(2, {
          qualityProfileId: 9,
          status: 'announced',
          inCinemas: '2025-01-01T00:00:00Z',
        }),
      ],
    });
    env.radarr.on('GET', '/api/v3/qualityprofile', [{ id: 4, name: 'HD-1080p' }]);
    const body = (await env.browser.get(env.url('/manquants?page=2'))).json<MissingPage>();
    expect(body).toMatchObject({ totalRecords: 120, page: 2, pageSize: 50 });
    expect(body.records[0]).toEqual({
      id: 1,
      title: 'Movie 1',
      year: 2001,
      status: 'released',
      qualityProfile: 'HD-1080p',
      releaseDate: '2024-05-01T00:00:00.000Z',
      poster: poster.remoteUrl,
    });
    expect(body.records[1]).toMatchObject({
      qualityProfile: null,
      releaseDate: '2025-01-01T00:00:00.000Z',
    });
    const call = env.radarr.callsTo('GET', '/api/v3/wanted/missing')[0];
    expect(call?.query.get('page')).toBe('2');
    expect(call?.query.get('monitored')).toBe('true');
  });

  it('recherche de tous les manquants', async () => {
    env.radarr.on('POST', '/api/v3/command', { id: 4 });
    expect((await env.browser.post(env.url('/recherche-manquants'))).json()).toEqual({
      ok: true,
      cmdId: 4,
    });
    expect(env.radarr.callsTo('POST', '/api/v3/command')[0]?.body).toEqual({
      name: 'MissingMoviesSearch',
    });
  });

  it('cutoff : qualité actuelle du fichier', async () => {
    env.radarr.on('GET', '/api/v3/wanted/cutoff', {
      totalRecords: 1,
      records: [rawMovie(3, { movieFile: { quality: { quality: { name: 'HDTV-720p' } } } })],
    });
    const body = (await env.browser.get(env.url('/cutoff'))).json<CutoffPage>();
    expect(body.records[0]).toMatchObject({ id: 3, quality: 'HDTV-720p' });
    expect(body.page).toBe(1);
  });
});

describe('historique, liste de blocage', () => {
  it('historique : filtre numérique transmis, valeur inconnue ignorée', async () => {
    env.radarr.on('GET', '/api/v3/history', {
      totalRecords: 1,
      records: [
        {
          id: 5,
          eventType: 'grabbed',
          data: { protocol: 'torrent' },
          movie: { title: 'M', year: 2000 },
        },
      ],
    });
    const body = (await env.browser.get(env.url('/historique?eventType=1'))).json<HistoryPage>();
    expect(body.records[0]).toMatchObject({
      id: 5,
      protocol: 'torrent',
      movie: { title: 'M', year: 2000 },
    });
    expect(env.radarr.callsTo('GET', '/api/v3/history')[0]?.query.get('eventType')).toBe('1');
    await env.browser.get(env.url('/historique?eventType=evil'));
    expect(env.radarr.callsTo('GET', '/api/v3/history')[1]?.query.has('eventType')).toBe(false);
  });

  it('liste de blocage : page, suppression unitaire et groupée', async () => {
    env.radarr.on('GET', '/api/v3/blocklist', {
      totalRecords: 1,
      records: [{ id: 2, sourceTitle: 'Bad' }],
    });
    expect(
      (await env.browser.get(env.url('/blocklist'))).json<BlocklistPage>().records[0],
    ).toMatchObject({
      id: 2,
      sourceTitle: 'Bad',
    });
    env.radarr.on('DELETE', '/api/v3/blocklist/2');
    expect((await env.browser.post(env.url('/blocklist/2/delete'))).json()).toEqual({ ok: true });
    env.radarr.on('DELETE', '/api/v3/blocklist/bulk');
    await env.browser.post(env.url('/blocklist/bulk-delete'), { ids: [2, 3] });
    expect(env.radarr.callsTo('DELETE', '/api/v3/blocklist/bulk')[0]?.body).toEqual({
      ids: [2, 3],
    });
  });
});

describe('tri et recherche (P5c.5, V5, V6)', () => {
  it('historique : date décroissante par défaut, tri par titre transmis', async () => {
    env.radarr.on('GET', '/api/v3/history', { totalRecords: 0, records: [] });
    await env.browser.get(env.url('/historique'));
    await env.browser.get(env.url('/historique?sort=title&dir=asc&sort=evil'));
    await env.browser.get(env.url('/historique?sort=bogus&dir=sideways'));
    const [first, second, third] = env.radarr.callsTo('GET', '/api/v3/history');
    expect(first?.query.get('sortKey')).toBe('date');
    expect(first?.query.get('sortDirection')).toBe('descending');
    expect(second?.query.get('sortKey')).toBe('movieMetadata.sortTitle');
    expect(second?.query.get('sortDirection')).toBe('ascending');
    // Valeurs inconnues : retour au défaut.
    expect(third?.query.get('sortKey')).toBe('date');
    expect(third?.query.get('sortDirection')).toBe('descending');
  });

  it('recherche par titre : ids de la bibliothèque, accents ignorés ; rien trouvé → page vide sans appel', async () => {
    await warmLibrary(env, [
      rawMovie(1, { title: 'Amélie' }),
      rawMovie(2, { title: 'Le Fabuleux destin' }),
      rawMovie(3, { title: 'AMELIE 2' }),
    ]);
    env.radarr.on('GET', '/api/v3/history', { totalRecords: 4, records: [] });
    env.radarr.on('GET', '/api/v3/blocklist', { totalRecords: 1, records: [] });
    const body = (await env.browser.get(env.url('/historique?q=amelie'))).json<HistoryPage>();
    expect(body.totalRecords).toBe(4);
    expect(env.radarr.callsTo('GET', '/api/v3/history')[0]?.query.getAll('movieIds')).toEqual([
      '1',
      '3',
    ]);
    await env.browser.get(env.url('/blocklist?q=fabuleux&sort=source'));
    const blocklist = env.radarr.callsTo('GET', '/api/v3/blocklist')[0];
    expect(blocklist?.query.getAll('movieIds')).toEqual(['2']);
    expect(blocklist?.query.get('sortKey')).toBe('sourceTitle');
    expect(blocklist?.query.get('sortDirection')).toBe('ascending');

    const none = (await env.browser.get(env.url('/historique?q=zzz&page=2'))).json<HistoryPage>();
    expect(none).toEqual({ records: [], totalRecords: 0, page: 2, pageSize: 50 });
    expect(env.radarr.callsTo('GET', '/api/v3/history')).toHaveLength(1);
  });

  it('cutoff filtré : liste complète lue une fois, titre et profil filtrés, puis paginée', async () => {
    const movies = Array.from({ length: 60 }, (_, index) =>
      rawMovie(index + 1, {
        title: index % 2 === 0 ? `Star ${index + 1}` : `Other ${index + 1}`,
        qualityProfileId: index < 50 ? 4 : 1,
      }),
    );
    env.radarr.on('GET', '/api/v3/wanted/cutoff', { totalRecords: 60, records: movies });
    const page = (await env.browser.get(env.url('/cutoff?q=star&profile=4'))).json<CutoffPage>();
    expect(page.totalRecords).toBe(25);
    expect(page.records).toHaveLength(25);
    expect(page.records.every((movie) => movie.title.startsWith('Star'))).toBe(true);
    const call = env.radarr.callsTo('GET', '/api/v3/wanted/cutoff')[0];
    expect(call?.query.get('page')).toBe('1');
    expect(call?.query.get('pageSize')).toBe('2000');
    // Sans filtre : pagination de Radarr.
    await env.browser.get(env.url('/cutoff?page=2'));
    expect(env.radarr.callsTo('GET', '/api/v3/wanted/cutoff')[1]?.query.get('pageSize')).toBe('50');
  });
});

describe('collections', () => {
  it('films enrichis : dans la bibliothèque, avec fichier', async () => {
    env.radarr.on('GET', '/api/v3/collection', [
      {
        id: 1,
        tmdbId: 2344,
        title: 'The Matrix Collection',
        monitored: true,
        images: [poster],
        movies: [
          { tmdbId: 603, title: 'The Matrix', year: 1999 },
          { tmdbId: 604, title: 'Reloaded', year: 2003 },
          { tmdbId: 605, title: 'Revolutions', year: 2003 },
        ],
      },
    ]);
    env.radarr.on('GET', '/api/v3/movie', [
      rawMovie(1, { tmdbId: 603, hasFile: true }),
      rawMovie(2, { tmdbId: 604, hasFile: false }),
    ]);
    const [collection] = (await env.browser.get(env.url('/collections'))).json<MovieCollection[]>();
    expect(collection).toMatchObject({
      id: 1,
      title: 'The Matrix Collection',
      monitored: true,
      poster: poster.remoteUrl,
    });
    expect(collection?.movies.map((m) => [m.tmdbId, m.inLibrary, m.hasFile])).toEqual([
      [603, true, true],
      [604, true, false],
      [605, false, false],
    ]);
  });

  it('suivi d’une collection : bibliothèque invalidée', async () => {
    await warmLibrary(env);
    env.radarr.on('PUT', '/api/v3/collection/1', {});
    const response = await env.browser.post(env.url('/collections/1/monitor'), {
      monitored: false,
    });
    expect(response.json()).toEqual({ ok: true, monitored: false });
    expect(env.radarr.callsTo('PUT', '/api/v3/collection/1')[0]?.body).toEqual({
      monitored: false,
    });
    expect(env.libraryCached()).toBe(false);
  });
});

describe('système', () => {
  const systemUrl = () => `/api/medias/${env.instance.slug}/radarr/systeme`;

  it('réservé aux admins : un droit d’écriture ne suffit pas', async () => {
    demoteUser(env.database, EMAIL, { [`radarr:${env.instance.slug}`]: 'write' });
    expect((await env.browser.get(systemUrl())).statusCode).toBe(403);
    expect(env.radarr.callsTo('GET', '/api/v3/system/status')).toHaveLength(0);
  });

  it('sections normalisées ; une section en échec vaut null', async () => {
    env.radarr.on('GET', '/api/v3/system/status', {
      version: '5.0.1',
      osName: 'ubuntu',
      isDocker: true,
      startTime: '2026-11-20T10:00:00Z',
    });
    env.radarr.on('GET', '/api/v3/health', [
      { type: 'warning', source: 'IndexerCheck', message: 'No indexers' },
    ]);
    env.radarr.on('GET', '/api/v3/diskspace', [
      { path: '/movies', freeSpace: 10, totalSpace: 100 },
    ]);
    env.radarr.on('GET', '/api/v3/downloadclient', [
      { name: 'qBit', implementation: 'QBittorrent', enable: true },
    ]);
    env.radarr.on('GET', '/api/v3/indexer', { message: 'boom' }, 500);
    env.radarr.on('GET', '/api/v3/log', {
      records: [
        {
          time: '2026-11-20T11:00:00Z',
          level: 'info',
          message: 'Started',
          exception: 'x'.repeat(300),
        },
      ],
    });
    const body = (await env.browser.get(systemUrl())).json<ArrSystemResponse>();
    expect(body.status).toMatchObject({
      version: '5.0.1',
      isDocker: true,
      startTime: '2026-11-20T10:00:00.000Z',
    });
    expect(body.health).toEqual([
      { type: 'warning', source: 'IndexerCheck', message: 'No indexers' },
    ]);
    expect(body.diskSpace).toEqual([
      { path: '/movies', label: null, freeSpace: 10, totalSpace: 100 },
    ]);
    expect(body.downloadClients).toEqual([
      { name: 'qBit', implementation: 'QBittorrent', enable: true },
    ]);
    expect(body.indexers).toBeNull();
    expect(body.logs?.[0]?.exception).toHaveLength(200);
    expect(env.radarr.callsTo('GET', '/api/v3/log')[0]?.query.get('pageSize')).toBe('20');
  });

  it('toutes les sections en échec : erreur commune', async () => {
    const response = await env.browser.get(systemUrl());
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ code: 'UPSTREAM_ERROR', service: 'radarr' });
  });
});
