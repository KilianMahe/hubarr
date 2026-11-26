// SPDX-License-Identifier: AGPL-3.0-or-later
// Assistant d'installation et garde « installation requise » (P0.7). Portage de
// `SetupControllerTest` et `SetupRedirectSubscriberTest`.
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app';
import type { AppDatabase } from '../../../src/db/client';
import { settings, users } from '../../../src/db/schema';
import { SETTING_KEYS, getSetting } from '../../../src/modules/settings/settings';
import { verifyPassword } from '../../../src/security/password';
import {
  TestBrowser,
  createClock,
  createTestDatabase,
  createUser,
  UNUSED_DATA_DIR,
} from '../../helpers';

const ADMIN = {
  email: 'Joshua@Example.com',
  displayName: 'Joshua',
  password: 'secret-enough',
  passwordConfirm: 'secret-enough',
};

const testRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/test/me', { config: { access: 'user' } }, async (request) => ({
    user: request.user,
  }));
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

/** Visiteur qui a déjà chargé le shell (`/api/bootstrap` fournit le jeton CSRF). */
async function visitor(): Promise<TestBrowser> {
  const browser = new TestBrowser(() => app);
  browser.csrf = (await browser.get('/api/bootstrap')).json<{ csrfToken: string }>().csrfToken;
  return browser;
}

const storedSettings = () => database.db.select().from(settings).all();

describe('GET /api/setup', () => {
  it('envoie une installation vierge sur l’accueil de l’assistant, sans rien écrire', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/setup' });
    expect(response.json()).toEqual({ next: 'welcome' });
    expect(storedSettings()).toEqual([]);
  });

  it('clôt une installation à moitié faite et passe aux services', async () => {
    await createUser(database, { email: 'a@b.c', password: 'password-1', completeSetup: false });
    const browser = await visitor();
    await browser.post('/api/setup/locale', { locale: 'fr' });

    expect((await browser.get('/api/setup')).json()).toEqual({ next: 'services' });
    expect(getSetting(database.db, SETTING_KEYS.setupCompleted)).toBe(true);
    // Le visiteur n'est peut-être pas l'admin : sa langue n'est pas promue.
    expect(getSetting(database.db, SETTING_KEYS.displayLanguage)).toBeUndefined();
  });

  it('ferme l’assistant une fois l’installation terminée', async () => {
    await createUser(database, { email: 'a@b.c', password: 'password-1' });
    expect((await app.inject({ method: 'GET', url: '/api/setup' })).json()).toEqual({
      next: 'home',
    });

    const locale = await (await visitor()).post('/api/setup/locale', { locale: 'fr' });
    expect(locale.statusCode).toBe(409);
    expect(locale.json()).toEqual({ code: 'SETUP_COMPLETED' });
  });
});

describe('POST /api/setup/locale', () => {
  it('garde la langue en session, et la session prime pour /api/bootstrap', async () => {
    const browser = await visitor();
    expect((await browser.post('/api/setup/locale', { locale: 'fr' })).statusCode).toBe(204);
    expect((await browser.get('/api/bootstrap')).json()).toMatchObject({ locale: 'fr' });
    expect(storedSettings()).toEqual([]);
  });

  it('refuse une langue inconnue (400) et une requête sans jeton CSRF (403)', async () => {
    const browser = await visitor();
    expect((await browser.post('/api/setup/locale', { locale: 'zz' })).statusCode).toBe(400);
    browser.csrf = undefined;
    expect((await browser.post('/api/setup/locale', { locale: 'fr' })).statusCode).toBe(403);
  });
});

describe('POST /api/setup/admin', () => {
  it('crée l’admin, le connecte, clôt l’installation et promeut la langue', async () => {
    const browser = await visitor();
    await browser.post('/api/setup/locale', { locale: 'fr' });
    const anonymousCsrf = browser.csrf;

    const response = await browser.post('/api/setup/admin', ADMIN);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ csrfToken: string }>();
    expect(body).toMatchObject({
      next: 'services',
      user: { id: 1, email: 'joshua@example.com', role: 'admin', displayName: 'Joshua' },
    });
    expect(body.csrfToken).not.toBe(anonymousCsrf);

    const row = database.db.select().from(users).get();
    expect(row?.role).toBe('admin');
    expect(row?.lastLoginAt?.getTime()).toBe(clock.now());
    expect(await verifyPassword(row?.passwordHash ?? '', ADMIN.password)).toBe(true);
    expect(getSetting(database.db, SETTING_KEYS.setupCompleted)).toBe(true);
    expect(getSetting(database.db, SETTING_KEYS.displayLanguage)).toBe('fr');

    // Connecté dans une session régénérée, qui ne porte plus la langue de l'assistant :
    // la préférence permanente prend le relais.
    expect((await browser.get('/api/test/me')).statusCode).toBe(200);
    expect((await browser.get('/api/bootstrap')).json()).toMatchObject({
      setupRequired: false,
      locale: 'fr',
      user: { id: 1 },
    });
  });

  it('laisse le nom affiché facultatif', async () => {
    const response = await (
      await visitor()
    ).post('/api/setup/admin', {
      ...ADMIN,
      displayName: '  ',
    });
    expect(response.json()).toMatchObject({ user: { displayName: 'joshua@example.com' } });
    expect(database.db.select().from(users).get()?.displayName).toBeNull();
  });

  it('ne propose jamais de second compte', async () => {
    await createUser(database, { email: 'a@b.c', password: 'password-1', completeSetup: false });
    const response = await (await visitor()).post('/api/setup/admin', ADMIN);
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: 'SETUP_COMPLETED' });
    expect(database.db.select().from(users).all()).toHaveLength(1);
  });

  it('ne crée qu’un admin quand deux requêtes se croisent', async () => {
    const [first, second] = await Promise.all([visitor(), visitor()]);
    const responses = await Promise.all([
      first.post('/api/setup/admin', ADMIN),
      second.post('/api/setup/admin', { ...ADMIN, email: 'other@example.com' }),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect(database.db.select().from(users).all()).toHaveLength(1);
  });

  it('refuse une saisie invalide sans rien créer, en signalant toutes les erreurs', async () => {
    const response = await (
      await visitor()
    ).post('/api/setup/admin', {
      email: 'not-an-email',
      password: 'short',
      passwordConfirm: 'different',
    });
    expect(response.statusCode).toBe(400);
    const body = response.json<{ code: string; details: { message: string }[] }>();
    expect(body.code).toBe('VALIDATION');
    expect(body.details.map((issue) => issue.message).sort()).toEqual([
      'setup.error.email_invalid',
      'setup.error.password_mismatch',
      'setup.error.password_too_short',
    ]);
    expect(database.db.select().from(users).all()).toEqual([]);
    expect(storedSettings()).toEqual([]);
  });

  it('refuse un jeton CSRF invalide sans rien créer', async () => {
    const browser = await visitor();
    browser.csrf = 'x'.repeat(43);
    expect((await browser.post('/api/setup/admin', ADMIN)).statusCode).toBe(403);
    expect(database.db.select().from(users).all()).toEqual([]);
  });
});

describe('garde « installation requise »', () => {
  it('bloque les routes protégées tant que l’installation n’est pas terminée', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/test/me' });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ code: 'SETUP_REQUIRED' });
  });

  it('laisse passer les routes publiques et répond 404 sur une route inconnue', async () => {
    for (const url of ['/api/health', '/api/bootstrap', '/api/setup', '/api/auth/csrf']) {
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(200);
    }
    expect((await app.inject({ method: 'GET', url: '/api/inconnue' })).statusCode).toBe(404);
  });

  it('laisse passer une fois l’installation terminée, sans relire la base ensuite', async () => {
    await createUser(database, { email: 'a@b.c', password: 'password-1' });
    expect((await app.inject({ method: 'GET', url: '/api/test/me' })).statusCode).toBe(401);
    // L'état « terminé » est mémorisé : il ne peut pas revenir en arrière.
    database.db.delete(settings).run();
    expect((await app.inject({ method: 'GET', url: '/api/test/me' })).statusCode).toBe(401);
  });

  it('relit l’état tant que l’installation n’est pas terminée', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/test/me' })).statusCode).toBe(409);
    await createUser(database, { email: 'a@b.c', password: 'password-1' });
    expect((await app.inject({ method: 'GET', url: '/api/test/me' })).statusCode).toBe(401);
  });

  it('laisse passer si l’état est illisible (table absente)', async () => {
    database.sqlite.exec('DROP TABLE setting');
    expect((await app.inject({ method: 'GET', url: '/api/test/me' })).statusCode).toBe(401);
  });
});
