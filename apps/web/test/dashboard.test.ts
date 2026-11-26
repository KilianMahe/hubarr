// SPDX-License-Identifier: AGPL-3.0-or-later
// Tableau de bord (P4.1) : logique (jours, dates relatives, salutation,
// réordonnancement) et page montée (sections dans l'ordre choisi, sections
// masquées ou sans service absentes, carte en panne sans effet sur les autres,
// mode édition enregistré, aperçu rapide).

import type { BootstrapServices, DashboardPage, UpcomingItem } from '@hubarr/shared';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import {
  downloadBars,
  greetingKey,
  moveSection,
  refLocation,
  relativeDate,
  shortDay,
  upcomingByDay,
  weekdayKey,
} from '../src/features/dashboard/dashboard-api';
import { ACTIVITY } from './activity-fixtures';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settle, type FakeHandler } from './helpers';

beforeAll(async () => {
  await setLocale('en');
});
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('logique', () => {
  it('salutation, jour de la semaine, grille de 7 jours', () => {
    expect(greetingKey(3)).toBe('dashboard.greeting.evening');
    expect(greetingKey(9)).toBe('dashboard.greeting.morning');
    expect(greetingKey(15)).toBe('dashboard.greeting.afternoon');
    expect(greetingKey(20)).toBe('dashboard.greeting.evening');
    expect(weekdayKey('2026-11-22')).toBe('dashboard.weekdays.sun');
    expect(weekdayKey('2026-11-23')).toBe('dashboard.weekdays.mon');
    const item = { day: '2026-11-24' } as UpcomingItem;
    const days = upcomingByDay('2026-11-22', 7, [item]);
    expect(days.map((d) => d.day)).toEqual([
      '2026-11-22',
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
    ]);
    expect(days[0]?.isToday).toBe(true);
    expect(days[2]?.items).toEqual([item]);
  });

  it('dates relatives, liens, déplacement d’une section', () => {
    const now = new Date('2026-11-22T12:00:00Z');
    expect(relativeDate('2026-11-22T08:00:00Z', now)).toEqual({ key: 'dashboard.relative.today' });
    expect(relativeDate('2026-11-21T08:00:00Z', now)).toEqual({
      key: 'dashboard.relative.yesterday',
    });
    expect(relativeDate('2026-11-18T12:00:00Z', now)).toEqual({
      key: 'dashboard.relative.days_ago',
      count: 4,
    });
    expect(relativeDate('2026-10-01T12:00:00Z', now)?.key).toBe('dashboard.relative.months_ago');
    expect(relativeDate(null, now)).toBeNull();
    expect(refLocation({ kind: 'library', type: 'series', slug: 'tv', id: 3 })).toEqual({
      name: 'sonarr-series',
      params: { slug: 'tv', id: '3' },
    });
    expect(refLocation({ kind: 'tmdb', type: 'movie', id: 603 })).toEqual({
      name: 'tmdb',
      query: { detail: 'movie/603' },
    });
    const layout = [
      { key: 'upcoming', visible: true },
      { key: 'health', visible: true },
    ] as DashboardPage['layout'];
    expect(moveSection(layout, 1, -1).map((s) => s.key)).toEqual(['health', 'upcoming']);
    expect(moveSection(layout, 0, -1)).toBe(layout);
  });

  it('graphique des téléchargements : hauteur relative au jour le plus chargé', () => {
    expect(
      downloadBars([
        { day: '2026-11-21', bytes: 0 },
        { day: '2026-11-22', bytes: 50 },
        { day: '2026-11-23', bytes: 200 },
      ]).map((b) => b.ratio),
    ).toEqual([0, 0.25, 1]);
    expect(downloadBars([{ day: '2026-11-22', bytes: 0 }])[0]?.ratio).toBe(0);
    expect(shortDay('2026-11-22', 'en')).toBe('Nov 22');
    expect(shortDay('2026-11-01', 'fr')).toBe('1 nov.');
  });
});

function page(overrides: Partial<DashboardPage> = {}): DashboardPage {
  return {
    layout: [
      { key: 'health', visible: true },
      { key: 'upcoming', visible: true },
      { key: 'requests', visible: true },
      { key: 'plex', visible: true },
      { key: 'emby', visible: true },
      { key: 'transmission', visible: true },
      { key: 'watchlist', visible: true },
      { key: 'trending', visible: false },
      { key: 'recent', visible: true },
    ],
    configured: {
      radarr: true,
      sonarr: false,
      seerr: false,
      tmdb: true,
      tautulli: false,
      transmission: false,
      tracearr: false,
      emby: false,
      downloads: false,
    },
    watchlist: [{ tmdbId: 1, mediaType: 'tv', title: 'Show', poster: null, year: 2020, vote: 8 }],
    ...overrides,
  };
}

function routes(extra: Record<string, FakeHandler> = {}): Record<string, FakeHandler> {
  return {
    'GET /api/health/services': () => ({
      body: { services: {}, instances: { radarr: [], sonarr: [] } },
    }),
    'GET /api/tableau-de-bord': () => ({ body: page() }),
    'GET /api/tableau-de-bord/widget/hero': () => ({
      body: { spotlight: null, stats: { films: 12, series: null }, upcomingCount: 3 },
    }),
    'GET /api/tableau-de-bord/widget/health': () => ({
      body: { chips: [{ id: 'radarr', name: 'Films', status: 'up', latencyMs: 12 }] },
    }),
    'GET /api/tableau-de-bord/widget/upcoming': () => ({ status: 500, body: { code: 'INTERNAL' } }),
    'GET /api/tableau-de-bord/widget/recent': () => ({
      body: {
        available: true,
        items: [
          {
            type: 'movie',
            id: 7,
            title: 'Recent Movie',
            addedAt: null,
            poster: null,
            downloaded: true,
            network: null,
            slug: 'films',
            tmdbId: 603,
            tvdbId: null,
            episodeCount: 0,
          },
        ],
      },
    }),
    'GET /api/tableau-de-bord/quicklook/movie/films/7': () => ({
      body: {
        title: 'Recent Movie',
        year: 2024,
        poster: null,
        backdrop: null,
        overview: 'Synopsis',
        genres: ['Drama'],
        rating: 7.5,
        runtime: 120,
        network: null,
        seasons: null,
        status: 'downloaded',
        action: { kind: 'manage', type: 'movie', slug: 'films', id: 7 },
        inLibrary: true,
        radarrId: 7,
        sonarrId: null,
        airStatus: null,
        cast: [],
        providers: [],
        trailerKey: null,
        imdbId: null,
        tmdbId: 9,
        tmdbType: 'movie',
        posterPath: null,
        releaseDates: [],
      },
    }),
    'GET /api/decouverte/watchlist/status': () => ({ body: { keys: [] } }),
    ...extra,
  };
}

const services: BootstrapServices = {
  states: {
    radarr: { configured: true, disabled: false },
    tmdb: { configured: true, disabled: false },
  },
  instances: {
    radarr: [{ slug: 'films', name: 'Films', enabled: true, isDefault: true }],
    sonarr: [],
  },
  sidebar: {},
};

const t = (key: string, values: Record<string, unknown> = {}) => i18n.global.t(key, values);

describe('page', () => {
  it('files d’attente Radarr (V21) : problèmes d’abord, fiche et onglet ; masquée pour un utilisateur', async () => {
    const queueItem = (id: number, overrides: Record<string, unknown> = {}) => ({
      id,
      movieId: id,
      title: `Film ${id}`,
      year: 2020,
      size: 100,
      sizeleft: 50,
      status: 'downloading',
      trackedStatus: 'ok',
      trackedState: 'downloading',
      quality: 'HD',
      protocol: 'torrent',
      eta: null,
      indexer: null,
      downloadId: null,
      outputPath: null,
      downloadClient: null,
      statusMessages: [],
      ...overrides,
    });
    const layout = [{ key: 'queue', visible: true }] as DashboardPage['layout'];
    fakeFetch(
      routes({
        'GET /api/tableau-de-bord': () => ({ body: page({ layout }) }),
        'GET /api/medias/films/films/queue': () => ({
          body: [
            queueItem(1, { sizeleft: 10 }),
            queueItem(2, { trackedStatus: 'warning' }),
            queueItem(3, { trackedState: 'importPending' }),
            queueItem(4, { trackedState: 'importing' }),
          ],
        }),
      }),
    );
    const { wrapper } = await mountApp('/tableau-de-bord', bootstrapOf({ user: ADMIN, services }));
    mounted.push(wrapper);
    await settle();
    const rows = wrapper.findAll('[data-test="dashboard-queue-row"]');
    expect(rows.map((row) => row.text())).toEqual([
      expect.stringContaining('Film 2'),
      expect.stringContaining('Film 4'),
      expect.stringContaining('Film 3'),
      expect.stringContaining('Film 1'),
    ]);
    expect(rows[0]?.text()).toContain(t('dashboard.queue.state.warning'));
    // Import en cours : la fiche ; en attente d'import ou en téléchargement :
    // la file d'attente de l'instance.
    expect(rows[1]?.attributes('href')).toBe('/medias/films/films/4');
    expect(rows[2]?.attributes('href')).toBe('/medias/films/films/file-attente');
    expect(rows[3]?.text()).toContain('90 %');
    expect(rows[3]?.attributes('href')).toBe('/medias/films/films/file-attente');
    expect(wrapper.get('[data-test="dashboard-queue-link"]').attributes('href')).toBe(
      '/medias/films/films/file-attente',
    );
    wrapper.unmount();
    mounted.pop();

    // Utilisateur sans droit sur Radarr/Sonarr : le serveur les dit non configurés.
    fakeFetch(
      routes({
        'GET /api/tableau-de-bord': () => ({
          body: page({ layout, configured: { ...page().configured, radarr: false } }),
        }),
      }),
    );
    const user = await mountApp(
      '/tableau-de-bord',
      bootstrapOf({ user: { ...ADMIN, role: 'user' }, services }),
    );
    mounted.push(user.wrapper);
    await settle();
    expect(user.wrapper.find('[data-test="card-queue"]').exists()).toBe(false);
  });

  it('lecture en cours : la fenêtre de la page Tracearr ou Tautulli', async () => {
    const layout = [{ key: 'plex', visible: true }] as DashboardPage['layout'];
    const metadata = { metadata: null };
    const mountWith = async (source: 'tautulli' | 'tracearr') => {
      fakeFetch(
        routes({
          'GET /api/tableau-de-bord': () => ({
            body: page({ layout, configured: { ...page().configured, [source]: true } }),
          }),
          'GET /api/tableau-de-bord/widget/plex': () => ({
            body: { available: true, source, activity: ACTIVITY, history: [] },
          }),
          'GET /api/tautulli/metadata/42': () => ({ body: metadata }),
        }),
      );
      const app = await mountApp('/tableau-de-bord', bootstrapOf({ user: ADMIN, services }));
      mounted.push(app.wrapper);
      await settle();
      await app.wrapper
        .get('[data-test="card-activity"] [data-test="activity-row"] button')
        .trigger('click');
      await settle();
      return app.wrapper;
    };

    // Tracearr : détail de la lecture (flux, lecteur, réseau).
    let wrapper = await mountWith('tracearr');
    expect(document.querySelector('[data-test="session-detail-title"]')?.textContent).toBe(
      'Orbite Basse',
    );
    expect(document.querySelector('[data-test="tautulli-metadata"]')).toBeNull();
    wrapper.unmount();
    mounted.pop();
    document.body.innerHTML = '';

    // Tautulli : métadonnées Plex du titre.
    wrapper = await mountWith('tautulli');
    expect(document.querySelector('[data-test="tautulli-metadata"]')).not.toBeNull();
    expect(document.querySelector('[data-test="session-detail"]')).toBeNull();
    expect(wrapper.find('[data-test="card-activity"]').exists()).toBe(true);
  });

  it('sections dans l’ordre, masquées ou sans service absentes, carte en panne isolée', async () => {
    fakeFetch(routes());
    const { wrapper } = await mountApp('/tableau-de-bord', bootstrapOf({ user: ADMIN, services }));
    mounted.push(wrapper);
    await settle();
    const keys = wrapper
      .findAll('[data-section-key]')
      .map((el) => el.attributes('data-section-key'));
    expect(keys).toEqual(['health', 'upcoming', 'watchlist', 'recent']);
    expect(wrapper.find('[data-test="card-health"]').text()).toContain('Films');
    // La carte des sorties en panne disparaît sans masquer les autres.
    expect(wrapper.find('[data-test="card-upcoming"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="card-recent"]').text()).toContain('Recent Movie');
    expect(wrapper.find('[data-test="card-watchlist"]').text()).toContain('Show');
    expect(
      wrapper.findAll('[data-test="hero-stat"]').map((s) => s.find('.stat-tile__value').text()),
    ).toEqual(['12', '—', '3']);
  });

  it('aperçu rapide d’un ajout récent, lien « Gérer »', async () => {
    fakeFetch(routes());
    const { wrapper } = await mountApp('/tableau-de-bord', bootstrapOf({ user: ADMIN, services }));
    mounted.push(wrapper);
    await settle();
    await wrapper.get('[data-test="card-recent"] .v-card').trigger('click');
    await settle();
    const sheet = document.querySelector('[data-test="quicklook"]');
    expect(sheet?.textContent).toContain('Synopsis');
    expect(document.querySelector('[data-test="quicklook-action"]')?.getAttribute('href')).toBe(
      '/medias/films/films/7',
    );
  });

  it('mode édition : réordonner, masquer, enregistrer', async () => {
    const { calls } = fakeFetch(
      routes({ 'POST /api/admin/settings': () => ({ status: 500, body: { code: 'INTERNAL' } }) }),
    );
    const { wrapper } = await mountApp('/tableau-de-bord', bootstrapOf({ user: ADMIN, services }));
    mounted.push(wrapper);
    await settle();
    await wrapper.get('[data-test="layout-edit"]').trigger('click');
    await settle();
    const row = wrapper.get('[data-test="layout-row-upcoming"]');
    await row.findAll('button')[0]?.trigger('click');
    await settle();
    await wrapper.get('[data-test="layout-save"]').trigger('click');
    await settle();
    const save = calls.find((c) => c.method === 'POST' && c.url === '/api/admin/settings');
    expect(save?.body).toMatchObject({
      dashboard: {
        order: [
          'upcoming',
          'health',
          'requests',
          'plex',
          'emby',
          'transmission',
          'watchlist',
          'trending',
          'recent',
        ],
        hidden: ['trending'],
      },
    });
  });
});

describe('statistiques (lot 13)', () => {
  const GIB = 1_073_741_824;
  const layout = [
    { key: 'downloads', visible: true },
    { key: 'disks', visible: true },
  ] as DashboardPage['layout'];
  const statsRoutes = (configured: Partial<DashboardPage['configured']> = {}) =>
    routes({
      'GET /api/tableau-de-bord': () => ({
        body: page({
          layout,
          configured: { ...page().configured, downloads: true, ...configured },
        }),
      }),
      'GET /api/tableau-de-bord/widget/downloads': () => ({
        body: {
          available: true,
          days: [
            { day: '2026-11-21', bytes: 2 * GIB },
            { day: '2026-11-22', bytes: 0 },
          ],
          total: 2 * GIB,
          average: GIB,
          clients: [
            { id: 'qbittorrent', ok: true },
            { id: 'sabnzbd', ok: false },
          ],
        },
      }),
      'GET /api/tableau-de-bord/widget/disks': () => ({
        body: {
          available: true,
          disks: [
            {
              path: '/movies',
              label: 'movies',
              freeSpace: 50 * GIB,
              totalSpace: 1000 * GIB,
              usedPercent: 95,
              alert: true,
              roots: [{ service: 'radarr', instance: 'Films', path: '/movies' }],
            },
            {
              path: '/tv',
              label: null,
              freeSpace: 600 * GIB,
              totalSpace: 2000 * GIB,
              usedPercent: 70,
              alert: false,
              roots: [{ service: 'sonarr', instance: 'Séries', path: '/tv' }],
            },
          ],
          failed: ['Films 4K'],
        },
      }),
    });

  it('admin : total, moyenne, une barre par jour, client sans réponse ; disques et alerte', async () => {
    fakeFetch(statsRoutes());
    const { wrapper } = await mountApp('/tableau-de-bord', bootstrapOf({ user: ADMIN, services }));
    mounted.push(wrapper);
    await settle();
    const downloads = wrapper.get('[data-test="card-downloads"]');
    expect(downloads.get('[data-test="downloads-total"]').text()).toBe('2.0 GB');
    expect(downloads.get('[data-test="downloads-average"]').text()).toBe('1.0 GB');
    const bars = downloads.findAll('[data-test="downloads-bar"]');
    expect(bars).toHaveLength(2);
    expect(Number(bars[0]?.attributes('height'))).toBeGreaterThan(90);
    expect(bars[1]?.attributes('height')).toBe('0');
    expect(bars[0]?.find('title').text()).toBe('Nov 21: 2.0 GB');
    expect(downloads.get('[data-test="downloads-failed"]').text()).toContain('SABnzbd');

    const disks = wrapper.findAll('[data-test="disk"]');
    expect(disks).toHaveLength(2);
    expect(disks[0]?.text()).toContain('/movies');
    expect(disks[0]?.text()).toContain(t('dashboard.disks.used', { percent: '95' }));
    expect(disks[0]?.find('[data-test="disk-alert"]').exists()).toBe(true);
    expect(disks[1]?.find('[data-test="disk-alert"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="disks-failed"]').text()).toContain('Films 4K');
  });

  it('sans client de téléchargement : pas de graphique ; utilisateur sans droit : aucune des deux', async () => {
    const { calls } = fakeFetch(statsRoutes({ downloads: false }));
    const { wrapper } = await mountApp('/tableau-de-bord', bootstrapOf({ user: ADMIN, services }));
    mounted.push(wrapper);
    await settle();
    expect(wrapper.find('[data-test="card-downloads"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="card-disks"]').exists()).toBe(true);
    expect(calls.some((c) => c.url.endsWith('/widget/downloads'))).toBe(false);
    wrapper.unmount();
    mounted.pop();

    // Services illisibles pour le compte : non configurés d'après le serveur.
    const user = fakeFetch(statsRoutes({ radarr: false, sonarr: false, downloads: false }));
    const asUser = await mountApp(
      '/tableau-de-bord',
      bootstrapOf({ user: { ...ADMIN, role: 'user' }, services }),
    );
    mounted.push(asUser.wrapper);
    await settle();
    expect(asUser.wrapper.find('[data-test="card-downloads"]').exists()).toBe(false);
    expect(asUser.wrapper.find('[data-test="card-disks"]').exists()).toBe(false);
    expect(user.calls.some((c) => c.url.includes('/widget/d'))).toBe(false);
  });
});

describe('surveillance des téléchargements', () => {
  it('passages terminés et en erreur, repli exponentiel plafonné', async () => {
    const { detectTransitions, nextDelay, MAX_DELAY_MS } =
      await import('../src/app/download-watch');
    const result = detectTransitions(
      { a: 'downloading', b: 'downloading', c: 'seeding', d: 'paused' },
      [
        { hash: 'a', state: 'completed', name: 'A', size: 1 },
        { hash: 'b', state: 'downloading', name: 'B', size: 1 },
        { hash: 'c', state: 'seeding', name: 'C', size: 1 },
        { hash: 'd', state: 'error', name: 'D', size: 1 },
        { hash: 'e', state: 'error', name: 'E', size: 1 },
      ],
    );
    expect(result.completed.map((i) => i.hash)).toEqual(['a']);
    expect(result.errored.map((i) => i.hash)).toEqual(['d']);
    expect(result.next).toMatchObject({ a: 'completed', e: 'error' });
    expect(nextDelay(2_000, 0)).toBe(2_000);
    expect(nextDelay(2_000, 3)).toBe(8_000);
    expect(nextDelay(10_000, 10)).toBe(MAX_DELAY_MS);
  });

  it('« Vu » (Tracearr) sur les tendances et les derniers ajouts', async () => {
    const layout = page().layout.map((section) =>
      section.key === 'trending' ? { ...section, visible: true } : section,
    );
    fakeFetch(
      routes({
        'GET /api/tableau-de-bord': () => ({ body: page({ layout }) }),
        'GET /api/tableau-de-bord/widget/recommendations': () => ({
          body: {
            available: true,
            items: [
              { id: 603, type: 'movie', title: 'Matrix', year: 1999, poster: null, vote: 8 },
              { id: 1399, type: 'tv', title: 'Thrones', year: 2011, poster: null, vote: 8 },
              { id: 5, type: 'movie', title: 'Unseen', year: 2020, poster: null, vote: 6 },
            ],
          },
        }),
        'GET /api/tracearr/watched': () => ({
          body: {
            linked: true,
            movies: [603],
            shows: [
              {
                tmdbId: 1399,
                tvdbId: null,
                episodes: [
                  [1, 1],
                  [1, 2],
                ],
              },
            ],
          },
        }),
      }),
    );
    const withTracearr: BootstrapServices = {
      ...services,
      states: { ...services.states, tracearr: { configured: true, disabled: false } },
    };
    const { wrapper } = await mountApp(
      '/tableau-de-bord',
      bootstrapOf({ user: ADMIN, services: withTracearr }),
    );
    mounted.push(wrapper);
    await settle();
    const badges = (card: string) =>
      wrapper.findAll(`[data-test="${card}"] [data-test="watched-badge"]`).map((b) => b.text());
    expect(badges('card-trending')).toEqual(['Watched', '2 episodes watched']);
    expect(badges('card-recent')).toEqual(['Watched']);
  });
});
