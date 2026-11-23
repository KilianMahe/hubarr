// SPDX-License-Identifier: AGPL-3.0-or-later
// Base commune Radarr/Sonarr : port de `RadarrClientMultiGetTest` (disjoncteur
// ouvert → lot entier à `null` sans réseau, lot vide) et règles du disjoncteur
// de `multiGet` reprises du code de `RadarrClient::multiGet` ; contrat des
// appels communs (commandes, file d'attente, liste de blocage, étiquettes).

import { MockAgent } from 'undici';
import { afterEach, describe, expect, it } from 'vitest';
import { ArrClient } from '../../../src/integrations/arr/client';
import {
  HttpClient,
  ServiceHealthCache,
  UpstreamError,
  apiKeyHeader,
} from '../../../src/integrations/http';
import type { RadarrPaths } from '../../../src/integrations/radarr/types';
import { ARR_ORIGIN, fakeArr, type FakeArr } from './fake-arr';

let fake: FakeArr | null = null;
let agent: MockAgent | null = null;

afterEach(async () => {
  await fake?.agent.close();
  await agent?.close();
  fake = null;
  agent = null;
});

function arr(): { client: ArrClient<RadarrPaths>; fake: FakeArr } {
  fake = fakeArr();
  return { client: new ArrClient<RadarrPaths>(fake.http), fake };
}

/** Client sur un MockAgent nu, pour des réponses différentes par chemin. */
function bare(): { client: ArrClient<RadarrPaths>; agent: MockAgent; health: ServiceHealthCache } {
  agent = new MockAgent();
  agent.disableNetConnect();
  const health = new ServiceHealthCache();
  const http = new HttpClient({
    service: 'radarr',
    instance: 'radarr',
    baseUrl: ARR_ORIGIN,
    auth: apiKeyHeader('X-Api-Key', 'secret'),
    health,
    dispatcher: agent,
  });
  return { client: new ArrClient<RadarrPaths>(http), agent, health };
}

const refused = () => Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });

describe('multiGet', () => {
  it('disjoncteur ouvert : tout le lot vaut null sans appel réseau', async () => {
    const { client, fake } = arr();
    fake.health.markDown('radarr', 'radarr');
    const result = await client.multiGet({
      status: { path: '/api/v3/system/status' },
      queue: { path: '/api/v3/queue' },
    });
    expect(result).toEqual({ status: null, queue: null });
    expect(fake.calls).toHaveLength(0);
  });

  it('lot vide : objet vide', async () => {
    const { client } = arr();
    await expect(client.multiGet({})).resolves.toEqual({});
  });

  it('renvoie chaque réponse sous son nom, avec paramètres de chemin et requête', async () => {
    const { client, fake } = arr();
    fake.on('GET', '/api/v3/system/status', { version: '7.0.3' });
    fake.on('GET', '/api/v3/movie/12', { id: 12, title: 'Alien' });
    fake.on('GET', '/api/v3/queue', { records: [] });
    const result = await client.multiGet({
      status: { path: '/api/v3/system/status' },
      movie: { path: '/api/v3/movie/{id}', params: { id: 12 } },
      queue: { path: '/api/v3/queue', query: { pageSize: 50, includeMovie: true } },
    });
    expect(result.status?.version).toBe('7.0.3');
    expect(result.movie?.title).toBe('Alien');
    expect(result.queue?.records).toEqual([]);
    const queueCall = fake.calls.find((call) => call.path === '/api/v3/queue');
    expect(queueCall?.query.get('pageSize')).toBe('50');
    expect(queueCall?.query.get('includeMovie')).toBe('true');
  });

  it('une requête en échec vaut null ; une réponse suffit à refermer le disjoncteur', async () => {
    const { client, agent, health } = bare();
    const pool = agent.get(ARR_ORIGIN);
    pool.intercept({ path: '/api/v3/system/status' }).reply(200, { version: '7' });
    pool.intercept({ path: '/api/v3/health' }).replyWithError(refused());
    const result = await client.multiGet({
      status: { path: '/api/v3/system/status' },
      health: { path: '/api/v3/health' },
    });
    expect(result).toEqual({ status: { version: '7' }, health: null });
    expect(health.isDown('radarr', 'radarr')).toBe(false);
  });

  it("n'ouvre le disjoncteur que si tout le lot échoue à la connexion", async () => {
    const { client, agent, health } = bare();
    const pool = agent.get(ARR_ORIGIN);
    pool.intercept({ path: '/api/v3/system/status' }).replyWithError(refused());
    pool.intercept({ path: '/api/v3/health' }).replyWithError(refused());
    const result = await client.multiGet({
      status: { path: '/api/v3/system/status' },
      health: { path: '/api/v3/health' },
    });
    expect(result).toEqual({ status: null, health: null });
    expect(health.isDown('radarr', 'radarr')).toBe(true);
  });

  it('des statuts en erreur seuls ne touchent pas au disjoncteur', async () => {
    const { client, agent, health } = bare();
    health.markDown('radarr', 'other');
    agent.get(ARR_ORIGIN).intercept({ path: '/api/v3/health' }).reply(500, 'boom');
    const result = await client.multiGet({ health: { path: '/api/v3/health' } });
    expect(result).toEqual({ health: null });
    expect(health.isDown('radarr', 'radarr')).toBe(false);
  });

  it('un JSON illisible compte comme une réponse (null, disjoncteur refermé)', async () => {
    const { client, agent, health } = bare();
    const pool = agent.get(ARR_ORIGIN);
    pool.intercept({ path: '/api/v3/system/status' }).reply(200, '<html>');
    pool.intercept({ path: '/api/v3/health' }).replyWithError(refused());
    const result = await client.multiGet({
      status: { path: '/api/v3/system/status' },
      health: { path: '/api/v3/health' },
    });
    expect(result).toEqual({ status: null, health: null });
    expect(health.isDown('radarr', 'radarr')).toBe(false);
  });
});

describe('commandes', () => {
  it('envoie le nom et les champs propres à la commande, renvoie son id', async () => {
    const { client, fake } = arr();
    fake.on('POST', '/api/v3/command', { id: 42, name: 'RefreshMovie' }, 201);
    await expect(client.commandId('RefreshMovie', { movieIds: [3] })).resolves.toBe(42);
    expect(fake.last().body).toEqual({ name: 'RefreshMovie', movieIds: [3] });
    expect(fake.last().headers['x-api-key']).toBe('secret');
  });

  it('le nom ne peut pas être écrasé par les champs en plus', async () => {
    const { client, fake } = arr();
    fake.on('POST', '/api/v3/command', { id: 1 }, 201);
    await client.sendCommand('RssSync', { name: 'Other' });
    expect(fake.last().body).toEqual({ name: 'RssSync' });
  });

  it('statut, liste et annulation', async () => {
    const { client, fake } = arr();
    fake.on('GET', '/api/v3/command/7', { id: 7, status: 'completed' });
    fake.on('GET', '/api/v3/command', [{ id: 7 }]);
    fake.on('DELETE', '/api/v3/command/7');
    await expect(client.commandStatus(7)).resolves.toMatchObject({ status: 'completed' });
    await expect(client.commands()).resolves.toEqual([{ id: 7 }]);
    await client.cancelCommand(7);
    expect(fake.last().method).toBe('DELETE');
  });

  it('un corps vide sur une ressource attendue est une réponse invalide', async () => {
    const { client, fake } = arr();
    fake.on('GET', '/api/v3/command/7');
    const error = await client.commandStatus(7).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect((error as UpstreamError).kind).toBe('invalid_response');
  });

  it('une liste vide côté instance donne un tableau vide', async () => {
    const { client, fake } = arr();
    fake.on('GET', '/api/v3/tag');
    await expect(client.tags()).resolves.toEqual([]);
  });
});

describe("file d'attente et liste de blocage", () => {
  it('suppression : toutes les options en requête, avec les noms de l’API', async () => {
    const { client, fake } = arr();
    fake.on('DELETE', '/api/v3/queue/5');
    await client.deleteQueueItem(5, { removeFromClient: true, blocklist: true });
    const call = fake.last();
    expect(Object.fromEntries(call.query)).toEqual({
      removeFromClient: 'true',
      blocklist: 'true',
      skipRedownload: 'false',
    });
  });

  it('suppression groupée : ids dans le corps, options en requête', async () => {
    const { client, fake } = arr();
    fake.on('DELETE', '/api/v3/queue/bulk');
    await client.bulkDeleteQueue([1, 2], { removeFromClient: true });
    expect(fake.last().body).toEqual({ ids: [1, 2] });
    expect(Object.fromEntries(fake.last().query)).toEqual({
      removeFromClient: 'true',
      blocklist: 'false',
    });
  });

  it('grab unitaire et groupé', async () => {
    const { client, fake } = arr();
    fake.on('POST', '/api/v3/queue/grab/9', {});
    fake.on('POST', '/api/v3/queue/grab/bulk', {});
    await client.grabQueueItem(9);
    await client.bulkGrabQueue([9, 10]);
    expect(fake.last().body).toEqual({ ids: [9, 10] });
  });

  it('message de validation de l’instance remonté dans l’erreur', async () => {
    const { client, fake } = arr();
    fake.on(
      'POST',
      '/api/v3/queue/grab/bulk',
      [{ propertyName: 'Ids', errorMessage: 'must not be empty' }],
      400,
    );
    const error = (await client.bulkGrabQueue([]).catch((e: unknown) => e)) as UpstreamError;
    expect(error.kind).toBe('http');
    expect(error.message).toBe('Ids: must not be empty');
  });

  it('liste de blocage : suppression unitaire et groupée, échec marqué', async () => {
    const { client, fake } = arr();
    fake.on('DELETE', '/api/v3/blocklist/3');
    fake.on('DELETE', '/api/v3/blocklist/bulk');
    fake.on('POST', '/api/v3/history/failed/8');
    await client.deleteBlocklistItem(3);
    await client.bulkDeleteBlocklist([3, 4]);
    expect(fake.last().body).toEqual({ ids: [3, 4] });
    await client.markHistoryFailed(8);
    expect(fake.last()).toMatchObject({ method: 'POST', path: '/api/v3/history/failed/8' });
  });
});

describe('étiquettes et système', () => {
  it('création et renommage', async () => {
    const { client, fake } = arr();
    fake.on('POST', '/api/v3/tag', { id: 1, label: '4k' }, 201);
    fake.on('PUT', '/api/v3/tag/1', { id: 1, label: 'uhd' }, 202);
    await expect(client.createTag('4k')).resolves.toEqual({ id: 1, label: '4k' });
    expect(fake.last().body).toEqual({ label: '4k' });
    await client.updateTag(1, 'uhd');
    expect(fake.last().body).toEqual({ id: 1, label: 'uhd' });
  });

  it('statut, santé, espace disque, profils, dossiers, langues', async () => {
    const { client, fake } = arr();
    fake.on('GET', '/api/v3/system/status', { version: '7.0.3', appName: 'Radarr' });
    fake.on('GET', '/api/v3/health', [{ type: 'warning' }]);
    fake.on('GET', '/api/v3/diskspace', [{ path: '/movies' }]);
    fake.on('GET', '/api/v3/qualityprofile', [{ id: 1, name: 'HD' }]);
    fake.on('GET', '/api/v3/rootfolder', [{ id: 1, path: '/movies' }]);
    fake.on('GET', '/api/v3/language', [{ id: 1, name: 'English' }]);
    await expect(client.systemStatus()).resolves.toMatchObject({ version: '7.0.3' });
    await expect(client.systemHealth()).resolves.toHaveLength(1);
    await expect(client.diskSpace()).resolves.toHaveLength(1);
    await expect(client.qualityProfiles()).resolves.toEqual([{ id: 1, name: 'HD' }]);
    await expect(client.rootFolders()).resolves.toHaveLength(1);
    await expect(client.languages()).resolves.toHaveLength(1);
  });
});
