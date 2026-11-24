// SPDX-License-Identifier: AGPL-3.0-or-later
// « Vu » via Tracearr (lot 7) : association du compte, synchronisation
// (complète puis incrémentale, sans doublon), titres vus, resynchronisation
// réservée à l'admin, et réponses neutres sans Tracearr.

import type { TracearrLink, TracearrWatched } from '@hubarr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { tracearrSync, tracearrWatch } from '../../../src/db/schema';
import { applyServicePatch } from '../../../src/modules/services/config';
import { fakeUpstream, torrentEnv, type TorrentEnv } from '../torrents/torrent-env';

const TRACEARR = 'http://tracearr.test:3000';
const SHOW = '22222222-3333-4444-5555-666666666666';

let env: TorrentEnv | undefined;
afterEach(async () => {
  await env?.close();
  env = undefined;
});

function history(userId: string) {
  return [
    {
      id: `${userId}-m1`,
      media_type: 'movie',
      media_title: 'Film vu',
      tmdb_id: 603,
      started_at: '2026-11-20T20:00:00Z',
      percent_complete: 98,
      watched: true,
    },
    {
      id: `${userId}-m2`,
      media_type: 'movie',
      media_title: 'Film commencé',
      tmdb_id: 604,
      started_at: '2026-11-21T20:00:00Z',
      percent_complete: 20,
      watched: false,
    },
    {
      id: `${userId}-e1`,
      media_type: 'episode',
      show_media_id: SHOW,
      season_number: 1,
      episode_number: 2,
      started_at: '2026-11-19T20:00:00Z',
      watched: true,
    },
    {
      id: `${userId}-e2`,
      media_type: 'episode',
      show_media_id: SHOW,
      season_number: 1,
      episode_number: 2,
      started_at: '2026-11-18T20:00:00Z',
      watched: true,
    },
    // Musique et lignes sans identifiant : ignorées.
    { id: `${userId}-t1`, media_type: 'track', started_at: '2026-11-18T20:00:00Z' },
    { id: `${userId}-m3`, media_type: 'movie', started_at: '2026-11-18T20:00:00Z' },
  ];
}

async function open(role: 'admin' | 'user' = 'admin') {
  env = await torrentEnv({ role, configure: {} });
  applyServicePatch(env.database.db, 'tracearr', { url: TRACEARR, apiKey: 'trr_pub_x' });
  const upstream = fakeUpstream(env.agent, TRACEARR);
  upstream.on('GET /api/v2/public/users', {
    body: {
      data: [
        { id: 'id-bob', username: 'bob', identity_name: 'Bob' },
        { id: 'id-alice', username: 'alice' },
      ],
      meta: { nextCursor: null },
    },
  });
  upstream.on('GET /api/v2/public/history', (call) => {
    const user = call.query.get('user_id') ?? '';
    const rows = history(user);
    // Pagination : deux lignes par page.
    const start = Number(call.query.get('cursor') ?? '0');
    const next = start + 2 < rows.length ? String(start + 2) : null;
    return { body: { data: rows.slice(start, start + 2), meta: { nextCursor: next } } };
  });
  upstream.on(`GET /api/v2/public/media/${SHOW}`, {
    body: { id: SHOW, media_type: 'show', tmdb_id: 1399, tvdb_id: 121361 },
  });
  return { current: env, upstream };
}

async function link(current: TorrentEnv, name: string) {
  const state = (await current.browser.get('/api/profil/tracearr')).json<TracearrLink>();
  const account = state.accounts.find((a) => a.name === name);
  if (account === undefined) throw new Error(`compte ${name} absent`);
  const response = await current.browser.post('/api/profil/tracearr', { key: account.key });
  await current.app.watchSync.idle();
  return response;
}

describe('association du compte', () => {
  it('liste les identités par jeton, sans leurs identifiants', async () => {
    const { current } = await open();
    const response = await current.browser.get('/api/profil/tracearr');
    expect(response.statusCode).toBe(200);
    const state = response.json<TracearrLink>();
    expect(state.unavailable).toBeNull();
    expect(state.accounts.map((a) => a.name)).toEqual(['alice', 'Bob']);
    expect(state.linked).toBeNull();
    expect(response.body).not.toContain('id-bob');
  });

  it('associe, importe en arrière-plan puis dissocie en oubliant les lectures', async () => {
    const { current } = await open();
    const response = await link(current, 'Bob');
    expect(response.statusCode).toBe(200);
    expect(response.json<TracearrLink>().linked?.name).toBe('Bob');

    const state = (await current.browser.get('/api/profil/tracearr')).json<TracearrLink>();
    expect(state.sync).toMatchObject({ error: null, plays: 4 });
    expect(state.sync?.lastRunAt).not.toBeNull();

    const unlink = await current.browser.post('/api/profil/tracearr', { key: null });
    expect(unlink.json<TracearrLink>().linked).toBeNull();
    expect(current.database.db.select().from(tracearrWatch).all()).toHaveLength(0);
    expect(current.database.db.select().from(tracearrSync).all()).toHaveLength(0);
  });

  it('refuse un jeton inconnu ou mal formé', async () => {
    const { current } = await open();
    expect(
      (await current.browser.post('/api/profil/tracearr', { key: 'A'.repeat(22) })).statusCode,
    ).toBe(404);
    expect((await current.browser.post('/api/profil/tracearr', { key: 'id-bob' })).statusCode).toBe(
      400,
    );
  });

  it('Tracearr sans API v2 : association indisponible', async () => {
    const { current, upstream } = await open();
    upstream.on('GET /api/v2/public/users', { status: 404, text: 'Not Found' });
    const state = (await current.browser.get('/api/profil/tracearr')).json<TracearrLink>();
    expect(state.unavailable).toBe('unsupported');
    expect(state.accounts).toEqual([]);
  });

  it('Tracearr non configuré : réponses neutres', async () => {
    const { current } = await open();
    applyServicePatch(current.database.db, 'tracearr', { remove: true });
    const state = (await current.browser.get('/api/profil/tracearr')).json<TracearrLink>();
    expect(state.unavailable).toBe('unconfigured');
    const watched = (await current.browser.get('/api/tracearr/watched')).json<TracearrWatched>();
    expect(watched).toEqual({ linked: false, movies: [], shows: [] });
  });
});

describe('titres vus', () => {
  it('films vus et épisodes vus sans doublon, séries par TMDB et TVDB', async () => {
    const { current } = await open('user');
    await link(current, 'Bob');
    const watched = (await current.browser.get('/api/tracearr/watched')).json<TracearrWatched>();
    expect(watched).toEqual({
      linked: true,
      movies: [603],
      shows: [{ tmdbId: 1399, tvdbId: 121361, episodes: [[1, 2]] }],
    });
  });

  it('passage incrémental depuis le curseur, sans doublon', async () => {
    const { current, upstream } = await open();
    await link(current, 'Bob');
    const before = upstream.callsTo('GET /api/v2/public/history').length;
    expect(upstream.callsTo('GET /api/v2/public/history')[0]?.query.get('since')).toBeNull();
    await current.app.watchSync.sync('id-bob');
    const calls = upstream.callsTo('GET /api/v2/public/history').slice(before);
    // Curseur : dernière lecture (21/11 20 h) moins 6 h de recouvrement.
    expect(calls[0]?.query.get('since')).toBe('2026-11-21T14:00:00.000Z');
    expect(current.database.db.select().from(tracearrWatch).all()).toHaveLength(4);
  });
});

describe('resynchronisation', () => {
  it('réservée à l’admin', async () => {
    const { current } = await open('user');
    expect((await current.browser.post('/api/admin/tracearr/resync')).statusCode).toBe(403);
  });

  it('réimporte tout l’historique des identités associées', async () => {
    const { current, upstream } = await open();
    await link(current, 'Bob');
    const response = await current.browser.post('/api/admin/tracearr/resync');
    expect(response.statusCode).toBe(200);
    const last = upstream.callsTo('GET /api/v2/public/history').at(-3);
    expect(last?.query.get('since')).toBeNull();
    expect(response.json<TracearrLink>().sync).toMatchObject({ plays: 4, error: null });
  });

  it('Tracearr injoignable : erreur mémorisée, lectures conservées', async () => {
    const { current, upstream } = await open();
    await link(current, 'Bob');
    upstream.on('GET /api/v2/public/history', { status: 500, text: 'boom' });
    await current.app.watchSync.sync('id-bob');
    const state = (await current.browser.get('/api/profil/tracearr')).json<TracearrLink>();
    expect(state.sync).toMatchObject({ error: 'unreachable', plays: 4 });
  });
});
