// SPDX-License-Identifier: AGPL-3.0-or-later
// Droits par service (`plugins/access.ts`, garde de service) : lecture pour
// `GET`, écriture sinon, par instance pour Radarr/Sonarr, `permission`
// explicite, module de service fermé par défaut aux routes sans service.

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import type { AppDatabase } from '../../src/db/client';
import { createInstance } from '../../src/modules/instances/instances';
import { applyServicePatch } from '../../src/modules/services/config';
import { guardServiceModule } from '../../src/plugins/access';
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
let userId: number;
const opts = { resolve: () => Promise.resolve<string[]>([]) };
const ok = async () => ({ ok: true });

beforeEach(async () => {
  database = await createTestDatabase();
  app = buildApp({
    database,
    dataDir: UNUSED_DATA_DIR,
    routes: [
      async (instance) => {
        // Module d'un service : fermé par défaut aux routes sans service.
        guardServiceModule(instance, (request) =>
          (request.params as { client?: string }).client === 'sabnzbd' ? 'sabnzbd' : null,
        );
        const prowlarr = { service: 'prowlarr' as const };
        instance.get('/api/test/prowlarr', { config: prowlarr }, ok);
        instance.post('/api/test/prowlarr', { config: prowlarr }, ok);
        instance.post(
          '/api/test/prowlarr/search',
          { config: { ...prowlarr, permission: 'read' } },
          ok,
        );
        instance.get(
          '/api/test/prowlarr/settings',
          { config: { ...prowlarr, permission: 'admin' } },
          ok,
        );
        instance.get(
          '/api/test/medias/:slug/films',
          { config: { service: 'radarr' } },
          async (request) => ({ slug: request.instance?.slug }),
        );
        instance.post('/api/test/medias/:slug/films', { config: { service: 'radarr' } }, ok);
        instance.get('/api/test/radarr', { config: { service: 'radarr' } }, async (request) => ({
          slug: request.instance?.slug,
        }));
        instance.get('/api/test/free', ok);
        instance.get('/api/test/usenet/:client', ok);
      },
    ],
  });
  userId = await createUser(database, {
    email: 'u@example.com',
    password: 'password-1',
    role: 'user',
  });
  applyServicePatch(database.db, 'prowlarr', { url: 'http://p', apiKey: 'k' });
  await createInstance(database.db, 'radarr', { name: 'Radarr', url: 'http://r1' }, opts);
  await createInstance(database.db, 'radarr', { name: 'Radarr 4K', url: 'http://r2' }, opts);
  browser = new TestBrowser(() => app);
  await browser.login({ email: 'u@example.com', password: 'password-1' });
});
afterEach(async () => {
  await app.close();
});

describe('droits par service', () => {
  it('sans droit → 403 FORBIDDEN, en lecture comme en écriture', async () => {
    const response = await browser.get('/api/test/prowlarr');
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      code: 'FORBIDDEN',
      service: 'prowlarr',
      details: { level: 'read' },
    });
    expect((await browser.post('/api/test/prowlarr')).statusCode).toBe(403);
  });

  it('lecture : GET et POST déclarés en lecture ; écriture refusée', async () => {
    grantPermissions(database, userId, { prowlarr: 'read' });
    expect((await browser.get('/api/test/prowlarr')).statusCode).toBe(200);
    expect((await browser.post('/api/test/prowlarr/search')).statusCode).toBe(200);
    expect((await browser.post('/api/test/prowlarr')).json()).toMatchObject({
      code: 'FORBIDDEN',
      details: { level: 'write' },
    });
  });

  it('écriture : tout passe, sauf les routes réservées aux admins', async () => {
    grantPermissions(database, userId, { prowlarr: 'write' });
    expect((await browser.post('/api/test/prowlarr')).statusCode).toBe(200);
    expect((await browser.get('/api/test/prowlarr/settings')).statusCode).toBe(403);
  });

  it('un admin a tous les droits', async () => {
    await createUser(database, { email: 'a@example.com', password: 'password-1' });
    const admin = new TestBrowser(() => app);
    await admin.login({ email: 'a@example.com', password: 'password-1' });
    expect((await admin.post('/api/test/prowlarr')).statusCode).toBe(200);
    expect((await admin.get('/api/test/prowlarr/settings')).statusCode).toBe(200);
  });

  it('droits relus à chaque requête : un retrait s’applique aussitôt', async () => {
    grantPermissions(database, userId, { prowlarr: 'read' });
    expect((await browser.get('/api/test/prowlarr')).statusCode).toBe(200);
    grantPermissions(database, userId, {});
    expect((await browser.get('/api/test/prowlarr')).statusCode).toBe(403);
  });
});

describe('droits par instance (Radarr/Sonarr)', () => {
  it('le droit porte sur l’instance du slug', async () => {
    grantPermissions(database, userId, { 'radarr:radarr-4k': 'write', 'radarr:radarr': 'read' });
    expect((await browser.get('/api/test/medias/radarr/films')).statusCode).toBe(200);
    expect((await browser.post('/api/test/medias/radarr/films')).statusCode).toBe(403);
    expect((await browser.post('/api/test/medias/radarr-4k/films')).statusCode).toBe(200);
  });

  it('sans slug : la première instance lisible si la par défaut est fermée', async () => {
    grantPermissions(database, userId, { 'radarr:radarr-4k': 'read' });
    expect((await browser.get('/api/test/radarr')).json()).toEqual({ slug: 'radarr-4k' });
    grantPermissions(database, userId, {});
    expect((await browser.get('/api/test/radarr')).statusCode).toBe(403);
  });
});

describe('module de service fermé par défaut', () => {
  it('route sans service : admins seulement', async () => {
    grantPermissions(database, userId, { prowlarr: 'write' });
    expect((await browser.get('/api/test/free')).statusCode).toBe(403);
  });

  it('service résolu par le module (paramètre `:client`)', async () => {
    expect((await browser.get('/api/test/usenet/sabnzbd')).statusCode).toBe(403);
    grantPermissions(database, userId, { sabnzbd: 'read' });
    expect((await browser.get('/api/test/usenet/sabnzbd')).statusCode).toBe(200);
    expect((await browser.get('/api/test/usenet/nzbget')).statusCode).toBe(403);
  });
});
