// SPDX-License-Identifier: AGPL-3.0-or-later
// Prowlarr, intégrations, réglages et système (P3c.3) : familles à schéma,
// profils d'application, configurations (secrets), historique, étiquettes,
// santé, statut, journaux, tâches, sauvegardes, mises à jour.

import { ARR_SECRET_MASK, type Provider } from '@hubarr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { prowlarrEnv, type ProwlarrEnv } from './prowlarr-env';

let env: ProwlarrEnv | undefined;
afterEach(async () => {
  await env?.close();
  env = undefined;
});
async function open(): Promise<ProwlarrEnv> {
  env = await prowlarrEnv();
  return env;
}

const app = (id: number) => ({
  id,
  name: `Radarr ${id}`,
  implementation: 'Radarr',
  implementationName: 'Radarr',
  configContract: 'RadarrSettings',
  syncLevel: 'fullSync',
  tags: [],
  fields: [
    { name: 'baseUrl', value: 'http://radarr:7878' },
    { name: 'apiKey', value: 'radarr-secret', privacy: 'apiKey' },
  ],
});

describe('ressources à schéma', () => {
  it.each([
    ['/applications', '/application', '/api/v1/applications'],
    ['/download-clients', '/downloadclient', '/api/v1/downloadclient'],
    ['/notifications', '/notification', '/api/v1/notification'],
  ])(
    '%s : liste et modèles masqués, modification restituant le secret',
    async (list, item, upstream) => {
      const env = await open();
      env.prowlarr.on('GET', upstream, [app(1)]);
      env.prowlarr.on('GET', `${upstream}/schema`, [app(0)]);
      env.prowlarr.on('GET', `${upstream}/1`, app(1));
      env.prowlarr.onCall('PUT', `${upstream}/1`, (call) => ({ status: 202, body: call.body }));
      env.prowlarr.on('POST', `${upstream}/test`);
      env.prowlarr.on('DELETE', `${upstream}/1`);

      const listed = (await env.browser.get(env.url(list))).json<Provider[]>();
      expect(listed[0]?.fields?.[1]?.value).toBe(ARR_SECRET_MASK);
      expect(
        JSON.stringify((await env.browser.get(env.url(`${item}/schema`))).json()),
      ).not.toContain('radarr-secret');
      const saved = await env.browser.post(env.url(`${item}/1/update`), {
        ...app(1),
        name: 'Films',
        fields: [
          { name: 'baseUrl', value: 'http://radarr:7878' },
          { name: 'apiKey', value: ARR_SECRET_MASK },
        ],
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.body).not.toContain('radarr-secret');
      expect(
        (env.prowlarr.callsTo('PUT', `${upstream}/1`)[0]?.body as Provider).fields?.[1],
      ).toEqual({
        name: 'apiKey',
        value: 'radarr-secret',
      });
      expect((await env.browser.post(env.url(`${item}/test`), app(1))).json()).toEqual({
        ok: true,
        message: null,
      });
      expect((await env.browser.post(env.url(`${item}/1/delete`))).json()).toEqual({ ok: true });
    },
  );

  it('profils d’application : ajout, modification, suppression refusée → 502', async () => {
    const env = await open();
    const body = {
      name: 'Interactif',
      enableRss: false,
      enableAutomaticSearch: false,
      enableInteractiveSearch: true,
      minimumSeeders: 3,
    };
    env.prowlarr.onCall('POST', '/api/v1/appprofile', (call) => ({
      status: 201,
      body: { id: 4, ...(call.body as object) },
    }));
    env.prowlarr.onCall('PUT', '/api/v1/appprofile/4', (call) => ({
      status: 202,
      body: call.body,
    }));
    env.prowlarr.on('DELETE', '/api/v1/appprofile/4', { message: 'Profile in use' }, 400);
    expect((await env.browser.post(env.url('/app-profile/add'), body)).json()).toEqual({
      id: 4,
      ...body,
    });
    expect(
      (
        await env.browser.post(env.url('/app-profile/4/update'), { ...body, minimumSeeders: 5 })
      ).json(),
    ).toMatchObject({ id: 4, minimumSeeders: 5 });
    const refused = await env.browser.post(env.url('/app-profile/4/delete'));
    expect(refused.statusCode).toBe(502);
    expect(refused.json()).toMatchObject({ message: 'Profile in use' });
    expect(
      (await env.browser.post(env.url('/app-profile/add'), { ...body, name: '' })).statusCode,
    ).toBe(400);
  });
});

describe('configurations', () => {
  it('général : secrets masqués, fusion sans clé d’API ni mot de passe masqué', async () => {
    const env = await open();
    const host = {
      id: 1,
      port: 9696,
      instanceName: 'Prowlarr',
      apiKey: 'prowlarr-key',
      password: 'pw',
      username: 'admin',
    };
    env.prowlarr.on('GET', '/api/v1/config/host', host);
    env.prowlarr.onCall('PUT', '/api/v1/config/host/1', (call) => ({
      status: 202,
      body: call.body,
    }));
    const page = await env.browser.get(env.url('/general'));
    expect(page.json()).toMatchObject({
      port: 9696,
      apiKey: ARR_SECRET_MASK,
      password: ARR_SECRET_MASK,
    });
    const saved = await env.browser.post(env.url('/general/save'), {
      port: 9697,
      apiKey: 'hack',
      password: ARR_SECRET_MASK,
    });
    expect(saved.json()).toMatchObject({ port: 9697, apiKey: ARR_SECRET_MASK });
    expect(env.prowlarr.callsTo('PUT', '/api/v1/config/host/1')[0]?.body).toEqual({
      ...host,
      port: 9697,
    });
  });

  it('interface et réglages des clients ; section absente → 404', async () => {
    const env = await open();
    env.prowlarr.on('GET', '/api/v1/config/ui', { id: 1, theme: 'auto', uiLanguage: 'en' });
    env.prowlarr.onCall('PUT', '/api/v1/config/ui/1', (call) => ({ status: 202, body: call.body }));
    expect((await env.browser.post(env.url('/ui/save'), { theme: 'dark' })).json()).toEqual({
      id: 1,
      theme: 'dark',
      uiLanguage: 'en',
    });
    expect((await env.browser.get(env.url('/downloadclient-config'))).statusCode).toBe(404);
  });
});

describe('système', () => {
  it('historique paginé et « depuis » : données de l’évènement lues', async () => {
    const env = await open();
    const record = {
      id: 7,
      indexerId: 2,
      date: '2026-11-21T10:00:00Z',
      eventType: 'indexerQuery',
      successful: true,
      data: {
        source: 'Radarr',
        query: 'dune',
        categories: '2000',
        queryResults: '12',
        elapsedTime: '340',
      },
    };
    env.prowlarr.on('GET', '/api/v1/history', { records: [record], totalRecords: 120 });
    env.prowlarr.on('GET', '/api/v1/history/since', [record]);
    const page = await env.browser.get(env.url('/history?page=3'));
    expect(page.json()).toEqual({
      records: [
        {
          id: 7,
          indexerId: 2,
          date: '2026-11-21T10:00:00.000Z',
          eventType: 'indexerQuery',
          successful: true,
          source: 'Radarr',
          query: 'dune',
          queryType: null,
          categories: '2000',
          queryResults: 12,
          elapsedTime: 340,
        },
      ],
      totalRecords: 120,
      page: 3,
      pageSize: 50,
    });
    expect(env.prowlarr.callsTo('GET', '/api/v1/history')[0]?.query.get('page')).toBe('3');
    await env.browser.get(env.url('/history/since?date=2026-11-01'));
    await env.browser.get(env.url('/history/since?date=junk'));
    const since = env.prowlarr.callsTo('GET', '/api/v1/history/since');
    expect(since[0]?.query.get('date')).toBe('2026-11-01');
    expect(since[1]?.query.get('date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('étiquettes (usage, suppression), santé, statut sans chemin de démarrage', async () => {
    const env = await open();
    env.prowlarr.on('GET', '/api/v1/tag/detail', [{ id: 1, label: 'films', indexerIds: [3] }]);
    env.prowlarr.on('DELETE', '/api/v1/tag/1');
    env.prowlarr.on('GET', '/api/v1/health', [{ source: 'x', type: 'warning', message: 'm' }]);
    env.prowlarr.on('GET', '/api/v1/system/status', {
      version: '3.0.2',
      branch: 'master',
      startupPath: '/app/prowlarr/bin',
      urlBase: '/prowlarr',
      isDocker: true,
      migrationVersion: 42,
    });
    expect((await env.browser.get(env.url('/tags/detail'))).json()).toEqual([
      {
        id: 1,
        label: 'films',
        indexerIds: [3],
        applicationIds: [],
        notificationIds: [],
        indexerProxyIds: [],
      },
    ]);
    expect((await env.browser.post(env.url('/tags/1/supprimer'))).json()).toEqual({ ok: true });
    expect((await env.browser.get(env.url('/health'))).json()).toHaveLength(1);
    const status = await env.browser.get(env.url('/status'));
    expect(status.json()).toMatchObject({ version: '3.0.2', isDocker: true, migrationVersion: 42 });
    expect(status.body).not.toContain('/app/prowlarr/bin');
  });

  it('journaux : 100 par page, niveau transmis s’il est connu', async () => {
    const env = await open();
    env.prowlarr.on('GET', '/api/v1/log', {
      records: [{ time: '2026-11-21T10:00:00Z', level: 'Warn', logger: 'X', message: 'm' }],
      totalRecords: 1,
    });
    const page = await env.browser.get(env.url('/logs?page=2&level=warn'));
    expect(page.json()).toMatchObject({ page: 2, pageSize: 100, records: [{ level: 'warn' }] });
    expect(env.prowlarr.callsTo('GET', '/api/v1/log')[0]?.query.get('level')).toBe('warn');
    await env.browser.get(env.url('/logs?level=<script>'));
    expect(env.prowlarr.callsTo('GET', '/api/v1/log')[1]?.query.get('level')).toBeNull();
  });

  it('tâches, sauvegardes (création suivie, suppression), mises à jour en conteneur', async () => {
    const env = await open();
    env.prowlarr.on('GET', '/api/v1/system/task', [
      { id: 1, name: 'Backup', taskName: 'Backup', interval: 10080 },
    ]);
    env.prowlarr.on('POST', '/api/v1/command', { id: 12 }, 201);
    env.prowlarr.on('GET', '/api/v1/system/backup', [
      { id: 1, name: 'a.zip', type: 'scheduled', size: 10, time: '2026-11-01T00:00:00Z' },
      { id: 2, name: 'b.zip', type: 'manual', size: 20, time: '2026-11-20T00:00:00Z' },
    ]);
    env.prowlarr.on('DELETE', '/api/v1/system/backup/2');
    env.prowlarr.on('GET', '/api/v1/update', [
      { version: '3.0.3', installed: false, latest: true },
    ]);
    env.prowlarr.on('GET', '/api/v1/system/status', { version: '3.0.2', isDocker: true });

    expect((await env.browser.get(env.url('/tasks'))).json()).toMatchObject([
      { id: 1, taskName: 'Backup', interval: 10080 },
    ]);
    expect(
      (await env.browser.post(env.url('/taches/executer'), { name: 'RssSync' })).json(),
    ).toEqual({ ok: true, cmdId: 12 });
    expect(
      (await env.browser.get(env.url('/backups'))).json<{ id: number }[]>().map((item) => item.id),
    ).toEqual([2, 1]);
    expect((await env.browser.post(env.url('/sauvegardes/creer'))).json()).toEqual({
      ok: true,
      cmdId: 12,
    });
    expect(env.prowlarr.callsTo('POST', '/api/v1/command')[1]?.body).toEqual({ name: 'Backup' });
    expect((await env.browser.post(env.url('/sauvegardes/2/supprimer'))).json()).toEqual({
      ok: true,
    });
    expect((await env.browser.get(env.url('/updates'))).json()).toMatchObject({
      version: '3.0.2',
      docker: true,
      updates: [{ version: '3.0.3', latest: true }],
    });
  });
});
