// SPDX-License-Identifier: AGPL-3.0-or-later
// Habillage mobile des vues de service (P5b.4) : barre
// basse avec libellés et FAB central, barre du haut « pilule » (recherche ou
// compteurs), appui long → barre contextuelle de la sélection, onglet
// « Serveur », speed-dial, snackbar en haut.

import type { MovieLibraryItem, MovieLibraryResponse } from '@hubarr/shared';
import { DEFAULT_MOVIE_LIBRARY_QUERY } from '@hubarr/shared';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, withDirectives } from 'vue';
import type { useRoute } from 'vue-router';
import { bottomNavActive } from '../src/app/navigation';
import { LONG_PRESS_MS, vLongPress } from '../src/app/long-press';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import { RADARR_BOTTOM_NAV } from '../src/features/movies/radarr-pages';
import { SEERR_BOTTOM_NAV } from '../src/features/seerr/seerr-nav';
import { SONARR_BOTTOM_NAV } from '../src/features/series/sonarr-pages';
import { serviceSettingsBottomNav } from '../src/app/service-admin';
import { SETTINGS_BOTTOM_NAV } from '../src/features/settings/sections';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, setViewportWidth, settle } from './helpers';

const t = (key: string, values: Record<string, unknown> = {}) => i18n.global.t(key, values);
const mounted: VueWrapper[] = [];
const desktopWidth = window.innerWidth;

beforeAll(async () => {
  await setLocale('fr');
});
beforeEach(() => {
  setViewportWidth(412);
});
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  setViewportWidth(desktopWidth);
  vi.useRealTimers();
  localStorage.clear();
});

type Route = ReturnType<typeof useRoute>;
const routeNamed = (name: string) => ({ name }) as unknown as Route;

describe('onglets actifs de la barre basse', () => {
  it('Radarr : la fiche relève de la bibliothèque, l’administration du « Serveur »', () => {
    const active = (name: string) =>
      RADARR_BOTTOM_NAV.filter((item) => bottomNavActive(item, routeNamed(name))).map(
        (item) => item.labelKey,
      );
    // File d'attente à la place de l'historique (P5c.6, D143).
    expect(RADARR_BOTTOM_NAV.map((item) => item.to.name)).toEqual([
      'radarr',
      'radarr-missing',
      'radarr-queue',
      'radarr-server',
    ]);
    expect(active('radarr')).toEqual(['media.nav.films']);
    expect(active('radarr-movie')).toEqual(['media.nav.films']);
    expect(active('radarr-queue')).toEqual(['media.queue_page.title']);
    expect(active('radarr-history')).toEqual(['server.tab']);
    expect(active('radarr-blocklist')).toEqual(['server.tab']);
    expect(active('radarr-exclusions')).toEqual(['server.tab']);
  });

  it('Sonarr : séries, prochains épisodes, file d’attente et « Serveur » (D143)', () => {
    const active = (name: string) =>
      SONARR_BOTTOM_NAV.filter((item) => bottomNavActive(item, routeNamed(name))).map(
        (item) => item.to.name,
      );
    expect(SONARR_BOTTOM_NAV.map((item) => item.to.name)).toEqual([
      'sonarr',
      'sonarr-upcoming',
      'sonarr-queue',
      'sonarr-server',
    ]);
    expect(active('sonarr-series')).toEqual(['sonarr']);
    expect(active('sonarr-missing')).toEqual(['sonarr-server']);
    expect(active('sonarr-history')).toEqual(['sonarr-server']);
  });

  it('Seerr : plus d’onglet « Serveur » (D140), la fiche utilisateur relève des utilisateurs', () => {
    const active = (name: string) =>
      SEERR_BOTTOM_NAV.filter((item) => bottomNavActive(item, routeNamed(name))).map(
        (item) => item.to.name,
      );
    expect(SEERR_BOTTOM_NAV.map((item) => item.to.name)).toEqual(['seerr', 'seerr-users']);
    expect(active('seerr-settings-logs')).toEqual([]);
    expect(active('seerr-user')).toEqual(['seerr-users']);
  });
});

describe('barre basse des paramètres (lot 3)', () => {
  const at = (name: string, hash = '') => ({ name, hash }) as unknown as Route;
  const activeIn = (items: typeof SETTINGS_BOTTOM_NAV, route: Route) =>
    items.filter((item) => bottomNavActive(item, route)).map((item) => item.labelKey);

  it('page Paramètres : une section par onglet, « Services » sans fragment', () => {
    expect(SETTINGS_BOTTOM_NAV.map((item) => item.testId)).toEqual([
      'tab-services',
      'tab-display',
      'tab-languages',
      'tab-backup',
      'tab-logs',
      'tab-about',
    ]);
    expect(activeIn(SETTINGS_BOTTOM_NAV, at('settings'))).toEqual(['admin.nav.services']);
    expect(activeIn(SETTINGS_BOTTOM_NAV, at('settings', '#section-backup'))).toEqual([
      'admin.nav.backup',
    ]);
    expect(activeIn(SETTINGS_BOTTOM_NAV, at('settings', '#section-logs'))).toEqual([
      'admin.nav.logs',
    ]);
    expect(activeIn(SETTINGS_BOTTOM_NAV, at('dashboard'))).toEqual([]);
  });

  it('paramètres d’un service : un onglet par groupe, actif sur chacune de ses pages', () => {
    const items = serviceSettingsBottomNav('radarr', 'radarr');
    expect(items.map((item) => item.labelKey)).toEqual([
      'media.group.profiles',
      'media.group.integrations',
      'media.group.general',
      'media.group.system',
    ]);
    expect(items.every((item) => item.testId === 'admin-group')).toBe(true);
    // État du système en tête du groupe système.
    expect(items[3]?.menu?.[0]?.id).toBe('radarr-system');
    expect(activeIn(items, at('radarr-tags'))).toEqual(['media.group.general']);
    expect(activeIn(items, at('radarr-system'))).toEqual(['media.group.system']);
    expect(serviceSettingsBottomNav('seerr').map((item) => item.labelKey)).toEqual([
      'jellyseerr.nav.settings',
      'server.group.system',
    ]);
  });
});

describe('appui long', () => {
  function touch(el: Element, type: string, x = 10, y = 10): void {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, 'touches', {
      value: type === 'touchend' ? [] : [{ clientX: x, clientY: y }],
    });
    el.dispatchEvent(event);
  }
  function mountPressable() {
    const onPress = vi.fn();
    const onClick = vi.fn();
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          withDirectives(h('div', { onClick, 'data-test': 'target' }, 'x'), [
            [vLongPress, onPress],
          ]),
      }),
      { attachTo: document.body },
    );
    mounted.push(wrapper);
    return { el: wrapper.get('[data-test="target"]').element, onPress, onClick };
  }

  it('déclenche après le délai et absorbe le clic qui suit', () => {
    vi.useFakeTimers();
    const { el, onPress, onClick } = mountPressable();
    touch(el, 'touchstart');
    vi.advanceTimersByTime(LONG_PRESS_MS - 1);
    expect(onPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onPress).toHaveBeenCalledOnce();
    touch(el, 'touchend');
    (el as HTMLElement).click();
    expect(onClick).not.toHaveBeenCalled();
    // Le clic suivant passe normalement.
    (el as HTMLElement).click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('un déplacement (défilement) ou un relâchement précoce annule l’appui', () => {
    vi.useFakeTimers();
    const { el, onPress } = mountPressable();
    touch(el, 'touchstart');
    touch(el, 'touchmove', 10, 40);
    vi.advanceTimersByTime(LONG_PRESS_MS);
    touch(el, 'touchstart');
    vi.advanceTimersByTime(100);
    touch(el, 'touchend');
    vi.advanceTimersByTime(LONG_PRESS_MS);
    expect(onPress).not.toHaveBeenCalled();
  });
});

// ── Vues montées en largeur mobile ──────────────────────────────────────────

const RADARR_SERVICES = {
  states: { radarr: { configured: true, disabled: false } },
  instances: {
    radarr: [{ slug: 'radarr', name: 'Radarr', enabled: true, isDefault: true }],
    sonarr: [],
  },
  sidebar: {},
};

function movie(id: number, title: string): MovieLibraryItem {
  return {
    id,
    tmdbId: id,
    imdbId: null,
    title,
    sortTitle: title.toLowerCase(),
    year: 2020,
    overview: null,
    poster: null,
    status: 'released',
    hasFile: false,
    monitored: true,
    quality: null,
    qualityProfileId: 1,
    minimumAvailability: 'released',
    tags: [],
    added: null,
    sizeOnDisk: 0,
    sizeGb: null,
    genres: [],
    runtime: null,
  };
}

const LIBRARY = {
  items: [movie(1, 'The Matrix'), movie(2, 'Inception')],
  total: 2,
  libraryTotal: 2,
  page: 1,
  perPage: 200,
  totalPages: 1,
  unlimited: false,
  facets: { genres: [], qualities: [], languages: [] },
  stats: { total: 2, downloaded: 1, waiting: 1, totalGb: 12.5 },
  query: { ...DEFAULT_MOVIE_LIBRARY_QUERY },
} satisfies MovieLibraryResponse;

async function mountRadarr(path: string, routes: Parameters<typeof fakeFetch>[0] = {}) {
  const fetch = fakeFetch({
    'GET /api/health/services': () => ({
      body: {
        services: { radarr: true },
        instances: { radarr: [{ slug: 'radarr', name: 'Radarr', state: true }], sonarr: [] },
        ok: 1,
        total: 1,
        timestamp: '2026-11-18T12:00:00Z',
      },
    }),
    'GET /api/medias/radarr/films': () => ({ body: LIBRARY }),
    'GET /api/medias/radarr/films/warnings': () => ({ body: { warnings: [], indexerCount: 1 } }),
    ...routes,
  });
  const app = await mountApp(path, bootstrapOf({ user: ADMIN, services: RADARR_SERVICES }));
  mounted.push(app.wrapper);
  await settle();
  return { ...app, fetch };
}

const $ = (selector: string) => document.querySelector<HTMLElement>(selector);

describe('bibliothèque de films sur mobile', () => {
  it('barre basse libellée avec le FAB au centre, recherche dans la pilule', async () => {
    const { router } = await mountRadarr('/medias/radarr/films');
    const nav = $('[data-test="service-bottom-nav"]');
    expect(nav).not.toBeNull();
    const labels = [...(nav?.querySelectorAll('.service-bottom-nav__label') ?? [])].map((label) =>
      label.textContent.trim(),
    );
    expect(labels).toEqual([
      t('media.nav.films'),
      t('media.item.missing'),
      t('media.queue_page.title'),
      t('server.tab'),
    ]);
    // FAB entre le 2e et le 3e onglet.
    const children = [...(nav?.querySelector('.v-bottom-navigation__content')?.children ?? [])];
    expect(children[2]?.querySelector('[data-test="movies-add"]')).not.toBeNull();

    // Titre « Service · Page » dans la pilule (lot 3), la loupe ouvre la recherche.
    expect($('[data-test="topbar-title"]')?.textContent.trim()).toBe(
      `Radarr · ${t('media.nav.films')}`,
    );
    expect($('[data-test="topbar-pill"]')).not.toBeNull();
    expect($('[data-test="movies-search"]')).toBeNull();
    expect($('[data-test="topbar-search"]')).toBeNull();
    $('[data-test="topbar-search-open"]')?.click();
    await settle();
    expect($('[data-test="topbar-title"]')).toBeNull();
    const input = $('[data-test="topbar-search"]') as HTMLInputElement;
    expect(input.placeholder).toBe(t('media.films.filters.search_placeholder'));
    input.value = 'matrix';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await settle();
    expect(router.currentRoute.value.query.q).toBe('matrix');
    // La croix vide la recherche et rend le titre.
    $('[data-test="topbar-search-close"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await settle();
    expect(router.currentRoute.value.query.q).toBeUndefined();
    expect($('[data-test="topbar-title"]')).not.toBeNull();
  });

  it('le FAB ouvre l’ajout, depuis la bibliothèque comme depuis une autre page', async () => {
    const { router } = await mountRadarr('/medias/radarr/films/historique', {
      'GET /api/medias/radarr/films/historique': () => ({
        body: { items: [], page: 1, totalPages: 1, total: 0, eventType: '' },
      }),
    });
    $('[data-test="movies-add"]')?.click();
    await settle();
    expect(router.currentRoute.value.name).toBe('radarr');
    // Le paramètre `?action=add` est consommé.
    expect(router.currentRoute.value.query.action).toBeUndefined();
    expect($('[data-test="add-movie"]')).not.toBeNull();
  });

  it('appui long : sélection, barre contextuelle en haut, barre basse masquée', async () => {
    localStorage.setItem('hubarr.films-view', 'extended');
    await mountRadarr('/medias/radarr/films');
    const row = $('[data-test="movies-content"] .movie-row');
    expect(row).not.toBeNull();
    const start = new Event('touchstart', { bubbles: true });
    // Le geste du tiroir (écouté sur la fenêtre) lit aussi `changedTouches`.
    const touches = [{ clientX: 5, clientY: 5 }];
    Object.defineProperty(start, 'touches', { value: touches });
    Object.defineProperty(start, 'changedTouches', { value: touches });
    row?.dispatchEvent(start);
    await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 50));
    await settle();
    expect($('[data-test="selection-bar-count"]')?.textContent).toBe(
      t('common.ds.selected', { count: 1 }),
    );
    expect($('[data-test="service-bottom-nav"]')).toBeNull();
    expect($('[data-test="bulk-count"]')).toBeNull();
    expect($('[data-test="bulk-edit"]')).not.toBeNull();
    $('[data-test="selection-bar-all"]')?.click();
    await settle();
    expect($('[data-test="selection-bar-count"]')?.textContent).toBe(
      t('common.ds.selected', { count: 2 }),
    );
    $('[data-test="selection-bar-clear"]')?.click();
    await settle();
    expect($('[data-test="selection-bar"]')).toBeNull();
    expect($('[data-test="service-bottom-nav"]')).not.toBeNull();
  });
});

describe('onglet « Serveur »', () => {
  it('version, pages d’usage et commandes, sans administration (D140) ; compteurs dans la pilule', async () => {
    const { fetch } = await mountRadarr('/medias/radarr/radarr/serveur', {
      'GET /api/medias/radarr/radarr/systeme': () => ({
        body: {
          status: {
            version: '5.0.1',
            osName: null,
            osVersion: null,
            runtimeVersion: null,
            databaseVersion: null,
            startTime: null,
            urlBase: null,
            isDocker: null,
          },
          health: [],
          diskSpace: [],
          downloadClients: [],
          indexers: null,
          logs: [],
        },
      }),
      'POST /api/medias/radarr/films/command/refresh-all': () => ({ body: { ok: true, cmdId: 7 } }),
    });
    expect($('[data-test="server-version"]')?.textContent).toContain('5.0.1');
    for (const id of ['radarr-blocklist', 'radarr-exclusions', 'refresh-all', 'search-missing'])
      expect($(`[data-test="server-item-${id}"]`)).not.toBeNull();
    // Configuration et système : dans les paramètres de Hubarr (P5c.4, D140).
    for (const id of ['radarr-system', 'radarr-quality', 'radarr-backups'])
      expect($(`[data-test="server-item-${id}"]`)).toBeNull();
    expect($('[data-test="server-panel"]')?.textContent).not.toContain(t('media.group.profiles'));
    // Compteurs dans la page, sous la version (lot 3).
    expect($('[data-test="server-stats"]')?.textContent).toContain('12.5');
    // Onglet actif : « Serveur ».
    expect($('[data-test="bottom-nav-server.tab"]')?.classList).toContain('v-btn--active');
    expect($('[data-test="topbar-title"]')?.textContent.trim()).toBe(`Radarr · ${t('server.tab')}`);

    $('[data-test="server-item-refresh-all"]')?.click();
    await settle();
    expect(
      fetch.calls.some((call) => call.url === '/api/medias/radarr/films/command/refresh-all'),
    ).toBe(true);
    expect(document.body.textContent).toContain(
      t('server.command_started', { name: t('media.films.actions.refresh_all_title') }),
    );
    // Snackbar en haut sur mobile.
    expect($('.v-snackbar')?.className).toContain('v-snackbar--top');
  });

  it('« Rechercher tous les manquants » demande confirmation', async () => {
    const { fetch } = await mountRadarr('/medias/radarr/radarr/serveur', {
      'POST /api/medias/radarr/films/recherche-manquants': () => ({ body: { ok: true, cmdId: 8 } }),
    });
    $('[data-test="server-item-search-missing"]')?.click();
    await settle();
    expect(document.body.textContent).toContain(t('server.commands.search_missing_confirm'));
    expect(fetch.calls.filter((call) => call.method === 'POST')).toHaveLength(0);
    $('[data-test="confirm"]')?.click();
    await settle();
    expect(fetch.calls.filter((call) => call.method === 'POST')).toHaveLength(1);
  });
});

describe('calendrier sur mobile (V12)', () => {
  const calendar = {
    events: [
      {
        type: 'film',
        releaseType: 'digital',
        date: '2026-11-25',
        airDateUtc: null,
        title: 'Matrix',
        seriesTitle: null,
        season: null,
        episode: null,
        year: 1999,
        poster: null,
        fanart: null,
        overview: null,
        status: 'released',
        hasFile: false,
        monitored: true,
        downloadStatus: 'missing',
        id: 7,
        runtime: 120,
        studio: null,
        network: null,
        genres: [],
        certification: null,
        instanceSlug: 'radarr',
        instanceName: 'Radarr',
      },
    ],
    totalFilms: 1,
    totalEpisodes: 0,
    radarrFailed: false,
    sonarrFailed: false,
    radarrConfigured: true,
    sonarrConfigured: false,
  };

  it('mois en pastilles, le jour touché listé sous la grille ; semaine en liste', async () => {
    await mountRadarr('/calendrier?view=month&date=2026-11-02', {
      'GET /api/calendrier': () => ({ body: calendar }),
    });
    const month = $('[data-test="calendar-month"]');
    expect(month?.textContent).not.toContain('Matrix');
    expect(month?.querySelectorAll('.cal-dot')).toHaveLength(1);
    expect($('[data-test="calendar-month-day"]')?.textContent).toContain(t('calendar.day.empty'));
    const cell = [...(month?.querySelectorAll<HTMLElement>('[role="button"]') ?? [])].find(
      (element) =>
        element.getAttribute('aria-label')?.includes(t('calendar.event.count', { count: 1 })),
    );
    cell?.click();
    await settle();
    expect(cell?.getAttribute('aria-pressed')).toBe('true');
    expect($('[data-test="calendar-month-day"]')?.textContent).toContain('Matrix');
    expect($('[data-test="calendar-day"]')).toBeNull();
    $('[data-test="view-week"]')?.click();
    await settle();
    expect($('[data-test="calendar-week"]')?.className).toContain('cal-week--list');
  });
});

describe('grand écran', () => {
  it('ni pilule, ni barre basse, ni FAB : la barre du haut et les onglets restent', async () => {
    setViewportWidth(desktopWidth);
    await mountRadarr('/medias/radarr/films');
    expect($('[data-test="topbar-pill"]')).toBeNull();
    expect($('[data-test="service-bottom-nav"]')).toBeNull();
    expect($('[data-test="radarr-nav"] .v-tabs')).not.toBeNull();
    expect($('[data-test="movies-search"]')).not.toBeNull();
  });
});
