// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration *arr, système (P3b.5) : sauvegardes, mises à jour, tâches,
// commandes, journaux, statistiques, parseur, import de bibliothèque,
// suggestions et renommage (Radarr), calendrier (Sonarr).

import {
  ARR_KINDS,
  type LibraryImportScan,
  type LibraryStats,
  type LogsPage,
  type ParseResult,
  type SuggestionsPage,
  type UpdatesPage,
} from '@hubarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rawMovie } from '../movies/radarr-env';
import { rawSeries } from '../series/sonarr-env';
import { adminEnv, type AdminEnv } from './admin-env';

describe.each(ARR_KINDS)('système (%s)', (kind) => {
  let env: AdminEnv;
  beforeEach(async () => {
    env = await adminEnv(kind);
  });
  afterEach(async () => {
    await env.close();
  });

  it('sauvegardes : récentes en tête, sans chemin ; création, suppression, restauration', async () => {
    env.upstream.on('GET', '/api/v3/system/backup', [
      {
        id: 1,
        name: 'a.zip',
        path: '/backup/a.zip',
        type: 'scheduled',
        size: 10,
        time: '2026-11-01T00:00:00Z',
      },
      {
        id: 2,
        name: 'b.zip',
        path: '/backup/b.zip',
        type: 'manual',
        size: 20,
        time: '2026-11-10T00:00:00Z',
      },
    ]);
    const list = (await env.browser.get(env.url('/sauvegardes'))).json<{ id: number }[]>();
    expect(list.map((backup) => backup.id)).toEqual([2, 1]);
    expect(JSON.stringify(list)).not.toContain('/backup/');
    env.upstream.on('POST', '/api/v3/command', { id: 31 });
    expect((await env.browser.post(env.url('/sauvegardes/creer'))).json()).toEqual({
      ok: true,
      cmdId: 31,
    });
    expect(env.upstream.callsTo('POST', '/api/v3/command')[0]?.body).toEqual({ name: 'Backup' });
    env.upstream.on('DELETE', '/api/v3/system/backup/2');
    env.upstream.on('POST', '/api/v3/system/backup/restore/2');
    expect((await env.browser.post(env.url('/sauvegardes/2/supprimer'))).json()).toEqual({
      ok: true,
    });
    expect((await env.browser.post(env.url('/sauvegardes/2/restaurer'))).json()).toEqual({
      ok: true,
    });
    expect(env.upstream.callsTo('POST', '/api/v3/system/backup/restore/2')).toHaveLength(1);
  });

  it('mises à jour : versions, nouveautés, conteneur ; installation', async () => {
    env.upstream.on('GET', '/api/v3/update', [
      {
        version: '5.1.0',
        branch: 'master',
        releaseDate: '2026-11-01T00:00:00Z',
        installable: true,
        latest: true,
        changes: { new: ['A'], fixed: ['B'] },
      },
      { version: '5.0.0', installed: true, changes: null },
    ]);
    env.upstream.on('GET', '/api/v3/system/status', { version: '5.0.0', isDocker: true });
    const page = (await env.browser.get(env.url('/mises-a-jour'))).json<UpdatesPage>();
    expect(page.version).toBe('5.0.0');
    expect(page.docker).toBe(true);
    expect(page.updates[0]).toMatchObject({
      version: '5.1.0',
      installable: true,
      latest: true,
      changes: { new: ['A'], fixed: ['B'] },
    });
    expect(page.updates[1]?.changes).toEqual({ new: [], fixed: [] });
    env.upstream.on('POST', '/api/v3/command', { id: 9 });
    expect((await env.browser.post(env.url('/mises-a-jour/installer'))).json()).toEqual({
      ok: true,
      cmdId: 9,
    });
    expect(env.upstream.callsTo('POST', '/api/v3/command')[0]?.body).toEqual({
      name: 'ApplicationUpdate',
    });
  });

  it('tâches : liste, lancement par nom de commande (vide ou exotique refusé)', async () => {
    env.upstream.on('GET', '/api/v3/system/task', [
      {
        id: 1,
        name: 'RSS Sync',
        taskName: 'RssSync',
        interval: 15,
        lastExecution: '2026-11-21T10:00:00Z',
        nextExecution: '2026-11-21T10:15:00Z',
        lastDuration: '00:00:01',
      },
    ]);
    expect((await env.browser.get(env.url('/taches'))).json()).toEqual([
      expect.objectContaining({ name: 'RSS Sync', taskName: 'RssSync', interval: 15 }),
    ]);
    env.upstream.on('POST', '/api/v3/command', { id: 4 });
    expect(
      (await env.browser.post(env.url('/taches/executer'), { commandName: 'RssSync' })).json(),
    ).toEqual({ ok: true, cmdId: 4 });
    const empty = await env.browser.post(env.url('/taches/executer'), { commandName: '' });
    expect(empty.statusCode).toBe(400);
    expect(JSON.stringify(empty.json())).toContain('media.api.command_name_required');
    expect(
      (await env.browser.post(env.url('/taches/executer'), { commandName: '../x' })).statusCode,
    ).toBe(400);
  });

  it('commandes : plus récentes en tête, état (purgée → `unknown`), annulation', async () => {
    env.upstream.on('GET', '/api/v3/command', [
      { id: 1, commandName: 'RSS Sync', name: 'RssSync', status: 'completed' },
      { id: 3, name: 'Backup', status: 'started', started: '2026-11-21T10:00:00Z' },
    ]);
    expect(
      (await env.browser.get(env.url('/commandes')))
        .json<{ id: number; name: string }[]>()
        .map((command) => [command.id, command.name]),
    ).toEqual([
      [3, 'Backup'],
      [1, 'RSS Sync'],
    ]);
    env.upstream.on('GET', '/api/v3/command/3', { id: 3, name: 'Backup', status: 'completed' });
    expect((await env.browser.get(env.url('/command/3/status'))).json()).toMatchObject({
      id: 3,
      status: 'completed',
    });
    expect((await env.browser.get(env.url('/command/8/status'))).json()).toMatchObject({
      id: 8,
      status: 'unknown',
    });
    env.upstream.on('DELETE', '/api/v3/command/3');
    expect((await env.browser.post(env.url('/command/3/annuler'))).json()).toEqual({ ok: true });
  });

  it('journaux : fichiers sans URL, 100 par page, niveau transmis, exception tronquée', async () => {
    env.upstream.on('GET', '/api/v3/log/file', [
      {
        filename: 'radarr.txt',
        lastWriteTime: '2026-11-21T10:00:00Z',
        downloadUrl: '/logfile/radarr.txt',
      },
    ]);
    env.upstream.on('GET', '/api/v3/log', {
      totalRecords: 250,
      records: [
        {
          time: '2026-11-21T10:00:00Z',
          level: 'Warn',
          logger: 'RssSync',
          message: 'slow',
          exception: 'x'.repeat(3000),
        },
      ],
    });
    const page = (await env.browser.get(env.url('/logs?page=2&level=warn'))).json<LogsPage>();
    expect(page.files).toEqual([
      { filename: 'radarr.txt', lastWriteTime: '2026-11-21T10:00:00.000Z' },
    ]);
    expect(page.records[0]).toMatchObject({ level: 'warn', logger: 'RssSync', message: 'slow' });
    expect(page.records[0]?.exception).toHaveLength(2000);
    expect(page).toMatchObject({ totalRecords: 250, page: 2, pageSize: 100 });
    const query = env.upstream.callsTo('GET', '/api/v3/log')[0]?.query;
    expect(query?.get('level')).toBe('warn');
    expect(query?.get('pageSize')).toBe('100');
    await env.browser.get(env.url('/logs?level=bogus'));
    expect(env.upstream.callsTo('GET', '/api/v3/log')[1]?.query.has('level')).toBe(false);
  });

  it('statistiques tirées de la bibliothèque', async () => {
    env.upstream.on('GET', '/api/v3/diskspace', [
      { path: '/data', label: 'data', freeSpace: 10, totalSpace: 100 },
    ]);
    if (kind === 'radarr') {
      env.upstream.on('GET', '/api/v3/movie', [
        rawMovie(1, {
          year: 1999,
          hasFile: true,
          sizeOnDisk: 1000,
          genres: ['Action'],
          movieFile: { quality: { quality: { name: 'Bluray-1080p' } } },
        }),
        rawMovie(2, { year: 2005, monitored: false, genres: ['Action', 'Drama'] }),
      ]);
      env.upstream.on('GET', '/api/v3/wanted/missing', { totalRecords: 7, records: [] });
    } else {
      env.upstream.on('GET', '/api/v3/series', [
        rawSeries(1, { status: 'ended', network: 'HBO', genres: ['Drama'] }),
        rawSeries(2, { network: 'HBO', monitored: false, genres: ['Drama', 'Crime'] }),
      ]);
    }
    const stats = (await env.browser.get(env.url('/stats'))).json<LibraryStats>();
    expect(stats.total).toBe(2);
    expect(stats.monitored).toBe(1);
    expect(stats.disks).toEqual([{ path: '/data', label: 'data', freeSpace: 10, totalSpace: 100 }]);
    if (kind === 'radarr') {
      expect(stats).toMatchObject({
        hasFile: 1,
        missing: 7,
        decades: [
          { name: '1990s', count: 1 },
          { name: '2000s', count: 1 },
        ],
      });
      expect(stats.genres[0]).toEqual({ name: 'Action', count: 2 });
    } else {
      expect(stats).toMatchObject({
        continuing: 1,
        ended: 1,
        networks: [{ name: 'HBO', count: 2 }],
      });
      expect(stats.genres[0]).toEqual({ name: 'Drama', count: 2 });
    }
  });

  it('parseur : sans titre, rien ; résultat normalisé (film ou épisode)', async () => {
    expect((await env.browser.get(env.url('/parser'))).json()).toEqual({ result: null });
    env.upstream.on(
      'GET',
      '/api/v3/parse',
      kind === 'radarr'
        ? {
            title: 'The.Matrix.1999.1080p',
            parsedMovieInfo: {
              movieTitle: 'The Matrix',
              year: 1999,
              quality: { quality: { name: 'Bluray-1080p' } },
              languages: [{ id: 1, name: 'English' }],
              releaseGroup: 'GRP',
            },
            movie: { id: 3, title: 'The Matrix', year: 1999 },
          }
        : {
            title: 'Show.S01E02E03',
            parsedEpisodeInfo: {
              seriesTitle: 'Show',
              seasonNumber: 1,
              episodeNumbers: [2, 3],
              quality: { quality: { name: 'HDTV-720p' } },
              languages: [],
            },
            series: { id: 5, title: 'Show' },
          },
    );
    const result = (await env.browser.get(env.url('/parser?title=x'))).json<{
      result: ParseResult;
    }>().result;
    if (kind === 'radarr') {
      expect(result).toMatchObject({
        parsedTitle: 'The Matrix',
        year: 1999,
        quality: 'Bluray-1080p',
        languages: ['English'],
        releaseGroup: 'GRP',
        episode: null,
        match: { id: 3, title: 'The Matrix', year: 1999 },
      });
    } else {
      expect(result).toMatchObject({
        parsedTitle: 'Show',
        quality: 'HDTV-720p',
        episode: 'S01E02E03',
        match: { id: 5, title: 'Show', year: null },
      });
    }
    expect(env.upstream.callsTo('GET', '/api/v3/parse')[0]?.query.get('title')).toBe('x');
  });

  it('import de bibliothèque : dossiers et profils, scan des dossiers absents de la bibliothèque', async () => {
    env.upstream.on('GET', '/api/v3/rootfolder', [{ id: 1, path: '/media' }]);
    env.upstream.on('GET', '/api/v3/qualityprofile', [{ id: 4, name: 'HD' }]);
    expect((await env.browser.get(env.url('/import-bibliotheque'))).json()).toEqual({
      rootFolders: [{ id: 1, path: '/media' }],
      qualityProfiles: [{ id: 4, name: 'HD' }],
    });
    const library =
      kind === 'radarr'
        ? [rawMovie(1, { path: '/media/Known (2001)/' })]
        : [rawSeries(1, { path: '/media/Known' })];
    env.upstream.on('GET', kind === 'radarr' ? '/api/v3/movie' : '/api/v3/series', library);
    env.upstream.on('GET', '/api/v3/filesystem', {
      directories: [
        {
          name: kind === 'radarr' ? 'Known (2001)' : 'Known',
          path: kind === 'radarr' ? '/media/Known (2001)/' : '/media/Known/',
        },
        { name: 'New', path: '/media/New/', size: 5 },
      ],
    });
    const scan = (
      await env.browser.post(env.url('/import-bibliotheque/scan'), { folder: '/media//' })
    ).json<LibraryImportScan>();
    expect(scan.folders).toEqual([{ name: 'New', path: '/media/New', size: 5 }]);
    expect(env.upstream.callsTo('GET', '/api/v3/filesystem')[0]?.query.get('path')).toBe('/media/');
    expect(
      (await env.browser.post(env.url('/import-bibliotheque/scan'), { folder: '' })).statusCode,
    ).toBe(400);
  });

  it('suggestions, renommage (Radarr) et calendrier (Sonarr) selon le service', async () => {
    env.upstream.on('GET', '/api/v3/importlist/movie', [
      {
        tmdbId: 603,
        title: 'The Matrix',
        year: 1999,
        isRecommendation: true,
        remotePoster: 'https://image.tmdb.org/t/p/original/x.jpg',
        ratings: { tmdb: { value: 8.2 } },
      },
      {
        tmdbId: 604,
        title: 'Local',
        images: [{ coverType: 'poster', remoteUrl: 'http://radarr.local/poster.jpg' }],
        id: 9,
      },
    ]);
    env.upstream.on('GET', '/api/v3/qualityprofile', [{ id: 4, name: 'HD' }]);
    env.upstream.on('GET', '/api/v3/rootfolder', [{ id: 1, path: '/media' }]);
    env.upstream.on('GET', '/api/v3/calendar', []);
    env.upstream.on('GET', '/api/v3/movie', [
      rawMovie(2, { title: 'Zulu' }),
      rawMovie(1, { title: 'Alpha' }),
    ]);
    env.upstream.on('GET', '/api/v3/rename', [
      { movieFileId: 3, existingPath: 'a.mkv', newPath: 'b.mkv' },
    ]);
    env.upstream.on('POST', '/api/v3/command', { id: 12 });
    const suggestions = await env.browser.get(env.url('/suggestions'));
    const rename = await env.browser.get(env.url('/renommer'));
    const calendar = await env.browser.get(env.url('/calendrier'));
    if (kind === 'radarr') {
      const page = suggestions.json<SuggestionsPage>();
      expect(page.movies[0]).toMatchObject({
        tmdbId: 603,
        recommended: true,
        poster: 'https://image.tmdb.org/t/p/original/x.jpg',
        ratings: { tmdb: 8.2, imdb: null },
        inLibrary: false,
      });
      expect(page.movies[1]).toMatchObject({ poster: null, inLibrary: true });
      expect(rename.json()).toEqual({
        movies: [
          { id: 1, title: 'Alpha', year: 2001 },
          { id: 2, title: 'Zulu', year: 2002 },
        ],
      });
      expect((await env.browser.get(env.url('/renommer/1/propositions'))).json()).toEqual([
        { movieFileId: 3, existingPath: 'a.mkv', newPath: 'b.mkv' },
      ]);
      expect((await env.browser.post(env.url('/renommer/1/executer'))).json()).toEqual({
        ok: true,
        cmdId: 12,
      });
      expect(env.upstream.callsTo('POST', '/api/v3/command')[0]?.body).toEqual({
        name: 'RenameMovie',
        movieIds: [1],
      });
      expect(calendar.statusCode).toBe(404);
    } else {
      expect(suggestions.statusCode).toBe(404);
      expect(rename.statusCode).toBe(404);
      expect(calendar.statusCode).toBe(200);
      const call = env.upstream.callsTo('GET', '/api/v3/calendar')[0];
      expect(call).toBeDefined();
    }
  });
});
