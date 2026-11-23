// SPDX-License-Identifier: AGPL-3.0-or-later
// Routes `/api/admin/settings*` et `/api/admin/instances/*` : port de
// `AdminSettingsControllerTest` (enregistrement, test de connexion),
// `AdminSettingsRemoveServiceTest`, `AdminSettingsSaveKeepsServicesEnabledTest`
// et des actions d'`AdminInstancesController`.

import type { InstanceListResponse, ServiceTestResponse, SettingsResponse } from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app';
import type { AppDatabase } from '../../../src/db/client';
import { readServiceConfig } from '../../../src/modules/services/config';
import { TestBrowser, UNUSED_DATA_DIR, createTestDatabase, createUser } from '../../helpers';

const EMAIL = 'admin@example.com';
const PASSWORD = 'password-1';

let database: AppDatabase;
let app: FastifyInstance;
let agent: MockAgent;
let browser: TestBrowser;

beforeEach(async () => {
  database = await createTestDatabase();
  agent = new MockAgent();
  agent.disableNetConnect();
  app = buildApp({
    database,
    dataDir: UNUSED_DATA_DIR,
    dispatcher: agent,
    resolve: () => Promise.resolve([]),
  });
  await createUser(database, { email: EMAIL, password: PASSWORD });
  browser = new TestBrowser(() => app);
  expect((await browser.login({ email: EMAIL, password: PASSWORD })).statusCode).toBe(200);
});
afterEach(async () => {
  await app.close();
  await agent.close();
});

const save = async (body: object) => browser.post('/api/admin/settings', body);

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('valeur absente');
  return value;
}

describe('GET/POST /api/admin/settings', () => {
  it('réservé aux admins', async () => {
    await createUser(database, { email: 'user@example.com', password: PASSWORD, role: 'user' });
    const user = new TestBrowser(() => app);
    await user.login({ email: 'user@example.com', password: PASSWORD });
    expect((await user.get('/api/admin/settings')).statusCode).toBe(403);
    expect((await new TestBrowser(() => app).get('/api/admin/settings')).statusCode).toBe(401);
  });

  it('renvoie l’état sans jamais exposer les secrets', async () => {
    await save({ services: { prowlarr: { url: 'http://p:9696', apiKey: 'top-secret' } } });
    const response = await browser.get('/api/admin/settings');
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('top-secret');
    const body = response.json<SettingsResponse>();
    expect(body.services.prowlarr).toEqual({
      saved: true,
      configured: true,
      enabled: true,
      url: 'http://p:9696',
      user: '',
      hasApiKey: true,
      hasPassword: false,
    });
    expect(body.services.tmdb.saved).toBe(false);
    expect(body.instances).toEqual({ radarr: [], sonarr: [] });
    expect(body.sidebar.calendar).toBe(true);
    expect(body.about.userCount).toBe(1);
  });

  it('un secret vide ne l’efface pas ; un enregistrement d’autre chose ne touche à rien', async () => {
    await save({ services: { qbittorrent: { url: 'http://q', user: 'admin', password: 'pw' } } });
    await save({ services: { qbittorrent: { url: 'http://q', user: 'admin', password: '' } } });
    await save({ sidebar: { radarr: false } });
    expect(readServiceConfig(database.db, 'qbittorrent')).toMatchObject({
      password: 'pw',
      enabled: true,
    });
  });

  it('retirer un service n’efface que lui', async () => {
    await save({
      services: {
        prowlarr: { url: 'http://p', apiKey: 'k' },
        tautulli: { url: 'http://t', apiKey: 'k2' },
      },
    });
    const body = (
      await save({ services: { prowlarr: { remove: true } } })
    ).json<SettingsResponse>();
    expect(body.services.prowlarr.saved).toBe(false);
    expect(body.services.tautulli.saved).toBe(true);
  });

  it('interrupteur par service et visibilité dans le menu', async () => {
    let body = (
      await save({
        services: { seerr: { url: 'http://s', apiKey: 'k', enabled: false } },
        sidebar: { tmdb: false, calendar: false },
      })
    ).json<SettingsResponse>();
    expect(body.services.seerr).toMatchObject({ enabled: false, configured: false, saved: true });
    expect(body.sidebar).toMatchObject({ tmdb: false, calendar: false, radarr: true });
    body = (await save({ sidebar: { tmdb: true } })).json<SettingsResponse>();
    expect(body.sidebar.tmdb).toBe(true);
  });

  it('refuse un identifiant de service inconnu', async () => {
    expect((await save({ services: { radarr: { url: 'http://r' } } })).statusCode).toBe(400);
    expect((await save({ sidebar: { nope: false } })).statusCode).toBe(400);
  });

  it('enregistrer invalide les disjoncteurs', async () => {
    app.upstream.health.markDown('prowlarr');
    await save({ services: { prowlarr: { url: 'http://p', apiKey: 'k' } } });
    expect(app.upstream.health.isDown('prowlarr')).toBe(false);
  });
});

describe('POST /api/admin/settings/test/:service', () => {
  it('succès : catégorie ok et statut HTTP', async () => {
    await save({ services: { prowlarr: { url: 'http://prowlarr.test:9696', apiKey: 'k' } } });
    agent
      .get('http://prowlarr.test:9696')
      .intercept({ path: '/api/v1/system/status', headers: { 'x-api-key': 'k' } })
      .reply(200, { version: '2' });
    const response = await browser.post('/api/admin/settings/test/prowlarr', {});
    expect(response.json<ServiceTestResponse>()).toEqual({
      ok: true,
      service: 'Prowlarr',
      category: 'ok',
      http: 200,
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('échec : catégorie et statut', async () => {
    agent
      .get('http://tautulli.test')
      .intercept({ path: /^\/api\/v2/ })
      .reply(500, '');
    const response = await browser.post('/api/admin/settings/test/tautulli', {
      url: 'http://tautulli.test',
      apiKey: 'k',
    });
    expect(response.json<ServiceTestResponse>()).toEqual({
      ok: false,
      service: 'Tautulli',
      category: 'server_error',
      http: 500,
    });
  });

  it('teste les valeurs du formulaire avant enregistrement, clé vide = clé enregistrée', async () => {
    await save({ services: { sabnzbd: { url: 'http://old.test', apiKey: 'saved-key' } } });
    agent
      .get('http://new.test:8080')
      .intercept({ path: '/api?mode=queue&output=json&apikey=saved-key' })
      .reply(403, 'Access denied - Hostname verification failed');
    const body = (
      await browser.post('/api/admin/settings/test/sabnzbd', {
        url: 'http://new.test:8080',
        apiKey: '',
      })
    ).json<ServiceTestResponse>();
    expect(body.category).toBe('host_whitelist');
  });

  it('Radarr : instance par défaut à défaut de valeurs saisies', async () => {
    await browser.post('/api/admin/instances/radarr/add', {
      name: 'Radarr',
      url: 'http://radarr.test',
      apiKey: 'rk',
    });
    agent
      .get('http://radarr.test')
      .intercept({ path: '/api/v3/system/status', headers: { 'x-api-key': 'rk' } })
      .reply(401, '');
    expect(
      (await browser.post('/api/admin/settings/test/radarr', {})).json<ServiceTestResponse>()
        .category,
    ).toBe('auth');
  });

  it('erreur réseau → network, sans détail dans la réponse', async () => {
    agent
      .get('http://down.test')
      .intercept({ path: '/api/v1/system/status' })
      .replyWithError(
        Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:9696 k=secret'), {
          code: 'ECONNREFUSED',
        }),
      );
    const response = await browser.post('/api/admin/settings/test/prowlarr', {
      url: 'http://down.test',
      apiKey: 'secret',
    });
    expect(response.json<ServiceTestResponse>()).toEqual({
      ok: false,
      service: 'Prowlarr',
      category: 'network',
      http: null,
    });
    expect(response.body).not.toContain('secret');
  });

  it('service inconnu → 400 ; non configuré → unconfigured', async () => {
    expect((await browser.post('/api/admin/settings/test/nope', {})).statusCode).toBe(400);
    expect(
      (await browser.post('/api/admin/settings/test/tmdb', {})).json<ServiceTestResponse>()
        .category,
    ).toBe('unconfigured');
  });
});

describe('POST /api/admin/settings/health/invalidate/:service', () => {
  it('referme le disjoncteur du service et de ses instances', async () => {
    app.upstream.health.markDown('radarr', 'radarr-4k');
    const response = await browser.post('/api/admin/settings/health/invalidate/Radarr');
    expect(response.json()).toEqual({ ok: true });
    expect(app.upstream.health.isDown('radarr', 'radarr-4k')).toBe(false);
  });

  it('refuse un service sans interrupteur ni instance (Gluetun) ou inconnu', async () => {
    expect((await browser.post('/api/admin/settings/health/invalidate/gluetun')).statusCode).toBe(
      400,
    );
    expect((await browser.post('/api/admin/settings/health/invalidate/nope')).statusCode).toBe(400);
  });
});

describe('/api/admin/instances', () => {
  const add = async (type: string, body: object) =>
    browser.post(`/api/admin/instances/${type}/add`, body);

  it('ajout, défaut, activation, modification, suppression', async () => {
    let list = (
      await add('radarr', { name: 'Radarr', url: 'http://r1', apiKey: 'k1' })
    ).json<InstanceListResponse>();
    expect(list.instances).toHaveLength(1);
    expect(list.instances[0]).toMatchObject({
      slug: 'radarr',
      isDefault: true,
      hasApiKey: true,
      enabled: true,
    });
    list = (
      await add('radarr', { name: 'Radarr 4K', url: 'http://r2' })
    ).json<InstanceListResponse>();
    const second = must(list.instances[1]);
    expect(second).toMatchObject({
      slug: 'radarr-4k',
      isDefault: false,
      hasApiKey: false,
      position: 1,
    });
    expect(JSON.stringify(list)).not.toContain('k1');

    list = (
      await browser.post(`/api/admin/instances/${second.id}/set-default`)
    ).json<InstanceListResponse>();
    expect(list.instances.map((row) => row.isDefault)).toEqual([false, true]);

    list = (
      await browser.post(`/api/admin/instances/${second.id}/toggle-enabled`)
    ).json<InstanceListResponse>();
    expect(list.instances[1]?.enabled).toBe(false);

    list = (
      await browser.post(`/api/admin/instances/${second.id}/edit`, {
        name: 'UHD',
        url: 'http://r3',
        slug: 'uhd',
        enabled: true,
        defaultQualityProfileId: 3,
      })
    ).json<InstanceListResponse>();
    expect(list.instances[1]).toMatchObject({
      name: 'UHD',
      slug: 'uhd',
      url: 'http://r3',
      enabled: true,
      defaultQualityProfileId: 3,
    });

    list = (
      await browser.post(`/api/admin/instances/${second.id}/delete`)
    ).json<InstanceListResponse>();
    expect(list.instances).toHaveLength(1);
    expect(list.instances[0]?.isDefault).toBe(true);
  });

  it('erreurs de saisie → 400 avec clé i18n', async () => {
    const response = await add('sonarr', { name: '', url: 'file:///etc/passwd' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'VALIDATION',
      details: [
        { path: 'name', code: 'name_required', message: 'admin.instances.error.name_required' },
      ],
    });
    const blocked = await add('sonarr', { name: 'S', url: 'http://169.254.169.254' });
    expect(blocked.json()).toMatchObject({
      details: [{ code: 'url_blocked', reason: 'link-local' }],
    });
    expect((await add('prowlarr', { name: 'P', url: 'http://p' })).statusCode).toBe(400);
  });

  it('instance inconnue → 404 ; une ligne de service unique n’est pas une instance', async () => {
    expect((await browser.post('/api/admin/instances/999/delete')).statusCode).toBe(404);
    await save({ services: { prowlarr: { url: 'http://p', apiKey: 'k' } } });
    const row = database.sqlite
      .prepare("select id from service_instance where type = 'prowlarr'")
      .get() as { id: number };
    expect((await browser.post(`/api/admin/instances/${row.id}/delete`)).statusCode).toBe(404);
  });

  it('test d’une instance avec ses propres valeurs', async () => {
    await add('sonarr', { name: 'A', url: 'http://a.test', apiKey: 'ka' });
    const list = (
      await add('sonarr', { name: 'B', url: 'http://b.test', apiKey: 'kb' })
    ).json<InstanceListResponse>();
    agent
      .get('http://b.test')
      .intercept({ path: '/api/v3/system/status', headers: { 'x-api-key': 'kb' } })
      .reply(200, {});
    const response = await browser.post(`/api/admin/instances/${must(list.instances[1]).id}/test`);
    expect(response.json()).toEqual({ ok: true, category: 'ok', http: 200 });
  });

  it('mutation sans jeton CSRF → 403', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/instances/radarr/add',
      headers: { cookie: `hubarr_session=${browser.cookie ?? ''}` },
      payload: { name: 'R', url: 'http://r' },
    });
    expect(response.statusCode).toBe(403);
  });
});
