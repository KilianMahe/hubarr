// SPDX-License-Identifier: AGPL-3.0-or-later
// Fiche série (P3a.2) : fiche, édition, suppression, historique, renommage,
// explorateur, épisodes, saisons, recherche interactive et grab, fichiers
// (modification fusionnée côté serveur, réattribution, suppression),
// définitions de qualité ; contrat contre un Sonarr simulé.

import type { EpisodeFile, SeriesRelease } from '@hubarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rawEpisode, rawSeries, sonarrEnv, warmSeries, type SonarrEnv } from './sonarr-env';

let env: SonarrEnv;
beforeEach(async () => {
  env = await sonarrEnv();
});
afterEach(async () => {
  await env.close();
});

const rawFile = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  seriesId: 1,
  seasonNumber: 1,
  relativePath: `Season 01/E${id}.mkv`,
  path: `/tv/Show/Season 01/E${id}.mkv`,
  size: 1_000,
  quality: {
    quality: { id: 3, name: 'WEBDL-1080p' },
    revision: { version: 2, real: 0, isRepack: true },
  },
  languages: [{ id: 2, name: 'French' }],
  releaseGroup: 'GRP',
  releaseType: 'singleEpisode',
  indexerFlags: 0,
  mediaInfo: { videoCodec: 'x265', audioLanguages: 'fre/eng', resolution: '1920x1080' },
  ...overrides,
});

describe('série (n° 196, 209, 211, 212, 222, 225, 230)', () => {
  it('fiche normalisée, sans cache ; série absente → 404', async () => {
    env.sonarr.on('GET', '/api/v3/series/1', rawSeries(1, { title: 'Dark' }));
    const response = await env.browser.get(env.url('/1/info'));
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({ id: 1, title: 'Dark', percent: 50 });
    expect((await env.browser.get(env.url('/2/info'))).statusCode).toBe(404);
  });

  it('édition : champs fournis fusionnés dans la ressource, cache invalidé', async () => {
    await warmSeries(env);
    env.sonarr.on('GET', '/api/v3/series/1', rawSeries(1, { path: '/tv/old' }));
    env.sonarr.on('PUT', '/api/v3/series/1', rawSeries(1, { seriesType: 'anime' }));
    const response = await env.browser.post(env.url('/1/edit'), {
      seriesType: 'anime',
      monitorNewItems: 'none',
      tags: [3],
    });
    expect(response.json()).toMatchObject({ ok: true, series: { id: 1, seriesType: 'anime' } });
    expect(env.sonarr.callsTo('PUT', '/api/v3/series/1')[0]?.body).toMatchObject({
      id: 1,
      path: '/tv/old',
      seriesType: 'anime',
      monitorNewItems: 'none',
      tags: [3],
    });
    expect(env.libraryCached()).toBe(false);
  });

  it('suppression : fichiers et exclusion transmis ; cache invalidé', async () => {
    await warmSeries(env);
    env.sonarr.on('DELETE', '/api/v3/series/1');
    await env.browser.post(env.url('/1/delete'), { deleteFiles: true });
    const call = env.sonarr.callsTo('DELETE', '/api/v3/series/1')[0];
    expect(call?.query.get('deleteFiles')).toBe('true');
    expect(call?.query.get('addImportListExclusion')).toBe('false');
    expect(env.libraryCached()).toBe(false);
  });

  it('historique avec l’épisode, type d’évènement de Sonarr v4', async () => {
    env.sonarr.on('GET', '/api/v3/history', {
      records: [
        {
          id: 1,
          eventType: 'downloadFolderImported',
          date: '2026-11-20T10:00:00Z',
          sourceTitle: 'Show.S01E02',
          quality: { quality: { name: 'HDTV-720p' } },
          episode: { seasonNumber: 1, episodeNumber: 2, title: 'Two' },
          data: { importedPath: '/tv/x.mkv' },
        },
      ],
    });
    expect((await env.browser.get(env.url('/1/history'))).json()).toEqual([
      expect.objectContaining({
        eventType: 'downloadFolderImported',
        quality: 'HDTV-720p',
        episode: { seasonNumber: 1, episodeNumber: 2, title: 'Two' },
        importedPath: '/tv/x.mkv',
        date: '2026-11-20T10:00:00.000Z',
      }),
    ]);
  });

  it('renommage : propositions, puis `RenameFiles` ou `RenameSeries`', async () => {
    env.sonarr.on('GET', '/api/v3/rename', [
      {
        episodeFileId: 5,
        seasonNumber: 1,
        episodeNumbers: [2],
        existingPath: 'a.mkv',
        newPath: 'b.mkv',
      },
    ]);
    env.sonarr.on('POST', '/api/v3/command', { id: 8 });
    expect((await env.browser.get(env.url('/1/rename'))).json()).toEqual([
      {
        episodeFileId: 5,
        seasonNumber: 1,
        episodeNumbers: [2],
        existingPath: 'a.mkv',
        newPath: 'b.mkv',
      },
    ]);
    await env.browser.post(env.url('/1/rename'), { fileIds: [5] });
    await env.browser.post(env.url('/1/rename'), {});
    expect(env.sonarr.callsTo('POST', '/api/v3/command').map((call) => call.body)).toEqual([
      { name: 'RenameFiles', seriesId: 1, files: [5] },
      { name: 'RenameSeries', seriesIds: [1] },
    ]);
  });

  it('explorateur de dossiers', async () => {
    env.sonarr.on('GET', '/api/v3/filesystem', {
      parent: '/',
      directories: [{ name: 'tv', path: '/tv/' }, { name: 'x' }],
    });
    const response = await env.browser.get(env.sonarrUrl('/filesystem?path=%2F'));
    expect(response.json()).toEqual({ parent: '/', directories: [{ name: 'tv', path: '/tv/' }] });
    expect(env.sonarr.callsTo('GET', '/api/v3/filesystem')[0]?.query.get('path')).toBe('/');
  });
});

describe('épisodes et saisons (n° 197 à 200, 210)', () => {
  it('épisodes normalisés', async () => {
    env.sonarr.on('GET', '/api/v3/episode', [rawEpisode(1, { hasFile: true, episodeFileId: 9 })]);
    expect((await env.browser.get(env.url('/1/episodes'))).json()).toEqual([
      expect.objectContaining({
        id: 1,
        seasonNumber: 1,
        episodeNumber: 1,
        airDate: '2020-01-01',
        hasFile: true,
        episodeFileId: 9,
      }),
    ]);
  });

  it('suivi d’un épisode : ressource relue puis renvoyée', async () => {
    env.sonarr.on('GET', '/api/v3/episode/4', rawEpisode(4));
    env.sonarr.on('PUT', '/api/v3/episode/4', rawEpisode(4, { monitored: false }));
    const response = await env.browser.post(env.url('/episode/4/monitor'), { monitored: false });
    expect(response.json()).toEqual({ ok: true });
    expect(env.sonarr.callsTo('PUT', '/api/v3/episode/4')[0]?.body).toMatchObject({
      id: 4,
      monitored: false,
    });
  });

  it('recherche d’épisodes et de saison', async () => {
    env.sonarr.on('POST', '/api/v3/command', { id: 3 });
    await env.browser.post(env.url('/episode/search'), { episodeIds: [4, 5] });
    await env.browser.post(env.url('/1/season/2/search'));
    expect(env.sonarr.callsTo('POST', '/api/v3/command').map((call) => call.body)).toEqual([
      { name: 'EpisodeSearch', episodeIds: [4, 5] },
      { name: 'SeasonSearch', seriesId: 1, seasonNumber: 2 },
    ]);
    const empty = await env.browser.post(env.url('/episode/search'), { episodeIds: [] });
    expect(empty.statusCode).toBe(400);
  });

  it('suivi d’une saison : seule la saison visée change, cache invalidé', async () => {
    await warmSeries(env);
    env.sonarr.on(
      'GET',
      '/api/v3/series/1',
      rawSeries(1, {
        seasons: [
          { seasonNumber: 1, monitored: true },
          { seasonNumber: 2, monitored: true },
        ],
      }),
    );
    env.sonarr.on('PUT', '/api/v3/series/1', rawSeries(1));
    await env.browser.post(env.url('/season/monitor'), {
      seriesId: 1,
      seasonNumber: 2,
      monitored: false,
    });
    const body = env.sonarr.callsTo('PUT', '/api/v3/series/1')[0]?.body as {
      seasons: { seasonNumber: number; monitored: boolean }[];
    };
    expect(body.seasons).toEqual([
      { seasonNumber: 1, monitored: true },
      { seasonNumber: 2, monitored: false },
    ]);
    expect(env.libraryCached()).toBe(false);
  });
});

describe('recherche interactive (n° 213, 214, 221)', () => {
  const release = {
    guid: 'g1',
    indexerId: 2,
    title: 'Show.S01E02.1080p',
    indexer: 'Idx',
    quality: { quality: { name: 'WEBDL-1080p' } },
    size: 2_097_152,
    seeders: 10,
    protocol: 'torrent',
    approved: true,
    customFormats: [{ id: 7, name: 'FR' }],
    customFormatScore: 50,
    seasonNumber: 1,
    episodeNumbers: [2],
    mappedSeasonNumber: 1,
    mappedEpisodeNumbers: [2],
    infoUrl: 'javascript:alert(1)',
  };

  it('releases d’un épisode : scores du profil de la série, saison et épisodes, `infoUrl` filtré', async () => {
    env.sonarr.on('GET', '/api/v3/episode/4', rawEpisode(4, { seriesId: 1 }));
    env.sonarr.on('GET', '/api/v3/series/1', rawSeries(1, { qualityProfileId: 5 }));
    env.sonarr.on('GET', '/api/v3/qualityprofile', [
      { id: 5, formatItems: [{ format: 7, score: 50 }] },
    ]);
    env.sonarr.on('GET', '/api/v3/release', [
      release,
      { ...release, guid: 'g2', approved: false, rejections: ['Too old'] },
    ]);
    const releases = (await env.browser.get(env.url('/episode/4/releases'))).json<
      SeriesRelease[]
    >();
    expect(releases.map((item) => item.guid)).toEqual(['g1', 'g2']);
    expect(releases[0]).toMatchObject({
      sizeMb: 2,
      scoreDetails: [{ name: 'FR', score: 50 }],
      episodeNumbers: [2],
      seasonNumber: 1,
      fullSeason: false,
      infoUrl: null,
    });
    expect(env.sonarr.callsTo('GET', '/api/v3/release')[0]?.query.get('episodeId')).toBe('4');
  });

  it('releases d’une saison (packs) : série et saison en requête', async () => {
    env.sonarr.on('GET', '/api/v3/series/1', rawSeries(1));
    env.sonarr.on('GET', '/api/v3/qualityprofile', []);
    env.sonarr.on('GET', '/api/v3/release', [{ ...release, fullSeason: true }]);
    const ok = await env.browser.get(env.url('/1/season/1/releases'));
    expect(ok.json<SeriesRelease[]>()[0]?.fullSeason).toBe(true);
    const query = env.sonarr.callsTo('GET', '/api/v3/release')[0]?.query;
    expect([query?.get('seriesId'), query?.get('seasonNumber')]).toEqual(['1', '1']);
  });

  it('grab : guid et indexeur transmis ; refus → 502', async () => {
    env.sonarr.on('POST', '/api/v3/release', {});
    expect(
      (await env.browser.post(env.url('/release/grab'), { guid: 'g1', indexerId: 2 })).json(),
    ).toEqual({ ok: true });
    expect(env.sonarr.callsTo('POST', '/api/v3/release')[0]?.body).toEqual({
      guid: 'g1',
      indexerId: 2,
    });
    env.sonarr.on('POST', '/api/v3/release', { message: 'Release rejected' }, 400);
    const refused = await env.browser.post(env.url('/release/grab'), { guid: 'g1', indexerId: 2 });
    expect(refused.statusCode).toBe(502);
  });
});

describe('fichiers (n° 207, 208, 217 à 220)', () => {
  it('fichiers normalisés (qualité, version, langues, infos média)', async () => {
    env.sonarr.on('GET', '/api/v3/episodefile', [rawFile(5)]);
    const files = (await env.browser.get(env.url('/1/files'))).json<EpisodeFile[]>();
    expect(files[0]).toMatchObject({
      id: 5,
      quality: { id: 3, name: 'WEBDL-1080p' },
      qualityVersion: 2,
      languages: [{ id: 2, name: 'French' }],
      releaseType: 'singleEpisode',
      mediaInfo: { videoCodec: 'x265', audioLanguages: 'fre/eng' },
    });
  });

  it('modification : qualité de la définition, révision gardée ; cache invalidé', async () => {
    await warmSeries(env);
    env.sonarr.on('GET', '/api/v3/episodefile/5', rawFile(5));
    env.sonarr.on('GET', '/api/v3/qualitydefinition', [
      { id: 1, quality: { id: 9, name: 'Bluray-1080p', source: 'bluray' }, title: 'Bluray-1080p' },
    ]);
    env.sonarr.onCall('PUT', '/api/v3/episodefile/5', (call) => ({ status: 202, body: call.body }));
    const response = await env.browser.post(env.url('/file/5/update'), {
      qualityId: 9,
      releaseGroup: 'NEW',
    });
    expect(response.json()).toMatchObject({
      ok: true,
      file: { quality: { id: 9, name: 'Bluray-1080p' }, qualityVersion: 2, releaseGroup: 'NEW' },
    });
    expect(env.sonarr.callsTo('PUT', '/api/v3/episodefile/5')[0]?.body).toMatchObject({
      quality: {
        quality: { id: 9, name: 'Bluray-1080p' },
        revision: { version: 2, isRepack: true },
      },
      languages: [{ id: 2, name: 'French' }],
    });
    expect(env.libraryCached()).toBe(false);
  });

  it('mise à jour complète : type de release et drapeaux par `PUT /episodefile/bulk`', async () => {
    env.sonarr.on('GET', '/api/v3/episodefile/5', rawFile(5));
    env.sonarr.on('PUT', '/api/v3/episodefile/bulk', []);
    const response = await env.browser.post(env.url('/files/bulk-update'), {
      fileId: 5,
      releaseType: 'seasonPack',
      indexerFlags: 8,
      languages: [{ id: 1, name: 'English' }],
    });
    expect(response.json()).toMatchObject({
      ok: true,
      file: { releaseType: 'seasonPack', indexerFlags: 8 },
    });
    expect(env.sonarr.callsTo('PUT', '/api/v3/episodefile/bulk')[0]?.body).toEqual([
      expect.objectContaining({
        id: 5,
        releaseType: 'seasonPack',
        indexerFlags: 8,
        languages: [{ id: 1, name: 'English' }],
      }),
    ]);
    const missing = await env.browser.post(env.url('/files/bulk-update'), { fileId: 99 });
    expect(missing.statusCode).toBe(404);
  });

  it('réattribution : `ManualImport` avec le fichier relu', async () => {
    env.sonarr.on('GET', '/api/v3/episodefile/5', rawFile(5));
    env.sonarr.on('POST', '/api/v3/command', { id: 12 });
    const response = await env.browser.post(env.url('/file/5/reassign'), {
      seriesId: 1,
      episodeIds: [33],
    });
    expect(response.json()).toEqual({ ok: true, cmdId: 12 });
    expect(env.sonarr.callsTo('POST', '/api/v3/command')[0]?.body).toMatchObject({
      name: 'ManualImport',
      importMode: 'auto',
      files: [
        { path: '/tv/Show/Season 01/E5.mkv', seriesId: 1, episodeIds: [33], episodeFileId: 5 },
      ],
    });
    const invalid = await env.browser.post(env.url('/file/5/reassign'), {
      seriesId: 1,
      episodeIds: [],
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('suppression d’un fichier ; définitions de qualité dans l’ordre du poids', async () => {
    env.sonarr.on('DELETE', '/api/v3/episodefile/5');
    expect((await env.browser.post(env.url('/file/5/delete'))).json()).toEqual({ ok: true });
    env.sonarr.on('GET', '/api/v3/qualitydefinition', [
      { quality: { id: 2, name: 'B' }, title: 'B', weight: 2 },
      { quality: { id: 1, name: 'A' }, title: 'A', weight: 1 },
    ]);
    expect((await env.browser.get(env.url('/quality-definitions'))).json()).toEqual([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ]);
  });
});
