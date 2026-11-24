// SPDX-License-Identifier: AGPL-3.0-or-later
// Accueil à onglets (lot 11) : Tableau de bord, Découverte, Calendrier reliés
// par des onglets (haut de page sur grand écran, barre basse sur mobile), une
// entrée « Accueil » dans le tiroir, URL et page d'accueil inchangées.
import type { BootstrapServices } from '@hubarr/shared';
import { defaultDisplayValues } from '@hubarr/shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { useRoute } from 'vue-router';
import { HOME_TABS, visibleBottomNav } from '../src/app/home-tabs';
import { bottomNavActive } from '../src/app/navigation';
import { setLocale } from '../src/app/plugins/i18n';
import { RADARR_BOTTOM_NAV } from '../src/features/movies/radarr-pages';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, setViewportWidth, settle } from './helpers';

const desktopWidth = window.innerWidth;

beforeAll(async () => {
  await setLocale('en');
});
afterEach(() => {
  setViewportWidth(desktopWidth);
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = '';
});

function servicesOf(overrides: Partial<BootstrapServices> = {}): BootstrapServices {
  return {
    states: {
      tmdb: { configured: true, disabled: false },
      radarr: { configured: true, disabled: false },
    },
    instances: {
      radarr: [{ slug: 'films', name: 'Films', enabled: true, isDefault: true }],
      sonarr: [],
    },
    sidebar: {},
    ...overrides,
  };
}

type Route = ReturnType<typeof useRoute>;
const routeNamed = (name: string) => ({ name }) as unknown as Route;
const names = (services: BootstrapServices, isAdmin = true) =>
  visibleBottomNav(HOME_TABS, { services, isAdmin }).map((item) => item.to.name);

describe('onglets de l’accueil', () => {
  it('n’affiche que les pages utilisables', () => {
    expect(names(servicesOf())).toEqual(['dashboard', 'tmdb', 'calendar']);
    const noTmdb = servicesOf();
    noTmdb.states.tmdb = { configured: false, disabled: false };
    expect(names(noTmdb)).toEqual(['dashboard', 'calendar']);
    expect(names(servicesOf({ sidebar: { tmdb: false, calendar: false } }))).toEqual([]);
    // Un seul onglet restant : pas de barre.
    const onlyDashboard = servicesOf({ states: {} });
    expect(names(onlyDashboard)).toEqual([]);
  });

  it('laisse intactes les barres sans condition (services)', () => {
    expect(
      visibleBottomNav(RADARR_BOTTOM_NAV, { services: servicesOf({ states: {} }), isAdmin: true }),
    ).toHaveLength(RADARR_BOTTOM_NAV.length);
  });

  it('explorateur et watchlist relèvent de l’onglet Découverte', () => {
    const active = (name: string) =>
      HOME_TABS.filter((item) => bottomNavActive(item, routeNamed(name))).map(
        (item) => item.to.name,
      );
    expect(active('tmdb-explorer')).toEqual(['tmdb']);
    expect(active('tmdb-watchlist')).toEqual(['tmdb']);
    expect(active('calendar')).toEqual(['calendar']);
  });
});

describe('shell', () => {
  it('grand écran : onglets en haut, entrée « Accueil » active sur les trois pages', async () => {
    fakeFetch({});
    const { wrapper, router } = await mountApp(
      '/calendrier',
      bootstrapOf({ user: ADMIN, services: servicesOf() }),
    );
    await settle();
    const tabs = wrapper.get('[data-test="home-tabs"]');
    expect(tabs.findAll('.v-tab').map((tab) => tab.text())).toEqual([
      'Dashboard',
      'Discover',
      'Calendar',
    ]);
    expect(tabs.get('[data-test="home-tab-calendar"]').classes()).toContain('v-tab--selected');
    expect(wrapper.find('[data-test="service-bottom-nav"]').exists()).toBe(false);

    const home = wrapper.get('[data-drawer-item="sidebar.nav.home"]');
    expect(home.text()).toBe('Home');
    expect(home.classes()).toContain('v-list-item--active');
    // Découverte et Calendrier ne sont plus des entrées du tiroir.
    expect(wrapper.find('[data-drawer-item="tmdb"]').exists()).toBe(false);
    expect(wrapper.find('[data-drawer-item="calendar"]').exists()).toBe(false);

    await router.push('/decouverte/watchlist');
    await settle();
    expect(wrapper.get('[data-test="home-tab-discover"]').classes()).toContain('v-tab--selected');
    expect(wrapper.get('[data-drawer-item="sidebar.nav.home"]').classes()).toContain(
      'v-list-item--active',
    );

    await router.push('/profil');
    await settle();
    expect(wrapper.find('[data-test="home-tabs"]').exists()).toBe(false);
    expect(wrapper.get('[data-drawer-item="sidebar.nav.home"]').classes()).not.toContain(
      'v-list-item--active',
    );
  });

  it('mobile : barre basse à trois onglets, sans onglets en haut', async () => {
    setViewportWidth(412);
    fakeFetch({});
    const { wrapper } = await mountApp(
      '/tableau-de-bord',
      bootstrapOf({ user: ADMIN, services: servicesOf() }),
    );
    await settle();
    const bar = wrapper.get('[data-test="service-bottom-nav"]');
    expect(
      ['dashboard', 'discover', 'calendar'].map((tab) =>
        bar.find(`[data-test="home-tab-${tab}"]`).exists(),
      ),
    ).toEqual([true, true, true]);
    expect(bar.get('[data-test="home-tab-dashboard"]').classes()).toContain('v-btn--active');
    expect(wrapper.find('[data-test="home-tabs"]').exists()).toBe(false);
  });

  it('la page d’accueil choisie (`/`) reste servie', async () => {
    fakeFetch({});
    const { router } = await mountApp(
      '/',
      bootstrapOf({
        user: ADMIN,
        services: servicesOf(),
        preferences: { ...defaultDisplayValues(), display_home_page: 'discovery' },
      }),
    );
    await settle();
    expect(router.currentRoute.value.name).toBe('tmdb');
  });
});
