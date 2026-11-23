// SPDX-License-Identifier: AGPL-3.0-or-later
// État de santé des services : port de `HealthServiceStatusTest`,
// `HealthServiceSharedCacheTest`, `HealthServiceTest` (cache, invalidation, non
// configuré), `HealthControllerTest::testServicesHealth*` et `TopbarHealthServicesTest`.

import { HEALTH_FLAT_SERVICES, type ServiceId, type ServicesHealthResponse } from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app';
import type { AppDatabase } from '../../../src/db/client';
import { ServiceHealthCache } from '../../../src/integrations/http';
import {
  ServiceHealthMonitor,
  classifyLatency,
  isHealthyStatus,
  type Pinger,
} from '../../../src/modules/health/service-health';
import { createInstance, setInstanceEnabled } from '../../../src/modules/instances/instances';
import { applyServicePatch } from '../../../src/modules/services/config';
import {
  TestBrowser,
  UNUSED_DATA_DIR,
  createClock,
  createTestDatabase,
  createUser,
} from '../../helpers';

const noDns = { resolve: () => Promise.resolve<string[]>([]) };

let database: AppDatabase;
beforeEach(async () => {
  database = await createTestDatabase();
});
afterEach(() => {
  database.close();
});

function monitor(
  ping: Pinger,
  clock = createClock(),
  health = new ServiceHealthCache({ now: clock.now }),
) {
  return {
    monitor: new ServiceHealthMonitor({ db: database.db, deps: { health }, now: clock.now, ping }),
    clock,
    health,
  };
}

function countingPinger(
  result: { ok: boolean; latencyMs: number } | null = { ok: true, latencyMs: 10 },
) {
  const calls: string[] = [];
  const ping: Pinger = (service: ServiceId, instance?: string) => {
    calls.push(instance === undefined ? service : `${service}:${instance}`);
    return Promise.resolve(result);
  };
  return { calls, ping };
}

describe('classifyLatency', () => {
  it('seuils 750 ms et 2 s (bornes incluses)', () => {
    expect(classifyLatency(0)).toBe('up');
    expect(classifyLatency(750)).toBe('up');
    expect(classifyLatency(751)).toBe('slow');
    expect(classifyLatency(2000)).toBe('slow');
    expect(classifyLatency(2001)).toBe('very_slow');
  });

  it('projection booléenne', () => {
    expect(isHealthyStatus('up')).toBe(true);
    expect(isHealthyStatus('very_slow')).toBe(true);
    expect(isHealthyStatus('down')).toBe(false);
    expect(isHealthyStatus('degraded')).toBe(false);
    expect(isHealthyStatus(null)).toBeNull();
  });
});

describe('ServiceHealthMonitor', () => {
  it('non configuré : null, sans sonde', async () => {
    const { calls, ping } = countingPinger();
    const { monitor: m } = monitor(ping);
    expect(await m.statusFor('prowlarr')).toEqual({ status: null, latencyMs: null });
    expect(calls).toEqual([]);
  });

  it('désactivé : null, sans sonde', async () => {
    applyServicePatch(database.db, 'prowlarr', { url: 'http://p', apiKey: 'k', enabled: false });
    const { calls, ping } = countingPinger();
    expect(await monitor(ping).monitor.isHealthy('prowlarr')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('up, down et latence', async () => {
    applyServicePatch(database.db, 'prowlarr', { url: 'http://p', apiKey: 'k' });
    expect(
      await monitor(countingPinger({ ok: true, latencyMs: 1200 }).ping).monitor.statusFor(
        'prowlarr',
      ),
    ).toEqual({
      status: 'slow',
      latencyMs: 1200,
    });
    expect(
      await monitor(countingPinger({ ok: false, latencyMs: 5 }).ping).monitor.statusFor('prowlarr'),
    ).toEqual({
      status: 'down',
      latencyMs: null,
    });
  });

  it('disjoncteur ouvert : degraded, sans sonde', async () => {
    applyServicePatch(database.db, 'prowlarr', { url: 'http://p', apiKey: 'k' });
    const { calls, ping } = countingPinger();
    const { monitor: m, health } = monitor(ping);
    health.markDown('prowlarr');
    expect((await m.statusFor('prowlarr')).status).toBe('degraded');
    expect(await m.isHealthy('prowlarr')).toBe(false);
    expect(calls).toEqual([]);
  });

  it('cache 10 s, une seule sonde pour deux appels simultanés', async () => {
    applyServicePatch(database.db, 'prowlarr', { url: 'http://p', apiKey: 'k' });
    const { calls, ping } = countingPinger();
    const { monitor: m, clock } = monitor(ping);
    await Promise.all([m.statusFor('prowlarr'), m.statusFor('prowlarr')]);
    await m.statusFor('prowlarr');
    expect(calls).toHaveLength(1);
    clock.advance(9_999);
    await m.statusFor('prowlarr');
    expect(calls).toHaveLength(1);
    clock.advance(1);
    await m.statusFor('prowlarr');
    expect(calls).toHaveLength(2);
  });

  it('un échec est gardé tel quel pendant 10 s', async () => {
    applyServicePatch(database.db, 'prowlarr', { url: 'http://p', apiKey: 'k' });
    const { calls, ping } = countingPinger({ ok: false, latencyMs: 0 });
    const { monitor: m } = monitor(ping);
    expect(await m.isHealthy('prowlarr')).toBe(false);
    expect(await m.isHealthy('prowlarr')).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('invalidate : resonde, et referme le disjoncteur du service et de ses instances', async () => {
    applyServicePatch(database.db, 'prowlarr', { url: 'http://p', apiKey: 'k' });
    const { calls, ping } = countingPinger();
    const { monitor: m, health } = monitor(ping);
    await m.statusFor('prowlarr');
    health.markDown('radarr', 'radarr-4k');
    health.markDown('prowlarr');
    m.invalidate('radarr');
    expect(health.isDown('radarr', 'radarr-4k')).toBe(false);
    expect(health.isDown('prowlarr')).toBe(true);
    m.invalidate();
    expect(health.isDown('prowlarr')).toBe(false);
    await m.statusFor('prowlarr');
    expect(calls).toHaveLength(2);
  });

  it('instances indépendantes : cache et sonde par slug', async () => {
    await createInstance(database.db, 'radarr', { name: 'A', url: 'http://a', apiKey: 'k' }, noDns);
    await createInstance(database.db, 'radarr', { name: 'B', url: 'http://b', apiKey: 'k' }, noDns);
    const { calls, ping } = countingPinger();
    const { monitor: m } = monitor(ping);
    await m.statusFor('radarr', 'a');
    await m.statusFor('radarr', 'b');
    expect(calls).toEqual(['radarr:a', 'radarr:b']);
  });

  it('sonde réelle : échec de connexion → disjoncteur ouvert ; succès → refermé', async () => {
    applyServicePatch(database.db, 'prowlarr', { url: 'http://prowlarr.test', apiKey: 'k' });
    const agent = new MockAgent();
    agent.disableNetConnect();
    const health = new ServiceHealthCache();
    const m = new ServiceHealthMonitor({
      db: database.db,
      deps: { health, dispatcher: agent, ...noDns },
    });
    agent
      .get('http://prowlarr.test')
      .intercept({ path: '/api/v1/system/status' })
      .replyWithError(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
    expect((await m.statusFor('prowlarr')).status).toBe('down');
    expect(health.isDown('prowlarr')).toBe(true);
    m.invalidate();
    agent.get('http://prowlarr.test').intercept({ path: '/api/v1/system/status' }).reply(200, {});
    expect((await m.statusFor('prowlarr')).status).toBe('up');
    await agent.close();
  });
});

describe('GET /api/health/services', () => {
  let app: FastifyInstance;
  let agent: MockAgent;
  let browser: TestBrowser;

  beforeEach(async () => {
    agent = new MockAgent();
    agent.disableNetConnect();
    app = buildApp({ database, dataDir: UNUSED_DATA_DIR, dispatcher: agent, ...noDns });
    await createUser(database, { email: 'user@example.com', password: 'password-1', role: 'user' });
    browser = new TestBrowser(() => app);
    await browser.login({ email: 'user@example.com', password: 'password-1' });
  });
  afterEach(async () => {
    await app.close();
    await agent.close();
  });

  it('exige une session', async () => {
    expect((await new TestBrowser(() => app).get('/api/health/services')).statusCode).toBe(401);
  });

  it('chaque service du catalogue, une ligne par instance, ET des instances', async () => {
    applyServicePatch(database.db, 'sabnzbd', { url: 'http://sab.test', apiKey: 'k' });
    applyServicePatch(database.db, 'nzbget', { url: 'http://nzb.test' });
    await createInstance(
      database.db,
      'radarr',
      { name: 'Radarr', url: 'http://r1.test', apiKey: 'k' },
      noDns,
    );
    await createInstance(
      database.db,
      'radarr',
      { name: 'Radarr 4K', url: 'http://r2.test', apiKey: 'k' },
      noDns,
    );
    const off = await createInstance(
      database.db,
      'radarr',
      { name: 'Off', url: 'http://r3.test', apiKey: 'k' },
      noDns,
    );
    setInstanceEnabled(database.db, off, false);
    agent
      .get('http://sab.test')
      .intercept({ path: /^\/api/ })
      .reply(200, {});
    agent.get('http://nzb.test').intercept({ path: '/jsonrpc', method: 'POST' }).reply(500, '');
    agent.get('http://r1.test').intercept({ path: '/api/v3/system/status' }).reply(200, {});
    agent.get('http://r2.test').intercept({ path: '/api/v3/system/status' }).reply(401, '');

    const body = (await browser.get('/api/health/services')).json<ServicesHealthResponse>();
    for (const id of HEALTH_FLAT_SERVICES) expect(body.services).toHaveProperty(id);
    expect(body.services).toMatchObject({
      sabnzbd: true,
      nzbget: false,
      tmdb: null,
      radarr: false,
      sonarr: null,
    });
    expect(body.instances.radarr).toEqual([
      { slug: 'radarr', name: 'Radarr', state: true },
      { slug: 'radarr-4k', name: 'Radarr 4K', state: false },
    ]);
    expect(body).toMatchObject({ ok: 2, total: 4 });
  });

  it('diagnostic passif : catégorie, URL pour les admins seulement', async () => {
    applyServicePatch(database.db, 'tautulli', { url: 'http://tau.test', apiKey: 'k' });
    agent
      .get('http://tau.test')
      .intercept({ path: /^\/api\/v2/ })
      .reply(200, { response: { result: 'error' } })
      .times(2);
    expect((await browser.get('/api/health/diagnose/tautulli')).json()).toEqual({
      ok: false,
      category: 'auth',
      http: 200,
      url: null,
    });
    await createUser(database, { email: 'admin@example.com', password: 'password-1' });
    const admin = new TestBrowser(() => app);
    await admin.login({ email: 'admin@example.com', password: 'password-1' });
    expect((await admin.get('/api/health/diagnose/tautulli')).json()).toMatchObject({
      url: 'http://tau.test',
    });
    expect((await admin.get('/api/health/diagnose/nope')).statusCode).toBe(404);
    expect((await admin.get('/api/health/diagnose/radarr?instance=nope')).statusCode).toBe(404);
  });
});
