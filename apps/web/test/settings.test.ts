// SPDX-License-Identifier: AGPL-3.0-or-later
// Page des paramètres : services, test de connexion, instances Radarr/Sonarr.

import {
  DASHBOARD_SECTIONS,
  SERVICE_IDS,
  defaultDisplayValues,
  resolveTheme,
  type FlatServiceId,
  type FlatServiceState,
  type ServiceInstance,
  type ServicesHealthResponse,
  type SettingsResponse,
} from '@hubarr/shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, setViewportWidth, settle } from './helpers';

const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {});

const EMPTY: FlatServiceState = {
  saved: false,
  configured: false,
  enabled: true,
  url: '',
  user: '',
  hasApiKey: false,
  hasPassword: false,
};

function instance(overrides: Partial<ServiceInstance> = {}): ServiceInstance {
  return {
    id: 1,
    type: 'radarr',
    slug: 'radarr',
    name: 'Radarr',
    url: 'http://radarr:7878',
    hasApiKey: true,
    enabled: true,
    isDefault: true,
    position: 0,
    defaultQualityProfileId: null,
    ...overrides,
  };
}

function settingsOf(
  services: Partial<Record<FlatServiceId, Partial<FlatServiceState>>> = {},
  instances: Partial<SettingsResponse['instances']> = {},
): SettingsResponse {
  const all = Object.fromEntries(
    SERVICE_IDS.filter((id) => id !== 'radarr' && id !== 'sonarr').map((id) => [
      id,
      { ...EMPTY, ...services[id] },
    ]),
  ) as SettingsResponse['services'];
  return {
    services: all,
    instances: { radarr: [], sonarr: [], ...instances },
    sidebar: Object.fromEntries([...SERVICE_IDS, 'calendar'].map((id) => [id, true])),
    display: { ...defaultDisplayValues(), display_timezone: '' },
    systemTimezone: 'Europe/Paris',
    timezones: ['Europe/Paris', 'UTC'],
    dashboard: DASHBOARD_SECTIONS.map((key) => ({ key, visible: true })),
    theme: resolveTheme(undefined, undefined),
    backup: { exportable: 0, skipped: 0 },
    about: {
      version: '1.2.3',
      nodeVersion: 'v24.0.0',
      databasePath: '/data/hubarr.db',
      databaseSize: 4096,
      avatarsDir: '/data/avatars',
      userCount: 1,
      serverTime: '2026-11-18T12:00:00.000Z',
      timezone: 'UTC',
    },
  };
}

const HEALTH: ServicesHealthResponse = {
  services: { prowlarr: true, tmdb: null, radarr: false },
  instances: { radarr: [{ slug: 'radarr', name: 'Radarr', state: false }], sonarr: [] },
  ok: 1,
  total: 2,
  timestamp: '2026-11-18T12:00:00Z',
};

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('élément absent');
  return value;
}

function type(value: string, input: HTMLInputElement): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

beforeAll(async () => {
  await setLocale('en');
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function open(
  settings: SettingsResponse,
  routes: Parameters<typeof fakeFetch>[0] = {},
  hash = '',
) {
  const fake = fakeFetch({
    'GET /api/admin/settings': () => ({ body: settings }),
    'GET /api/health/services': () => ({ body: HEALTH }),
    ...routes,
  });
  const mounted = await mountApp(`/admin/settings${hash}`, bootstrapOf({ user: ADMIN }));
  await settle();
  return { ...mounted, fake };
}

describe('paramètres : services', () => {
  it('affiche les groupes, les services connectés ouverts et leur état', async () => {
    const { wrapper } = await open(
      settingsOf({
        prowlarr: { saved: true, configured: true, url: 'http://p:9696', hasApiKey: true },
      }),
    );
    const text = wrapper.text();
    expect(text).toContain(t('admin.services.group.media'));
    expect(text).toContain('http://p:9696');
    const prowlarr = wrapper.get('[data-service-card="prowlarr"]');
    expect(prowlarr.text()).toContain(t('admin.services.state.up'));
    expect(prowlarr.text()).toContain(t('admin.services.secret_saved'));
    expect(wrapper.get('[data-service-card="tmdb"]').text()).toContain(
      t('admin.services.state.new'),
    );
  });

  it('enregistre les champs du service, secret vide compris (inchangé côté serveur)', async () => {
    const saved = settingsOf({
      prowlarr: { saved: true, configured: true, url: 'http://new', hasApiKey: true },
    });
    const { wrapper, fake } = await open(
      settingsOf({ prowlarr: { saved: true, url: 'http://p', hasApiKey: true } }),
      {
        'POST /api/admin/settings': () => ({ body: saved }),
      },
    );
    const card = wrapper.get('[data-service-card="prowlarr"]');
    await card.get('input[name="prowlarr-url"]').setValue('http://new');
    await card.get('form').trigger('submit');
    await settle();
    const call = fake.calls.find(
      (item) => item.method === 'POST' && item.url === '/api/admin/settings',
    );
    expect(call?.body).toEqual({ services: { prowlarr: { url: 'http://new', apiKey: '' } } });
    expect(call?.headers['x-csrf-token']).toBe('csrf-1');
  });

  it('« Tester » affiche la catégorie traduite', async () => {
    const { wrapper, fake } = await open(
      settingsOf({ sabnzbd: { saved: true, url: 'http://sab' } }),
      {
        'POST /api/admin/settings/test/sabnzbd': () => ({
          body: { ok: false, service: 'SABnzbd', category: 'host_whitelist', http: 403 },
        }),
      },
    );
    const card = wrapper.get('[data-service-card="sabnzbd"]');
    await card.get('[data-test="service-test"]').trigger('click');
    await settle();
    expect(card.get('[data-test="test-result"]').text()).toBe(
      t('admin.test.category.host_whitelist', { http: 403 }),
    );
    expect(
      fake.calls.find((item) => item.url === '/api/admin/settings/test/sabnzbd')?.body,
    ).toEqual({
      url: 'http://sab',
      apiKey: '',
      user: '',
      password: '',
    });
  });

  it('recherche : filtre les services, message si rien ne correspond', async () => {
    const { wrapper } = await open(settingsOf());
    await wrapper.get('input[type="text"]').setValue('tautu');
    await settle();
    expect(wrapper.find('[data-service-card="tautulli"]').exists()).toBe(true);
    expect(wrapper.find('[data-service-card="prowlarr"]').exists()).toBe(false);
    await wrapper.get('input[type="text"]').setValue('zzz');
    await settle();
    expect(wrapper.text()).toContain(t('admin.services.no_match'));
  });
});

describe('paramètres : instances', () => {
  it('liste les instances avec leur état, ajoute une instance', async () => {
    const added = instance({
      id: 2,
      slug: 'radarr-4k',
      name: 'Radarr 4K',
      isDefault: false,
      position: 1,
    });
    const { wrapper, fake } = await open(settingsOf({}, { radarr: [instance()] }), {
      'POST /api/admin/instances/radarr/add': () => ({
        body: { type: 'radarr', instances: [instance(), added] },
      }),
    });
    const panel = wrapper.get('[data-service-card="radarr"]');
    expect(panel.text()).toContain(t('admin.services.instances_count', { count: 1 }));
    expect(panel.text()).toContain(t('admin.instances.badge.default'));

    await panel.get('[data-test="instance-add"]').trigger('click');
    await settle();
    const dialog = must(document.body.querySelector('[data-test="instance-dialog-radarr"]'));
    const inputs = dialog.querySelectorAll<HTMLInputElement>('input');
    type('Radarr 4K', must(inputs[0]));
    type('http://r4k', must(inputs[1]));
    must(dialog.querySelector('form')).dispatchEvent(new Event('submit'));
    await settle();
    expect(
      fake.calls.find((item) => item.url === '/api/admin/instances/radarr/add')?.body,
    ).toMatchObject({
      name: 'Radarr 4K',
      url: 'http://r4k',
    });
    expect(wrapper.get('[data-service-card="radarr"]').text()).toContain('Radarr 4K');
  });

  it('affiche l’erreur de validation renvoyée par le serveur', async () => {
    const { wrapper } = await open(settingsOf(), {
      'POST /api/admin/instances/sonarr/add': () => ({
        status: 400,
        body: {
          code: 'VALIDATION',
          details: [
            {
              path: 'url',
              code: 'url_blocked',
              message: 'admin.instances.error.url_blocked',
              reason: 'scheme',
            },
          ],
        },
      }),
    });
    await wrapper.get('[data-service-card="sonarr"] button').trigger('click');
    await settle();
    await wrapper.get('[data-service-card="sonarr"] [data-test="instance-add"]').trigger('click');
    await settle();
    must(document.body.querySelector('[data-test="instance-dialog-sonarr"] form')).dispatchEvent(
      new Event('submit'),
    );
    await settle();
    expect(document.body.querySelector('[data-test="instance-error"]')?.textContent).toContain(
      t('admin.instances.error.url_blocked', { reason: 'scheme' }),
    );
  });
});

describe('paramètres : administration des services (P5c.4, D140)', () => {
  it('bouton « Paramètres » par instance Radarr et pour Prowlarr (P5d.3, D149)', async () => {
    const { wrapper } = await open(
      settingsOf(
        { prowlarr: { saved: true, configured: true, url: 'http://p:9696', hasApiKey: true } },
        { radarr: [instance(), instance({ id: 2, slug: 'off', name: 'Off', enabled: false })] },
      ),
    );
    // Première page du premier groupe, à l'URL de l'original.
    expect(wrapper.get('[data-test="instance-settings-radarr"]').attributes('href')).toBe(
      '/medias/radarr/radarr/qualite',
    );
    // Instance désactivée : pas de paramètres.
    expect(wrapper.find('[data-test="instance-settings-off"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="service-settings-prowlarr"]').attributes('href')).toMatch(
      /^\/prowlarr\//,
    );
    // Service non enregistré : pas de bouton ; l'ancien bloc de liens a disparu.
    expect(wrapper.find('[data-test="service-settings-seerr"]').exists()).toBe(false);
    expect(wrapper.find('[data-test^="admin-link-"]').exists()).toBe(false);
  });

  it('l’ancien onglet « Serveur » de Prowlarr mène aux paramètres', async () => {
    fakeFetch({
      'GET /api/admin/settings': () => ({ body: settingsOf() }),
      'GET /api/health/services': () => ({ body: HEALTH }),
    });
    const { router } = await mountApp('/prowlarr/serveur', bootstrapOf({ user: ADMIN }));
    await settle();
    expect(router.currentRoute.value.name).toBe('settings');
    expect(router.currentRoute.value.hash).toBe('#section-services');
  });
});

describe('paramètres : à propos', () => {
  it('l’ancre ouvre l’onglet et affiche la version', async () => {
    const { wrapper } = await open(settingsOf(), {}, '#section-about');
    expect(wrapper.get('#section-about').text()).toContain('1.2.3');
  });
});

describe('paramètres sur mobile (lot 3)', () => {
  const desktopWidth = window.innerWidth;
  afterEach(() => {
    setViewportWidth(desktopWidth);
  });

  it('sections dans la barre basse, section nommée dans la barre du haut', async () => {
    setViewportWidth(412);
    const { wrapper, router } = await open(settingsOf(), {}, '#section-about');
    const $ = (selector: string) => document.querySelector<HTMLElement>(selector);
    expect($('[data-test="service-bottom-nav"]')).not.toBeNull();
    // Plus d'onglets dans la page.
    expect(wrapper.find('.settings-layout .v-tabs').exists()).toBe(false);
    expect($('[data-test="tab-about"]')?.classList).toContain('v-btn--active');
    expect($('[data-test="topbar-title"]')?.textContent.trim()).toBe(
      `${t('admin.page.title')} · ${t('admin.nav.about')}`,
    );
    $('[data-test="tab-display"]')?.click();
    await settle();
    expect(router.currentRoute.value.hash).toBe('#section-display');
    expect($('[data-test="tab-display"]')?.classList).toContain('v-btn--active');
    expect($('[data-test="topbar-title"]')?.textContent.trim()).toBe(
      `${t('admin.page.title')} · ${t('admin.nav.display')}`,
    );
  });
});
