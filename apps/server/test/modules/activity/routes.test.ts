// SPDX-License-Identifier: AGPL-3.0-or-later
// Routes d'activité (P3e) : `TautulliControllerTest`, `TracearrControllerTest`,
// `EmbyControllerTest` (gardes, formes neutres, proxys d'images, fiches TMDB).

import type {
  Activity,
  Chart,
  TracearrHistory,
  TracearrUser,
  TracearrUserDetail,
  UserPermissions,
} from '@hubarr/shared';
import type { MockAgent } from 'undici';
import { afterEach, describe, expect, it } from 'vitest';
import { applyServicePatch } from '../../../src/modules/services/config';
import { torrentEnv, type TorrentEnv } from '../torrents/torrent-env';

const TAUTULLI = 'http://tautulli.test:8181';
const TRACEARR = 'http://tracearr.test:3000';
const EMBY = 'http://emby.test:8096';
const SERVER = '11111111-2222-3333-4444-555555555555';

let env: TorrentEnv | undefined;
afterEach(async () => {
  await env?.close();
  env = undefined;
});

async function open(
  role: 'admin' | 'user' = 'user',
  permissions: UserPermissions = { tautulli: 'read', tracearr: 'read', emby: 'read' },
): Promise<TorrentEnv> {
  env = await torrentEnv({ role, configure: {}, permissions });
  applyServicePatch(env.database.db, 'tautulli', { url: TAUTULLI, apiKey: 't-key' });
  applyServicePatch(env.database.db, 'tracearr', { url: TRACEARR, apiKey: 'trr_pub_x' });
  applyServicePatch(env.database.db, 'emby', { url: EMBY, apiKey: 'e-key' });
  return env;
}

function tautulli(agent: MockAgent, handler: (cmd: string, query: URLSearchParams) => unknown) {
  agent
    .get(TAUTULLI)
    .intercept({ path: (p) => p.startsWith('/api/v2'), method: 'GET' })
    .reply((options) => {
      const query = new URL(options.path, TAUTULLI).searchParams;
      if (query.get('apikey') !== 't-key')
        return { statusCode: 200, data: JSON.stringify({ response: { result: 'error' } }) };
      const result = handler(query.get('cmd') ?? '', query);
      if (result instanceof Uint8Array)
        return {
          statusCode: 200,
          data: Buffer.from(result),
          responseOptions: { headers: { 'content-type': 'image/jpeg' } },
        };
      return {
        statusCode: 200,
        data: JSON.stringify({ response: { result: 'success', data: result } }),
        responseOptions: { headers: { 'content-type': 'application/json' } },
      };
    })
    .persist();
}

describe('gardes', () => {
  it('utilisateur simple sans droit → 403', async () => {
    const current = await open('user', { tracearr: 'read' });
    expect((await current.browser.get('/api/tautulli/activity')).statusCode).toBe(403);
  });

  it('utilisateur simple avec la lecture autorisé ; non configuré → 409', async () => {
    const current = await open('user');
    tautulli(current.agent, () => ({ stream_count: 0, sessions: [] }));
    expect((await current.browser.get('/api/tautulli/activity')).statusCode).toBe(200);
    applyServicePatch(current.database.db, 'tautulli', { remove: true });
    expect((await current.browser.get('/api/tautulli/activity')).statusCode).toBe(409);
  });
});

describe('Tautulli', () => {
  it('activité, graphique avec plage et métrique bornées, utilisateur numérique seulement', async () => {
    const current = await open();
    const seen: URLSearchParams[] = [];
    tautulli(current.agent, (cmd, query) => {
      seen.push(query);
      if (cmd === 'get_activity')
        return {
          stream_count: 1,
          sessions: [{ media_type: 'movie', title: 'Film', thumb: '/library/1' }],
        };
      return {
        categories: ['a'],
        series: [
          { name: 'Movies', data: [1] },
          { name: 'Total', data: [1] },
        ],
      };
    });
    const activity = (await current.browser.get('/api/tautulli/now-playing')).json<Activity>();
    expect(activity).toMatchObject({
      connected: true,
      streamCount: 1,
      sessions: [{ title: 'Film', poster: 'api/tautulli/image?img=%2Flibrary%2F1' }],
    });
    const chart = (
      await current.browser.get('/api/tautulli/activity-hour?range=12&metric=duration&user=abc')
    ).json<Chart>();
    expect(chart.series.map((s) => s.name)).toEqual(['Movies']);
    const last = seen.at(-1);
    expect(last?.get('cmd')).toBe('get_plays_by_hourofday');
    expect(last?.get('time_range')).toBe('30');
    expect(last?.get('y_axis')).toBe('duration');
    expect(last?.has('user_id')).toBe(false);
    await current.browser.get('/api/tautulli/plays?mode=stream&user=7');
    expect(seen.at(-1)?.get('cmd')).toBe('get_plays_by_stream_type');
    expect(seen.at(-1)?.get('user_id')).toBe('7');
  });

  it('injoignable : forme neutre (200) ; clé refusée : auth', async () => {
    const current = await open();
    current.agent
      .get(TAUTULLI)
      .intercept({ path: () => true, method: () => true })
      .replyWithError(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))
      .persist();
    expect((await current.browser.get('/api/tautulli/activity')).json<Activity>()).toMatchObject({
      connected: false,
      error: 'unreachable',
      sessions: [],
    });
    expect((await current.browser.get('/api/tautulli/history')).json()).toEqual([]);
    applyServicePatch(current.database.db, 'tautulli', { url: 'http://other.test', apiKey: 'bad' });
    current.app.upstream.health.clear('tautulli');
    current.app.live.invalidateAll();
    current.agent
      .get('http://other.test')
      .intercept({ path: () => true })
      .reply(200, { response: { result: 'error' } })
      .persist();
    expect((await current.browser.get('/api/tautulli/activity')).json<Activity>()).toMatchObject({
      error: 'auth',
    });
  });

  it('proxy d’images : chemin contrôlé, type matriciel ; fiche TMDB d’un épisode par sa série', async () => {
    const current = await open();
    tautulli(current.agent, (cmd, query) => {
      if (cmd === 'pms_image_proxy') return new Uint8Array([1, 2, 3]);
      if (query.get('rating_key') === '5')
        return { media_type: 'episode', grandparent_rating_key: '4', grandparent_guids: [] };
      if (query.get('rating_key') === '4') return { media_type: 'show', guids: ['tmdb://1399'] };
      return {};
    });
    const image = await current.browser.get(
      '/api/tautulli/image?img=%2Flibrary%2Fmetadata%2F1%2Fthumb',
    );
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toBe('image/jpeg');
    expect(image.headers['cache-control']).toBe('private, max-age=86400');
    expect((await current.browser.get('/api/tautulli/image?img=%2Fetc%2Fpasswd')).statusCode).toBe(
      404,
    );
    expect((await current.browser.get('/api/tautulli/quicklook/5')).json()).toEqual({
      type: 'tv',
      id: 1399,
    });
    expect((await current.browser.get('/api/tautulli/quicklook/9')).json()).toEqual({
      type: null,
      id: null,
    });
  });
});

describe('Tracearr', () => {
  it('flux v2 puis repli v1 sur 404 ; historique paginé v1 ; image refusée hors UUID', async () => {
    const current = await open();
    const pool = current.agent.get(TRACEARR);
    pool
      .intercept({ path: (p) => p.startsWith('/api/v2/public/'), method: 'GET' })
      .reply(404, { error: 'not found' })
      .persist();
    pool
      .intercept({
        path: '/api/v1/public/streams',
        method: 'GET',
        headers: { authorization: 'Bearer trr_pub_x' },
      })
      .reply(200, { data: [{ mediaType: 'movie', mediaTitle: 'Film' }], summary: { total: 1 } })
      .persist();
    pool
      .intercept({ path: (p) => p.startsWith('/api/v1/public/history'), method: 'GET' })
      .reply(200, { data: [{ mediaType: 'movie', mediaTitle: 'F' }], meta: { total: 30 } })
      .persist();
    const activity = (await current.browser.get('/api/tracearr/activity')).json<Activity>();
    expect(activity).toMatchObject({
      connected: true,
      streamCount: 1,
      sessions: [{ title: 'Film' }],
    });
    const history = (await current.browser.get('/api/tracearr/history')).json<TracearrHistory>();
    expect(history.nextCursor).toBe('p2');
    expect(
      (await current.browser.get('/api/tracearr/history?cursor=p2')).json<TracearrHistory>()
        .nextCursor,
    ).toBeNull();
    expect((await current.browser.get('/api/tracearr/image?server=nope&img=%2Fa')).statusCode).toBe(
      404,
    );
    expect(
      (await current.browser.get(`/api/tracearr/image?server=${SERVER}&img=%2F%2Fevil`)).statusCode,
    ).toBe(404);
  });

  it('fiche utilisateur : historique filtré, statistiques, inconnu ou identifiant invalide → 404', async () => {
    const current = await open();
    const pool = current.agent.get(TRACEARR);
    const seen: string[] = [];
    pool
      .intercept({ path: (p) => p.startsWith('/api/v1/public/users'), method: 'GET' })
      .reply(200, {
        data: [
          { id: 'u1', username: 'alice', lastActivityAt: '2026-11-20T21:00:00Z', sessionCount: 3 },
          { id: 'u2', username: 'bob', lastActivityAt: '2026-11-19T21:00:00Z', sessionCount: 2 },
        ],
      })
      .persist();
    const row = (user: string, i: number, extra: Record<string, unknown>) => ({
      user: { id: user, username: user === 'u1' ? 'alice' : 'bob' },
      startedAt: new Date(Date.UTC(2026, 10, 20, 20) - i * 3_600_000).toISOString(),
      durationMs: 1_800_000,
      ...extra,
    });
    pool
      .intercept({ path: (p) => p.startsWith('/api/v2/public/history'), method: 'GET' })
      .reply((options) => {
        const query = new URL(options.path, TRACEARR).searchParams;
        seen.push(`${query.get('userId') ?? ''}:${query.get('cursor') ?? ''}`);
        // Tracearr ignore ici le filtre : les lignes de bob sont retirées par Hubarr.
        const second = query.get('cursor') === 'c2';
        return {
          statusCode: 200,
          data: JSON.stringify({
            data: second
              ? [row('u1', 5, { mediaType: 'movie', mediaTitle: 'Film A', platform: 'Roku' })]
              : [
                  row('u1', 1, { mediaType: 'movie', mediaTitle: 'Film A', platform: 'Plex Web' }),
                  row('u2', 2, { mediaType: 'movie', mediaTitle: 'Autre', platform: 'TV' }),
                  row('u1', 3, {
                    mediaType: 'episode',
                    mediaTitle: 'Pilote',
                    showTitle: 'Série',
                    seasonNumber: 1,
                    episodeNumber: 1,
                    platform: 'Plex Web',
                  }),
                ],
            meta: { nextCursor: second ? null : 'c2' },
          }),
          responseOptions: { headers: { 'content-type': 'application/json' } },
        };
      })
      .persist();
    // L'adresse de la fiche est un jeton opaque, jamais l'identifiant Tracearr.
    const users = (await current.browser.get('/api/tracearr/users')).json<TracearrUser[]>();
    const key = users.find((u) => u.displayName === 'alice')?.key ?? '';
    expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(JSON.stringify(users)).not.toMatch(/"u[12]"/);
    const response = await current.browser.get(`/api/tracearr/users/${key}`);
    expect(response.statusCode).toBe(200);
    const detail = response.json<TracearrUserDetail>();
    expect(seen).toEqual(['u1:', 'u1:c2']);
    expect(JSON.stringify(detail)).not.toMatch(/"u[12]"/);
    expect(detail.user).toMatchObject({ key, displayName: 'alice', plays: 3 });
    expect(detail.history.every((r) => r.userKey === key)).toBe(true);
    expect(detail.history.map((r) => r.title)).toEqual([
      'Film A',
      'Série — S01E01 · Pilote',
      'Film A',
    ]);
    expect(detail.stats).toMatchObject({
      plays: 3,
      watchTimeMs: 5_400_000,
      movies: 2,
      episodes: 1,
      platforms: [
        { name: 'Plex Web', plays: 2 },
        { name: 'Roku', plays: 1 },
      ],
      topTitles: [
        { name: 'Film A', plays: 2 },
        { name: 'Série', plays: 1 },
      ],
    });
    expect(detail).toMatchObject({ scannedRows: 4, truncated: false });
    expect((await current.browser.get('/api/tracearr/users/u1')).statusCode).toBe(404);
    expect((await current.browser.get(`/api/tracearr/users/${'A'.repeat(22)}`)).statusCode).toBe(
      404,
    );
    expect((await current.browser.get('/api/tracearr/users/a%20b')).statusCode).toBe(404);
  });

  it('graphiques : forme neutre en cas d’échec', async () => {
    const current = await open();
    current.agent
      .get(TRACEARR)
      .intercept({ path: () => true })
      .reply(500, 'boom')
      .persist();
    const charts = (await current.browser.get('/api/tracearr/charts?period=decade')).json<{
      plays: Chart;
    }>();
    expect(charts.plays).toEqual({ categories: [], series: [] });
  });

  it('arrêt d’une lecture : écriture sur Tracearr exigée, message transmis, lecture terminée → 404', async () => {
    const SESSION = '33333333-4444-5555-6666-777777777777';
    const GONE = '44444444-5555-6666-7777-888888888888';
    const path = (id: string) => `/api/tracearr/streams/${id}/terminate`;

    // Lecture seule : refusé (403) avant tout appel à Tracearr.
    const user = await open('user');
    expect((await user.browser.post(path(SESSION), {})).statusCode).toBe(403);
    await user.close();

    const current = await open('user', { tracearr: 'write' });
    const pool = current.agent.get(TRACEARR);
    const bodies: unknown[] = [];
    pool
      .intercept({
        path: `/api/v1/public/streams/${SESSION}/terminate`,
        method: 'POST',
        headers: { authorization: 'Bearer trr_pub_x' },
      })
      .reply((options) => {
        bodies.push(typeof options.body === 'string' ? JSON.parse(options.body) : null);
        return { statusCode: 200, data: { success: true, sessionId: SESSION } };
      })
      .times(2);
    pool
      .intercept({ path: `/api/v1/public/streams/${GONE}/terminate`, method: 'POST' })
      .reply(409, { error: 'Session already stopped' });

    const done = await current.browser.post(path(SESSION), { reason: '  Pause dîner  ' });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toEqual({ ok: true });
    expect((await current.browser.post(path(SESSION), {})).statusCode).toBe(200);
    expect(bodies).toEqual([{ reason: 'Pause dîner' }, {}]);

    expect((await current.browser.post(path(GONE), {})).json()).toMatchObject({
      code: 'NOT_FOUND',
      service: 'tracearr',
    });
    expect((await current.browser.post(path('s1'), {})).statusCode).toBe(400);
    expect(
      (await current.browser.post(path(SESSION), { reason: 'x'.repeat(201) })).statusCode,
    ).toBe(400);
  });
});

describe('Emby', () => {
  it('activité par le préfixe /emby, fiche TMDB, identifiant invalide refusé', async () => {
    const current = await open();
    const pool = current.agent.get(EMBY);
    pool
      .intercept({ path: '/emby/Sessions', method: 'GET', headers: { 'x-emby-token': 'e-key' } })
      .reply(200, [
        {
          Id: 's',
          NowPlayingItem: { Id: '1', Type: 'Movie', Name: 'Film' },
          PlayState: { PlayMethod: 'DirectPlay' },
        },
      ])
      .persist();
    pool
      .intercept({ path: (p) => p.startsWith('/emby/Items?'), method: 'GET' })
      .reply(200, { Items: [{ Type: 'Movie', ProviderIds: { Tmdb: '603' } }] })
      .persist();
    expect((await current.browser.get('/api/emby/activity')).json<Activity>()).toMatchObject({
      connected: true,
      directPlayCount: 1,
      sessions: [{ title: 'Film', poster: 'api/emby/image?item=1' }],
    });
    expect((await current.browser.get('/api/emby/quicklook/123')).json()).toEqual({
      type: 'movie',
      id: 603,
    });
    expect((await current.browser.get('/api/emby/quicklook/zz')).statusCode).toBe(400);
    expect((await current.browser.get('/api/emby/image?item=..%2Fx')).statusCode).toBe(404);
  });
});
