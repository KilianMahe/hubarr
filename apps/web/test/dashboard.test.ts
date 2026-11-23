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
  greetingKey,
  moveSection,
  refLocation,
  relativeDate,
  upcomingByDay,
  weekdayKey,
} from '../src/features/dashboard/dashboard-api';
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
          body: [queueItem(1, { sizeleft: 10 }), queueItem(2, { trackedStatus: 'warning' })],
        }),
      }),
    );
    const { wrapper } = await mountApp('/tableau-de-bord', bootstrapOf({ user: ADMIN, services }));
    mounted.push(wrapper);
    await settle();
    const rows = wrapper.findAll('[data-test="dashboard-queue-row"]');
    expect(rows.map((row) => row.text())).toEqual([
      expect.stringContaining('Film 2'),
      expect.stringContaining('Film 1'),
    ]);
    expect(rows[0]?.text()).toContain(t('dashboard.queue.state.warning'));
    expect(rows[1]?.text()).toContain('90 %');
    expect(rows[1]?.attributes('href')).toBe('/medias/films/films/1');
    expect(wrapper.get('[data-test="dashboard-queue-link"]').attributes('href')).toBe(
      '/medias/films/films/file-attente',
    );
    wrapper.unmount();
    mounted.pop();

    fakeFetch(routes({ 'GET /api/tableau-de-bord': () => ({ body: page({ layout }) }) }));
    const user = await mountApp(
      '/tableau-de-bord',
      bootstrapOf({ user: { ...ADMIN, role: 'user' }, services }),
    );
    mounted.push(user.wrapper);
    await settle();
    expect(user.wrapper.find('[data-test="card-queue"]').exists()).toBe(false);
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
});
