// SPDX-License-Identifier: AGPL-3.0-or-later
// Politiques d'accès de toutes les routes de l'application (`plugins/access.ts`) :
// - une route sans politique empêche le démarrage ;
// - sans session, toute route non publique répond 401 ;
// - un compte sans aucun droit reçoit 403 sur toute route qui n'est ni
//   publique ni ouverte à tout compte connecté (`access: 'user'`), avant la
//   validation et avant tout état de configuration ;
// - la liste des routes `user` est figée : en ajouter une est une décision
//   à relire (elle doit filtrer elle-même selon `request.access`).

import { CSRF_HEADER, SESSION_COOKIE_NAME } from '@hubarr/shared';
import type { FastifyInstance, HTTPMethods } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { guardAdminModule } from '../../src/plugins/access';
import { TestBrowser, UNUSED_DATA_DIR, createTestDatabase, createUser } from '../helpers';

interface RouteEntry {
  method: HTTPMethods;
  url: string;
  access: string | undefined;
}

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

const ok = async () => ({ ok: true });

describe('déclaration obligatoire', () => {
  it('une route sans politique empêche le démarrage', async () => {
    app = buildApp({
      database: await createTestDatabase(),
      dataDir: UNUSED_DATA_DIR,
      routes: [
        async (instance) => {
          instance.get('/api/test/oubli', ok);
        },
      ],
    });
    await expect(app.ready()).rejects.toThrow(/GET \/api\/test\/oubli/);
  });

  it('une politique contraire à celle du module est refusée', async () => {
    app = buildApp({
      database: await createTestDatabase(),
      dataDir: UNUSED_DATA_DIR,
      routes: [
        async (instance) => {
          guardAdminModule(instance);
          instance.get('/api/test/fuite', { config: { access: 'public' } }, ok);
        },
      ],
    });
    await expect(app.ready()).rejects.toThrow(/politique « public » dans un module « admin »/);
  });
});

describe('toutes les routes de l’application', () => {
  it('401 sans session, 403 sans droit, routes `user` connues', async () => {
    const database = await createTestDatabase();
    const instance = buildApp({ database, dataDir: UNUSED_DATA_DIR, watchSyncIntervalMs: 0 });
    app = instance;
    const routes: RouteEntry[] = [];
    instance.addHook('onRoute', (route) => {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const method of methods) {
        if (method === 'HEAD') continue;
        routes.push({ method, url: route.url, access: route.config?.access });
      }
    });
    await instance.ready();
    expect(routes.length).toBeGreaterThan(500);

    await createUser(database, { email: 'u@example.com', password: 'password-1', role: 'user' });
    const user = new TestBrowser(() => instance);
    expect((await user.login({ email: 'u@example.com', password: 'password-1' })).statusCode).toBe(
      200,
    );

    const call = async (route: RouteEntry, browser: TestBrowser) => {
      const response = await instance.inject({
        method: route.method,
        // Paramètres remplacés par une valeur quelconque : le refus doit
        // précéder leur validation.
        url: route.url.replace(/:\w+(\([^)]*\))?/g, '1'),
        headers: {
          'sec-fetch-site': 'same-origin',
          ...(browser.cookie === undefined
            ? {}
            : { cookie: `${SESSION_COOKIE_NAME}=${browser.cookie}` }),
          ...(browser.csrf === undefined ? {} : { [CSRF_HEADER]: browser.csrf }),
        },
        ...(route.method === 'GET' ? {} : { payload: {} }),
      });
      return `${route.method} ${route.url} → ${response.statusCode}`;
    };

    // Visiteur anonyme muni d'un jeton CSRF : le refus vient bien de l'accès.
    const visitor = new TestBrowser(() => instance);
    await visitor.fetchCsrf();
    const guarded = routes.filter((route) => route.access !== 'public');
    const anonymous = await Promise.all(guarded.map((route) => call(route, visitor)));
    expect(anonymous.filter((line) => !line.endsWith('→ 401'))).toEqual([]);

    const restricted = guarded.filter((route) => route.access !== 'user');
    const denied = await Promise.all(restricted.map((route) => call(route, user)));
    expect(denied.filter((line) => !line.endsWith('→ 403'))).toEqual([]);

    const open = guarded
      .filter((route) => route.access === 'user')
      .map((route) => `${route.method} ${route.url}`)
      .sort();
    expect(open).toMatchInlineSnapshot(`
      [
        "GET /api/calendrier",
        "GET /api/calendrier.ics",
        "GET /api/events",
        "GET /api/health/diagnose/:service",
        "GET /api/health/services",
        "GET /api/medias/:slug/search",
        "GET /api/medias/:slug/search/online",
        "GET /api/profil",
        "GET /api/profil/avatar/file/:filename",
        "GET /api/profil/tracearr",
        "GET /api/tableau-de-bord",
        "GET /api/tableau-de-bord/quicklook/:type/:slug/:id",
        "GET /api/tableau-de-bord/quicklook/tmdb/:type/:id",
        "GET /api/tableau-de-bord/widget/disks",
        "GET /api/tableau-de-bord/widget/downloads",
        "GET /api/tableau-de-bord/widget/emby",
        "GET /api/tableau-de-bord/widget/health",
        "GET /api/tableau-de-bord/widget/hero",
        "GET /api/tableau-de-bord/widget/plex",
        "GET /api/tableau-de-bord/widget/recent",
        "GET /api/tableau-de-bord/widget/recommendations",
        "GET /api/tableau-de-bord/widget/requests",
        "GET /api/tableau-de-bord/widget/transmission",
        "GET /api/tableau-de-bord/widget/upcoming",
        "GET /api/tracearr/watched",
        "GET /calendrier.ics",
        "POST /api/profil",
        "POST /api/profil/avatar",
        "POST /api/profil/avatar/delete",
        "POST /api/profil/preferences",
        "POST /api/profil/tracearr",
      ]
    `);
  });
});
