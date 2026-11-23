// SPDX-License-Identifier: AGPL-3.0-or-later
// Recherche interactive, grab, renommage, commandes actives et file (P2.5) :
// port de `MediaReleasesSearchTest` (partie Radarr : délai dépassé → 504,
// liens `infoUrl` filtrés) et contrat des routes contre un Radarr simulé.

import type { ArrCommandStatus, ArrRelease, MovieQueueItem } from '@hubarr/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RELEASES_TIMEOUT_MS } from '../../../src/integrations/radarr/client';
import { rawMovie, radarrEnv, type RadarrEnv } from './radarr-env';

let env: RadarrEnv;
beforeEach(async () => {
  env = await radarrEnv();
});
afterEach(async () => {
  vi.useRealTimers();
  await env.close();
});

const release = (overrides: Record<string, unknown>) => ({
  guid: 'g',
  indexerId: 1,
  title: 'Release',
  indexer: 'Idx',
  quality: { quality: { name: 'Bluray-1080p' } },
  size: 2_097_152,
  protocol: 'torrent',
  age: 3,
  approved: true,
  rejections: [],
  customFormatScore: 0,
  customFormats: [],
  languages: [{ id: 2, name: 'French' }],
  ...overrides,
});

describe('GET :id/releases', () => {
  beforeEach(() => {
    env.radarr.on('GET', '/api/v3/movie/1', rawMovie(1, { qualityProfileId: 4 }));
    env.radarr.on('GET', '/api/v3/qualityprofile', [
      { id: 3, formatItems: [{ format: 9, score: 999 }] },
      {
        id: 4,
        formatItems: [
          { format: 9, score: 50 },
          { format: 8, score: -10 },
        ],
      },
    ]);
  });

  it('normalise, trie (acceptées, score, seeders) et détaille le score du profil du film', async () => {
    env.radarr.on('GET', '/api/v3/release', [
      release({
        guid: 'refusée',
        approved: false,
        customFormatScore: 100,
        rejections: ['Not wanted'],
      }),
      release({ guid: 'peu-de-seeds', seeders: 2, customFormatScore: 40 }),
      release({ guid: 'beaucoup', seeders: 90, customFormatScore: 40 }),
      release({
        guid: 'meilleure',
        customFormatScore: 40 + 10,
        customFormats: [
          { id: 9, name: 'HDR' },
          { id: 8, name: 'x265' },
        ],
      }),
    ]);
    const response = await env.browser.get(env.url('/1/releases'));
    expect(response.statusCode).toBe(200);
    const releases = response.json<ArrRelease[]>();
    expect(releases.map((r) => r.guid)).toEqual([
      'meilleure',
      'beaucoup',
      'peu-de-seeds',
      'refusée',
    ]);
    expect(releases[0]).toMatchObject({
      sizeMb: 2,
      quality: 'Bluray-1080p',
      languages: ['French'],
      customFormats: ['HDR', 'x265'],
      scoreDetails: [
        { name: 'HDR', score: 50 },
        { name: 'x265', score: -10 },
      ],
    });
    expect(releases[3]?.rejections).toEqual(['Not wanted']);
    expect(env.radarr.callsTo('GET', '/api/v3/release')[0]?.query.get('movieId')).toBe('1');
  });

  it('infoUrl : seulement http(s), casse indifférente (MediaReleasesSearchTest)', async () => {
    env.radarr.on('GET', '/api/v3/release', [
      release({ guid: 'a', infoUrl: 'https://tracker.example/torrent/1' }),
      release({ guid: 'b' }),
      release({ guid: 'c', infoUrl: 'javascript:alert(1)' }),
      release({ guid: 'd', infoUrl: 'HTTPS://tracker.example/x' }),
      release({ guid: 'e', infoUrl: 42 }),
    ]);
    const byGuid = new Map(
      (await env.browser.get(env.url('/1/releases')))
        .json<ArrRelease[]>()
        .map((r) => [r.guid, r.infoUrl]),
    );
    expect(Object.fromEntries(byGuid)).toEqual({
      a: 'https://tracker.example/torrent/1',
      b: null,
      c: null,
      d: 'HTTPS://tracker.example/x',
      e: null,
    });
  });

  it('aucune release : liste vide en 200 ; fiche illisible : scores à zéro', async () => {
    env.radarr.on('GET', '/api/v3/movie/1', { message: 'boom' }, 500);
    env.radarr.on('GET', '/api/v3/release', []);
    const response = await env.browser.get(env.url('/1/releases'));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('délai dépassé → 504 SEARCH_TIMED_OUT (MediaReleasesSearchTest)', async () => {
    expect(RELEASES_TIMEOUT_MS).toBe(90_000);
    env.radarr.onCall('GET', '/api/v3/release', () => {
      throw Object.assign(new Error('timeout'), { code: 'UND_ERR_HEADERS_TIMEOUT' });
    });
    const response = await env.browser.get(env.url('/1/releases'));
    expect(response.statusCode).toBe(504);
    expect(response.json()).toMatchObject({ code: 'SEARCH_TIMED_OUT', service: 'radarr' });
  });
});

describe('grab', () => {
  it('transmet guid et indexeur ; un refus de Radarr garde son message', async () => {
    env.radarr.on('POST', '/api/v3/release', {});
    const ok = await env.browser.post(env.url('/1/grab'), { guid: 'abc', indexerId: 7 });
    expect(ok.json()).toEqual({ ok: true });
    expect(env.radarr.callsTo('POST', '/api/v3/release')[0]?.body).toEqual({
      guid: 'abc',
      indexerId: 7,
    });

    env.radarr.on('POST', '/api/v3/release', [{ errorMessage: 'Release rejected' }], 400);
    const refused = await env.browser.post(env.url('/1/grab'), { guid: 'abc', indexerId: 7 });
    expect(refused.statusCode).toBe(502);
    expect(refused.json<{ message?: string }>().message).toContain('Release rejected');
  });

  it('guid manquant → 400', async () => {
    expect((await env.browser.post(env.url('/1/grab'), { indexerId: 7 })).statusCode).toBe(400);
  });
});

describe('renommage', () => {
  it('propositions, puis commande RenameMovie', async () => {
    env.radarr.on('GET', '/api/v3/rename', [
      { movieId: 1, movieFileId: 5, existingPath: 'old.mkv', newPath: 'Movie (2001).mkv' },
    ]);
    expect((await env.browser.get(env.url('/1/rename-preview'))).json()).toEqual([
      { movieFileId: 5, existingPath: 'old.mkv', newPath: 'Movie (2001).mkv' },
    ]);
    env.radarr.on('POST', '/api/v3/command', { id: 12, name: 'RenameMovie' });
    expect((await env.browser.post(env.url('/1/rename'))).json()).toEqual({ ok: true, cmdId: 12 });
    expect(env.radarr.callsTo('POST', '/api/v3/command')[0]?.body).toEqual({
      name: 'RenameMovie',
      movieIds: [1],
    });
  });
});

describe('commandes actives, file', () => {
  it('seulement les commandes en attente ou en cours', async () => {
    env.radarr.on('GET', '/api/v3/command', [
      { id: 1, name: 'MoviesSearch', status: 'started', message: 'Searching' },
      { id: 2, name: 'RssSync', status: 'completed' },
      { id: 3, name: 'RenameMovie', status: 'queued' },
    ]);
    const commands = (await env.browser.get(env.url('/commands/active'))).json<
      ArrCommandStatus[]
    >();
    expect(commands.map((c) => [c.id, c.name, c.status])).toEqual([
      [1, 'MoviesSearch', 'started'],
      [3, 'RenameMovie', 'queued'],
    ]);
  });

  it('file normalisée', async () => {
    env.radarr.on('GET', '/api/v3/queue', {
      records: [
        {
          id: 9,
          movieId: 1,
          title: 'Rel',
          status: 'downloading',
          size: 10,
          sizeleft: 5,
          movie: { title: 'Movie 1', year: 2001 },
        },
      ],
    });
    const queue = (await env.browser.get(env.url('/queue'))).json<MovieQueueItem[]>();
    expect(queue[0]).toMatchObject({
      id: 9,
      movieId: 1,
      title: 'Movie 1',
      status: 'downloading',
      size: 10,
      sizeleft: 5,
    });
  });
});
