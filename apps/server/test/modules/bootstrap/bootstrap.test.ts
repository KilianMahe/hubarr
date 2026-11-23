// SPDX-License-Identifier: AGPL-3.0-or-later
// `GET /api/bootstrap` (P0.7) : état initial du shell.
import {
  SESSION_COOKIE_NAME,
  defaultDisplayValues,
  resolveTheme,
  type BootstrapResponse,
} from '@hubarr/shared';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app';
import { createInstance } from '../../../src/modules/instances/instances';
import { applyServicePatch } from '../../../src/modules/services/config';
import { systemTimezone } from '../../../src/modules/settings/preferences';
import { SETTING_KEYS, setSetting, sidebarHideKey } from '../../../src/modules/settings/settings';
import { TestBrowser, createTestDatabase, createUser, UNUSED_DATA_DIR } from '../../helpers';

describe('GET /api/bootstrap', () => {
  it('décrit une installation vierge et ouvre une session anonyme pour le jeton CSRF', async () => {
    const app = buildApp({
      dataDir: UNUSED_DATA_DIR,
      database: await createTestDatabase(),
      version: '1.2.3',
    });
    const response = await app.inject({ method: 'GET', url: '/api/bootstrap' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ csrfToken: string }>();
    expect(body).toEqual({
      setupRequired: true,
      user: null,
      csrfToken: expect.any(String) as string,
      locale: 'en',
      version: '1.2.3',
      theme: resolveTheme(undefined, undefined),
      services: { states: {}, instances: { radarr: [], sonarr: [] }, sidebar: {} },
      preferences: defaultDisplayValues(systemTimezone()),
    });
    expect(response.cookies.map((cookie) => cookie.name)).toContain(SESSION_COOKIE_NAME);
    await app.close();
  });

  it('renvoie l’utilisateur connecté et la langue préférée', async () => {
    const database = await createTestDatabase();
    const app = buildApp({ dataDir: UNUSED_DATA_DIR, database });
    await createUser(database, { email: 'admin@example.com', password: 'password-1' });
    setSetting(database.db, SETTING_KEYS.displayLanguage, 'fr');

    const browser = new TestBrowser(() => app);
    await browser.login({ email: 'admin@example.com', password: 'password-1' });
    const body = (await browser.get('/api/bootstrap')).json<{ csrfToken: string }>();
    expect(body).toMatchObject({
      setupRequired: false,
      user: { email: 'admin@example.com', role: 'admin' },
      locale: 'fr',
    });
    // Même jeton que celui renvoyé par la connexion.
    expect(body.csrfToken).toBe(browser.csrf);
    await app.close();
  });

  it('décrit les services à un utilisateur connecté seulement', async () => {
    const database = await createTestDatabase();
    const app = buildApp({ dataDir: UNUSED_DATA_DIR, database });
    await createUser(database, { email: 'admin@example.com', password: 'password-1' });
    applyServicePatch(database.db, 'prowlarr', { url: 'http://p', apiKey: 'secret-key' });
    applyServicePatch(database.db, 'seerr', { url: 'http://s', apiKey: 'k', enabled: false });
    await createInstance(
      database.db,
      'radarr',
      { name: 'Radarr 4K', url: 'http://r', apiKey: 'rk' },
      { resolve: () => Promise.resolve([]) },
    );
    setSetting(database.db, sidebarHideKey('calendar'), true);

    const anonymous = (
      await app.inject({ method: 'GET', url: '/api/bootstrap' })
    ).json<BootstrapResponse>();
    expect(anonymous.services.states).toEqual({});

    const browser = new TestBrowser(() => app);
    await browser.login({ email: 'admin@example.com', password: 'password-1' });
    const response = await browser.get('/api/bootstrap');
    const { services } = response.json<BootstrapResponse>();
    expect(services.states.prowlarr).toEqual({ configured: true, disabled: false });
    expect(services.states.seerr).toEqual({ configured: false, disabled: true });
    expect(services.states.radarr).toEqual({ configured: true, disabled: false });
    expect(services.instances.radarr).toEqual([
      { slug: 'radarr-4k', name: 'Radarr 4K', enabled: true, isDefault: true },
    ]);
    expect(services.sidebar).toMatchObject({ calendar: false, tmdb: true });
    // Ni clé ni URL de service dans le bootstrap.
    for (const secret of ['secret-key', '"rk"', 'http://p', 'http://r'])
      expect(response.body).not.toContain(secret);
    await app.close();
  });

  it('ignore une préférence de langue invalide', async () => {
    const database = await createTestDatabase();
    const app = buildApp({ dataDir: UNUSED_DATA_DIR, database });
    setSetting(database.db, SETTING_KEYS.displayLanguage, 'zz');
    expect((await app.inject({ method: 'GET', url: '/api/bootstrap' })).json()).toMatchObject({
      locale: 'en',
    });
    await app.close();
  });

  it('renvoie le thème et l’accent choisis', async () => {
    const database = await createTestDatabase();
    const app = buildApp({ dataDir: UNUSED_DATA_DIR, database });
    setSetting(database.db, SETTING_KEYS.displayTheme, 'nord');
    setSetting(database.db, SETTING_KEYS.displayThemeColor, 'orange');
    const body = (await app.inject({ method: 'GET', url: '/api/bootstrap' })).json<unknown>();
    expect(body).toMatchObject({
      theme: { kind: 'preset', key: 'nord', accent: 'orange', primary: '#f59e0b' },
    });
    await app.close();
  });
});
