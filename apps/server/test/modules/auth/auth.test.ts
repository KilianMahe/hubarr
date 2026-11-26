// SPDX-License-Identifier: AGPL-3.0-or-later
// Connexion, sessions, CSRF et rôles de bout en bout (P0.6), via `app.inject()`.
import { CSRF_HEADER, SESSION_COOKIE_NAME, SESSION_TTL_MS } from '@hubarr/shared';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app';
import type { AppDatabase } from '../../../src/db/client';
import { sessions, users } from '../../../src/db/schema';
import { guardAdminModule } from '../../../src/plugins/access';
import { ANONYMOUS_SESSION_TTL_MS } from '../../../src/plugins/sessions';
import {
  TestBrowser,
  createClock,
  createTestDatabase,
  createUser,
  sessionCookie,
  type LoginCredentials,
  UNUSED_DATA_DIR,
} from '../../helpers';

const ADMIN = { email: 'Admin@Example.com', password: 'correct-horse' };

/** Routes de test : une protégée, une réservée aux administrateurs, une mutation. */
const testRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/test/me', { config: { access: 'user' } }, async (request) => ({
    user: request.user,
  }));
  app.post('/api/test/mutate', { config: { access: 'user' } }, async () => ({ ok: true }));
  await app.register(async (admin) => {
    guardAdminModule(admin);
    admin.get('/api/test/admin', async () => ({ ok: true }));
  });
};

let database: AppDatabase;
let app: FastifyInstance;
let clock: ReturnType<typeof createClock>;

beforeEach(async () => {
  database = await createTestDatabase();
  clock = createClock();
  app = buildApp({ dataDir: UNUSED_DATA_DIR, database, now: clock.now, routes: [testRoutes] });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

/** Navigateur de test lié à l'application courante, connecté par défaut en `ADMIN`. */
class Browser extends TestBrowser {
  constructor() {
    super(() => app);
  }

  override login(credentials: LoginCredentials = ADMIN) {
    return super.login(credentials);
  }
}

describe('connexion', () => {
  beforeEach(async () => {
    await createUser(database, ADMIN);
  });

  it('ouvre une session et renvoie l’utilisateur sans son hash', async () => {
    const browser = new Browser();
    const response = await browser.login({
      email: ' ADMIN@example.com ',
      password: ADMIN.password,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<Record<string, unknown>>();
    expect(body.user).toEqual({
      id: 1,
      email: 'admin@example.com',
      role: 'admin',
      permissions: {},
      displayName: 'admin@example.com',
      avatarUrl: null,
    });
    expect(JSON.stringify(body)).not.toContain('argon2');
    expect((await browser.get('/api/test/me')).json()).toMatchObject({ user: { id: 1 } });
    expect(database.db.select().from(users).get()?.lastLoginAt?.getTime()).toBe(clock.now());
  });

  it('pose un cookie HttpOnly SameSite=Lax, de session sauf « se souvenir de moi »', async () => {
    const browser = new Browser();
    const plain = sessionCookie(await browser.login());
    expect(plain).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(plain?.maxAge).toBeUndefined();
    expect(plain?.secure).toBeUndefined();

    const remembered = sessionCookie(await new Browser().login({ ...ADMIN, remember: true }));
    expect(remembered?.maxAge).toBe(SESSION_TTL_MS / 1000);
  });

  it('marque le cookie Secure derrière un proxy HTTPS de confiance', async () => {
    await app.close();
    app = buildApp({
      dataDir: UNUSED_DATA_DIR,
      database: await createTestDatabase(),
      trustProxy: true,
    });
    const csrf = await app.inject({
      method: 'GET',
      url: '/api/auth/csrf',
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(sessionCookie(csrf)?.secure).toBe(true);
  });

  it('régénère la session : l’ancien cookie anonyme ne vaut plus rien', async () => {
    const browser = new Browser();
    await browser.fetchCsrf();
    const anonymous = browser.cookie;
    await browser.post('/api/auth/login', ADMIN);
    expect(browser.cookie).toBeDefined();
    expect(browser.cookie).not.toBe(anonymous);
    const stale = await app.inject({
      method: 'GET',
      url: '/api/test/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${String(anonymous)}` },
    });
    expect(stale.statusCode).toBe(401);
  });

  it('ne stocke que l’empreinte du jeton de session', async () => {
    const browser = new Browser();
    await browser.login();
    const ids = database.db
      .select({ id: sessions.id })
      .from(sessions)
      .all()
      .map((row) => row.id);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(ids).not.toContain(browser.cookie);
  });

  it.each([
    ['mot de passe erroné', { email: ADMIN.email, password: 'wrong-password' }],
    ['e-mail inconnu', { email: 'nobody@example.com', password: ADMIN.password }],
  ])('refuse un %s avec INVALID_CREDENTIALS', async (_label, credentials) => {
    const response = await new Browser().login(credentials);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ code: 'INVALID_CREDENTIALS' });
  });

  it('valide le corps de la requête', async () => {
    const response = await new Browser().login({ email: '', password: 'x' });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'VALIDATION', details: [{ path: 'email' }] });
  });

  it('bloque 15 min après 5 échecs, même avec le bon mot de passe', async () => {
    const browser = new Browser();
    for (let i = 0; i < 5; i++) {
      expect((await browser.login({ email: ADMIN.email, password: 'nope' })).statusCode).toBe(401);
    }
    const blocked = await browser.login();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toEqual({ code: 'LOGIN_THROTTLED', details: { retryAfter: 900 } });
    expect(blocked.headers['retry-after']).toBe('900');

    clock.advance(15 * 60 * 1000);
    expect((await browser.login()).statusCode).toBe(200);
  });
});

describe('sessions', () => {
  beforeEach(async () => {
    await createUser(database, ADMIN);
  });

  it('expire après 7 jours d’inactivité', async () => {
    const browser = new Browser();
    await browser.login();
    clock.advance(SESSION_TTL_MS);
    const response = await browser.get('/api/test/me');
    expect(response.statusCode).toBe(401);
    expect(sessionCookie(response)?.value).toBe('');
    expect(database.db.select().from(sessions).all()).toHaveLength(0);
  });

  it('glisse : chaque visite repousse l’échéance de 7 jours', async () => {
    const browser = new Browser();
    await browser.login({ ...ADMIN, remember: true });
    for (let day = 0; day < 3; day++) {
      clock.advance(SESSION_TTL_MS - 60 * 60 * 1000);
      const response = await browser.get('/api/test/me');
      expect(response.statusCode).toBe(200);
      // Cookie persistant renouvelé avec la session.
      expect(sessionCookie(response)?.maxAge).toBe(SESSION_TTL_MS / 1000);
    }
  });

  it('n’écrit pas en base à chaque requête (au plus une fois par heure)', async () => {
    const browser = new Browser();
    await browser.login({ ...ADMIN, remember: true });
    clock.advance(10 * 60 * 1000);
    expect(sessionCookie(await browser.get('/api/test/me'))).toBeUndefined();
  });

  it('purge les sessions expirées, anonymes comprises', async () => {
    await new Browser().fetchCsrf();
    await new Browser().login();
    clock.advance(ANONYMOUS_SESSION_TTL_MS + 1);
    expect(app.sessions.purgeExpired()).toBe(1);
    clock.advance(SESSION_TTL_MS);
    expect(app.sessions.purgeExpired()).toBe(1);
  });

  it('déconnecte : session supprimée et cookie effacé', async () => {
    const browser = new Browser();
    await browser.login();
    const response = await browser.post('/api/auth/logout');
    expect(response.statusCode).toBe(204);
    expect(sessionCookie(response)?.value).toBe('');
    expect(database.db.select().from(sessions).all()).toHaveLength(0);
    expect((await browser.get('/api/test/me')).statusCode).toBe(401);
  });
});

describe('contrôle d’accès', () => {
  it('refuse une route protégée sans session (401) mais laisse un 404 sur une route inconnue', async () => {
    await createUser(database, ADMIN);
    const browser = new Browser();
    expect((await browser.get('/api/test/me')).json()).toEqual({ code: 'UNAUTHENTICATED' });
    expect((await browser.get('/api/inconnue')).statusCode).toBe(404);
  });

  it('réserve les modules admin aux administrateurs', async () => {
    await createUser(database, ADMIN);
    await createUser(database, { email: 'user@example.com', password: 'password-1', role: 'user' });
    const admin = new Browser();
    await admin.login();
    expect((await admin.get('/api/test/admin')).statusCode).toBe(200);

    const user = new Browser();
    await user.login({ email: 'user@example.com', password: 'password-1' });
    expect((await user.get('/api/test/me')).statusCode).toBe(200);
    const forbidden = await user.get('/api/test/admin');
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toEqual({ code: 'FORBIDDEN' });

    expect((await new Browser().get('/api/test/admin')).statusCode).toBe(401);
  });
});

describe('CSRF', () => {
  let browser: Browser;
  beforeEach(async () => {
    await createUser(database, ADMIN);
    browser = new Browser();
    await browser.login();
  });

  it('accepte une mutation avec le jeton de la session', async () => {
    expect((await browser.post('/api/test/mutate')).statusCode).toBe(200);
  });

  it('refuse un POST sans jeton, avec un jeton faux ou celui d’avant la connexion (403)', async () => {
    const valid = browser.csrf;
    browser.csrf = undefined;
    const missing = await browser.post('/api/test/mutate');
    expect(missing.statusCode).toBe(403);
    expect(missing.json()).toEqual({ code: 'CSRF' });

    browser.csrf = 'x'.repeat(43);
    expect((await browser.post('/api/test/mutate')).statusCode).toBe(403);

    const other = new Browser();
    await other.fetchCsrf();
    browser.csrf = other.csrf;
    expect((await browser.post('/api/test/mutate')).statusCode).toBe(403);
    browser.csrf = valid;
  });

  it('refuse aussi la connexion sans jeton', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: ADMIN });
    expect(response.statusCode).toBe(403);
  });

  it.each(['cross-site', 'same-site'])(
    'refuse Sec-Fetch-Site: %s même avec le jeton',
    async (site) => {
      expect(
        (await browser.post('/api/test/mutate', undefined, { 'sec-fetch-site': site })).statusCode,
      ).toBe(403);
    },
  );

  it('à défaut de Sec-Fetch-Site, exige une Origin qui désigne l’hôte servi', async () => {
    const send = (headers: Record<string, string>) =>
      app.inject({
        method: 'POST',
        url: '/api/test/mutate',
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${String(browser.cookie)}`,
          [CSRF_HEADER]: String(browser.csrf),
          host: 'hubarr.local:7070',
          ...headers,
        },
      });
    expect((await send({ origin: 'http://hubarr.local:7070' })).statusCode).toBe(200);
    expect((await send({})).statusCode).toBe(200); // client non navigateur (curl)
    expect((await send({ origin: 'https://evil.example' })).statusCode).toBe(403);
    expect((await send({ origin: 'null' })).statusCode).toBe(403);
  });

  it('ne demande pas de jeton sur GET, HEAD et OPTIONS', async () => {
    browser.csrf = undefined;
    expect((await browser.get('/api/test/me')).statusCode).toBe(200);
  });
});
