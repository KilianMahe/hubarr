// SPDX-License-Identifier: AGPL-3.0-or-later
// Préférences côté client : port de `HomeControllerTest` (page d'accueil choisie,
// dernière visitée, repli, bienvenue), section « Affichage » (thème appliqué,
// mise en page), section « Langues », toasts désactivés.

import {
  DASHBOARD_SECTIONS,
  SERVICE_IDS,
  defaultDisplayValues,
  resolveTheme,
  type BootstrapServices,
  type FlatServiceState,
  type LanguagesResponse,
  type SettingsResponse,
} from '@hubarr/shared';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAST_ROUTE_STORAGE_KEY, readLastRoute, rememberRoute, resolveHome } from '../src/app/home';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import { routes } from '../src/app/router';
import { useNotifyStore } from '../src/app/stores/notify';
import { useSessionStore } from '../src/app/stores/session';
import { createMemoryHistory, createRouter } from 'vue-router';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settle } from './helpers';

const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {});

function services(configured: string[], extra: Partial<BootstrapServices> = {}): BootstrapServices {
  return {
    states: Object.fromEntries(
      SERVICE_IDS.map((id) => [id, { configured: configured.includes(id), disabled: false }]),
    ),
    instances: {
      radarr: configured.includes('radarr')
        ? [{ slug: 'radarr-4k', name: 'Radarr 4K', enabled: true, isDefault: true }]
        : [],
      sonarr: configured.includes('sonarr')
        ? [{ slug: 'sonarr', name: 'Sonarr', enabled: true, isDefault: true }]
        : [],
    },
    sidebar: {},
    ...extra,
  };
}

beforeEach(async () => {
  await setLocale('en');
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = '';
});

/** Navigue (sans gardes) et retient la page, comme le fait `afterEach`. */
function visitor() {
  const router = createRouter({ history: createMemoryHistory(), routes });
  return async (path: string) => {
    await router.push(path);
    rememberRoute(router.currentRoute.value);
  };
}

describe('page d’accueil', () => {
  const all = services(['tmdb', 'radarr', 'sonarr', 'qbittorrent']);

  it('tableau de bord par défaut', () => {
    expect(resolveHome('dashboard', services([]))).toEqual({ name: 'dashboard' });
  });

  it('préférence suivie quand le service est configuré', () => {
    expect(resolveHome('discovery', all)).toEqual({ name: 'tmdb' });
    expect(resolveHome('films', all)).toEqual({ name: 'radarr', params: { slug: 'radarr-4k' } });
    expect(resolveHome('series', all)).toEqual({ name: 'sonarr', params: { slug: 'sonarr' } });
    expect(resolveHome('qbittorrent', all)).toEqual({ name: 'qbittorrent' });
  });

  it('repli sur la chaîne TMDB, Radarr, Sonarr, qBittorrent si la cible manque', () => {
    expect(resolveHome('films', services(['sonarr']))).toEqual({
      name: 'sonarr',
      params: { slug: 'sonarr' },
    });
    expect(resolveHome('discovery', services(['qbittorrent']))).toEqual({ name: 'qbittorrent' });
  });

  it('rien de configuré et préférence inaccessible : bienvenue', () => {
    expect(resolveHome('films', services([]))).toBeNull();
  });

  it('TMDB désactivé : la préférence « discovery » passe à la suite', () => {
    const disabled = services(['radarr']);
    disabled.states.tmdb = { configured: false, disabled: true };
    expect(resolveHome('discovery', disabled)).toEqual({
      name: 'radarr',
      params: { slug: 'radarr-4k' },
    });
  });

  it('dernière page visitée : retenue, slug remplacé par l’instance par défaut', async () => {
    const visit = visitor();
    await visit('/medias/old-slug/films');
    expect(readLastRoute()).toEqual({ name: 'radarr' });
    expect(resolveHome('last', all, readLastRoute())).toEqual({
      name: 'radarr',
      params: { slug: 'radarr-4k' },
    });
    await visit('/usenet/nzbget');
    expect(readLastRoute()).toEqual({ name: 'usenet', params: { client: 'nzbget' } });
  });

  it('dernière page : accueil, connexion, paramètres et assistant jamais retenus', async () => {
    const visit = visitor();
    await visit('/prowlarr');
    for (const path of ['/', '/login', '/admin/settings', '/setup/welcome']) await visit(path);
    expect(readLastRoute()).toEqual({ name: 'prowlarr' });
  });

  it('dernière page disparue, absente ou de service désactivé : repli', () => {
    localStorage.setItem(LAST_ROUTE_STORAGE_KEY, JSON.stringify({ name: 'nope' }));
    expect(resolveHome('last', all, readLastRoute(), () => false)).toEqual({ name: 'tmdb' });
    expect(resolveHome('last', all, null)).toEqual({ name: 'tmdb' });
    expect(resolveHome('last', services(['sonarr']), { name: 'prowlarr' })).toEqual({
      name: 'sonarr',
      params: { slug: 'sonarr' },
    });
  });

  it('dans l’application : `/` mène à la page choisie', async () => {
    fakeFetch({});
    const { router } = await mountApp(
      '/',
      bootstrapOf({
        user: ADMIN,
        services: all,
        preferences: { ...defaultDisplayValues(), display_home_page: 'films' },
      }),
    );
    expect(router.currentRoute.value.fullPath).toBe('/medias/radarr-4k/films');
  });
});

describe('toasts', () => {
  it('désactivés : seules les erreurs restent', () => {
    setActivePinia(createPinia());
    useSessionStore().setPreferences({ ...defaultDisplayValues(), display_toasts: '0' });
    const notify = useNotifyStore();
    notify.success('admin.flash.saved');
    notify.info('x');
    notify.error('error.generic.message');
    expect(notify.queue.map((item) => item.kind)).toEqual(['error']);
  });
});

const EMPTY: FlatServiceState = {
  saved: false,
  configured: false,
  enabled: true,
  url: '',
  user: '',
  hasApiKey: false,
  hasPassword: false,
};

function settingsOf(overrides: Partial<SettingsResponse> = {}): SettingsResponse {
  return {
    services: Object.fromEntries(
      SERVICE_IDS.filter((id) => id !== 'radarr' && id !== 'sonarr').map((id) => [id, EMPTY]),
    ) as SettingsResponse['services'],
    instances: { radarr: [], sonarr: [] },
    sidebar: Object.fromEntries([...SERVICE_IDS, 'calendar'].map((id) => [id, true])),
    display: { ...defaultDisplayValues(), display_timezone: '' },
    systemTimezone: 'Europe/Paris',
    timezones: ['Europe/Paris', 'UTC'],
    dashboard: DASHBOARD_SECTIONS.map((key) => ({ key, visible: true })),
    theme: resolveTheme(undefined, undefined),
    backup: { exportable: 0, skipped: 0 },
    about: {
      version: '1.2.3',
      nodeVersion: 'v24',
      databasePath: '/data/hubarr.db',
      databaseSize: 0,
      avatarsDir: '/data/avatars',
      userCount: 1,
      serverTime: '2026-11-18T12:00:00.000Z',
      timezone: 'UTC',
    },
    ...overrides,
  };
}

describe('section Affichage', () => {
  it('enregistre préférences, menu et mise en page ; applique thème et préférences', async () => {
    const saved = settingsOf({
      display: {
        ...defaultDisplayValues(),
        display_timezone: '',
        display_theme: 'nord',
        display_date_format: 'iso',
      },
      theme: resolveTheme('nord', 'orange'),
    });
    const { calls } = fakeFetch({
      'GET /api/admin/settings': () => ({ body: settingsOf() }),
      'GET /api/health/services': () => ({ status: 404 }),
      'POST /api/admin/settings': () => ({ body: saved }),
    });
    const { wrapper, session, vuetify } = await mountApp(
      '/admin/settings#section-display',
      bootstrapOf({ user: ADMIN }),
    );
    await settle();
    // Remonter « recent » d'un cran.
    const rows = wrapper.findAll('[data-dashboard-row]');
    await rows.at(-1)?.get('[data-test="move-up"]').trigger('click');
    await wrapper.get('#section-display form').trigger('submit');
    await settle();
    const call = calls.find((item) => item.method === 'POST' && item.url === '/api/admin/settings');
    const body = call?.body as {
      display: Record<string, string>;
      dashboard: { order: string[] };
      sidebar: Record<string, boolean>;
    };
    expect(body.display.display_home_page).toBe('dashboard');
    expect(body.display).not.toHaveProperty('display_language');
    expect(body.dashboard.order.slice(-2)).toEqual(['recent', 'trending']);
    expect(body.sidebar.calendar).toBe(true);
    expect(vuetify.theme.theme.value).toMatchObject({ key: 'nord', accent: 'orange' });
    expect(session.preferences).toMatchObject({
      display_date_format: 'iso',
      display_timezone: 'Europe/Paris',
    });
  });
});

describe('section Langues', () => {
  const languages: LanguagesResponse = {
    hubarr: { ui: 'en', metadata: 'en-US' },
    radarr: [
      {
        slug: 'radarr',
        name: 'Radarr',
        current: 1,
        currentInfo: 1,
        available: [
          { id: 1, name: 'English' },
          { id: 2, name: 'French' },
        ],
        error: false,
      },
      {
        slug: 'radarr-4k',
        name: 'Radarr 4K',
        current: null,
        currentInfo: null,
        available: [],
        error: true,
      },
    ],
    sonarr: [],
    prowlarr: { configured: false, current: null, available: { en: 'English' }, error: false },
    seerr: {
      configured: true,
      current: 'en',
      available: { en: 'English', fr: 'Français' },
      error: false,
    },
  };

  it('affiche les services injoignables, n’envoie que les valeurs connues, signale l’échec partiel', async () => {
    const { calls } = fakeFetch({
      'GET /api/admin/settings': () => ({ body: settingsOf() }),
      'GET /api/admin/settings/languages': () => ({ body: languages }),
      'POST /api/admin/settings/languages/save': () => ({
        body: { failed: ['Seerr'], locale: 'en' },
      }),
    });
    const { wrapper } = await mountApp(
      '/admin/settings#section-languages',
      bootstrapOf({ user: ADMIN }),
    );
    await settle();
    expect(wrapper.get('[data-language-row="radarr:radarr-4k"]').text()).toContain(
      t('admin.languages.unreachable'),
    );
    expect(wrapper.get('[data-language-row="prowlarr"]').text()).toContain(
      t('admin.languages.not_configured'),
    );
    await wrapper.get('#section-languages form').trigger('submit');
    await settle();
    const call = calls.find((item) => item.url === '/api/admin/settings/languages/save');
    expect(call?.body).toEqual({
      hubarrUi: 'en',
      hubarrMetadata: 'en-US',
      radarrUi: { radarr: 1 },
      radarrInfo: { radarr: 1 },
      sonarrUi: {},
      seerrUi: 'en',
    });
    expect(useNotifyStore().queue.at(-1)).toMatchObject({
      kind: 'error',
      key: 'admin.languages.partial_error',
      values: { services: 'Seerr' },
    });
  });
});

describe('section Sauvegarde', () => {
  it('lien d’export et compteurs ; import après confirmation, résultat traduit', async () => {
    const { calls } = fakeFetch({
      'GET /api/admin/settings': () => ({
        body: settingsOf({ backup: { exportable: 7, skipped: 2 } }),
      }),
      'POST /api/admin/settings/import': () => ({
        body: { applied: 3, skipped: 1, instancesApplied: 2, instancesSkipped: 0 },
      }),
    });
    const { wrapper } = await mountApp(
      '/admin/settings#section-backup',
      bootstrapOf({ user: ADMIN }),
    );
    await settle();
    expect(wrapper.get('[data-test="export"]').attributes('href')).toBe(
      'api/admin/settings/export',
    );
    expect(wrapper.get('[data-test="export-count"]').text()).toBe(
      t('admin.backup.export.count', { safe: 7, skipped: 2 }),
    );

    // Notifications émises (la snackbar retire un message de la file après son délai).
    const notified: { name: string; args: unknown[] }[] = [];
    useNotifyStore().$onAction(({ name, args }) => {
      notified.push({ name, args });
    });
    const input = wrapper.get('[data-test="import-file"]');
    const file = new File(['{"hubarr_export_version":1,"settings":{}}'], 'export.json', {
      type: 'application/json',
    });
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    await input.trigger('change');
    await settle();
    document.body.querySelector<HTMLElement>('[data-test="confirm"]')?.click();
    await settle();
    const call = calls.find((item) => item.url === '/api/admin/settings/import');
    // Fichier envoyé brut, tel quel (`fetch(url, { body: file })`).
    expect(call?.body).toBeInstanceOf(Blob);
    expect((call?.body as File | undefined)?.name).toBe('export.json');
    // Sous la charge de `make check`, la notification peut arriver après `settle()`.
    await vi.waitFor(() => {
      expect(notified.at(-1)).toEqual({
        name: 'success',
        args: [
          'admin.import.result',
          { applied: 3, skipped: 1, instances_applied: 2, instances_skipped: 0 },
        ],
      });
    });
  });

  it('fichier trop gros refusé avant l’envoi', async () => {
    const { calls } = fakeFetch({ 'GET /api/admin/settings': () => ({ body: settingsOf() }) });
    const { wrapper } = await mountApp(
      '/admin/settings#section-backup',
      bootstrapOf({ user: ADMIN }),
    );
    await settle();
    const input = wrapper.get('[data-test="import-file"]');
    const file = new File(['x'.repeat(64_001)], 'big.json', { type: 'application/json' });
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
    await input.trigger('change');
    await settle();
    expect(wrapper.get('[data-test="import-error"]').text()).toBe(t('admin.import.too_big'));
    expect(calls.some((item) => item.url === '/api/admin/settings/import')).toBe(false);
  });
});
