// SPDX-License-Identifier: AGPL-3.0-or-later
// Préférences d'affichage, mise en page et langues : port de
// `DisplayPreferencesServiceTest` (défauts, valeurs enregistrées, valeur vide ou
// inconnue), `DashboardLayoutServiceTest`, `DashboardSectionsTest`,
// `AdminSettingsControllerTest` (mise en page, `languagesSave` par instance),
// `resetDisplay`.

import { DASHBOARD_SECTIONS, type LanguagesResponse, type SettingsResponse } from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../../src/app';
import type { AppDatabase } from '../../../src/db/client';
import { createInstance } from '../../../src/modules/instances/instances';
import { applyServicePatch } from '../../../src/modules/services/config';
import {
  applyDisplayPatch,
  normalizeDisplayValue,
  readDashboardLayout,
  readDisplayValues,
  readResolvedPreferences,
  saveDashboardLayout,
  systemTimezone,
} from '../../../src/modules/settings/preferences';
import { getSetting, setSetting } from '../../../src/modules/settings/settings';
import { TestBrowser, UNUSED_DATA_DIR, createTestDatabase, createUser } from '../../helpers';

const noDns = { resolve: () => Promise.resolve<string[]>([]) };
let database: AppDatabase;
beforeEach(async () => {
  database = await createTestDatabase();
});
afterEach(() => {
  database.close();
});

describe('préférences d’affichage', () => {
  it('valeurs par défaut sans rien d’enregistré', () => {
    expect(readDisplayValues(database.db)).toMatchObject({
      display_home_page: 'dashboard',
      display_toasts: '1',
      display_timezone: '',
      display_date_format: 'fr',
      display_time_format: '24h',
      display_theme_color: 'theme_default',
      display_qbit_refresh: '2',
      display_ui_density: 'comfortable',
      display_page_size: '200',
      display_language: 'en',
      display_metadata_language: 'en-US',
    });
    // Fuseau vide : celui du système pour le front.
    expect(readResolvedPreferences(database.db).display_timezone).toBe(systemTimezone());
  });

  it('les valeurs enregistrées remplacent les défauts ; vide ou inconnue → défaut', () => {
    applyDisplayPatch(database.db, {
      display_home_page: 'films',
      display_timezone: 'America/New_York',
      display_date_format: 'iso',
      display_time_format: '12h',
      display_theme_color: 'green',
      display_qbit_refresh: '5',
      display_ui_density: 'compact',
    });
    expect(readDisplayValues(database.db)).toMatchObject({
      display_home_page: 'films',
      display_timezone: 'America/New_York',
      display_date_format: 'iso',
      display_time_format: '12h',
      display_theme_color: 'green',
      display_qbit_refresh: '5',
      display_ui_density: 'compact',
    });
    applyDisplayPatch(database.db, {
      display_home_page: '',
      display_theme_color: 'neon-yellow',
      display_timezone: 'Mars/Olympus',
    });
    expect(readDisplayValues(database.db)).toMatchObject({
      display_home_page: 'dashboard',
      display_theme_color: 'theme_default',
      display_timezone: '',
    });
    // Valeur invalide écrite à la main : ignorée à la lecture.
    setSetting(database.db, 'display_page_size', '7');
    expect(readDisplayValues(database.db).display_page_size).toBe('200');
  });

  it('normalisation : interrupteur en 1/0, fuseau connu, valeur de la liste', () => {
    expect(normalizeDisplayValue('display_toasts', '1')).toBe('1');
    expect(normalizeDisplayValue('display_toasts', 'yes')).toBe('0');
    expect(normalizeDisplayValue('display_timezone', 'Europe/Paris')).toBe('Europe/Paris');
    expect(normalizeDisplayValue('display_timezone', 'Nope/Nope')).toBeNull();
    expect(normalizeDisplayValue('display_page_size', '500')).toBe('500');
    expect(normalizeDisplayValue('display_theme', 'dracula')).toBe('dracula');
    expect(normalizeDisplayValue('display_theme', 'nope')).toBeNull();
  });

  it('les préférences de langue ne passent pas par la section Affichage', () => {
    applyDisplayPatch(database.db, { display_language: 'fr', display_metadata_language: 'fr-FR' });
    expect(readDisplayValues(database.db)).toMatchObject({
      display_language: 'en',
      display_metadata_language: 'en-US',
    });
  });
});

describe('mise en page du tableau de bord', () => {
  it('ordre par défaut, tout visible ; 10 sections connues (files d’attente, P5d.1)', () => {
    expect(DASHBOARD_SECTIONS).toHaveLength(10);
    expect(readDashboardLayout(database.db)).toEqual(
      DASHBOARD_SECTIONS.map((key) => ({ key, visible: true })),
    );
  });

  it('ordre enregistré respecté, inconnues et doublons ignorés, manquantes ajoutées', () => {
    saveDashboardLayout(database.db, {
      order: ['recent', 'nope', 'health', 'recent'],
      hidden: ['plex', 'zzz'],
    });
    const layout = readDashboardLayout(database.db);
    expect(layout.slice(0, 3).map((row) => row.key)).toEqual(['recent', 'health', 'upcoming']);
    expect(layout).toHaveLength(10);
    expect(layout.find((row) => row.key === 'plex')?.visible).toBe(false);
    // Ordre de l'original (chaîne « a,b ») toujours lu.
    setSetting(database.db, 'dashboard_section_order', 'trending, upcoming');
    expect(readDashboardLayout(database.db)[0]?.key).toBe('trending');
  });

  it('ordre vide : réglage supprimé', () => {
    saveDashboardLayout(database.db, { order: ['recent'], hidden: [] });
    saveDashboardLayout(database.db, { order: [], hidden: [] });
    expect(getSetting(database.db, 'dashboard_section_order')).toBeUndefined();
  });
});

describe('routes', () => {
  let app: FastifyInstance;
  let agent: MockAgent;
  let browser: TestBrowser;

  beforeEach(async () => {
    agent = new MockAgent();
    agent.disableNetConnect();
    app = buildApp({
      database,
      dataDir: UNUSED_DATA_DIR,
      dispatcher: agent,
      resolve: () => Promise.resolve([]),
    });
    await createUser(database, { email: 'admin@example.com', password: 'password-1' });
    browser = new TestBrowser(() => app);
    await browser.login({ email: 'admin@example.com', password: 'password-1' });
  });
  afterEach(async () => {
    await app.close();
    await agent.close();
  });

  it('enregistre préférences et mise en page ; le thème résolu suit', async () => {
    const body = (
      await browser.post('/api/admin/settings', {
        display: { display_theme: 'nord', display_theme_color: 'orange', display_toasts: '0' },
        dashboard: { order: ['health'], hidden: ['recent'] },
      })
    ).json<SettingsResponse>();
    expect(body.display).toMatchObject({ display_theme: 'nord', display_toasts: '0' });
    expect(body.theme).toMatchObject({ kind: 'preset', key: 'nord', accent: 'orange' });
    expect(body.dashboard[0]).toEqual({ key: 'health', visible: true });
    expect(body.dashboard.find((row) => row.key === 'recent')?.visible).toBe(false);
    expect(body.timezones).toContain('Europe/Paris');
  });

  it('POST dashboard-layout (mode édition du dashboard)', async () => {
    const response = await browser.post('/api/admin/settings/dashboard-layout', {
      order: ['trending', 'upcoming'],
      hidden: ['emby'],
    });
    expect(response.json()).toEqual({ ok: true });
    const layout = readDashboardLayout(database.db);
    expect(layout[0]?.key).toBe('trending');
    expect(layout.find((row) => row.key === 'emby')?.visible).toBe(false);
  });

  it('reset-display : préférences et mise en page par défaut, services intacts', async () => {
    applyServicePatch(database.db, 'prowlarr', { url: 'http://p', apiKey: 'k' });
    await browser.post('/api/admin/settings', {
      display: { display_page_size: '50' },
      dashboard: { order: ['recent'], hidden: ['plex'] },
    });
    setSetting(database.db, 'display_language', 'fr');
    const body = (await browser.post('/api/admin/settings/reset-display')).json<SettingsResponse>();
    expect(body.display.display_page_size).toBe('200');
    expect(body.display.display_language).toBe('en');
    expect(body.dashboard.every((row) => row.visible)).toBe(true);
    expect(body.dashboard[0]?.key).toBe('upcoming');
    expect(body.services.prowlarr.saved).toBe(true);
  });

  it('langues : lecture par instance, service injoignable signalé sans bloquer les autres', async () => {
    await createInstance(
      database.db,
      'radarr',
      { name: 'Radarr', url: 'http://r1.test', apiKey: 'k1' },
      noDns,
    );
    await createInstance(
      database.db,
      'radarr',
      { name: 'Radarr 4K', url: 'http://r2.test', apiKey: 'k2' },
      noDns,
    );
    applyServicePatch(database.db, 'seerr', { url: 'http://seerr.test', apiKey: 'k' });
    const r1 = agent.get('http://r1.test');
    r1.intercept({ path: '/api/v3/config/ui' }).reply(200, {
      id: 1,
      uiLanguage: 1,
      movieInfoLanguage: 2,
    });
    r1.intercept({ path: '/api/v3/language' }).reply(200, [
      { id: 1, name: 'English' },
      { id: 2, name: 'French' },
    ]);
    agent
      .get('http://r2.test')
      .intercept({ path: '/api/v3/config/ui' })
      .replyWithError(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
    agent.get('http://r2.test').intercept({ path: '/api/v3/language' }).reply(200, []);
    agent
      .get('http://seerr.test')
      .intercept({ path: '/api/v1/settings/main' })
      .reply(200, { locale: 'fr' });

    const body = (await browser.get('/api/admin/settings/languages')).json<LanguagesResponse>();
    expect(body.hubarr).toEqual({ ui: 'en', metadata: 'en-US' });
    expect(body.radarr[0]).toMatchObject({
      slug: 'radarr',
      current: 1,
      currentInfo: 2,
      error: false,
    });
    expect(body.radarr[0]?.available).toHaveLength(2);
    expect(body.radarr[1]).toMatchObject({ slug: 'radarr-4k', error: true });
    expect(body.prowlarr).toMatchObject({ configured: false });
    expect(body.seerr).toMatchObject({ configured: true, current: 'fr', error: false });
  });

  it('langues : seule l’instance mentionnée est modifiée ; échec nommé', async () => {
    await createInstance(
      database.db,
      'radarr',
      { name: 'Radarr', url: 'http://r1.test', apiKey: 'k1' },
      noDns,
    );
    await createInstance(
      database.db,
      'radarr',
      { name: 'Radarr 4K', url: 'http://r2.test', apiKey: 'k2' },
      noDns,
    );
    await createInstance(
      database.db,
      'sonarr',
      { name: 'Sonarr', url: 'http://s1.test', apiKey: 'ks' },
      noDns,
    );
    const r1 = agent.get('http://r1.test');
    r1.intercept({ path: '/api/v3/config/ui' }).reply(200, {
      id: 1,
      uiLanguage: 1,
      movieInfoLanguage: 1,
    });
    let pushed: unknown;
    r1.intercept({
      path: '/api/v3/config/ui/1',
      method: 'PUT',
      body: (raw) => {
        pushed = JSON.parse(raw);
        return true;
      },
    }).reply(202, {});
    agent.get('http://s1.test').intercept({ path: '/api/v3/config/ui' }).reply(500, 'boom');

    const response = await browser.post('/api/admin/settings/languages/save', {
      hubarrUi: 'fr',
      hubarrMetadata: 'fr-FR',
      radarrUi: { radarr: 2 },
      sonarrUi: { sonarr: 3 },
    });
    expect(response.json()).toEqual({ failed: ['Sonarr'], locale: 'fr' });
    expect(pushed).toEqual({ id: 1, uiLanguage: 2, movieInfoLanguage: 1 });
    expect(readDisplayValues(database.db)).toMatchObject({
      display_language: 'fr',
      display_metadata_language: 'fr-FR',
    });
    // r2 n'a jamais été contacté : un appel non prévu aurait fait échouer le MockAgent.
    expect(agent.pendingInterceptors()).toEqual([]);
  });

  it('langues : valeurs hors liste ignorées', async () => {
    const response = await browser.post('/api/admin/settings/languages/save', {
      hubarrUi: 'de',
      hubarrMetadata: 'ja-JP',
    });
    expect(response.json()).toEqual({ failed: [], locale: 'en' });
  });
});
