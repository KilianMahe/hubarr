// SPDX-License-Identifier: AGPL-3.0-or-later
// Fiche film (`/api/medias/:slug/films/:id/…`, P2.4) : port de
// `MediaLibraryCacheInvalidationTest` (modification d'un fichier) et contrat de
// chaque route contre un Radarr simulé.

import type {
  FilesystemResponse,
  MovieBlocklistItem,
  MovieCredit,
  MovieDetail,
  MovieFile,
  MovieHistoryItem,
} from '@hubarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rawMovie, radarrEnv, warmLibrary, type RadarrEnv } from './radarr-env';

let env: RadarrEnv;
beforeEach(async () => {
  env = await radarrEnv();
});
afterEach(async () => {
  await env.close();
});

const rawFile = (overrides: Record<string, unknown> = {}) => ({
  id: 5,
  movieId: 1,
  relativePath: 'Movie (2001).mkv',
  path: '/movies/Movie (2001)/Movie (2001).mkv',
  size: 1_000,
  dateAdded: '2024-02-01T10:00:00Z',
  quality: {
    quality: { id: 7, name: 'Bluray-1080p' },
    revision: { version: 2, real: 0, isRepack: true },
  },
  languages: [{ id: 2, name: 'French' }],
  releaseGroup: 'GRP',
  edition: '',
  customFormats: [{ id: 1, name: 'HDR' }],
  customFormatScore: 10,
  ...overrides,
});

describe('fiche', () => {
  it('detail et info renvoient la fiche normalisée, sans cache', async () => {
    env.radarr.on(
      'GET',
      '/api/v3/movie/1',
      rawMovie(1, {
        title: 'The Matrix',
        alternateTitles: [{ title: 'Matrix', sourceType: 'tmdb' }],
        images: [
          {
            coverType: 'fanart',
            remoteUrl: 'https://image.tmdb.org/t/p/original/f.jpg',
            url: '/MediaCover/1/fanart.jpg',
          },
        ],
      }),
    );
    for (const suffix of ['detail', 'info']) {
      const response = await env.browser.get(env.url(`/1/${suffix}`));
      expect(response.statusCode).toBe(200);
      const movie = response.json<MovieDetail>();
      expect(movie).toMatchObject({
        id: 1,
        title: 'The Matrix',
        fanart: 'https://image.tmdb.org/t/p/original/f.jpg',
      });
      expect(movie.alternateTitles).toEqual([
        { title: 'Matrix', sourceType: 'tmdb', sourceId: null },
      ]);
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });

  it('film inconnu de Radarr → 404 NOT_FOUND ; id invalide → 400', async () => {
    const missing = await env.browser.get(env.url('/99/detail'));
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: 'NOT_FOUND', service: 'radarr' });
    expect((await env.browser.get(env.url('/abc/detail'))).statusCode).toBe(400);
  });
});

describe('commandes du film', () => {
  it.each([
    ['search', 'MoviesSearch', { movieIds: [3] }],
    ['refresh', 'RefreshMovie', { movieIds: [3] }],
    ['rescan', 'RescanMovie', { movieId: 3 }],
  ])('%s → commande %s', async (path, name, extra) => {
    env.radarr.on('POST', '/api/v3/command', { id: 42, name });
    const response = await env.browser.post(env.url(`/3/${path}`));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, cmdId: 42 });
    expect(env.radarr.callsTo('POST', '/api/v3/command')[0]?.body).toEqual({ ...extra, name });
  });

  it('mutations protégées par le jeton CSRF', async () => {
    const response = await env.browser.post(env.url('/3/search'), undefined, {
      'x-csrf-token': 'faux',
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('suivi, suppression, édition', () => {
  it('monitor : relit le film, renvoie le nouveau suivi, invalide la bibliothèque', async () => {
    await warmLibrary(env);
    env.radarr.on('GET', '/api/v3/movie/1', rawMovie(1, { monitored: true, qualityProfileId: 4 }));
    env.radarr.on('PUT', '/api/v3/movie/1', rawMovie(1, { monitored: false }));
    const response = await env.browser.post(env.url('/1/monitor'), { monitored: false });
    expect(response.json()).toEqual({ ok: true, monitored: false });
    expect(env.radarr.callsTo('PUT', '/api/v3/movie/1')[0]?.body).toMatchObject({
      id: 1,
      monitored: false,
      qualityProfileId: 4,
    });
    expect(env.libraryCached()).toBe(false);
  });

  it('delete : options transmises à Radarr, bibliothèque invalidée', async () => {
    await warmLibrary(env);
    env.radarr.on('DELETE', '/api/v3/movie/1');
    const response = await env.browser.post(env.url('/1/delete'), {
      deleteFiles: true,
      addImportExclusion: true,
    });
    expect(response.json()).toEqual({ ok: true });
    const call = env.radarr.callsTo('DELETE', '/api/v3/movie/1')[0];
    expect(call?.query.get('deleteFiles')).toBe('true');
    expect(call?.query.get('addImportExclusion')).toBe('true');
    expect(env.libraryCached()).toBe(false);
  });

  it('edit : seuls les champs fournis sont fusionnés dans la ressource brute', async () => {
    await warmLibrary(env);
    env.radarr.on(
      'GET',
      '/api/v3/movie/1',
      rawMovie(1, { qualityProfileId: 1, path: '/a', extra: 'gardé' }),
    );
    env.radarr.on(
      'PUT',
      '/api/v3/movie/1',
      rawMovie(1, { qualityProfileId: 2, path: '/b', tags: [3] }),
    );
    const response = await env.browser.post(env.url('/1/edit'), {
      qualityProfileId: 2,
      path: '/b',
      tags: [3],
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ movie: MovieDetail }>().movie).toMatchObject({
      qualityProfileId: 2,
      path: '/b',
      tags: [3],
    });
    expect(env.radarr.callsTo('PUT', '/api/v3/movie/1')[0]?.body).toMatchObject({
      qualityProfileId: 2,
      path: '/b',
      tags: [3],
      monitored: true,
      extra: 'gardé',
    });
    expect(env.libraryCached()).toBe(false);
  });

  it('edit : disponibilité hors liste refusée', async () => {
    const response = await env.browser.post(env.url('/1/edit'), { minimumAvailability: 'preDB' });
    expect(response.statusCode).toBe(400);
  });
});

describe('fichiers (MediaLibraryCacheInvalidationTest)', () => {
  it('liste normalisée des fichiers', async () => {
    env.radarr.on('GET', '/api/v3/moviefile', [rawFile()]);
    const files = (await env.browser.get(env.url('/1/files'))).json<MovieFile[]>();
    expect(files).toEqual([
      {
        id: 5,
        relativePath: 'Movie (2001).mkv',
        path: '/movies/Movie (2001)/Movie (2001).mkv',
        size: 1_000,
        dateAdded: '2024-02-01T10:00:00.000Z',
        quality: { id: 7, name: 'Bluray-1080p' },
        languages: [{ id: 2, name: 'French' }],
        releaseGroup: 'GRP',
        edition: null,
        customFormats: ['HDR'],
        customFormatScore: 10,
      },
    ]);
    expect(env.radarr.callsTo('GET', '/api/v3/moviefile')[0]?.query.get('movieId')).toBe('1');
  });

  it('update réussi : qualité complète, révision gardée, langues, groupe ; cache invalidé', async () => {
    await warmLibrary(env);
    env.radarr.on('GET', '/api/v3/moviefile/5', rawFile());
    env.radarr.on('GET', '/api/v3/qualitydefinition', [
      {
        id: 30,
        title: 'WEB 2160p',
        weight: 9,
        quality: { id: 18, name: 'WEBDL-2160p', source: 'webdl', resolution: 2160 },
      },
    ]);
    env.radarr.onCall('PUT', '/api/v3/moviefile/5', (call) => ({ status: 202, body: call.body }));
    const response = await env.browser.post(env.url('/files/5/update'), {
      qualityId: 18,
      languages: [{ id: 1, name: 'English' }],
      releaseGroup: 'NEW',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ ok: boolean; file: MovieFile }>()).toMatchObject({
      ok: true,
      file: {
        quality: { id: 18, name: 'WEBDL-2160p' },
        releaseGroup: 'NEW',
        languages: [{ id: 1, name: 'English' }],
      },
    });
    expect(env.radarr.callsTo('PUT', '/api/v3/moviefile/5')[0]?.body).toMatchObject({
      id: 5,
      relativePath: 'Movie (2001).mkv',
      quality: {
        quality: { id: 18, name: 'WEBDL-2160p', source: 'webdl', resolution: 2160 },
        revision: { version: 2, real: 0, isRepack: true },
      },
      languages: [{ id: 1, name: 'English' }],
      releaseGroup: 'NEW',
    });
    expect(env.libraryCached()).toBe(false);
  });

  it('update en échec chez Radarr : pas d’invalidation, erreur commune', async () => {
    await warmLibrary(env);
    env.radarr.on('GET', '/api/v3/moviefile/5', rawFile());
    env.radarr.on('PUT', '/api/v3/moviefile/5', { message: 'boom' }, 500);
    const response = await env.browser.post(env.url('/files/5/update'), { releaseGroup: 'X' });
    expect(response.statusCode).toBe(502);
    expect(env.libraryCached()).toBe(true);
  });

  it('update : fichier inconnu → 404, aucune langue → 400', async () => {
    expect(
      (await env.browser.post(env.url('/files/9/update'), { releaseGroup: 'X' })).statusCode,
    ).toBe(404);
    expect((await env.browser.post(env.url('/files/5/update'), { languages: [] })).statusCode).toBe(
      400,
    );
  });

  it('suppression d’un fichier : cache invalidé', async () => {
    await warmLibrary(env);
    env.radarr.on('DELETE', '/api/v3/moviefile/5');
    expect((await env.browser.post(env.url('/files/5/delete'))).json()).toEqual({ ok: true });
    expect(env.libraryCached()).toBe(false);
  });

  it('définitions de qualité : qualité, titre de la définition, ordre du poids', async () => {
    env.radarr.on('GET', '/api/v3/qualitydefinition', [
      { id: 2, title: 'HD', weight: 5, quality: { id: 7, name: 'Bluray-1080p' } },
      { id: 1, title: 'SD', weight: 1, quality: { id: 1, name: 'SDTV' } },
      { id: 3, weight: 9 },
    ]);
    const response = await env.browser.get(env.url('/quality-definitions'));
    expect(response.json()).toEqual([
      { id: 1, name: 'SD' },
      { id: 7, name: 'HD' },
    ]);
  });
});

describe('crédits, extras, historique, liste de blocage', () => {
  it('crédits : photo distante seulement, type cast ou crew', async () => {
    env.radarr.on('GET', '/api/v3/credit', [
      {
        personName: 'Keanu Reeves',
        personTmdbId: 6384,
        character: 'Neo',
        type: 'cast',
        images: [
          {
            coverType: 'headshot',
            url: '/MediaCover/x.jpg',
            remoteUrl: 'https://image.tmdb.org/t/p/original/k.jpg',
          },
        ],
      },
      {
        personName: 'Lana',
        personTmdbId: 9,
        job: 'Director',
        department: 'Directing',
        type: 'crew',
        images: [{ url: '/local.jpg' }],
      },
    ]);
    const credits = (await env.browser.get(env.url('/1/credits'))).json<MovieCredit[]>();
    expect(credits[0]).toEqual({
      personName: 'Keanu Reeves',
      personTmdbId: 6384,
      character: 'Neo',
      job: null,
      department: null,
      type: 'cast',
      image: 'https://image.tmdb.org/t/p/original/k.jpg',
    });
    expect(credits[1]).toMatchObject({ type: 'crew', job: 'Director', image: null });
  });

  it('extras', async () => {
    env.radarr.on('GET', '/api/v3/extrafile', [
      { id: 1, relativePath: 'movie.fr.srt', extension: '.srt', type: 'subtitle' },
    ]);
    expect((await env.browser.get(env.url('/1/extras'))).json()).toEqual([
      { id: 1, relativePath: 'movie.fr.srt', extension: '.srt', type: 'subtitle' },
    ]);
  });

  it('historique : évènements normalisés depuis `data`', async () => {
    env.radarr.on('GET', '/api/v3/history/movie', [
      {
        id: 8,
        movieId: 1,
        eventType: 'grabbed',
        date: '2024-03-01T12:00:00Z',
        sourceTitle: 'Movie.2001.1080p',
        quality: { quality: { name: 'Bluray-1080p' } },
        data: { indexer: 'Idx', releaseTitle: 'Movie.2001.1080p', downloadClientName: 'qBit' },
        movie: { title: 'Movie 1', year: 2001 },
      },
    ]);
    const response = await env.browser.get(env.url('/1/history'));
    expect(response.json<MovieHistoryItem[]>()).toEqual([
      {
        id: 8,
        movieId: 1,
        eventType: 'grabbed',
        date: '2024-03-01T12:00:00.000Z',
        quality: 'Bluray-1080p',
        sourceTitle: 'Movie.2001.1080p',
        indexer: 'Idx',
        releaseTitle: 'Movie.2001.1080p',
        importedPath: null,
        downloadClient: 'qBit',
        protocol: null,
        reason: null,
        movie: { title: 'Movie 1', year: 2001 },
      },
    ]);
    const call = env.radarr.callsTo('GET', '/api/v3/history/movie')[0];
    expect(call?.query.get('movieId')).toBe('1');
  });

  it('liste de blocage du film', async () => {
    env.radarr.on('GET', '/api/v3/blocklist/movie', [
      {
        id: 3,
        movieId: 1,
        sourceTitle: 'Bad.Release',
        date: '2024-01-01T00:00:00Z',
        protocol: 'torrent',
        indexer: 'Idx',
        message: 'fake',
        languages: [{ id: 1, name: 'English' }],
        quality: { quality: { name: 'CAM' } },
      },
    ]);
    const items = (await env.browser.get(env.url('/1/blocklist'))).json<MovieBlocklistItem[]>();
    expect(items[0]).toMatchObject({
      id: 3,
      sourceTitle: 'Bad.Release',
      quality: 'CAM',
      languages: ['English'],
      movie: null,
    });
  });
});

describe('explorateur, étiquettes', () => {
  it('filesystem : dossiers seulement, chemin par défaut `/`', async () => {
    env.radarr.on('GET', '/api/v3/filesystem', {
      parent: '/',
      directories: [{ name: 'movies', path: '/movies/' }, { name: 'sans chemin' }],
      files: [],
    });
    const body = (await env.browser.get(env.url('/filesystem'))).json<FilesystemResponse>();
    expect(body).toEqual({ parent: '/', directories: [{ name: 'movies', path: '/movies/' }] });
    const call = env.radarr.callsTo('GET', '/api/v3/filesystem')[0];
    expect(call?.query.get('path')).toBe('/');
    expect(call?.query.get('includeFiles')).toBe('false');
  });

  it('création d’étiquette ; libellé vide refusé', async () => {
    env.radarr.on('POST', '/api/v3/tag', { id: 4, label: 'kids' });
    const response = await env.browser.post(env.url('/config/tag'), { label: ' kids ' });
    expect(response.json()).toEqual({ ok: true, tag: { id: 4, label: 'kids' } });
    expect(env.radarr.callsTo('POST', '/api/v3/tag')[0]?.body).toEqual({ label: 'kids' });
    expect((await env.browser.post(env.url('/config/tag'), { label: '  ' })).statusCode).toBe(400);
  });
});
