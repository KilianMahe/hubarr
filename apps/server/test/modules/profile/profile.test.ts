// SPDX-License-Identifier: AGPL-3.0-or-later
// Routes `/api/profil/*` (P0.8, `ProfileController` d'origine).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AVATAR_MAX_BYTES, type ProfileResponse } from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app';
import type { AppDatabase } from '../../../src/db/client';
import { watchlistItems } from '../../../src/db/schema';
import {
  TestBrowser,
  createClock,
  createTempDir,
  createTestDatabase,
  createUser,
} from '../../helpers';
import { AVATAR_SAMPLES } from './samples';

const EMAIL = 'admin@example.com';
const PASSWORD = 'password-1';

let database: AppDatabase;
let app: FastifyInstance;
let dataDir: ReturnType<typeof createTempDir>;
let browser: TestBrowser;
const avatarsDir = () => join(dataDir.path, 'avatars');
const avatarFiles = () => (existsSync(avatarsDir()) ? readdirSync(avatarsDir()) : []);

beforeEach(async () => {
  database = await createTestDatabase();
  dataDir = createTempDir();
  app = buildApp({ database, dataDir: dataDir.path, now: createClock().now });
  await createUser(database, { email: EMAIL, password: PASSWORD });
  browser = new TestBrowser(() => app);
  expect((await browser.login({ email: EMAIL, password: PASSWORD })).statusCode).toBe(200);
});
afterEach(async () => {
  await app.close();
  dataDir.remove();
});

function uploadAvatar(data: Buffer, type = 'application/octet-stream') {
  return browser.post('/api/profil/avatar', data, { 'content-type': type });
}

describe('GET /api/profil', () => {
  it('exige une session', async () => {
    const anonymous = new TestBrowser(() => app);
    expect((await anonymous.get('/api/profil')).statusCode).toBe(401);
  });

  it('décrit le compte, sans hash, avec l’aperçu des 4 derniers ajouts à la watchlist', async () => {
    for (let index = 1; index <= 5; index++) {
      database.db
        .insert(watchlistItems)
        .values({
          tmdbId: index,
          mediaType: index % 2 === 0 ? 'tv' : 'movie',
          title: `Titre ${String(index)}`,
          posterPath: index === 5 ? null : `/p${String(index)}.jpg`,
          year: 2000 + index,
          addedAt: new Date(Date.UTC(2026, 0, index)),
        })
        .run();
    }
    const response = await browser.get('/api/profil');
    expect(response.statusCode).toBe(200);
    const body = response.json<ProfileResponse>();
    expect(body.user).toMatchObject({
      email: EMAIL,
      role: 'admin',
      displayName: EMAIL,
      avatarUrl: null,
    });
    expect(body.displayNameRaw).toBe('');
    expect(body.lastLoginAt).toBe('2026-11-18T12:00:00.000Z');
    expect(body.watchlist.count).toBe(5);
    expect(body.watchlist.recent.map((item) => item.tmdbId)).toEqual([5, 4, 3, 2]);
    expect(body.watchlist.recent[0]).toEqual({
      tmdbId: 5,
      mediaType: 'movie',
      title: 'Titre 5',
      posterPath: null,
      year: 2005,
    });
    expect(response.body).not.toContain('argon2');
  });
});

describe('POST /api/profil', () => {
  it('enregistre le nom affiché (nettoyé) et revient à l’e-mail quand il est vidé', async () => {
    const named = await browser.post('/api/profil', { displayName: '  Joshua  ' });
    expect(named.statusCode).toBe(200);
    expect(named.json<ProfileResponse>()).toMatchObject({
      user: { displayName: 'Joshua' },
      displayNameRaw: 'Joshua',
    });
    const cleared = await browser.post('/api/profil', { displayName: '   ' });
    expect(cleared.json<ProfileResponse>().user.displayName).toBe(EMAIL);
  });

  it('exige le jeton CSRF', async () => {
    browser.csrf = undefined;
    expect((await browser.post('/api/profil', { displayName: 'x' })).statusCode).toBe(403);
  });

  it('refuse un mot de passe actuel faux sans rien enregistrer', async () => {
    const response = await browser.post('/api/profil', {
      displayName: 'Nouveau nom',
      currentPassword: 'wrong-password',
      newPassword: 'new-password-1',
      confirmPassword: 'new-password-1',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'VALIDATION',
      details: [{ path: 'currentPassword', message: 'flash.password.current_wrong' }],
    });
    expect((await browser.get('/api/profil')).json<ProfileResponse>().displayNameRaw).toBe('');
  });

  it('signale un nouveau mot de passe trop court ou mal confirmé', async () => {
    const response = await browser.post('/api/profil', {
      currentPassword: PASSWORD,
      newPassword: 'short',
      confirmPassword: 'other',
    });
    expect(response.statusCode).toBe(400);
    const messages = response
      .json<{ details: { message: string }[] }>()
      .details.map((issue) => issue.message)
      .sort();
    expect(messages).toEqual(['flash.password.mismatch', 'flash.password.too_short']);
  });

  it('change le mot de passe et déconnecte les autres appareils', async () => {
    const other = new TestBrowser(() => app);
    await other.login({ email: EMAIL, password: PASSWORD });
    expect((await other.get('/api/profil')).statusCode).toBe(200);

    const response = await browser.post('/api/profil', {
      currentPassword: PASSWORD,
      newPassword: 'new-password-1',
      confirmPassword: 'new-password-1',
    });
    expect(response.statusCode).toBe(200);
    expect((await browser.get('/api/profil')).statusCode).toBe(200);
    expect((await other.get('/api/profil')).statusCode).toBe(401);

    const fresh = new TestBrowser(() => app);
    expect((await fresh.login({ email: EMAIL, password: PASSWORD })).statusCode).toBe(401);
    expect((await fresh.login({ email: EMAIL, password: 'new-password-1' })).statusCode).toBe(200);
  });
});

describe('avatar', () => {
  it('enregistre un avatar reconnu à sa signature et le sert à un utilisateur connecté', async () => {
    const response = await uploadAvatar(AVATAR_SAMPLES['image/png']);
    expect(response.statusCode).toBe(200);
    const url = response.json<ProfileResponse>().user.avatarUrl;
    expect(url).toMatch(/^api\/profil\/avatar\/file\/\d+-[0-9a-f]{8}\.png$/);
    expect(avatarFiles()).toHaveLength(1);

    const served = await browser.get(`/${url ?? ''}`);
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(served.rawPayload.equals(AVATAR_SAMPLES['image/png'])).toBe(true);

    expect((await new TestBrowser(() => app).get(`/${url ?? ''}`)).statusCode).toBe(401);
  });

  it('remplace l’ancien avatar, même d’un autre format', async () => {
    const first = (await uploadAvatar(AVATAR_SAMPLES['image/png'])).json<ProfileResponse>();
    const second = (
      await uploadAvatar(AVATAR_SAMPLES['image/webp'], 'image/png')
    ).json<ProfileResponse>();
    expect(second.user.avatarUrl).toMatch(/\.webp$/);
    expect(avatarFiles()).toHaveLength(1);
    expect((await browser.get(`/${first.user.avatarUrl ?? ''}`)).statusCode).toBe(404);
    expect((await browser.get(`/${second.user.avatarUrl ?? ''}`)).statusCode).toBe(200);
  });

  it('refuse un format non pris en charge, quel que soit le type annoncé', async () => {
    const response = await uploadAvatar(Buffer.from('<svg/>'), 'image/png');
    expect(response.statusCode).toBe(415);
    expect(response.json()).toEqual({ code: 'AVATAR_INVALID_TYPE' });
    expect(avatarFiles()).toHaveLength(0);
  });

  it('refuse un envoi vide', async () => {
    const response = await browser.post('/api/profil/avatar');
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'AVATAR_MISSING' });
  });

  it('refuse un fichier de plus de 2 Mo', async () => {
    const big = Buffer.concat([AVATAR_SAMPLES['image/png'], Buffer.alloc(AVATAR_MAX_BYTES)]);
    const response = await uploadAvatar(big, 'image/png');
    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ code: 'PAYLOAD_TOO_LARGE' });
    expect(avatarFiles()).toHaveLength(0);
  });

  it('exige le jeton CSRF', async () => {
    browser.csrf = undefined;
    expect((await uploadAvatar(AVATAR_SAMPLES['image/png'])).statusCode).toBe(403);
    expect((await browser.post('/api/profil/avatar/delete')).statusCode).toBe(403);
  });

  it('supprime l’avatar et son fichier', async () => {
    const url = (await uploadAvatar(AVATAR_SAMPLES['image/gif'])).json<ProfileResponse>().user
      .avatarUrl;
    const response = await browser.post('/api/profil/avatar/delete');
    expect(response.statusCode).toBe(200);
    expect(response.json<ProfileResponse>().user.avatarUrl).toBeNull();
    expect(avatarFiles()).toHaveLength(0);
    expect((await browser.get(url ?? '')).statusCode).toBe(404);
    // Sans avatar : rien à faire, pas d'erreur.
    expect((await browser.post('/api/profil/avatar/delete')).statusCode).toBe(200);
  });

  it('ne sert que des noms de fichier attendus et attribués', async () => {
    for (const name of ['..%2Fhubarr.db', '1.png', '1-0a1b2c3d.png', '1-0a1b2c3d.svg']) {
      expect((await browser.get(`/api/profil/avatar/file/${name}`)).statusCode).toBe(404);
    }
  });
});
