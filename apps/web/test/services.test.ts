// SPDX-License-Identifier: AGPL-3.0-or-later
// Santé et gardes des services côté client : port de `ServiceRouteGuardSubscriberTest`
// (désactivé, non configuré, injoignable), `ConfigureServicesRouteTest`, tiroir et
// menu santé (`TopbarHealthServicesTest`), bannière.

import type { BootstrapServices, ServicesHealthResponse } from '@hubarr/shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildDrawerSections, healthColor } from '../src/app/drawer';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import { resolveServiceAccess } from '../src/app/router/guards';
import { routes } from '../src/app/router';
import { useNotifyStore } from '../src/app/stores/notify';
import { createRouter, createMemoryHistory } from 'vue-router';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settle } from './helpers';

const t = (key: string, values?: Record<string, unknown>) => i18n.global.t(key, values ?? {});

function servicesOf(overrides: Partial<BootstrapServices> = {}): BootstrapServices {
  return {
    states: {
      tmdb: { configured: true, disabled: false },
      prowlarr: { configured: false, disabled: false },
      seerr: { configured: false, disabled: true },
      qbittorrent: { configured: true, disabled: false },
      tautulli: { configured: true, disabled: false },
      radarr: { configured: true, disabled: false },
      sonarr: { configured: false, disabled: false },
    },
    instances: {
      radarr: [
        { slug: 'radarr', name: 'Radarr', enabled: true, isDefault: true },
        { slug: 'radarr-4k', name: 'Radarr 4K', enabled: true, isDefault: false },
        { slug: 'old', name: 'Old', enabled: false, isDefault: false },
      ],
      sonarr: [],
    },
    sidebar: { calendar: true },
    ...overrides,
  };
}

const HEALTH: ServicesHealthResponse = {
  services: { tmdb: true, qbittorrent: false, tautulli: null, radarr: false },
  instances: {
    radarr: [
      { slug: 'radarr', name: 'Radarr', state: true },
      { slug: 'radarr-4k', name: 'Radarr 4K', state: false },
    ],
    sonarr: [],
  },
  ok: 2,
  total: 4,
  timestamp: '2026-11-18T12:00:00Z',
};

const router = createRouter({ history: createMemoryHistory(), routes });
const resolve = (path: string) => router.resolve(path);

beforeAll(async () => {
  await setLocale('en');
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('resolveServiceAccess', () => {
  const admin = { isAdmin: true, services: servicesOf() };
  const user = { isAdmin: false, services: servicesOf() };

  it('service configuré : accès', () => {
    expect(resolveServiceAccess(resolve('/qbittorrent'), admin)).toBe(true);
    expect(resolveServiceAccess(resolve('/medias/radarr-4k/films'), admin)).toBe(true);
    expect(resolveServiceAccess(resolve('/profil'), admin)).toBe(true);
  });

  it('non configuré : services des paramètres pour un admin, accueil sinon, avec message', () => {
    expect(resolveServiceAccess(resolve('/prowlarr'), admin)).toEqual({
      to: { name: 'settings', hash: '#section-services' },
      flash: {
        key: 'error.service_not_configured.service_unavailable_flash',
        values: { service: 'Prowlarr' },
      },
    });
    expect(resolveServiceAccess(resolve('/usenet/sabnzbd'), user)).toMatchObject({
      to: { name: 'home' },
    });
  });

  it('désactivé : accueil avec le message dédié', () => {
    expect(resolveServiceAccess(resolve('/jellyseerr'), admin)).toEqual({
      to: { name: 'home' },
      flash: {
        key: 'error.service_not_configured.service_disabled_flash',
        values: { service: 'Seerr' },
      },
    });
  });

  it('instance inconnue → introuvable ; instance désactivée → accueil, à son nom', () => {
    expect(resolveServiceAccess(resolve('/medias/nope/films'), admin)).toMatchObject({
      to: { name: 'not-found' },
    });
    expect(resolveServiceAccess(resolve('/medias/old/films'), admin)).toMatchObject({
      to: { name: 'home' },
      flash: { values: { service: 'Old' } },
    });
  });

  it('calendrier : Radarr ou Sonarr requis', () => {
    expect(resolveServiceAccess(resolve('/calendrier'), admin)).toBe(true);
    const none = servicesOf();
    none.states.radarr = { configured: false, disabled: false };
    expect(
      resolveServiceAccess(resolve('/calendrier'), { isAdmin: true, services: none }),
    ).toMatchObject({
      to: { name: 'settings' },
    });
  });

  it('injoignable : une page d’index reste accessible (elle affiche la bannière)', () => {
    expect(resolveServiceAccess(resolve('/qbittorrent'), admin, HEALTH)).toBe(true);
    expect(resolveServiceAccess(resolve('/medias/radarr-4k/films'), admin, HEALTH)).toBe(true);
  });
});

describe('tiroir', () => {
  it('services configurés et visibles, par famille ; instances multiples en sous-entrées', () => {
    const sections = buildDrawerSections(servicesOf(), true);
    // Découverte et Calendrier : onglets de l'accueil (lot 11), plus dans les sections.
    expect(sections.map((section) => section.titleKey)).toEqual([
      'sidebar.family.arrs',
      'sidebar.family.downloads',
      'sidebar.family.server',
    ]);
    const radarr = sections[0]?.items[0];
    expect(radarr?.children?.map((child) => child.label)).toEqual(['Radarr', 'Radarr 4K']);
  });

  it('masqués du menu ou réservés aux admins', () => {
    const services = servicesOf({ sidebar: { calendar: false, tmdb: false } });
    const keys = buildDrawerSections(services, false).flatMap((section) =>
      section.items.map((item) => item.key),
    );
    expect(keys).toEqual(['tautulli']);
  });

  it('pastille de santé par service et par instance', () => {
    expect(healthColor(HEALTH, { service: 'tmdb' })).toBe('success');
    expect(healthColor(HEALTH, { service: 'qbittorrent' })).toBe('error');
    expect(healthColor(HEALTH, { service: 'tautulli' })).toBeNull();
    expect(healthColor(HEALTH, { service: 'radarr', instance: 'radarr' })).toBe('success');
    expect(healthColor(HEALTH, { service: 'radarr', instance: 'radarr-4k' })).toBe('error');
    expect(healthColor(undefined, { service: 'tmdb' })).toBeNull();
  });
});

describe('shell : santé et gardes', () => {
  it('menu santé : pastille partielle, résumé, une ligne par instance, services configurés seuls (V2)', async () => {
    fakeFetch({ 'GET /api/health/services': () => ({ body: HEALTH }) });
    const { wrapper } = await mountApp(
      '/profil',
      bootstrapOf({ user: ADMIN, services: servicesOf() }),
    );
    await settle();
    expect(wrapper.get('[data-test="health-dot"]').attributes('data-color')).toBe('warning');
    await wrapper.get('[data-test="health-menu"]').trigger('click');
    await settle();
    expect(document.body.querySelector('[data-test="health-summary"]')?.textContent).toBe(
      t('topbar.health.summary_running', { ok: 2, total: 4 }),
    );
    expect(
      document.body.querySelector('[data-health-row="radarr:radarr-4k"]')?.textContent,
    ).toContain(t('topbar.health.status.down'));
    expect(document.body.querySelector('[data-health-row="tautulli"]')).toBeNull();
    expect(document.body.textContent).not.toContain(t('topbar.health.status.not_configured'));
  });

  it('le tiroir liste les services configurés', async () => {
    fakeFetch({ 'GET /api/health/services': () => ({ body: HEALTH }) });
    const { wrapper } = await mountApp(
      '/profil',
      bootstrapOf({ user: ADMIN, services: servicesOf() }),
    );
    await settle();
    const drawer = wrapper.get('[data-test="nav-drawer"]');
    expect(drawer.find('[data-drawer-item="qbittorrent"]').exists()).toBe(true);
    expect(drawer.find('[data-drawer-item="prowlarr"]').exists()).toBe(false);
    expect(drawer.text()).toContain(t('sidebar.family.downloads'));
  });

  it('page d’un service non configuré : paramètres pour l’admin, avec message', async () => {
    fakeFetch({});
    const { router: app } = await mountApp(
      '/prowlarr',
      bootstrapOf({ user: ADMIN, services: servicesOf() }),
    );
    await settle();
    expect(app.currentRoute.value.name).toBe('settings');
    expect(useNotifyStore().queue.at(-1)).toMatchObject({
      key: 'error.service_not_configured.service_unavailable_flash',
      values: { service: 'Prowlarr' },
    });
  });

  it('route n° 70 : admin → services des paramètres, sinon accueil', async () => {
    fakeFetch({});
    const admin = await mountApp('/services/configurer', bootstrapOf({ user: ADMIN }));
    expect(admin.router.currentRoute.value.fullPath).toBe('/admin/settings#section-services');
    admin.wrapper.unmount();
    const user = await mountApp(
      '/services/configurer',
      bootstrapOf({ user: { ...ADMIN, role: 'user' } }),
    );
    expect(user.router.currentRoute.value.name).toBe('dashboard');
  });

  it('index d’un service injoignable : bannière avec la catégorie du diagnostic', async () => {
    const { calls } = fakeFetch({
      'GET /api/health/services': () => ({ body: HEALTH }),
      'GET /api/health/diagnose/qbittorrent': () => ({
        body: { ok: false, category: 'network', http: null, url: 'http://<qbit>:8080' },
      }),
      'POST /api/admin/settings/health/invalidate/qbittorrent': () => ({ body: { ok: true } }),
    });
    const { wrapper } = await mountApp(
      '/qbittorrent',
      bootstrapOf({ user: ADMIN, services: servicesOf() }),
    );
    await settle();
    const banner = wrapper.get('[data-test="service-down-banner"]');
    expect(banner.text()).toContain(
      t('error.service_banner.title_unreachable', { service: 'qBittorrent' }),
    );
    // L'URL est échappée avant d'entrer dans le message HTML.
    expect(banner.html()).toContain('&lt;qbit&gt;');
    await banner.get('[data-test="service-retry"]').trigger('click');
    await settle();
    expect(
      calls.some((call) => call.url === '/api/admin/settings/health/invalidate/qbittorrent'),
    ).toBe(true);
  });
});
