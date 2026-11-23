// SPDX-License-Identifier: AGPL-3.0-or-later
// Routes de la bibliothèque de séries (`/api/medias/:slug/series…`, P3a.1) :
// contrat de chaque route contre un Sonarr simulé, cache de la bibliothèque
// et son invalidation après une mutation, Sonarr injoignable.

import type {
  FilteredIdsResponse,
  SeriesLibraryResponse,
  SeriesWarningsResponse,
} from '@hubarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInstance, updateInstance } from '../../../src/modules/instances/instances';
import { noDns } from '../movies/radarr-env';
import { rawSeries, sonarrEnv, warmSeries, type SonarrEnv } from './sonarr-env';

let env: SonarrEnv;

async function setDefaultProfile(defaultQualityProfileId: number): Promise<void> {
  await updateInstance(
    env.database.db,
    env.instance,
    { name: 'Séries', url: 'http://sonarr.test', defaultQualityProfileId },
    noDns,
  );
}

beforeEach(async () => {
  env = await sonarrEnv();
});
afterEach(async () => {
  await env.close();
});

describe('page de la bibliothèque (n° 119)', () => {
  it('filtre, facettes, statistiques, calendrier, profil par défaut', async () => {
    env.sonarr.on('GET', '/api/v3/series', [
      rawSeries(1, { title: 'Breaking Bad', network: 'AMC', genres: ['Drama'], status: 'ended' }),
      rawSeries(2, { title: 'The Wire', network: 'HBO', status: 'ended', seriesType: 'anime' }),
      rawSeries(3, { title: 'Atlanta', network: 'FX' }),
    ]);
    env.sonarr.on('GET', '/api/v3/calendar', [
      { id: 9, seriesId: 3, seasonNumber: 1, episodeNumber: 2, title: 'Ep', airDate: '2026-11-25' },
    ]);
    const response = await env.browser.get(env.url('?status=ended&sort=title-desc'));
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json<SeriesLibraryResponse>();
    expect(body.items.map((item) => item.title)).toEqual(['The Wire', 'Breaking Bad']);
    expect(body.facets).toEqual({ genres: ['Drama'], networks: ['AMC', 'FX', 'HBO'] });
    expect(body.stats).toEqual({ total: 3, continuing: 1, ended: 2, totalGb: 0 });
    expect(body.calendar).toEqual([expect.objectContaining({ id: 9, airDate: '2026-11-25' })]);
    expect(body.defaultQualityProfileId).toBeNull();
    const calendar = env.sonarr.callsTo('GET', '/api/v3/calendar')[0];
    expect(calendar?.query.get('includeSeries')).toBe('true');
  });

  it('calendrier en échec : la bibliothèque reste servie', async () => {
    env.sonarr.on('GET', '/api/v3/series', [rawSeries(1)]);
    env.sonarr.on('GET', '/api/v3/calendar', { message: 'boom' }, 500);
    const response = await env.browser.get(env.url());
    expect(response.statusCode).toBe(200);
    expect(response.json<SeriesLibraryResponse>().calendar).toEqual([]);
  });

  it('lien profond `?open=` : la page qui contient la série', async () => {
    env.sonarr.on(
      'GET',
      '/api/v3/series',
      Array.from({ length: 120 }, (_, index) =>
        rawSeries(index + 1, { title: `S${String(index + 1).padStart(3, '0')}` }),
      ),
    );
    env.sonarr.on('GET', '/api/v3/calendar', []);
    const body = (
      await env.browser.get(env.url('?per_page=50&open=110'))
    ).json<SeriesLibraryResponse>();
    expect(body.page).toBe(3);
  });

  it('bibliothèque en cache entre deux lectures', async () => {
    await warmSeries(env);
    await env.browser.get(env.url('?status=ended'));
    expect(env.sonarr.callsTo('GET', '/api/v3/series')).toHaveLength(1);
    expect(env.libraryCached()).toBe(true);
  });

  it('Sonarr injoignable : 503 propre, jamais 500', async () => {
    env.agent
      .get('http://down.test')
      .intercept({ path: () => true, method: () => true })
      .replyWithError(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))
      .persist();
    const down = await createInstance(
      env.database.db,
      'sonarr',
      { name: 'En panne', url: 'http://down.test', apiKey: 'k' },
      noDns,
    );
    const response = await env.browser.get(`/api/medias/${down.slug}/series`);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'SERVICE_UNREACHABLE', service: 'sonarr' });
  });

  it('profil par défaut de l’instance exposé au dialogue d’ajout', async () => {
    await setDefaultProfile(4);
    await warmSeries(env);
    const body = (await env.browser.get(env.url())).json<SeriesLibraryResponse>();
    expect(body.defaultQualityProfileId).toBe(4);
  });
});

describe('avertissements (n° 161)', () => {
  it('santé et imports bloqués, en codes', async () => {
    env.sonarr.on('GET', '/api/v3/health', [{ source: 'IndexerCheck', message: 'No indexers' }]);
    env.sonarr.on('GET', '/api/v3/queue', {
      records: [{ id: 1, trackedDownloadState: 'importBlocked' }, { id: 2 }],
    });
    const body = (await env.browser.get(env.url('/warnings'))).json<SeriesWarningsResponse>();
    expect(body.warnings).toEqual([
      { code: 'health', source: 'IndexerCheck', message: 'No indexers' },
      { code: 'import_blocked', count: 1 },
    ]);
  });
});

describe('recherche et ajout (n° 162, 163)', () => {
  it('lookup : terme transmis, séries normalisées ; terme vide sans appel', async () => {
    env.sonarr.on('GET', '/api/v3/series/lookup', [rawSeries(0, { id: undefined, title: 'Dark' })]);
    const response = await env.browser.get(env.url('/lookup?term=dark'));
    expect(response.json<{ title: string; id: number | null }[]>()).toEqual([
      expect.objectContaining({ title: 'Dark', id: null }),
    ]);
    expect(env.sonarr.callsTo('GET', '/api/v3/series/lookup')[0]?.query.get('term')).toBe('dark');
    await env.browser.get(env.url('/lookup?term=%20'));
    expect(env.sonarr.callsTo('GET', '/api/v3/series/lookup')).toHaveLength(1);
  });

  it('ajout : ressource de la recherche complétée, profil par défaut de l’instance (issue #5)', async () => {
    await setDefaultProfile(6);
    await warmSeries(env);
    env.sonarr.on('GET', '/api/v3/series/lookup', [
      { title: 'Dark', tvdbId: 334824, qualityProfileId: 0, seriesType: 'standard', seasons: [] },
    ]);
    env.sonarr.on('POST', '/api/v3/series', rawSeries(40, { title: 'Dark' }));
    const response = await env.browser.post(env.url('/add'), {
      tvdbId: 334824,
      rootFolderPath: '/tv',
      monitor: 'future',
      searchForMissing: true,
      seriesType: 'anime',
      tags: [2],
    });
    expect(response.statusCode).toBe(200);
    expect(env.sonarr.callsTo('GET', '/api/v3/series/lookup')[0]?.query.get('term')).toBe(
      'tvdb:334824',
    );
    expect(env.sonarr.callsTo('POST', '/api/v3/series')[0]?.body).toMatchObject({
      title: 'Dark',
      tvdbId: 334824,
      qualityProfileId: 6,
      rootFolderPath: '/tv',
      monitored: true,
      seasonFolder: true,
      seriesType: 'anime',
      tags: [2],
      addOptions: {
        monitor: 'future',
        searchForMissingEpisodes: true,
        searchForCutoffUnmetEpisodes: false,
      },
    });
    expect(env.libraryCached()).toBe(false);
  });

  it('ajout : le profil choisi prime, sinon celui de la recherche, sinon 1', async () => {
    env.sonarr.on('POST', '/api/v3/series', rawSeries(1));
    env.sonarr.on('GET', '/api/v3/series/lookup', [{ tvdbId: 1, qualityProfileId: 3 }]);
    await env.browser.post(env.url('/add'), {
      tvdbId: 1,
      rootFolderPath: '/tv',
      qualityProfileId: 8,
    });
    await env.browser.post(env.url('/add'), { tvdbId: 1, rootFolderPath: '/tv' });
    env.sonarr.on('GET', '/api/v3/series/lookup', [{ tvdbId: 1 }]);
    await env.browser.post(env.url('/add'), { tvdbId: 1, rootFolderPath: '/tv' });
    expect(
      env.sonarr
        .callsTo('POST', '/api/v3/series')
        .map((call) => (call.body as { qualityProfileId: number }).qualityProfileId),
    ).toEqual([8, 3, 1]);
  });

  it('ajout : série introuvable → 404, sans dossier → 400, refus de Sonarr → 502', async () => {
    env.sonarr.on('GET', '/api/v3/series/lookup', []);
    const missing = await env.browser.post(env.url('/add'), { tvdbId: 9, rootFolderPath: '/tv' });
    expect(missing.statusCode).toBe(404);
    const noFolder = await env.browser.post(env.url('/add'), { tvdbId: 9 });
    expect(noFolder.statusCode).toBe(400);
    env.sonarr.on('GET', '/api/v3/series/lookup', [{ tvdbId: 9 }]);
    env.sonarr.on(
      'POST',
      '/api/v3/series',
      [{ errorMessage: 'This series has already been added' }],
      400,
    );
    const refused = await env.browser.post(env.url('/add'), { tvdbId: 9, rootFolderPath: '/tv' });
    expect(refused.statusCode).toBe(502);
  });
});

describe('filtre et masse (n° 164 à 166)', () => {
  it('ids du filtre sur la bibliothèque en cache ; `searchable_only` = épisodes manquants', async () => {
    await warmSeries(env, [
      rawSeries(1, { status: 'ended' }),
      rawSeries(2, {
        status: 'ended',
        statistics: { episodeCount: 4, episodeFileCount: 4 },
      }),
      rawSeries(3, { status: 'continuing' }),
    ]);
    const all = (
      await env.browser.get(env.url('/filter/ids?status=ended'))
    ).json<FilteredIdsResponse>();
    expect(all).toEqual({ ids: [1, 2], total: 2 });
    const searchable = (
      await env.browser.get(env.url('/filter/ids?status=ended&searchable_only=1'))
    ).json<FilteredIdsResponse>();
    expect(searchable.ids).toEqual([1]);
    expect(env.sonarr.callsTo('GET', '/api/v3/series')).toHaveLength(1);
  });

  it('édition de masse : champs fournis seulement, cache invalidé', async () => {
    await warmSeries(env);
    env.sonarr.on('PUT', '/api/v3/series/editor');
    const response = await env.browser.post(env.url('/bulk/edit'), {
      seriesIds: [1, 2],
      seriesType: 'daily',
      tags: [4],
      applyTags: 'remove',
    });
    expect(response.json()).toEqual({ ok: true });
    expect(env.sonarr.callsTo('PUT', '/api/v3/series/editor')[0]?.body).toEqual({
      seriesType: 'daily',
      tags: [4],
      applyTags: 'remove',
      seriesIds: [1, 2],
    });
    expect(env.libraryCached()).toBe(false);
  });

  it('suppression de masse ; liste vide refusée (400, clé de l’original)', async () => {
    env.sonarr.on('DELETE', '/api/v3/series/editor');
    await env.browser.post(env.url('/bulk/delete'), { seriesIds: [3], deleteFiles: true });
    expect(env.sonarr.callsTo('DELETE', '/api/v3/series/editor')[0]?.body).toEqual({
      seriesIds: [3],
      deleteFiles: true,
      addImportListExclusion: false,
    });
    const empty = await env.browser.post(env.url('/bulk/delete'), { seriesIds: [] });
    expect(empty.statusCode).toBe(400);
    expect(JSON.stringify(empty.json())).toContain('media.api.no_series');
  });

  it('mutation sans jeton CSRF refusée', async () => {
    env.browser.csrf = undefined;
    const response = await env.browser.post(env.url('/bulk/edit'), { seriesIds: [1] });
    expect(response.statusCode).toBe(403);
  });
});

describe('commandes (n° 169 à 171, 215, 216)', () => {
  it('commandes en cours seulement', async () => {
    env.sonarr.on('GET', '/api/v3/command', [
      { id: 1, name: 'SeriesSearch', status: 'started' },
      { id: 2, name: 'RssSync', status: 'completed' },
      { id: 3, name: 'RenameFiles', status: 'queued' },
    ]);
    const active = (await env.browser.get(env.url('/commands/active'))).json<{ id: number }[]>();
    expect(active.map((command) => command.id)).toEqual([1, 3]);
  });

  it('rechercher les manquants, tout actualiser, synchro RSS', async () => {
    env.sonarr.onCall('POST', '/api/v3/command', (call) => ({
      status: 201,
      body: { id: (call.body as { name: string }).name.length },
    }));
    for (const path of ['missing-search', 'refresh-all', 'rss-sync']) {
      expect((await env.browser.post(env.url(`/command/${path}`))).statusCode).toBe(200);
    }
    expect(env.sonarr.callsTo('POST', '/api/v3/command').map((call) => call.body)).toEqual([
      { name: 'MissingEpisodeSearch' },
      { name: 'RefreshSeries' },
      { name: 'RssSync' },
    ]);
  });

  it('état d’une commande ; commande purgée → `unknown`', async () => {
    env.sonarr.on('GET', '/api/v3/command/12', { id: 12, name: 'RssSync', status: 'started' });
    const status = (await env.browser.get(env.url('/command/12'))).json<{ status: string }>();
    expect(status).toMatchObject({ id: 12, name: 'RssSync', status: 'started' });
    const gone = (await env.browser.get(env.url('/command/13'))).json<{ status: string }>();
    expect(gone.status).toBe('unknown');
  });
});

describe('configuration (n° 223, 224, 226, 227)', () => {
  it('profils, dossiers racine, étiquettes réduits ; création d’étiquette', async () => {
    env.sonarr.on('GET', '/api/v3/qualityprofile', [{ id: 1, name: 'HD', items: [] }]);
    env.sonarr.on('GET', '/api/v3/rootfolder', [
      { id: 2, path: '/tv', accessible: true, freeSpace: 10 },
    ]);
    env.sonarr.on('GET', '/api/v3/tag', [{ id: 3, label: 'kids' }]);
    env.sonarr.on('POST', '/api/v3/tag', { id: 4, label: 'new' });
    expect((await env.browser.get(env.sonarrUrl('/quality-profiles'))).json()).toEqual([
      { id: 1, name: 'HD' },
    ]);
    expect((await env.browser.get(env.sonarrUrl('/root-folders'))).json()).toEqual([
      { id: 2, path: '/tv', accessible: true, freeSpace: 10 },
    ]);
    expect((await env.browser.get(env.sonarrUrl('/tags-json'))).json()).toEqual([
      { id: 3, label: 'kids' },
    ]);
    expect((await env.browser.post(env.sonarrUrl('/tags-json'), { label: 'new' })).json()).toEqual({
      ok: true,
      tag: { id: 4, label: 'new' },
    });
    const empty = await env.browser.post(env.sonarrUrl('/tags-json'), { label: '' });
    expect(empty.statusCode).toBe(400);
  });
});
