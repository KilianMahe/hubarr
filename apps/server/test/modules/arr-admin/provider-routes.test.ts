// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration *arr, intégrations (P3b.3) : indexeurs, clients, listes
// d'import, notifications, métadonnées, exclusions — pour Radarr et Sonarr ;
// secrets masqués et restitués.

import { ARR_KINDS, ARR_SECRET_MASK, type ExclusionPage, type Provider } from '@hubarr/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { adminEnv, type AdminEnv } from './admin-env';

const indexer = (overrides: Record<string, unknown> = {}) => ({
  id: 4,
  name: 'NZBgeek',
  implementation: 'Newznab',
  configContract: 'NewznabSettings',
  enableRss: true,
  fields: [
    { name: 'baseUrl', value: 'https://api.nzbgeek.info', type: 'textbox' },
    { name: 'apiKey', value: 'secret-key', type: 'textbox', privacy: 'apiKey' },
    { name: 'categories', value: [2000, 2040], type: 'select' },
  ],
  ...overrides,
});

describe.each(ARR_KINDS)('intégrations (%s)', (kind) => {
  let env: AdminEnv;
  beforeEach(async () => {
    env = await adminEnv(kind);
  });
  afterEach(async () => {
    await env.close();
  });

  it('indexeurs : liste et modèles sans secret, champs propres conservés', async () => {
    env.upstream.on('GET', '/api/v3/indexer', [indexer()]);
    env.upstream.on('GET', '/api/v3/indexer/schema', [
      { implementation: 'Torznab', fields: [{ name: 'apiKey', value: 'x', privacy: 'apiKey' }] },
    ]);
    const list = (await env.browser.get(env.url('/indexeurs'))).json<Provider[]>();
    expect(list[0]?.fields?.find((field) => field.name === 'apiKey')?.value).toBe(ARR_SECRET_MASK);
    expect(list[0]?.enableRss).toBe(true);
    expect(JSON.stringify(list)).not.toContain('secret-key');
    const schema = (await env.browser.get(env.url('/indexeurs/schema'))).json<Provider[]>();
    expect(schema[0]?.fields?.[0]?.value).toBe(ARR_SECRET_MASK);
  });

  it('modification : secret masqué restitué depuis l’instance, réponse masquée', async () => {
    env.upstream.on('GET', '/api/v3/indexer/4', indexer());
    env.upstream.onCall('PUT', '/api/v3/indexer/4', (call) => ({ status: 202, body: call.body }));
    const payload = indexer({
      id: 99,
      name: 'Geek',
      fields: [
        { name: 'baseUrl', value: 'https://new' },
        { name: 'apiKey', value: ARR_SECRET_MASK },
      ],
    });
    const response = await env.browser.post(env.url('/indexeurs/4/modifier'), payload);
    expect(response.statusCode).toBe(200);
    const sent = env.upstream.callsTo('PUT', '/api/v3/indexer/4')[0]?.body as Provider;
    expect(sent.id).toBe(4);
    expect(sent.fields).toEqual([
      { name: 'baseUrl', value: 'https://new' },
      { name: 'apiKey', value: 'secret-key' },
    ]);
    expect(JSON.stringify(response.json())).not.toContain('secret-key');
  });

  it('ajout : corps transmis ; nom obligatoire', async () => {
    env.upstream.onCall('POST', '/api/v3/downloadclient', (call) => ({
      status: 201,
      body: { ...(call.body as object), id: 8 },
    }));
    const body = {
      name: 'qBit',
      implementation: 'QBittorrent',
      configContract: 'QBittorrentSettings',
      enable: true,
      fields: [{ name: 'password', value: 'pw' }],
    };
    const created = await env.browser.post(env.url('/clients-telechargement/ajouter'), body);
    expect(created.json()).toMatchObject({ id: 8, name: 'qBit', enable: true });
    expect(env.upstream.callsTo('POST', '/api/v3/downloadclient')[0]?.body).toEqual(body);
    const unnamed = await env.browser.post(env.url('/clients-telechargement/ajouter'), {
      ...body,
      name: '',
    });
    expect(unnamed.statusCode).toBe(400);
    expect(JSON.stringify(unnamed.json())).toContain('schema_modal.error_name_required');
  });

  it('test : succès, refus de validation en bilan, secret restitué pour une ressource existante', async () => {
    env.upstream.on('GET', '/api/v3/indexer/4', indexer());
    env.upstream.on('POST', '/api/v3/indexer/test');
    const ok = await env.browser.post(env.url('/indexeurs/tester'), {
      ...indexer({ fields: [{ name: 'apiKey', value: ARR_SECRET_MASK }] }),
    });
    expect(ok.json()).toEqual({ ok: true, message: null });
    expect(env.upstream.callsTo('POST', '/api/v3/indexer/test')[0]?.body).toMatchObject({
      fields: [{ name: 'apiKey', value: 'secret-key' }],
    });
    env.upstream.on(
      'POST',
      '/api/v3/downloadclient/test',
      [{ propertyName: 'Host', errorMessage: 'Unable to connect' }],
      400,
    );
    const refused = await env.browser.post(env.url('/clients-telechargement/tester'), {
      name: 'x',
      implementation: 'QBittorrent',
      configContract: 'QBittorrentSettings',
      fields: [],
    });
    expect(refused.statusCode).toBe(200);
    expect(refused.json()).toEqual({ ok: false, message: 'Host: Unable to connect' });
  });

  it('test d’un serveur en erreur 500 → erreur commune', async () => {
    env.upstream.on('POST', '/api/v3/notification/test', { message: 'boom' }, 500);
    const response = await env.browser.post(env.url('/notifications/tester-payload'), {
      name: 'x',
      implementation: 'Discord',
      configContract: 'DiscordSettings',
      fields: [],
    });
    expect(response.statusCode).toBe(502);
  });

  it('notification existante testée avec sa ressource complète (id seul refusé dans l’original)', async () => {
    const notification = {
      id: 3,
      name: 'Discord',
      implementation: 'Discord',
      configContract: 'DiscordSettings',
      onGrab: true,
      fields: [],
    };
    env.upstream.on('GET', '/api/v3/notification/3', notification);
    env.upstream.on('POST', '/api/v3/notification/test');
    const response = await env.browser.post(env.url('/notifications/3/tester'));
    expect(response.json()).toEqual({ ok: true, message: null });
    expect(env.upstream.callsTo('POST', '/api/v3/notification/test')[0]?.body).toEqual(
      notification,
    );
  });

  it('listes d’import : pas de route de test ; suppression', async () => {
    env.upstream.on('DELETE', '/api/v3/importlist/2');
    expect((await env.browser.post(env.url('/listes-import/2/supprimer'))).json()).toEqual({
      ok: true,
    });
    const test = await env.browser.post(env.url('/listes-import/tester'), {});
    expect(test.statusCode).toBe(404);
  });

  it('métadonnées : liste, modification, pas d’ajout ; modèles et réglages selon le service', async () => {
    env.upstream.on('GET', '/api/v3/metadata', [
      {
        id: 1,
        name: 'Kodi',
        implementation: 'XbmcMetadata',
        configContract: 'XbmcMetadataSettings',
        enable: false,
        fields: [],
      },
    ]);
    env.upstream.onCall('PUT', '/api/v3/metadata/1', (call) => ({ status: 202, body: call.body }));
    expect((await env.browser.get(env.url('/metadata'))).json()).toHaveLength(1);
    const toggled = await env.browser.post(env.url('/metadata/1/modifier'), {
      name: 'Kodi',
      implementation: 'XbmcMetadata',
      configContract: 'XbmcMetadataSettings',
      enable: true,
      fields: [],
    });
    expect(toggled.json()).toMatchObject({ id: 1, enable: true });
    expect((await env.browser.post(env.url('/metadata/ajouter'), {})).statusCode).toBe(404);
    env.upstream.on('GET', '/api/v3/metadata/schema', []);
    env.upstream.on('GET', '/api/v3/config/metadata', { id: 1, certificationCountry: 'us' });
    env.upstream.onCall('PUT', '/api/v3/config/metadata/1', (call) => ({
      status: 202,
      body: call.body,
    }));
    const expected = kind === 'radarr' ? 200 : 404;
    expect((await env.browser.get(env.url('/metadata/schema'))).statusCode).toBe(expected);
    expect((await env.browser.get(env.url('/metadata/config'))).statusCode).toBe(expected);
    const saved = await env.browser.post(env.url('/metadata/config/sauvegarder'), {
      certificationCountry: 'fr',
    });
    expect(saved.statusCode).toBe(expected);
    if (kind === 'radarr') expect(saved.json()).toEqual({ id: 1, certificationCountry: 'fr' });
  });

  it('exclusions : page normalisée, tri par titre, 50 par page', async () => {
    const path = kind === 'radarr' ? '/api/v3/exclusions' : '/api/v3/importlistexclusion';
    env.upstream.on('GET', `${path}/paged`, {
      totalRecords: 51,
      records:
        kind === 'radarr'
          ? [{ id: 1, tmdbId: 603, movieTitle: 'The Matrix', movieYear: 1999 }]
          : [{ id: 1, tvdbId: 81189, title: 'Breaking Bad' }],
    });
    const page = (await env.browser.get(env.url('/exclusions?page=2'))).json<ExclusionPage>();
    expect(page).toEqual({
      records: [
        kind === 'radarr'
          ? { id: 1, externalId: 603, title: 'The Matrix', year: 1999 }
          : { id: 1, externalId: 81189, title: 'Breaking Bad', year: null },
      ],
      totalRecords: 51,
      page: 2,
      pageSize: 50,
    });
    const query = env.upstream.callsTo('GET', `${path}/paged`)[0]?.query;
    expect(query?.get('page')).toBe('2');
    expect(query?.get('sortKey')).toBe(kind === 'radarr' ? 'movieTitle' : 'title');
  });

  it('exclusions : ajout (`movieYear` pour Radarr), suppression, suppression groupée', async () => {
    const path = kind === 'radarr' ? '/api/v3/exclusions' : '/api/v3/importlistexclusion';
    env.upstream.onCall('POST', path, (call) => ({
      status: 201,
      body: { ...(call.body as object), id: 7 },
    }));
    env.upstream.on('DELETE', `${path}/7`);
    env.upstream.on('DELETE', `${path}/bulk`);
    const added = await env.browser.post(env.url('/exclusions/ajouter'), {
      externalId: 603,
      title: 'The Matrix',
      year: 1999,
    });
    expect(env.upstream.callsTo('POST', path)[0]?.body).toEqual(
      kind === 'radarr'
        ? { tmdbId: 603, movieTitle: 'The Matrix', movieYear: 1999 }
        : { tvdbId: 603, title: 'The Matrix' },
    );
    expect(added.json()).toMatchObject({ id: 7, externalId: 603, title: 'The Matrix' });
    await env.browser.post(env.url('/exclusions/7/supprimer'));
    await env.browser.post(env.url('/exclusions/bulk-supprimer'), { ids: [7, 8] });
    expect(env.upstream.callsTo('DELETE', `${path}/bulk`)[0]?.body).toEqual({ ids: [7, 8] });
    const empty = await env.browser.post(env.url('/exclusions/bulk-supprimer'), { ids: [] });
    expect(empty.statusCode).toBe(400);
  });
});
