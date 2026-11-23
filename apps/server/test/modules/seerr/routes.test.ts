// SPDX-License-Identifier: AGPL-3.0-or-later
// Seerr (P3f) : `JellyseerrControllerTest` porté (compteur « en attente ») et
// contrat des routes : demandes filtrées et enrichies, statut affiché,
// protections du propriétaire et des admins, secrets masqués et restitués,
// notes de version.

import type { SeerrRequestsPage, SeerrServicesPage, SeerrUserDetail } from '@hubarr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { parseReleaseNotes, requestDisplayStatus } from '../../../src/integrations/seerr/client';
import { applyServicePatch } from '../../../src/modules/services/config';
import {
  fakeUpstream,
  torrentEnv,
  type FakeUpstream,
  type TorrentEnv,
} from '../torrents/torrent-env';

const SEERR = 'http://seerr.test:5055';
let env: TorrentEnv | undefined;
let seerr: FakeUpstream;
afterEach(async () => {
  await env?.close();
  env = undefined;
});

async function open(role: 'admin' | 'user' = 'admin'): Promise<TorrentEnv> {
  env = await torrentEnv({ role, configure: {} });
  applyServicePatch(env.database.db, 'seerr', { url: SEERR, apiKey: 'seerr-key' });
  seerr = fakeUpstream(env.agent, SEERR);
  return env;
}

const request = (id: number, overrides: Record<string, unknown> = {}) => ({
  id,
  status: 1,
  type: 'movie',
  media: { tmdbId: 100 + id, status: 2, mediaType: 'movie' },
  requestedBy: { id: 2, displayName: 'bob', plexToken: 'secret-token' },
  ...overrides,
});

describe('logique', () => {
  it('statut affiché dans l’ordre de l’original', () => {
    expect(requestDisplayStatus({ status: 3, media: { status: 5 } })).toBe('declined');
    expect(requestDisplayStatus({ status: 2, media: { status: 5 } })).toBe('available');
    expect(requestDisplayStatus({ status: 2, media: { status: 4 } })).toBe('partially_available');
    expect(requestDisplayStatus({ status: 2, media: { status: 2 } })).toBe('processing');
    expect(requestDisplayStatus({ status: 1, media: { status: 3 } })).toBe('approved');
    expect(requestDisplayStatus({ status: 1, media: { status: 1 } })).toBe('pending');
    expect(requestDisplayStatus({})).toBe('unknown');
  });

  it('notes de version découpées en sections', () => {
    const body =
      '## v2.1.0\n### Features\n- add [thing](http://x) - (abc123)\n- other\n### Bug Fixes\n- fix\n## older';
    expect(parseReleaseNotes(body)).toEqual({ features: ['add thing', 'other'], fixes: ['fix'] });
  });
});

describe('gardes et compteur', () => {
  it('admins seulement ; compteur en attente (0 si absent) ; injoignable → 503', async () => {
    let current = await open('user');
    expect((await current.browser.get('/api/jellyseerr/pending-count')).statusCode).toBe(403);
    await current.close();
    current = await open();
    seerr.on('GET /api/v1/request/count', { body: { pending: 4, approved: 2 } });
    expect((await current.browser.get('/api/jellyseerr/pending-count')).json()).toEqual({
      pending: 4,
    });
    seerr.on('GET /api/v1/request/count', { body: { approved: 2 } });
    expect((await current.browser.get('/api/jellyseerr/pending-count')).json()).toEqual({
      pending: 0,
    });
    current.agent
      .get('http://down.test')
      .intercept({ path: () => true })
      .replyWithError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))
      .persist();
    applyServicePatch(current.database.db, 'seerr', { url: 'http://down.test' });
    expect((await current.browser.get('/api/jellyseerr/pending-count')).statusCode).toBe(503);
  });
});

describe('demandes', () => {
  it('page : filtre passé à Seerr, fiche TMDB, statut, secrets masqués', async () => {
    const current = await open();
    seerr.on('GET /api/v1/status', { body: { version: '2.1.0' } });
    seerr.on('GET /api/v1/request', {
      body: { pageInfo: { pages: 3, results: 45, page: 2 }, results: [request(1)] },
    });
    seerr.on('GET /api/v1/request/count', { body: { pending: 1 } });
    seerr.on('GET /api/v1/movie/101', {
      body: {
        title: 'Orbite Basse',
        overview: 'x',
        posterPath: '/p.jpg',
        releaseDate: '2019-01-01',
        genres: [{ name: 'SF' }],
      },
    });
    const page = (
      await current.browser.get('/api/jellyseerr?filter=pending&page=2&sort=modified')
    ).json<SeerrRequestsPage>();
    const call = seerr.callsTo('GET /api/v1/request')[0];
    expect(Object.fromEntries(call?.query ?? [])).toEqual({
      take: '20',
      skip: '20',
      filter: 'pending',
      sort: 'modified',
      sortDirection: 'desc',
    });
    expect(call?.headers['x-api-key']).toBe('seerr-key');
    expect(page.pageInfo).toEqual({ pages: 3, results: 45, page: 2 });
    expect(page.requests[0]).toMatchObject({
      id: 1,
      displayStatus: 'pending',
      tmdb: { title: 'Orbite Basse', genres: ['SF'] },
    });
    expect(JSON.stringify(page)).not.toContain('secret-token');
  });

  it('demandes par date de demande décroissante, quel que soit l’ordre de Seerr (V10)', async () => {
    const current = await open();
    seerr.on('GET /api/v1/request', {
      body: {
        results: [
          request(1, { createdAt: '2026-11-01T10:00:00.000Z' }),
          request(2, { createdAt: '2026-11-20T10:00:00.000Z' }),
          request(3, { createdAt: '2026-11-10T10:00:00.000Z' }),
        ],
        pageInfo: { pages: 1, results: 3, page: 1 },
      },
    });
    const page = (await current.browser.get('/api/jellyseerr')).json<SeerrRequestsPage>();
    expect(page.requests.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('« partiel » et type : filtrés par Hubarr sur 500 demandes', async () => {
    const current = await open();
    seerr.on('GET /api/v1/request', {
      body: {
        results: [
          request(1, { media: { status: 4 } }),
          request(2, { type: 'tv', media: { status: 4 } }),
          request(3),
        ],
      },
    });
    const page = (
      await current.browser.get('/api/jellyseerr?filter=partial&type=movie')
    ).json<SeerrRequestsPage>();
    expect(page.requests.map((r) => r.id)).toEqual([1]);
    expect(seerr.callsTo('GET /api/v1/request')[0]?.query.get('take')).toBe('500');
  });

  it('actions, édition vide refusée, refus de Seerr → 502 avec son message, fiche absente → 404', async () => {
    const current = await open();
    seerr.on('POST /api/v1/request/5/approve', { body: {} });
    seerr.on('DELETE /api/v1/request/5', { status: 204, text: '' });
    seerr.on('POST /api/v1/request/6/decline', {
      status: 400,
      body: { message: 'Request already declined' },
    });
    seerr.on('GET /api/v1/request/9', { status: 404, body: { message: 'not found' } });
    const b = current.browser;
    expect((await b.post('/api/jellyseerr/request/5/approve')).json()).toEqual({ ok: true });
    expect((await b.post('/api/jellyseerr/request/5/delete')).json()).toEqual({ ok: true });
    const refused = await b.post('/api/jellyseerr/request/6/decline');
    expect(refused.statusCode).toBe(502);
    expect(refused.json()).toMatchObject({ message: 'Request already declined' });
    expect((await b.post('/api/jellyseerr/request/5/edit', {})).json()).toMatchObject({
      message: 'jellyseerr.api.empty_data',
    });
    expect((await b.get('/api/jellyseerr/request/9')).json()).toMatchObject({
      code: 'NOT_FOUND',
      message: 'jellyseerr.api.request_not_found',
    });
  });
});

describe('utilisateurs', () => {
  it('propriétaire et admins protégés ; mot de passe trop court ; création et import validés', async () => {
    const current = await open();
    seerr.on('GET /api/v1/user/3', { body: { id: 3, permissions: 2 } });
    seerr.on('GET /api/v1/user/4', { body: { id: 4, permissions: 32 } });
    seerr.on('DELETE /api/v1/user/4', { status: 204, text: '' });
    const b = current.browser;
    expect((await b.post('/api/jellyseerr/utilisateurs/1/delete')).json()).toMatchObject({
      message: 'jellyseerr.api.cannot_delete_owner',
    });
    expect((await b.post('/api/jellyseerr/utilisateurs/3/delete')).json()).toMatchObject({
      message: 'jellyseerr.api.cannot_delete_admin',
    });
    expect((await b.post('/api/jellyseerr/utilisateurs/4/delete')).json()).toEqual({ ok: true });
    expect(
      (await b.post('/api/jellyseerr/utilisateurs/1/permissions', { permissions: 32 })).json(),
    ).toMatchObject({ message: 'jellyseerr.api.owner_protected' });
    expect(
      (await b.post('/api/jellyseerr/utilisateurs/4/password', { password: 'short' })).json(),
    ).toMatchObject({ message: 'jellyseerr.api.password_too_short' });
    expect(
      (await b.post('/api/jellyseerr/utilisateurs/create', { email: ' ', password: '' })).json(),
    ).toMatchObject({ message: 'jellyseerr.api.email_password_required' });
    expect(
      (
        await b.post('/api/jellyseerr/utilisateurs/import-jellyfin', { jellyfinUserIds: [] })
      ).json(),
    ).toMatchObject({ message: 'jellyseerr.api.no_user_selected' });
    expect((await b.get('/api/jellyseerr/utilisateurs/1')).statusCode).toBe(400);
  });

  it('fiche : rôle, quota, demandes récentes, 4K détecté', async () => {
    const current = await open();
    seerr.on('GET /api/v1/user/4', { body: { id: 4, displayName: 'carol', permissions: 8 } });
    seerr.on('GET /api/v1/user/4/quota', { body: { movie: { limit: 5 } } });
    seerr.on('GET /api/v1/user/4/requests', { body: { results: [request(7)] } });
    seerr.on('GET /api/v1/settings/main', {
      body: { defaultPermissions: 32, apiKey: 'seerr-secret' },
    });
    seerr.on('GET /api/v1/settings/radarr', {
      body: [{ id: 1, is4k: true, apiKey: 'radarr-secret' }],
    });
    seerr.on('GET /api/v1/settings/sonarr', { body: [] });
    const detail = (
      await current.browser.get('/api/jellyseerr/utilisateurs/4')
    ).json<SeerrUserDetail>();
    expect(detail).toMatchObject({
      user: { id: 4, role: 'manager' },
      quota: { movie: { limit: 5 } },
      defaultPermissions: 32,
      has4k: true,
    });
    expect(detail.requests[0]).toMatchObject({ id: 7 });
  });

  it('import Jellyfin : utilisateurs déjà importés écartés', async () => {
    const current = await open();
    seerr.on('GET /api/v1/settings/jellyfin/users', {
      body: [
        { id: 'jf1', username: 'a' },
        { id: 'jf2', username: 'b' },
      ],
    });
    seerr.on('GET /api/v1/user', { body: { results: [{ id: 5, jellyfinUserId: 'jf1' }] } });
    seerr.on('GET /api/v1/settings/main', { body: { mediaServerLogin: true } });
    expect((await current.browser.get('/api/jellyseerr/service/jellyfin-users')).json()).toEqual({
      users: [{ id: 'jf2', username: 'b' }],
      mediaServerLogin: true,
    });
  });
});

describe('réglages', () => {
  it('secrets masqués partout ; clé de Seerr jamais enregistrée ; clé *arr restituée', async () => {
    const current = await open();
    seerr.on('GET /api/v1/settings/main', {
      body: { applicationTitle: 'Seerr', apiKey: 'seerr-secret' },
    });
    seerr.on('POST /api/v1/settings/main', { body: {} });
    seerr.on('GET /api/v1/settings/jellyfin', { body: { name: 'JF', apiKey: 'jf-secret' } });
    seerr.on('GET /api/v1/settings/radarr', {
      body: [
        { id: 0, name: 'Radarr 0', apiKey: 'zero-secret' },
        { id: 1, name: 'Radarr', apiKey: 'radarr-secret', isDefault: true },
      ],
    });
    seerr.on('PUT /api/v1/settings/radarr/0', { body: {} });
    seerr.on('GET /api/v1/settings/sonarr', { body: [] });
    seerr.on('GET /api/v1/service/radarr/1', {
      body: { profiles: [{ id: 4, name: 'HD' }], rootFolders: [] },
    });
    seerr.on('PUT /api/v1/settings/radarr/1', { body: {} });
    seerr.on('POST /api/v1/settings/radarr/test', { body: { profiles: [] } });
    const b = current.browser;
    for (const url of [
      '/api/jellyseerr/parametres',
      '/api/jellyseerr/parametres/jellyfin',
      '/api/jellyseerr/parametres/services',
      '/api/jellyseerr/service/settings-main',
    ]) {
      const text = (await b.get(url)).body;
      expect(text).not.toContain('secret');
    }
    const services = (await b.get('/api/jellyseerr/parametres/services')).json<SeerrServicesPage>();
    expect(services.radarrProfiles['1']).toMatchObject({ profiles: [{ id: 4, name: 'HD' }] });
    await b.post('/api/jellyseerr/parametres/save', { applicationTitle: 'X', apiKey: '********' });
    expect(seerr.callsTo('POST /api/v1/settings/main')[0]?.body).toEqual({ applicationTitle: 'X' });
    await b.post('/api/jellyseerr/parametres/services/radarr/1/save', {
      name: 'Radarr 2',
      apiKey: '********',
    });
    expect(seerr.callsTo('PUT /api/v1/settings/radarr/1')[0]?.body).toEqual({
      name: 'Radarr 2',
      apiKey: 'radarr-secret',
    });
    // Seerr numérote ses serveurs à partir de 0.
    const zero = await b.post('/api/jellyseerr/parametres/services/radarr/0/save', {
      apiKey: '********',
    });
    expect(zero.json()).toEqual({ ok: true });
    expect(seerr.callsTo('PUT /api/v1/settings/radarr/0')[0]?.body).toEqual({
      apiKey: 'zero-secret',
    });
    await b.post('/api/jellyseerr/parametres/services/test', {
      type: 'radarr',
      id: 1,
      hostname: 'r',
      apiKey: '********',
    });
    expect(seerr.callsTo('POST /api/v1/settings/radarr/test')[0]?.body).toMatchObject({
      apiKey: 'radarr-secret',
      hostname: 'r',
    });
    expect((await b.get('/api/jellyseerr/service/radarr')).json()).toMatchObject({
      profiles: [{ id: 4 }],
    });
  });

  it('tâches : planification requise ; règles : création ou modification selon l’id', async () => {
    const current = await open();
    seerr.on('POST /api/v1/overrideRule', { body: {} });
    seerr.on('PUT /api/v1/overrideRule/3', { body: {} });
    seerr.on('POST /api/v1/settings/jobs/plex-sync/run', {
      body: { id: 'plex-sync', running: true },
    });
    const b = current.browser;
    expect(
      (await b.post('/api/jellyseerr/job/plex-sync/schedule', { schedule: ' ' })).json(),
    ).toMatchObject({ message: 'jellyseerr.api.schedule_required' });
    expect((await b.post('/api/jellyseerr/job/plex-sync/run')).json()).toEqual({
      ok: true,
      data: { id: 'plex-sync', running: true },
    });
    await b.post('/api/jellyseerr/parametres/services/rules/save', { genre: '18' });
    await b.post('/api/jellyseerr/parametres/services/rules/save', { id: 3, genre: '27' });
    expect(seerr.callsTo('POST /api/v1/overrideRule')[0]?.body).toEqual({ genre: '18' });
    expect(seerr.callsTo('PUT /api/v1/overrideRule/3')[0]?.body).toEqual({ genre: '27' });
  });
});
