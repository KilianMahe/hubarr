// SPDX-License-Identifier: AGPL-3.0-or-later
// Export et import de la configuration : port des tests d'`AdminSettingsControllerTest`
// (export sans secret avec les instances, import qui recrée les instances sans clé)
// au format de Hubarr.

import { IMPORT_MAX_BYTES, type ImportResult, type SettingsResponse } from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app';
import type { AppDatabase } from '../../../src/db/client';
import {
  apiKeyOf,
  createInstance,
  getInstanceBySlug,
  listInstances,
} from '../../../src/modules/instances/instances';
import { applyServicePatch, readServiceConfig } from '../../../src/modules/services/config';
import { readDashboardLayout, readDisplayValues } from '../../../src/modules/settings/preferences';
import { getSetting, setSetting } from '../../../src/modules/settings/settings';
import { CSRF_HEADER, SESSION_COOKIE_NAME } from '@hubarr/shared';
import { TestBrowser, UNUSED_DATA_DIR, createTestDatabase, createUser } from '../../helpers';

const noDns = { resolve: () => Promise.resolve<string[]>([]) };
let database: AppDatabase;
let app: FastifyInstance;
let browser: TestBrowser;

beforeEach(async () => {
  database = await createTestDatabase();
  app = buildApp({ database, dataDir: UNUSED_DATA_DIR, ...noDns });
  await createUser(database, { email: 'admin@example.com', password: 'password-1' });
  browser = new TestBrowser(() => app);
  await browser.login({ email: 'admin@example.com', password: 'password-1' });
});
afterEach(async () => {
  await app.close();
});

/** Envoie un fichier brut, comme le front (`fetch(url, { body: file })`). */
async function upload(content: string) {
  return app.inject({
    method: 'POST',
    url: '/api/admin/settings/import',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${browser.cookie ?? ''}`,
      [CSRF_HEADER]: browser.csrf ?? '',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
    },
    payload: content,
  });
}

async function seed() {
  applyServicePatch(database.db, 'prowlarr', { url: 'http://p:9696', apiKey: 'prowlarr-secret' });
  applyServicePatch(database.db, 'qbittorrent', {
    url: 'http://q',
    user: 'admin',
    password: 'qbit-secret',
  });
  applyServicePatch(database.db, 'seerr', { enabled: false });
  await createInstance(
    database.db,
    'radarr',
    { name: 'Radarr', url: 'http://r:7878', apiKey: 'radarr-secret', defaultQualityProfileId: 4 },
    noDns,
  );
  await createInstance(
    database.db,
    'sonarr',
    { name: 'Sonarr', url: 'http://s:8989', apiKey: 'sonarr-secret' },
    noDns,
  );
  setSetting(database.db, 'display_theme', 'nord');
  setSetting(database.db, 'display_language', 'fr');
  setSetting(database.db, 'sidebar_hide_tmdb', true);
  setSetting(database.db, 'dashboard_section_order', ['recent', 'health']);
  setSetting(database.db, 'dashboard_hide_plex', true);
}

describe('export', () => {
  it('sans aucun secret, avec services et instances, en pièce jointe', async () => {
    await seed();
    const response = await browser.get('/api/admin/settings/export');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toMatch(
      /^attachment; filename="hubarr-config-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    for (const secret of ['prowlarr-secret', 'qbit-secret', 'radarr-secret', 'sonarr-secret']) {
      expect(response.body).not.toContain(secret);
    }
    const body = response.json<Record<string, unknown>>();
    expect(body.hubarr_export_version).toBe(1);
    expect(body.settings).toEqual({
      dashboard_hide_plex: true,
      dashboard_section_order: ['recent', 'health'],
      display_language: 'fr',
      display_theme: 'nord',
      sidebar_hide_tmdb: true,
    });
    expect(body.services).toEqual({
      prowlarr: { url: 'http://p:9696', user: '', enabled: true },
      qbittorrent: { url: 'http://q', user: 'admin', enabled: true },
      seerr: { url: '', user: '', enabled: false },
    });
    expect(body.instances).toEqual([
      {
        type: 'radarr',
        slug: 'radarr',
        name: 'Radarr',
        url: 'http://r:7878',
        enabled: true,
        position: 0,
        is_default: true,
        default_quality_profile_id: 4,
      },
      {
        type: 'sonarr',
        slug: 'sonarr',
        name: 'Sonarr',
        url: 'http://s:8989',
        enabled: true,
        position: 0,
        is_default: true,
        default_quality_profile_id: null,
      },
    ]);
  });

  it('compteurs : entrées exportées, secrets ignorés', async () => {
    await seed();
    const body = (await browser.get('/api/admin/settings')).json<SettingsResponse>();
    expect(body.backup).toEqual({ exportable: 5 + 3 + 2, skipped: 4 });
  });
});

describe('import', () => {
  it('aller-retour : recrée services et instances, sans clé, sur une base neuve', async () => {
    await seed();
    const exported = (await browser.get('/api/admin/settings/export')).body;
    await app.close();

    database = await createTestDatabase();
    app = buildApp({ database, dataDir: UNUSED_DATA_DIR, ...noDns });
    await createUser(database, { email: 'admin@example.com', password: 'password-1' });
    browser = new TestBrowser(() => app);
    await browser.login({ email: 'admin@example.com', password: 'password-1' });

    const response = await upload(exported);
    expect(response.json<ImportResult>()).toEqual({
      applied: 8,
      skipped: 0,
      instancesApplied: 2,
      instancesSkipped: 0,
    });
    expect(readServiceConfig(database.db, 'qbittorrent')).toMatchObject({
      url: 'http://q',
      user: 'admin',
      password: '',
    });
    expect(readServiceConfig(database.db, 'prowlarr')).toMatchObject({
      url: 'http://p:9696',
      apiKey: '',
    });
    expect(readServiceConfig(database.db, 'seerr').enabled).toBe(false);
    const radarr = getInstanceBySlug(database.db, 'radarr', 'radarr');
    expect(radarr).toMatchObject({ url: 'http://r:7878', isDefault: true });
    expect(radarr && apiKeyOf(radarr)).toBeNull();
    expect(readDisplayValues(database.db)).toMatchObject({
      display_theme: 'nord',
      display_language: 'fr',
    });
    expect(getSetting(database.db, 'sidebar_hide_tmdb')).toBe(true);
    expect(readDashboardLayout(database.db)[0]).toEqual({ key: 'recent', visible: true });
    expect(readDashboardLayout(database.db).find((row) => row.key === 'plex')?.visible).toBe(false);
  });

  it('instance existante : mise à jour en gardant sa clé ; aucune suppression ; défaut appliqué à la fin', async () => {
    await createInstance(
      database.db,
      'radarr',
      { name: 'Old', url: 'http://old', apiKey: 'kept' },
      noDns,
    );
    await createInstance(database.db, 'radarr', { name: 'Local', url: 'http://local' }, noDns);
    const response = await upload(
      JSON.stringify({
        hubarr_export_version: 1,
        settings: {},
        instances: [
          {
            type: 'radarr',
            slug: 'old',
            name: 'Renamed',
            url: 'http://old/radarr',
            enabled: true,
            position: 3,
          },
          {
            type: 'radarr',
            slug: 'radarr-4k',
            name: 'Radarr 4K',
            url: 'http://4k',
            enabled: true,
            position: 1,
            is_default: true,
          },
          { type: 'prowlarr', slug: 'x', name: 'x', url: 'http://x' },
          { type: 'radarr', slug: 'bad', name: 'Bad', url: 'file:///etc/passwd' },
          'nope',
        ],
      }),
    );
    expect(response.json<ImportResult>()).toMatchObject({
      instancesApplied: 2,
      instancesSkipped: 3,
    });
    const old = getInstanceBySlug(database.db, 'radarr', 'old');
    expect(old).toMatchObject({
      name: 'Renamed',
      url: 'http://old/radarr',
      position: 3,
      isDefault: false,
    });
    expect(old && apiKeyOf(old)).toBe('kept');
    expect(getInstanceBySlug(database.db, 'radarr', 'radarr-4k')?.isDefault).toBe(true);
    expect(
      listInstances(database.db, 'radarr')
        .map((row) => row.slug)
        .sort(),
    ).toEqual(['local', 'old', 'radarr-4k']);
  });

  it('changement d’origine (hôte, port, schéma) : secrets enregistrés effacés', async () => {
    await createInstance(
      database.db,
      'radarr',
      { name: 'Radarr', url: 'http://radarr:7878', apiKey: 'radarr-secret' },
      noDns,
    );
    applyServicePatch(database.db, 'prowlarr', { url: 'http://p:9696', apiKey: 'prowlarr-secret' });
    applyServicePatch(database.db, 'qbittorrent', {
      url: 'http://q:8080',
      user: 'admin',
      password: 'qbit-secret',
    });
    applyServicePatch(database.db, 'tautulli', { url: 'http://t:8181', apiKey: 'tautulli-secret' });
    const response = await upload(
      JSON.stringify({
        hubarr_export_version: 1,
        settings: {},
        services: {
          prowlarr: { url: 'https://attacker.example' },
          qbittorrent: { url: 'http://q:9090' },
          // Même origine : rien n'est effacé.
          tautulli: { url: 'http://t:8181/' },
        },
        instances: [{ type: 'radarr', slug: 'radarr', name: 'Radarr', url: 'https://evil:7878' }],
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(readServiceConfig(database.db, 'prowlarr')).toMatchObject({
      url: 'https://attacker.example',
      apiKey: '',
    });
    expect(readServiceConfig(database.db, 'qbittorrent')).toMatchObject({
      url: 'http://q:9090',
      user: 'admin',
      password: '',
    });
    expect(readServiceConfig(database.db, 'tautulli').apiKey).toBe('tautulli-secret');
    const radarr = getInstanceBySlug(database.db, 'radarr', 'radarr');
    expect(radarr?.url).toBe('https://evil:7878');
    expect(radarr && apiKeyOf(radarr)).toBeNull();
  });

  it('secrets glissés dans le fichier ignorés, clés inconnues comptées', async () => {
    const response = await upload(
      JSON.stringify({
        hubarr_export_version: 1,
        settings: {
          prowlarr_api_key: 'evil',
          setup_completed: false,
          display_page_size: '50',
          unknown_key: 'x',
        },
        services: {
          prowlarr: { url: 'http://p', apiKey: 'evil', password: 'evil' },
          radarr: { url: 'http://r' },
          nope: {},
        },
      }),
    );
    expect(response.json<ImportResult>()).toMatchObject({ applied: 2, skipped: 5 });
    expect(readServiceConfig(database.db, 'prowlarr')).toMatchObject({
      url: 'http://p',
      apiKey: '',
      password: '',
    });
    expect(readDisplayValues(database.db).display_page_size).toBe('50');
    expect(getSetting(database.db, 'setup_completed')).toBe(true);
  });

  it.each([
    ['JSON invalide', '{ pas du json', 'admin.import.invalid_json'],
    [
      'trop imbriqué',
      JSON.stringify({ a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } }),
      'admin.import.invalid_json',
    ],
    [
      'export de Prismarr',
      JSON.stringify({ prismarr_export_version: 2, settings: {} }),
      'admin.import.unknown_format',
    ],
    [
      'version inconnue',
      JSON.stringify({ hubarr_export_version: 99, settings: {} }),
      'admin.import.unknown_format',
    ],
    ['sans réglages', JSON.stringify({ hubarr_export_version: 1 }), 'admin.import.unknown_format'],
    ['vide', '', 'admin.import.no_file'],
  ])('refus : %s', async (_label, content, key) => {
    const response = await upload(content);
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'VALIDATION', details: [{ message: key }] });
  });

  it('fichier de plus de 64 Ko → 413', async () => {
    const response = await upload(
      JSON.stringify({ hubarr_export_version: 1, settings: {}, pad: 'x'.repeat(IMPORT_MAX_BYTES) }),
    );
    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ code: 'PAYLOAD_TOO_LARGE' });
  });

  it('réservé aux admins, jeton CSRF exigé', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/settings/import',
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${browser.cookie ?? ''}`,
        'content-type': 'application/json',
      },
      payload: '{}',
    });
    expect(response.statusCode).toBe(403);
    expect((await new TestBrowser(() => app).get('/api/admin/settings/export')).statusCode).toBe(
      401,
    );
  });
});
