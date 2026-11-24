// SPDX-License-Identifier: AGPL-3.0-or-later
// Client de base : port de `ClientCircuitBreakerTest` (court-circuit immédiat,
// disjoncteur jamais ouvert sans échec observé) et comportements communs des
// clients d'origine (délais, erreurs, sonde).

import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HttpClient,
  ServiceHealthCache,
  UpstreamError,
  apiKeyHeader,
  apiKeyQuery,
  basicAuth,
  bearer,
  combineAuth,
  cookieSession,
  readSetCookie,
  transmissionSessionId,
} from '../../../src/integrations/http';
import { toApiError } from '../../../src/http/errors';
import { createClock } from '../../helpers';

const ORIGIN = 'http://radarr.test:7878';

let agent: MockAgent;
let health: ServiceHealthCache;

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  health = new ServiceHealthCache();
});

afterEach(async () => {
  await agent.close();
});

function client(overrides: Partial<ConstructorParameters<typeof HttpClient>[0]> = {}): HttpClient {
  return new HttpClient({
    service: 'radarr',
    instance: 'radarr-1',
    baseUrl: `${ORIGIN}/`,
    auth: apiKeyHeader('X-Api-Key', 'secret'),
    health,
    dispatcher: agent,
    ...overrides,
  });
}

async function rejection(promise: Promise<unknown>): Promise<UpstreamError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof UpstreamError) return error;
    throw error;
  }
  throw new Error('aucune erreur levée');
}

describe('HttpClient', () => {
  it('envoie la clé d’API et décode le JSON', async () => {
    agent
      .get(ORIGIN)
      .intercept({
        path: '/api/v3/system/status',
        method: 'GET',
        headers: { 'x-api-key': 'secret', accept: 'application/json' },
      })
      .reply(200, { version: '5.0' });
    await expect(client().get('/api/v3/system/status')).resolves.toEqual({ version: '5.0' });
  });

  it('sérialise la requête et le corps JSON', async () => {
    agent
      .get(ORIGIN)
      .intercept({
        path: '/api/v3/movie?tags=1&tags=2&monitored=true',
        method: 'POST',
        body: '{"title":"x"}',
        headers: { 'content-type': 'application/json' },
      })
      .reply(201, '');
    await expect(
      client().post(
        '/api/v3/movie',
        { title: 'x' },
        { query: { tags: [1, 2], monitored: true, none: undefined } },
      ),
    ).resolves.toBeNull();
  });

  it('court-circuite aussitôt un service marqué injoignable, sans appel réseau', async () => {
    health.markDown('radarr', 'radarr-1');
    const started = performance.now();
    const error = await rejection(client().get('/api/v3/movie'));
    expect(performance.now() - started).toBeLessThan(100);
    expect(error.kind).toBe('circuit_open');
    expect(error.unreachable).toBe(true);
  });

  it("n'ouvre jamais le disjoncteur sans échec observé, et pas pour une autre instance", async () => {
    health.markDown('radarr', 'radarr-4k');
    agent.get(ORIGIN).intercept({ path: '/api/v3/movie' }).reply(200, []);
    await expect(client().get('/api/v3/movie')).resolves.toEqual([]);
  });

  it('un échec de connexion ouvre le disjoncteur de l’instance', async () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    agent.get(ORIGIN).intercept({ path: '/api/v3/movie' }).replyWithError(refused);
    const error = await rejection(client().get('/api/v3/movie'));
    expect(error.kind).toBe('network');
    expect(error.info.networkCode).toBe('ECONNREFUSED');
    expect(health.isDown('radarr', 'radarr-1')).toBe(true);
    expect(health.isDown('radarr')).toBe(false);
  });

  it('une réponse trop lente après connexion ne marque pas le service injoignable', async () => {
    agent.get(ORIGIN).intercept({ path: '/api/v3/movie' }).reply(200, []).delay(200);
    const error = await rejection(client().get('/api/v3/movie', undefined, { timeoutMs: 50 }));
    expect(error.kind).toBe('timeout');
    expect(health.isDown('radarr', 'radarr-1')).toBe(false);
  });

  it('une réponse en erreur garde méthode, chemin, statut et message extrait', async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: '/api/v3/qualityprofile/1', method: 'DELETE' })
      .reply(500, { message: 'QualityProfile [1] is in use.' });
    const error = await rejection(client().delete('/api/v3/qualityprofile/1'));
    expect(error.kind).toBe('http');
    expect(error.info).toMatchObject({
      service: 'radarr',
      instance: 'radarr-1',
      method: 'DELETE',
      path: '/api/v3/qualityprofile/1',
      status: 500,
      message: 'QualityProfile [1] is in use.',
    });
    expect(toApiError(error)).toEqual({
      status: 502,
      body: {
        code: 'UPSTREAM_ERROR',
        service: 'radarr',
        message: 'QualityProfile [1] is in use.',
        details: {
          kind: 'http',
          instance: 'radarr-1',
          method: 'DELETE',
          path: '/api/v3/qualityprofile/1',
          status: 500,
        },
      },
    });
  });

  it('la sonde ne modifie pas le disjoncteur', async () => {
    health.markDown('radarr', 'radarr-1');
    agent.get(ORIGIN).intercept({ path: '/api/v3/system/status' }).reply(200, {});
    await client().probe({ path: '/api/v3/system/status' });
    expect(health.isDown('radarr', 'radarr-1')).toBe(true);
  });

  it('à l’échéance, un appel réussi retente et laisse le service joignable', async () => {
    const clock = createClock();
    health = new ServiceHealthCache({ now: clock.now });
    health.markDown('radarr', 'radarr-1');
    clock.advance(ServiceHealthCache.TTL_DOWN_MS);
    agent.get(ORIGIN).intercept({ path: '/api/v3/system/status' }).reply(200, {});
    await client().get('/api/v3/system/status');
    expect(health.isDown('radarr', 'radarr-1')).toBe(false);
  });

  it('JSON illisible → invalid_response', async () => {
    agent.get(ORIGIN).intercept({ path: '/x' }).reply(200, '<html>');
    expect((await rejection(client().get('/x'))).kind).toBe('invalid_response');
  });

  it('refuse un schéma autre que http(s) sans se connecter', async () => {
    const error = await rejection(client({ baseUrl: 'file:///etc' }).get('/passwd'));
    expect(error.kind).toBe('blocked');
    expect(toApiError(error).status).toBe(503);
    expect(toApiError(error).body.code).toBe('SERVICE_UNREACHABLE');
  });

  it('la sonde ignore le disjoncteur, ne lève pas et renvoie le corps brut', async () => {
    health.markDown('radarr', 'radarr-1');
    agent.get(ORIGIN).intercept({ path: '/api/v3/system/status' }).reply(401, 'Unauthorized');
    const result = await client().probe({ path: '/api/v3/system/status' });
    expect(result).toMatchObject({ status: 401, body: 'Unauthorized', error: null });

    agent
      .get(ORIGIN)
      .intercept({ path: '/down' })
      .replyWithError(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
    const failed = await client().probe({ path: '/down' });
    expect(failed.status).toBeNull();
    expect(failed.error?.info.networkCode).toBe('ENOTFOUND');
  });
});

describe('journal des appels en échec', () => {
  function recorder() {
    const lines: { level: string; obj: Record<string, unknown>; msg: string }[] = [];
    return {
      lines,
      logger: {
        warn: (obj: object, msg: string) =>
          lines.push({ level: 'warn', obj: obj as Record<string, unknown>, msg }),
        debug: (obj: object, msg: string) =>
          lines.push({ level: 'debug', obj: obj as Record<string, unknown>, msg }),
      },
    };
  }

  it('erreur HTTP : service, instance, méthode, chemin, statut, type, durée, disjoncteur, corps', async () => {
    const log = recorder();
    agent
      .get(ORIGIN)
      .intercept({ path: '/api/v3/movie?apikey=secret', method: 'GET' })
      .reply(500, { message: 'Database locked' });
    await rejection(client({ logger: log.logger }).get('/api/v3/movie', { apikey: 'secret' }));
    expect(log.lines).toHaveLength(1);
    const [line] = log.lines;
    expect(line?.level).toBe('warn');
    expect(line?.msg).toBe('radarr/radarr-1: GET /api/v3/movie → HTTP 500 (Database locked)');
    expect(line?.obj).toMatchObject({
      service: 'radarr',
      instance: 'radarr-1',
      method: 'GET',
      path: '/api/v3/movie',
      kind: 'http',
      status: 500,
      circuit: 'closed',
      body: '{"message":"Database locked"}',
    });
    expect(typeof line?.obj.durationMs).toBe('number');
    // Le chemin journalisé ne porte jamais la requête (clé d'API).
    expect(JSON.stringify(log.lines)).not.toContain('secret');
  });

  it('échec de connexion : code réseau et disjoncteur ouvert ; appels suivants en debug', async () => {
    const log = recorder();
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    agent.get(ORIGIN).intercept({ path: '/api/v3/movie' }).replyWithError(refused);
    await rejection(client({ logger: log.logger }).get('/api/v3/movie'));
    await rejection(client({ logger: log.logger }).get('/api/v3/movie'));
    expect(log.lines.map((line) => line.level)).toEqual(['warn', 'debug']);
    expect(log.lines[0]?.obj).toMatchObject({
      kind: 'network',
      networkCode: 'ECONNREFUSED',
      circuit: 'open',
    });
    expect(log.lines[1]?.obj).toMatchObject({ kind: 'circuit_open', circuit: 'open' });
  });

  it('JSON illisible journalisé', async () => {
    const log = recorder();
    agent.get(ORIGIN).intercept({ path: '/x' }).reply(200, '<html>');
    await rejection(client({ logger: log.logger }).get('/x'));
    expect(log.lines[0]?.obj).toMatchObject({ kind: 'invalid_response', status: 200 });
  });
});

describe('stratégies d’authentification', () => {
  it('clé en paramètre, Basic et Bearer', async () => {
    const pool = agent.get(ORIGIN);
    pool.intercept({ path: '/api?mode=queue&apikey=k' }).reply(200, {});
    pool
      .intercept({
        path: '/jsonrpc',
        headers: { authorization: `Basic ${Buffer.from('u:p').toString('base64')}` },
      })
      .reply(200, {});
    pool
      .intercept({ path: '/health', headers: { authorization: 'Bearer trr_pub_x' } })
      .reply(200, {});
    await client({ auth: apiKeyQuery('apikey', 'k') }).get('/api', { mode: 'queue' });
    await client({ auth: basicAuth('u', 'p') }).get('/jsonrpc');
    await client({ auth: bearer('trr_pub_x') }).get('/health');
  });

  it('Basic omis quand utilisateur et mot de passe sont vides', async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: '/jsonrpc', headers: (headers) => !('authorization' in headers) })
      .reply(200, {});
    await client({ auth: basicAuth('', '') }).get('/jsonrpc');
  });

  it('session par cookie : connexion unique, puis reconnexion et un seul rejeu sur 403', async () => {
    let logins = 0;
    const session = cookieSession({
      login: () => {
        logins++;
        return Promise.resolve(`SID=s${logins}`);
      },
      isExpired: (response) => response.status === 403,
    });
    const http = client({ service: 'qbittorrent', instance: undefined, auth: session });
    const pool = agent.get(ORIGIN);
    pool.intercept({ path: '/api/v2/app/version', headers: { cookie: 'SID=s1' } }).reply(200, 'v5');
    pool
      .intercept({ path: '/api/v2/app/version', headers: { cookie: 'SID=s1' } })
      .reply(403, 'Forbidden');
    pool.intercept({ path: '/api/v2/app/version', headers: { cookie: 'SID=s2' } }).reply(200, 'v5');

    await expect(
      Promise.all([http.get('/api/v2/app/version', undefined, { responseType: 'text' })]),
    ).resolves.toEqual(['v5']);
    await expect(
      http.get('/api/v2/app/version', undefined, { responseType: 'text' }),
    ).resolves.toBe('v5');
    expect(logins).toBe(2);
  });

  it('Transmission : 409 → nouvel identifiant de session et rejeu, Basic conservé', async () => {
    const session = transmissionSessionId();
    const http = client({
      service: 'transmission',
      instance: undefined,
      auth: combineAuth(basicAuth('u', 'p'), session),
    });
    const pool = agent.get(ORIGIN);
    pool
      .intercept({ path: '/transmission/rpc', method: 'POST' })
      .reply(409, '', { headers: { 'x-transmission-session-id': 'abc' } });
    pool
      .intercept({
        path: '/transmission/rpc',
        method: 'POST',
        headers: {
          'x-transmission-session-id': 'abc',
          authorization: `Basic ${Buffer.from('u:p').toString('base64')}`,
        },
      })
      .reply(200, { result: 'success' });
    await expect(http.post('/transmission/rpc', { method: 'session-get' })).resolves.toEqual({
      result: 'success',
    });
    expect(session.sessionId).toBe('abc');
  });

  it('readSetCookie', () => {
    expect(readSetCookie({ 'set-cookie': ['a=1; Path=/', 'SID=xyz; HttpOnly'] }, 'SID')).toBe(
      'SID=xyz',
    );
    expect(readSetCookie({}, 'SID')).toBeNull();
  });
});
