// SPDX-License-Identifier: AGPL-3.0-or-later
// Prowlarr, indexeurs (P3c.1) : page, CRUD, test, bascule, statistiques,
// catégories, actions groupées, test global, historique, profils,
// étiquettes, commandes ; secrets masqués et restitués ; gardes.

import {
  ARR_SECRET_MASK,
  type ArrCommandStatus,
  type ProwlarrOverview,
  type ProwlarrTestAll,
  type Provider,
} from '@hubarr/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { applyServicePatch } from '../../../src/modules/services/config';
import { prowlarrEnv, rawIndexer, type ProwlarrEnv } from './prowlarr-env';

let env: ProwlarrEnv;
afterEach(async () => {
  await env.close();
});

describe('page des indexeurs (n° 238)', () => {
  it('indexeurs normalisés avec statut et compteurs, tuiles, santé, applications', async () => {
    env = await prowlarrEnv();
    env.prowlarr.on('GET', '/api/v1/indexer', [
      rawIndexer(1),
      rawIndexer(2, { protocol: 'usenet', enable: false, privacy: 'private' }),
      rawIndexer(3, { capabilities: null }),
    ]);
    env.prowlarr.on('GET', '/api/v1/indexerstatus', [
      {
        indexerId: 3,
        disabledTill: '2026-11-22T00:00:00Z',
        mostRecentFailure: '2026-11-21T10:00:00Z',
      },
      { indexerId: 99, disabledTill: null },
    ]);
    env.prowlarr.on('GET', '/api/v1/indexerstats', {
      indexers: [
        {
          indexerId: 1,
          indexerName: 'Indexer 1',
          numberOfQueries: 12,
          numberOfGrabs: 3,
          numberOfFailedQueries: 2,
          numberOfFailedGrabs: 1,
        },
      ],
    });
    env.prowlarr.on('GET', '/api/v1/health', [
      { source: 'IndexerStatusCheck', type: 'warning', message: 'Indexers unavailable' },
      { source: 'x', type: 'error' },
    ]);
    env.prowlarr.on('GET', '/api/v1/applications', [
      {
        id: 1,
        name: 'Radarr',
        implementationName: 'Radarr',
        fields: [{ name: 'apiKey', value: 'k' }],
      },
    ]);

    const response = await env.browser.get(env.url());
    expect(response.statusCode).toBe(200);
    const page = response.json<ProwlarrOverview>();
    expect(page.indexers.map((indexer) => indexer.id)).toEqual([1, 2, 3]);
    expect(page.indexers[0]).toEqual({
      id: 1,
      name: 'Indexer 1',
      definitionName: 'def1',
      description: null,
      language: null,
      protocol: 'torrent',
      privacy: 'public',
      enabled: true,
      supportsRss: true,
      supportsSearch: true,
      appProfileId: 1,
      priority: 25,
      tags: [],
      added: '2026-01-02T03:04:05Z',
      categoryCount: 2,
      status: null,
      counters: { queries: 12, grabs: 3, failures: 3 },
    });
    expect(page.indexers[1]?.counters).toBeNull();
    expect(page.indexers[2]).toMatchObject({
      categoryCount: 0,
      status: { disabledTill: '2026-11-22T00:00:00Z', mostRecentFailure: '2026-11-21T10:00:00Z' },
    });
    // « En erreur » : indexeurs listés ayant un statut d'échec (l'indexeur 99 n'existe plus).
    expect(page.totals).toEqual({ total: 3, enabled: 2, failing: 1, torrent: 2, usenet: 1 });
    expect(page.health).toEqual([
      { source: 'IndexerStatusCheck', type: 'warning', message: 'Indexers unavailable' },
    ]);
    expect(page.applications).toEqual([{ id: 1, name: 'Radarr', implementationName: 'Radarr' }]);
    // Aucun réglage ni secret des indexeurs ou des applications dans la page.
    expect(response.body).not.toContain('secret-1');
    expect(env.prowlarr.calls[0]?.query.get('apikey')).toBeNull();
  });

  it('statistiques, santé et applications en échec : page affichée sans elles', async () => {
    env = await prowlarrEnv();
    env.prowlarr.on('GET', '/api/v1/indexer', [rawIndexer(1)]);
    env.prowlarr.on('GET', '/api/v1/indexerstats', { message: 'boom' }, 500);
    const page = (await env.browser.get(env.url())).json<ProwlarrOverview>();
    expect(page.indexers[0]?.counters).toBeNull();
    expect(page.health).toEqual([]);
    expect(page.applications).toEqual([]);
  });

  it('gardes : non configuré → 409, utilisateur simple → 403, injoignable → 503', async () => {
    env = await prowlarrEnv({ configured: false });
    const missing = await env.browser.get(env.url());
    expect(missing.statusCode).toBe(409);
    expect(missing.json()).toMatchObject({ code: 'SERVICE_NOT_CONFIGURED', service: 'prowlarr' });
    await env.close();

    env = await prowlarrEnv({ role: 'user' });
    expect((await env.browser.get(env.url())).statusCode).toBe(403);
    await env.close();

    env = await prowlarrEnv();
    env.agent
      .get('http://down.test')
      .intercept({ path: () => true, method: () => true })
      .replyWithError(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))
      .persist();
    applyServicePatch(env.database.db, 'prowlarr', { url: 'http://down.test' });
    const down = await env.browser.get(env.url());
    expect(down.statusCode).toBe(503);
    expect(down.json()).toMatchObject({ code: 'SERVICE_UNREACHABLE' });
  });
});

describe('CRUD des indexeurs', () => {
  it('modèles et indexeur brut sans secret (n° 239, 240) ; indexeur absent → 404', async () => {
    env = await prowlarrEnv();
    env.prowlarr.on('GET', '/api/v1/indexer/schema', [rawIndexer(0, { id: 0 })]);
    env.prowlarr.on('GET', '/api/v1/indexer/1', rawIndexer(1));
    const schema = (await env.browser.get(env.url('/indexer/schema'))).json<Provider[]>();
    expect(schema).toHaveLength(1);
    expect(JSON.stringify(schema)).not.toContain('secret-0');
    const indexer = (await env.browser.get(env.url('/indexer/1'))).json<Provider>();
    expect(indexer.fields?.find((field) => field.name === 'password')?.value).toBe(ARR_SECRET_MASK);
    expect(indexer.fields?.find((field) => field.name === 'username')?.value).toBe('me');
    expect(indexer.indexerUrls).toEqual(['https://indexer1.example/']);
    expect((await env.browser.get(env.url('/indexer/7'))).statusCode).toBe(404);
  });

  it('ajout (n° 241) : corps transmis, réponse masquée ; refus de Prowlarr → 502 avec son message', async () => {
    env = await prowlarrEnv();
    env.prowlarr.onCall('POST', '/api/v1/indexer', (call) => ({
      status: 201,
      body: { ...(call.body as object), id: 5 },
    }));
    const body = {
      name: 'YTS',
      implementation: 'Cardigann',
      configContract: 'CardigannSettings',
      definitionName: 'yts',
      enable: true,
      appProfileId: 1,
      priority: 25,
      tags: [2],
      fields: [
        { name: 'definitionFile', value: 'yts' },
        { name: 'password', value: 'pw' },
      ],
    };
    const created = await env.browser.post(env.url('/indexer/add'), body);
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ id: 5, name: 'YTS', definitionName: 'yts' });
    expect(env.prowlarr.callsTo('POST', '/api/v1/indexer')[0]?.body).toEqual(body);

    env.prowlarr.on(
      'POST',
      '/api/v1/indexer',
      [{ propertyName: 'BaseUrl', errorMessage: 'Invalid URL' }],
      400,
    );
    const refused = await env.browser.post(env.url('/indexer/add'), body);
    expect(refused.statusCode).toBe(502);
    expect(refused.json()).toMatchObject({
      code: 'UPSTREAM_ERROR',
      message: 'BaseUrl: Invalid URL',
    });
    expect(
      (await env.browser.post(env.url('/indexer/add'), { ...body, name: ' ' })).statusCode,
    ).toBe(400);
  });

  it('modification (n° 242) : secret masqué restitué depuis Prowlarr, id du chemin', async () => {
    env = await prowlarrEnv();
    env.prowlarr.on('GET', '/api/v1/indexer/1', rawIndexer(1));
    env.prowlarr.onCall('PUT', '/api/v1/indexer/1', (call) => ({ status: 202, body: call.body }));
    const response = await env.browser.post(env.url('/indexer/1/update'), {
      id: 42,
      name: 'Renamed',
      implementation: 'Cardigann',
      configContract: 'CardigannSettings',
      fields: [
        { name: 'baseUrl', value: 'https://mirror.example/' },
        { name: 'password', value: ARR_SECRET_MASK },
      ],
    });
    expect(response.statusCode).toBe(200);
    const sent = env.prowlarr.callsTo('PUT', '/api/v1/indexer/1')[0]?.body as Provider;
    expect(sent.id).toBe(1);
    expect(sent.fields).toEqual([
      { name: 'baseUrl', value: 'https://mirror.example/' },
      { name: 'password', value: 'secret-1' },
    ]);
    expect(response.body).not.toContain('secret-1');
  });

  it('suppression (n° 243) et suppression groupée (n° 290)', async () => {
    env = await prowlarrEnv();
    env.prowlarr.on('DELETE', '/api/v1/indexer/3');
    env.prowlarr.on('DELETE', '/api/v1/indexer/bulk');
    expect((await env.browser.post(env.url('/indexer/3/delete'))).json()).toEqual({ ok: true });
    expect(
      (await env.browser.post(env.url('/indexer/bulk/delete'), { ids: [1, 2] })).json(),
    ).toEqual({ ok: true });
    expect(env.prowlarr.callsTo('DELETE', '/api/v1/indexer/bulk')[0]?.body).toEqual({
      ids: [1, 2],
    });
    expect((await env.browser.post(env.url('/indexer/bulk/delete'), { ids: [] })).statusCode).toBe(
      400,
    );
  });

  it('test (n° 244) : succès, refus en bilan, secret restitué par id', async () => {
    env = await prowlarrEnv();
    env.prowlarr.on('GET', '/api/v1/indexer/1', rawIndexer(1));
    env.prowlarr.on('POST', '/api/v1/indexer/test');
    const payload = {
      id: 1,
      name: 'Indexer 1',
      implementation: 'Cardigann',
      configContract: 'CardigannSettings',
      fields: [{ name: 'password', value: ARR_SECRET_MASK }],
    };
    expect((await env.browser.post(env.url('/indexer/test'), payload)).json()).toEqual({
      ok: true,
      message: null,
    });
    expect(env.prowlarr.callsTo('POST', '/api/v1/indexer/test')[0]?.body).toMatchObject({
      fields: [{ name: 'password', value: 'secret-1' }],
    });
    env.prowlarr.on(
      'POST',
      '/api/v1/indexer/test',
      [{ propertyName: '', errorMessage: 'Unable to connect to indexer' }],
      400,
    );
    const refused = await env.browser.post(env.url('/indexer/test'), payload);
    expect(refused.statusCode).toBe(200);
    expect(refused.json()).toEqual({ ok: false, message: 'Unable to connect to indexer' });
  });

  it('bascule (n° 245) : indexeur complet renvoyé avec `enable` inversé', async () => {
    env = await prowlarrEnv();
    env.prowlarr.on('GET', '/api/v1/indexer/1', rawIndexer(1));
    env.prowlarr.onCall('PUT', '/api/v1/indexer/1', (call) => ({ status: 202, body: call.body }));
    const response = await env.browser.post(env.url('/indexer/1/toggle'));
    expect(response.json()).toEqual({ ok: true, enabled: false });
    const sent = env.prowlarr.callsTo('PUT', '/api/v1/indexer/1')[0]?.body as Provider;
    expect(sent).toMatchObject({ id: 1, enable: false, name: 'Indexer 1' });
    // Les secrets ne quittent pas le serveur : ils repartent tels quels vers Prowlarr.
    expect(sent.fields?.find((field) => field.name === 'password')?.value).toBe('secret-1');
    expect((await env.browser.post(env.url('/indexer/8/toggle'))).statusCode).toBe(404);
  });
});

describe('statistiques, catégories, actions groupées, test global', () => {
  it('statistiques (n° 287) et catégories par défaut (n° 288) normalisées', async () => {
    env = await prowlarrEnv();
    env.prowlarr.on('GET', '/api/v1/indexerstats', {
      indexers: [{ indexerId: 1, indexerName: 'A', numberOfQueries: 4 }],
      userAgents: [{ userAgent: 'Radarr/5', numberOfQueries: 3, numberOfGrabs: 1 }],
      hosts: [{ host: 'radarr', numberOfQueries: 3 }],
    });
    env.prowlarr.on('GET', '/api/v1/indexer/categories', [
      { id: 2000, name: 'Movies', subCategories: [{ id: 2040, name: 'Movies/HD' }] },
      { name: 'sans id' },
    ]);
    const stats = (await env.browser.get(env.url('/indexer/stats'))).json<{
      indexers: { numberOfQueries: number; numberOfGrabs: number }[];
      userAgents: unknown[];
      hosts: unknown[];
    }>();
    expect(stats.indexers[0]).toMatchObject({ indexerId: 1, numberOfQueries: 4, numberOfGrabs: 0 });
    expect(stats.userAgents).toEqual([{ name: 'Radarr/5', queries: 3, grabs: 1 }]);
    expect(stats.hosts).toEqual([{ name: 'radarr', queries: 3, grabs: 0 }]);
    expect((await env.browser.get(env.url('/indexer/categories'))).json()).toEqual([
      { id: 2000, name: 'Movies', subCategories: [{ id: 2040, name: 'Movies/HD' }] },
    ]);
  });

  it('modification groupée (n° 289) : seuls les champs fournis partent, étiquettes avec leur mode', async () => {
    env = await prowlarrEnv();
    env.prowlarr.on('PUT', '/api/v1/indexer/bulk', []);
    const ok = await env.browser.post(env.url('/indexer/bulk/update'), {
      ids: [1, 2],
      enable: false,
      priority: 10,
    });
    expect(ok.json()).toEqual({ ok: true });
    expect(env.prowlarr.callsTo('PUT', '/api/v1/indexer/bulk')[0]?.body).toEqual({
      ids: [1, 2],
      enable: false,
      priority: 10,
    });
    await env.browser.post(env.url('/indexer/bulk/update'), { ids: [3], tags: [4] });
    expect(env.prowlarr.callsTo('PUT', '/api/v1/indexer/bulk')[1]?.body).toEqual({
      ids: [3],
      tags: [4],
      applyTags: 'add',
    });
    const invalid = await env.browser.post(env.url('/indexer/bulk/update'), {
      ids: [1],
      priority: 99,
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('test global (n° 291) : 200 tous valides, 400 avec les échecs lus', async () => {
    env = await prowlarrEnv();
    env.prowlarr.on('POST', '/api/v1/indexer/testall', [
      { id: 1, isValid: true, validationFailures: [] },
    ]);
    expect((await env.browser.post(env.url('/indexer/testall'))).json()).toEqual({
      ok: true,
      results: [{ id: 1, isValid: true, message: null }],
    });
    env.prowlarr.on(
      'POST',
      '/api/v1/indexer/testall',
      [
        { id: 1, isValid: true, validationFailures: [] },
        {
          id: 2,
          isValid: false,
          validationFailures: [{ propertyName: 'BaseUrl', errorMessage: 'Unable to connect' }],
        },
      ],
      400,
    );
    const failed = await env.browser.post(env.url('/indexer/testall'));
    expect(failed.statusCode).toBe(200);
    expect(failed.json<ProwlarrTestAll>()).toEqual({
      ok: false,
      results: [
        { id: 1, isValid: true, message: null },
        { id: 2, isValid: false, message: 'BaseUrl: Unable to connect' },
      ],
    });
  });
});

describe('historique, profils, étiquettes, commandes', () => {
  it('historique d’un indexeur (n° 249) : 30 derniers, plus récents en tête', async () => {
    env = await prowlarrEnv();
    env.prowlarr.on('GET', '/api/v1/history/indexer', [
      { id: 1, date: '2026-11-20T10:00:00Z', eventType: 'indexerRss', successful: true, data: {} },
      {
        id: 2,
        date: '2026-11-21T10:00:00Z',
        eventType: 'indexerQuery',
        successful: true,
        data: { query: 'dune', source: 'Radarr' },
      },
    ]);
    const history = (await env.browser.get(env.url('/indexer/4/history'))).json<unknown>();
    expect(history).toEqual([
      {
        id: 2,
        date: '2026-11-21T10:00:00Z',
        eventType: 'indexerQuery',
        successful: true,
        query: 'dune',
        source: 'Radarr',
      },
      {
        id: 1,
        date: '2026-11-20T10:00:00Z',
        eventType: 'indexerRss',
        successful: true,
        query: null,
        source: null,
      },
    ]);
    const call = env.prowlarr.callsTo('GET', '/api/v1/history/indexer')[0];
    expect(call?.query.get('indexerId')).toBe('4');
    expect(call?.query.get('limit')).toBe('30');
  });

  it('profils d’application (n° 302), étiquettes (n° 300) et création (n° 301)', async () => {
    env = await prowlarrEnv();
    env.prowlarr.on('GET', '/api/v1/appprofile', [
      {
        id: 1,
        name: 'Standard',
        enableRss: true,
        enableAutomaticSearch: true,
        enableInteractiveSearch: true,
        minimumSeeders: 1,
      },
    ]);
    env.prowlarr.on('GET', '/api/v1/tag', [{ id: 2, label: 'films' }]);
    env.prowlarr.onCall('POST', '/api/v1/tag', (call) => ({
      status: 201,
      body: { id: 3, ...(call.body as object) },
    }));
    expect((await env.browser.get(env.url('/app-profiles'))).json()).toEqual([
      {
        id: 1,
        name: 'Standard',
        enableRss: true,
        enableAutomaticSearch: true,
        enableInteractiveSearch: true,
        minimumSeeders: 1,
      },
    ]);
    expect((await env.browser.get(env.url('/tags'))).json()).toEqual([{ id: 2, label: 'films' }]);
    expect((await env.browser.post(env.url('/tag/create'), { label: ' séries ' })).json()).toEqual({
      id: 3,
      label: 'séries',
    });
    expect((await env.browser.post(env.url('/tag/create'), { label: '' })).statusCode).toBe(400);
  });

  it('commande (n° 306) et son état (n° 292) ; commande purgée → `unknown`', async () => {
    env = await prowlarrEnv();
    env.prowlarr.on('POST', '/api/v1/command', { id: 17, name: 'ApplicationIndexerSync' }, 201);
    env.prowlarr.on('GET', '/api/v1/command/17', {
      id: 17,
      name: 'ApplicationIndexerSync',
      status: 'completed',
      queued: '2026-11-21T10:00:00Z',
    });
    expect(
      (await env.browser.post(env.url('/command'), { name: 'ApplicationIndexerSync' })).json(),
    ).toEqual({ ok: true, cmdId: 17 });
    expect(env.prowlarr.callsTo('POST', '/api/v1/command')[0]?.body).toEqual({
      name: 'ApplicationIndexerSync',
    });
    const status = (await env.browser.get(env.url('/command/17'))).json<ArrCommandStatus>();
    expect(status).toMatchObject({ id: 17, status: 'completed', queued: '2026-11-21T10:00:00Z' });
    expect((await env.browser.get(env.url('/command/18'))).json()).toMatchObject({
      id: 18,
      status: 'unknown',
    });
    expect((await env.browser.post(env.url('/command'), { name: 'rm -rf' })).statusCode).toBe(400);
  });
});

describe('droits d’un compte non admin', () => {
  it('lecture : page et fiche d’un indexeur ; modification refusée', async () => {
    env = await prowlarrEnv({ role: 'user', permissions: { prowlarr: 'read' } });
    env.prowlarr.on('GET', '/api/v1/indexer/1', rawIndexer(1));
    env.prowlarr.on('GET', '/api/v1/indexer/1/history', []);
    const indexer = await env.browser.get(env.url('/indexer/1'));
    expect(indexer.statusCode).toBe(200);
    expect(indexer.json<Provider>().fields?.find((f) => f.name === 'password')?.value).toBe(
      ARR_SECRET_MASK,
    );
    expect((await env.browser.post(env.url('/indexer/1/delete'), {})).json()).toMatchObject({
      code: 'FORBIDDEN',
      details: { level: 'write' },
    });
    expect(env.prowlarr.callsTo('DELETE', '/api/v1/indexer/1')).toHaveLength(0);
  });

  it('écriture : synchronisation des applications seule ; autre commande réservée aux admins', async () => {
    env = await prowlarrEnv({ role: 'user', permissions: { prowlarr: 'write' } });
    env.prowlarr.on('POST', '/api/v1/command', { id: 3, name: 'ApplicationIndexerSync' }, 201);
    expect(
      (await env.browser.post(env.url('/command'), { name: 'ApplicationIndexerSync' })).statusCode,
    ).toBe(200);
    const backup = await env.browser.post(env.url('/command'), { name: 'Backup' });
    expect(backup.statusCode).toBe(403);
    expect(backup.json()).toMatchObject({ code: 'FORBIDDEN', service: 'prowlarr' });
    expect(env.prowlarr.callsTo('POST', '/api/v1/command')).toHaveLength(1);
  });
});
