// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration des comptes (`/api/admin/users`) : liste, création avec
// droits, modification, mot de passe réinitialisé, garde-fous du dernier
// admin, suppression ; droits exposés à la session et dans le bootstrap.

import type { AuthUser, BootstrapResponse, ManagedUser, UserListResponse } from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app';
import type { AppDatabase } from '../../../src/db/client';
import { createInstance, deleteInstance } from '../../../src/modules/instances/instances';
import { applyServicePatch } from '../../../src/modules/services/config';
import { TestBrowser, UNUSED_DATA_DIR, createTestDatabase, createUser } from '../../helpers';

let database: AppDatabase;
let app: FastifyInstance;
let admin: TestBrowser;
let adminId: number;
const opts = { resolve: () => Promise.resolve<string[]>([]) };
const PASSWORD = 'password-1';

beforeEach(async () => {
  database = await createTestDatabase();
  app = buildApp({ database, dataDir: UNUSED_DATA_DIR });
  adminId = await createUser(database, { email: 'admin@example.com', password: PASSWORD });
  admin = new TestBrowser(() => app);
  await admin.login({ email: 'admin@example.com', password: PASSWORD });
});
afterEach(async () => {
  await app.close();
});

async function login(email: string, password = PASSWORD): Promise<TestBrowser> {
  const browser = new TestBrowser(() => app);
  const response = await browser.login({ email, password });
  expect(response.statusCode).toBe(200);
  return browser;
}

async function create(body: object): Promise<ManagedUser> {
  const response = await admin.post('/api/admin/users/create', body);
  expect(response.statusCode).toBe(200);
  return response.json<ManagedUser>();
}

describe('accès', () => {
  it('réservé aux admins, jeton CSRF exigé', async () => {
    await createUser(database, { email: 'u@example.com', password: PASSWORD, role: 'user' });
    const user = await login('u@example.com');
    expect((await user.get('/api/admin/users')).statusCode).toBe(403);
    expect((await new TestBrowser(() => app).get('/api/admin/users')).statusCode).toBe(401);
    const noCsrf = new TestBrowser(() => app);
    noCsrf.cookie = admin.cookie;
    expect((await noCsrf.post('/api/admin/users/create', {})).statusCode).toBe(403);
  });
});

describe('création et liste', () => {
  it('compte avec droits par service et par instance ; clés inconnues ignorées', async () => {
    const radarr = await createInstance(
      database.db,
      'radarr',
      { name: 'Films', url: 'http://r' },
      opts,
    );
    const created = await create({
      email: '  Bob@Example.com ',
      displayName: 'Bob',
      password: 'temporaire-1',
      permissions: {
        [`radarr:${radarr.slug}`]: 'write',
        prowlarr: 'read',
        'radarr:inconnue': 'read',
        nope: 'write',
        radarr: 'read',
      },
    });
    expect(created).toMatchObject({
      email: 'bob@example.com',
      displayName: 'Bob',
      role: 'user',
      lastLoginAt: null,
      permissions: { 'radarr:films': 'write', prowlarr: 'read' },
    });
    const list = (await admin.get('/api/admin/users')).json<UserListResponse>();
    expect(list.users.map((u) => [u.email, u.role])).toEqual([
      ['admin@example.com', 'admin'],
      ['bob@example.com', 'user'],
    ]);

    // Le compte se connecte avec son mot de passe provisoire et voit ses droits.
    const bob = await login('bob@example.com', 'temporaire-1');
    const me = (await bob.get('/api/bootstrap')).json<BootstrapResponse>();
    expect(me.user?.permissions).toEqual({ 'radarr:films': 'write', prowlarr: 'read' });
  });

  it('validation : e-mail invalide, mot de passe trop court ; e-mail pris → 409', async () => {
    expect(
      (await admin.post('/api/admin/users/create', { email: 'x', password: 'short' })).json(),
    ).toMatchObject({ code: 'VALIDATION' });
    const taken = await admin.post('/api/admin/users/create', {
      email: 'ADMIN@example.com',
      password: 'password-2',
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('un admin créé n’enregistre aucun droit', async () => {
    const created = await create({
      email: 'chef@example.com',
      password: 'password-2',
      role: 'admin',
      permissions: { prowlarr: 'read' },
    });
    expect(created).toMatchObject({ role: 'admin', permissions: {} });
  });
});

describe('modification', () => {
  it('droits remplacés et appliqués à la requête suivante, sans reconnexion', async () => {
    applyServicePatch(database.db, 'prowlarr', { url: 'http://p', apiKey: 'k' });
    const bob = await create({ email: 'bob@example.com', password: 'password-2' });
    const session = await login('bob@example.com', 'password-2');
    const user = () => session.get('/api/bootstrap').then((r) => r.json<BootstrapResponse>().user);
    expect((await user())?.permissions).toEqual({});

    const saved = await admin.post(`/api/admin/users/${bob.id}/save`, {
      displayName: 'Robert',
      permissions: { prowlarr: 'write' },
    });
    expect(saved.json()).toMatchObject({
      displayName: 'Robert',
      permissions: { prowlarr: 'write' },
    });
    expect((await user())?.permissions).toEqual({ prowlarr: 'write' });
    // Services du shell : Prowlarr lisible, donc présenté comme configuré.
    const states = (await session.get('/api/bootstrap')).json<BootstrapResponse>().services.states;
    expect(states.prowlarr?.configured).toBe(true);
    expect(states.tmdb?.configured).toBe(false);
  });

  it('promu admin : droits effacés ; rétrogradé : droits repartent de zéro', async () => {
    const bob = await create({
      email: 'bob@example.com',
      password: 'password-2',
      permissions: { prowlarr: 'read' },
    });
    const promoted = await admin.post(`/api/admin/users/${bob.id}/save`, { role: 'admin' });
    expect(promoted.json()).toMatchObject({ role: 'admin', permissions: {} });
    const demoted = await admin.post(`/api/admin/users/${bob.id}/save`, { role: 'user' });
    expect(demoted.json()).toMatchObject({ role: 'user', permissions: {} });
  });

  it('mot de passe réinitialisé : sessions du compte fermées, nouveau mot de passe valable', async () => {
    const bob = await create({ email: 'bob@example.com', password: 'password-2' });
    const session = await login('bob@example.com', 'password-2');
    await admin.post(`/api/admin/users/${bob.id}/save`, { password: 'nouveau-mdp-3' });
    expect((await session.get('/api/bootstrap')).json<BootstrapResponse>().user).toBeNull();
    expect(
      (await new TestBrowser(() => app).login({ email: 'bob@example.com', password: 'password-2' }))
        .statusCode,
    ).toBe(401);
    await login('bob@example.com', 'nouveau-mdp-3');
  });

  it('e-mail déjà pris → 409 ; compte inconnu → 404', async () => {
    const bob = await create({ email: 'bob@example.com', password: 'password-2' });
    expect(
      (await admin.post(`/api/admin/users/${bob.id}/save`, { email: 'admin@example.com' })).json(),
    ).toMatchObject({ code: 'EMAIL_TAKEN' });
    expect((await admin.post('/api/admin/users/999/save', {})).statusCode).toBe(404);
  });
});

describe('garde-fous', () => {
  it('un admin ne se retire pas son rôle et ne supprime pas son compte', async () => {
    await create({ email: 'chef@example.com', password: 'password-2', role: 'admin' });
    for (const response of [
      await admin.post(`/api/admin/users/${adminId}/save`, { role: 'user' }),
      await admin.post(`/api/admin/users/${adminId}/delete`, {}),
    ]) {
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'LAST_ADMIN' });
    }
  });

  it('suppression : sessions fermées ; un autre admin peut être supprimé', async () => {
    const chef = await create({ email: 'chef@example.com', password: 'password-2', role: 'admin' });
    const session = await login('chef@example.com', 'password-2');
    expect((await admin.post(`/api/admin/users/${chef.id}/delete`, {})).json()).toEqual({
      ok: true,
    });
    expect((await session.get('/api/bootstrap')).json<{ user: AuthUser | null }>().user).toBeNull();
    expect((await admin.post(`/api/admin/users/${chef.id}/delete`, {})).statusCode).toBe(404);
  });

  it('droits d’une instance supprimée effacés avec elle', async () => {
    const radarr = await createInstance(
      database.db,
      'radarr',
      { name: 'Films', url: 'http://r' },
      opts,
    );
    const bob = await create({
      email: 'bob@example.com',
      password: 'password-2',
      permissions: { [`radarr:${radarr.slug}`]: 'read' },
    });
    deleteInstance(database.db, radarr);
    const list = (await admin.get('/api/admin/users')).json<UserListResponse>();
    expect(list.users.find((u) => u.id === bob.id)?.permissions).toEqual({});
  });
});
