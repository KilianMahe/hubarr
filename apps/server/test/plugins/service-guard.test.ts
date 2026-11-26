// SPDX-License-Identifier: AGPL-3.0-or-later
// Port de `ServiceRouteGuardSubscriberTest` (désactivé, non configuré) et de
// `MultiInstanceBinderSubscriberTest` (liaison par slug, slug inconnu → 404).
// Un compte sans droit est refusé avant tout : il n'apprend rien de la
// configuration (service absent, désactivé, slug inconnu).

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import type { AppDatabase } from '../../src/db/client';
import { createInstance, setInstanceEnabled } from '../../src/modules/instances/instances';
import { applyServicePatch } from '../../src/modules/services/config';
import {
  TestBrowser,
  UNUSED_DATA_DIR,
  createTestDatabase,
  createUser,
  grantPermissions,
} from '../helpers';

let database: AppDatabase;
let app: FastifyInstance;
let browser: TestBrowser;
const opts = { resolve: () => Promise.resolve<string[]>([]) };

beforeEach(async () => {
  database = await createTestDatabase();
  app = buildApp({
    database,
    dataDir: UNUSED_DATA_DIR,
    routes: [
      async (instance) => {
        instance.get('/api/test/prowlarr', { config: { service: 'prowlarr' } }, async () => ({
          ok: true,
        }));
        instance.get(
          '/api/test/medias/:slug/films',
          { config: { service: 'radarr' } },
          async (request) => ({
            slug: request.instance?.slug,
          }),
        );
        instance.get('/api/test/radarr', { config: { service: 'radarr' } }, async (request) => ({
          slug: request.instance?.slug,
        }));
        instance.get('/api/test/free', { config: { access: 'user' } }, async (request) => ({
          instance: request.instance,
        }));
      },
    ],
  });
  await createUser(database, { email: 'a@example.com', password: 'password-1' });
  browser = new TestBrowser(() => app);
  await browser.login({ email: 'a@example.com', password: 'password-1' });
});
afterEach(async () => {
  await app.close();
});

describe('garde de service', () => {
  it('non configuré → 409 SERVICE_NOT_CONFIGURED (missing)', async () => {
    const response = await browser.get('/api/test/prowlarr');
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: 'SERVICE_NOT_CONFIGURED',
      service: 'prowlarr',
      details: { reason: 'missing', name: 'Prowlarr' },
    });
  });

  it('désactivé → 409 (disabled) ; configuré et actif → passe', async () => {
    applyServicePatch(database.db, 'prowlarr', { url: 'http://p', apiKey: 'k', enabled: false });
    expect((await browser.get('/api/test/prowlarr')).json()).toMatchObject({
      details: { reason: 'disabled' },
    });
    applyServicePatch(database.db, 'prowlarr', { enabled: true });
    expect((await browser.get('/api/test/prowlarr')).json()).toEqual({ ok: true });
  });

  it('une route sans service n’est pas concernée', async () => {
    expect((await browser.get('/api/test/free')).json()).toEqual({ instance: null });
  });

  it('la garde passe après l’authentification', async () => {
    expect((await new TestBrowser(() => app).get('/api/test/prowlarr')).statusCode).toBe(401);
  });
});

describe('liaison par slug', () => {
  it('lie l’instance du slug, ou l’instance par défaut sans slug', async () => {
    await createInstance(database.db, 'radarr', { name: 'Radarr', url: 'http://r1' }, opts);
    await createInstance(database.db, 'radarr', { name: 'Radarr 4K', url: 'http://r2' }, opts);
    expect((await browser.get('/api/test/medias/radarr-4k/films')).json()).toEqual({
      slug: 'radarr-4k',
    });
    expect((await browser.get('/api/test/radarr')).json()).toEqual({ slug: 'radarr' });
  });

  it('slug inconnu → 404 ; instance désactivée → 409 avec son nom ; aucune active → missing', async () => {
    const row = await createInstance(
      database.db,
      'radarr',
      { name: 'Radarr 4K', url: 'http://r' },
      opts,
    );
    expect((await browser.get('/api/test/medias/nope/films')).statusCode).toBe(404);
    setInstanceEnabled(database.db, row, false);
    expect((await browser.get('/api/test/medias/radarr-4k/films')).json()).toMatchObject({
      code: 'SERVICE_NOT_CONFIGURED',
      details: { reason: 'disabled', name: 'Radarr 4K' },
    });
    expect((await browser.get('/api/test/radarr')).json()).toMatchObject({
      details: { reason: 'missing' },
    });
  });
});

describe('compte sans droit', () => {
  let user: TestBrowser;
  let userId: number;
  beforeEach(async () => {
    userId = await createUser(database, {
      email: 'u@example.com',
      password: 'password-1',
      role: 'user',
    });
    user = new TestBrowser(() => app);
    await user.login({ email: 'u@example.com', password: 'password-1' });
  });

  it('403 avant l’état de la configuration : non configuré, désactivé', async () => {
    expect((await user.get('/api/test/prowlarr')).json()).toMatchObject({ code: 'FORBIDDEN' });
    applyServicePatch(database.db, 'prowlarr', { url: 'http://p', apiKey: 'k', enabled: false });
    expect((await user.get('/api/test/prowlarr')).json()).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('slug inconnu ou fermé : même 403 ; slug ouvert : instance liée', async () => {
    await createInstance(database.db, 'radarr', { name: 'Radarr', url: 'http://r1' }, opts);
    await createInstance(database.db, 'radarr', { name: 'Radarr 4K', url: 'http://r2' }, opts);
    grantPermissions(database, userId, { 'radarr:radarr': 'read' });
    expect((await user.get('/api/test/medias/nope/films')).statusCode).toBe(403);
    expect((await user.get('/api/test/medias/radarr-4k/films')).statusCode).toBe(403);
    expect((await user.get('/api/test/medias/radarr/films')).json()).toEqual({ slug: 'radarr' });
  });
});
