// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration Radarr/Sonarr (P3b.5) : logique (import de bibliothèque,
// intervalles, journaux, calendrier) et vues montées (sauvegardes, mises à
// jour, tâches, commandes, journaux, statistiques, parseur, import de
// bibliothèque, suggestions, renommage, calendrier, redirections Sonarr).

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setLocale } from '../src/app/plugins/i18n';
import { filterLogs, formatInterval, groupByAirDate } from '../src/features/arr-admin/admin-format';
import {
  defaultOptions,
  importRows,
  moviePayload,
  searchTerm,
  seriesPayload,
} from '../src/features/arr-admin/library-import';
import { settle } from './helpers';
import { adminApi, cleanupAdmin, click, fullMovie, mountAdmin, type } from './arr-admin-fixtures';

beforeAll(async () => {
  await setLocale('en');
});
afterEach(cleanupAdmin);

describe('logique', () => {
  it('import : terme de recherche, lignes, ajout d’un film (chemin) ou d’une série (dossier racine)', () => {
    expect(searchTerm('radarr', 'The Matrix (1999) Bluray-1080p')).toBe('The Matrix');
    expect(searchTerm('radarr', 'Heat WEBDL-1080p')).toBe('Heat');
    expect(searchTerm('sonarr', ' The Wire (2002) ')).toBe('The Wire (2002)');
    const [row] = importRows([{ name: 'Heat', path: '/media/Heat' }], defaultOptions('radarr', 4));
    if (!row) throw new Error('ligne');
    expect(moviePayload(row, '/media')).toBeNull();
    row.match = { externalId: 949, title: 'Heat', year: 1995, existing: false };
    expect(moviePayload(row, '/media')).toEqual({
      tmdbId: 949,
      title: 'Heat',
      year: 1995,
      qualityProfileId: 4,
      rootFolderPath: '/media',
      path: '/media/Heat',
      monitored: true,
      minimumAvailability: 'released',
      searchForMovie: false,
    });
    const [series] = importRows(
      [{ name: 'Wire', path: '/tv/Wire' }],
      defaultOptions('sonarr', null),
    );
    if (!series) throw new Error('ligne');
    series.match = { externalId: 79126, title: 'The Wire', year: 2002, existing: false };
    expect(seriesPayload(series, '/tv')).toEqual({
      tvdbId: 79126,
      rootFolderPath: '/tv',
      qualityProfileId: 0,
      seriesType: 'standard',
      monitor: 'all',
      monitored: true,
      seasonFolder: true,
      searchForMissing: false,
    });
  });

  it('intervalles, recherche dans les journaux, calendrier groupé', () => {
    expect(formatInterval(15, 'en')).toContain('15');
    expect(formatInterval(1440, 'en')).toContain('1');
    expect(formatInterval(null, 'en')).toBe('—');
    const logs = [
      { message: 'RSS sync', logger: 'RssSync', exception: null },
      { message: 'Import', logger: 'Importer', exception: 'Disk full' },
    ];
    expect(filterLogs(logs, 'disk')).toHaveLength(1);
    expect(filterLogs(logs, '')).toHaveLength(2);
    const days = groupByAirDate([
      { airDate: '2026-11-23', airDateUtc: '2026-11-23T21:00:00Z' },
      { airDate: '2026-11-22', airDateUtc: '2026-11-22T20:00:00Z' },
      { airDate: null, airDateUtc: '2026-11-23T01:00:00Z' },
      { airDate: null, airDateUtc: null },
    ]);
    expect(days.map((day) => [day.date, day.episodes.length])).toEqual([
      ['2026-11-22', 1],
      ['2026-11-23', 2],
    ]);
    expect(days[1]?.episodes[0]?.airDateUtc).toBe('2026-11-23T01:00:00Z');
  });
});

describe('vues', () => {
  it('sauvegardes : création (sans suivi si l’instance ne renvoie pas d’id), restauration confirmée', async () => {
    let backups = [
      { id: 1, name: 'a.zip', type: 'scheduled', size: 1024, time: '2026-11-20T00:00:00Z' },
    ];
    const { fetch } = await mountAdmin('/medias/radarr/radarr/sauvegardes', {
      [`GET ${adminApi('radarr', '/sauvegardes')}`]: () => ({ body: backups }),
      [`POST ${adminApi('radarr', '/sauvegardes/creer')}`]: () => {
        backups = [
          { id: 2, name: 'b.zip', type: 'manual', size: 10, time: '2026-11-21T00:00:00Z' },
          ...backups,
        ];
        return { body: { ok: true, cmdId: null } };
      },
      [`POST ${adminApi('radarr', '/sauvegardes/1/restaurer')}`]: () => ({ body: { ok: true } }),
    });
    click('[data-test="backup-create"]');
    await settle();
    expect(document.querySelectorAll('[data-test="backup-row"]')).toHaveLength(2);
    expect(document.querySelector('[data-test="arr-admin-feedback"]')?.textContent).toContain(
      'Backup created',
    );
    click('[data-test="backup-restore"]', 1);
    await settle();
    expect(document.body.textContent).toContain('restart');
    click('[data-test="confirm"]');
    await settle();
    expect(fetch.calls.some((call) => call.url.endsWith('/sauvegardes/1/restaurer'))).toBe(true);
  });

  it('mises à jour (conteneur) : pas de bouton d’installation', async () => {
    await mountAdmin('/medias/sonarr/sonarr/mises-a-jour', {
      [`GET ${adminApi('sonarr', '/mises-a-jour')}`]: () => ({
        body: {
          version: '4.0.20',
          docker: true,
          updates: [
            {
              version: '4.0.21',
              branch: 'main',
              releaseDate: null,
              installed: false,
              installable: true,
              latest: true,
              changes: { new: ['Faster'], fixed: [] },
            },
          ],
        },
      }),
    });
    expect(document.querySelector('[data-test="updates-version"]')?.textContent).toBe('4.0.20');
    expect(document.querySelector('[data-test="updates-docker"]')).not.toBeNull();
    expect(document.querySelector('[data-test="update-install"]')).toBeNull();
    expect(document.querySelector('[data-test="update-row"]')?.textContent).toContain('Faster');
  });

  it('tâches : lancement par nom de commande', async () => {
    const { fetch } = await mountAdmin('/medias/radarr/radarr/taches', {
      [`GET ${adminApi('radarr', '/taches')}`]: () => ({
        body: [
          {
            id: 1,
            name: 'RSS Sync',
            taskName: 'RssSync',
            interval: 15,
            lastExecution: null,
            nextExecution: null,
            lastDuration: null,
          },
        ],
      }),
      [`POST ${adminApi('radarr', '/taches/executer')}`]: () => ({ body: { ok: true, cmdId: 5 } }),
    });
    click('[data-test="task-run"]');
    await settle();
    expect(fetch.calls.find((call) => call.url.endsWith('/taches/executer'))?.body).toEqual({
      commandName: 'RssSync',
    });
    expect(document.querySelector('[data-test="arr-admin-feedback"]')?.textContent).toContain(
      'RSS Sync',
    );
  });

  it('commandes : annulation d’une commande en cours seulement', async () => {
    const { fetch } = await mountAdmin('/medias/radarr/radarr/commandes', {
      [`GET ${adminApi('radarr', '/commandes')}`]: () => ({
        body: [
          {
            id: 3,
            name: 'Backup',
            status: 'started',
            message: null,
            queued: null,
            started: '2026-11-21T10:00:00Z',
            ended: null,
            duration: null,
          },
          {
            id: 2,
            name: 'RssSync',
            status: 'completed',
            message: 'Done',
            queued: null,
            started: null,
            ended: null,
            duration: '00:00:01',
          },
        ],
      }),
      [`POST ${adminApi('radarr', '/command/3/annuler')}`]: () => ({ body: { ok: true } }),
    });
    expect(document.querySelectorAll('[data-test="command-cancel"]')).toHaveLength(1);
    click('[data-test="command-cancel"]');
    await settle();
    click('[data-test="confirm"]');
    await settle();
    expect(fetch.calls.some((call) => call.url.endsWith('/command/3/annuler'))).toBe(true);
  });

  it('journaux : niveau dans l’URL et transmis, recherche dans la page', async () => {
    const { fetch } = await mountAdmin('/medias/radarr/radarr/logs?level=error', {
      [`GET ${adminApi('radarr', '/logs')}`]: () => ({
        body: {
          files: [{ filename: 'radarr.txt', lastWriteTime: null }],
          records: [
            {
              time: null,
              level: 'error',
              logger: 'Importer',
              message: 'Disk full',
              exception: null,
            },
            { time: null, level: 'error', logger: 'RssSync', message: 'Timeout', exception: null },
          ],
          totalRecords: 2,
          page: 1,
          pageSize: 100,
        },
      }),
    });
    expect(fetch.calls.find((call) => call.url.includes('/logs'))?.url).toContain('level=error');
    expect(document.querySelectorAll('[data-test="log-row"]')).toHaveLength(2);
    type('[data-test="logs-search"]', 'disk');
    await settle();
    expect(document.querySelectorAll('[data-test="log-row"]')).toHaveLength(1);
  });

  it('statistiques (Sonarr) : compteurs propres aux séries', async () => {
    await mountAdmin('/medias/sonarr/sonarr/stats', {
      [`GET ${adminApi('sonarr', '/stats')}`]: () => ({
        body: {
          total: 3,
          monitored: 2,
          sizeOnDisk: 1024 ** 3,
          disks: [],
          genres: [{ name: 'Drama', count: 2 }],
          hasFile: null,
          missing: null,
          qualities: [],
          decades: [],
          continuing: 1,
          ended: 2,
          networks: [{ name: 'HBO', count: 2 }],
        },
      }),
    });
    const tiles = [...document.querySelectorAll('[data-test="stats-tile"]')].map(
      (tile) => tile.textContent,
    );
    expect(tiles).toHaveLength(4);
    expect(tiles[2]).toContain('2');
    expect(document.body.textContent).toContain('HBO');
  });

  it('parseur : titre dans l’URL, résultat et lien vers la fiche', async () => {
    const { router } = await mountAdmin('/medias/radarr/radarr/parser', {
      [`GET ${adminApi('radarr', '/parser')}`]: (call) =>
        call.url.includes('title=The')
          ? {
              body: {
                result: {
                  title: 'The.Matrix',
                  parsedTitle: 'The Matrix',
                  year: 1999,
                  quality: 'Bluray-1080p',
                  edition: null,
                  releaseGroup: null,
                  languages: ['English'],
                  episode: null,
                  match: { id: 3, title: 'The Matrix', year: 1999 },
                },
              },
            }
          : { body: { result: null } },
    });
    type('[data-test="parse-title"]', 'The.Matrix');
    await settle();
    click('[data-test="parse-submit"]');
    await settle();
    expect(router.currentRoute.value.query.title).toBe('The.Matrix');
    expect(document.querySelector('[data-test="parse-result"]')?.textContent).toContain(
      'Bluray-1080p',
    );
    expect(document.querySelector('[data-test="parse-match"]')?.getAttribute('href')).toMatch(
      /\/films\/3$/,
    );
  });

  it('import de bibliothèque (Radarr) : scan, recherche automatique, import des lignes cochées', async () => {
    const { fetch } = await mountAdmin('/medias/radarr/radarr/import-bibliotheque', {
      [`GET ${adminApi('radarr', '/import-bibliotheque')}`]: () => ({
        body: {
          rootFolders: [{ id: 1, path: '/media' }],
          qualityProfiles: [{ id: 4, name: 'HD' }],
        },
      }),
      [`POST ${adminApi('radarr', '/import-bibliotheque/scan')}`]: () => ({
        body: {
          folders: [
            { name: 'Heat (1995)', path: '/media/Heat (1995)', size: null },
            { name: 'Unknown', path: '/media/Unknown', size: null },
          ],
        },
      }),
      'GET /api/medias/radarr/films/lookup': (call) => ({
        body: call.url.includes('term=Heat')
          ? [fullMovie(null, { tmdbId: 949, title: 'Heat', year: 1995 })]
          : [],
      }),
      'POST /api/medias/radarr/films/add': () => ({
        body: { ok: true, movie: fullMovie(10), movieId: 10 },
      }),
    });
    click('[data-test="import-scan"]');
    await settle();
    expect(fetch.calls.find((call) => call.url.endsWith('/scan'))?.body).toEqual({
      folder: '/media',
    });
    expect(document.querySelectorAll('[data-test="import-row"]')).toHaveLength(2);
    click('[data-test="import-run"]');
    await settle();
    const adds = fetch.calls.filter((call) => call.url.endsWith('/films/add'));
    expect(adds).toHaveLength(1);
    expect(adds[0]?.body).toMatchObject({
      tmdbId: 949,
      path: '/media/Heat (1995)',
      rootFolderPath: '/media',
      qualityProfileId: 4,
      searchForMovie: false,
    });
    expect(document.querySelector('[data-test="import-status"]')?.textContent).toContain(
      'Imported',
    );
  });

  it('suggestions : ajout depuis le dialogue, « déjà ajouté » ensuite', async () => {
    const { fetch } = await mountAdmin('/medias/radarr/radarr/suggestions', {
      [`GET ${adminApi('radarr', '/suggestions')}`]: () => ({
        body: {
          movies: [
            {
              tmdbId: 603,
              title: 'The Matrix',
              year: 1999,
              overview: 'Neo',
              poster: null,
              runtime: 136,
              studio: null,
              genres: [],
              ratings: { imdb: null, tmdb: 8.2 },
              inLibrary: false,
              recommended: true,
              trending: false,
              popular: false,
            },
          ],
          qualityProfiles: [{ id: 4, name: 'HD' }],
          rootFolders: [{ id: 1, path: '/media' }],
        },
      }),
      'POST /api/medias/radarr/films/add': () => ({
        body: { ok: true, movie: fullMovie(10), movieId: 10 },
      }),
    });
    click('[data-test="suggestion-card"]');
    await settle();
    click('[data-test="arr-admin-dialog-save"]');
    await settle();
    expect(fetch.calls.find((call) => call.url.endsWith('/films/add'))?.body).toMatchObject({
      tmdbId: 603,
      qualityProfileId: 4,
      rootFolderPath: '/media',
      searchForMovie: true,
    });
    expect(document.querySelector('[data-test="suggestion-card"]')?.textContent).toContain(
      'Already',
    );
  });

  it('renommage : propositions du film choisi', async () => {
    const { wrapper } = await mountAdmin('/medias/radarr/radarr/renommer', {
      [`GET ${adminApi('radarr', '/renommer')}`]: () => ({
        body: { movies: [{ id: 1, title: 'Alpha', year: 2001 }] },
      }),
      [`GET ${adminApi('radarr', '/renommer/1/propositions')}`]: () => ({
        body: [{ movieFileId: 3, existingPath: 'a.mkv', newPath: 'b.mkv' }],
      }),
    });
    const { VAutocomplete } = await import('vuetify/components');
    wrapper
      .findAllComponents(VAutocomplete)
      .find((input) => input.attributes('data-test') === 'rename-movie')
      ?.vm.$emit('update:modelValue', 1);
    await settle();
    expect(document.querySelector('[data-test="rename-row"]')?.textContent).toContain('b.mkv');
  });

  it('calendrier Sonarr et redirections des anciennes pages', async () => {
    const { router } = await mountAdmin('/medias/sonarr/sonarr/calendrier', {
      [`GET ${adminApi('sonarr', '/calendrier')}`]: () => ({
        body: [
          {
            id: 1,
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
            airDate: '2026-11-22',
            airDateUtc: '2026-11-22T02:00:00Z',
            hasFile: false,
            monitored: true,
            runtime: 50,
            network: null,
            genres: [],
          },
        ],
      }),
      'GET /api/medias/sonarr/series/historique': () => ({
        body: { records: [], totalRecords: 0, page: 1, pageSize: 50 },
      }),
    });
    expect(document.querySelectorAll('[data-test="calendar-day"]')).toHaveLength(1);
    expect(document.querySelector('[data-test="calendar-episode"]')?.textContent).toContain(
      'S02E03',
    );
    await router.push('/medias/sonarr/sonarr/historique');
    await settle();
    expect(router.currentRoute.value.name).toBe('sonarr-history');
  });
});
