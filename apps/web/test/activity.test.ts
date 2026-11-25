// SPDX-License-Identifier: AGPL-3.0-or-later
// Activité (P3e) : logique des graphiques et pages Tautulli et Tracearr
// montées (lectures en cours, statistiques, graphiques, historique).

import type { Chart } from '@hubarr/shared';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { i18n, setLocale } from '../src/app/plugins/i18n';
import { mount as mountComponent } from '@vue/test-utils';
import BarChart from '../src/features/activity/BarChart.vue';
import { createHubarrVuetify } from '../src/app/plugins/vuetify';
import { resolveTheme } from '@hubarr/shared';
import { chartIsEmpty, durationLabel, stackChart } from '../src/features/activity/activity-api';
import { ACTIVITY } from './activity-fixtures';
import { click } from './arr-admin-fixtures';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settle } from './helpers';

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
  it('empilement, état vide, durées', () => {
    const chart: Chart = {
      categories: ['a', 'b'],
      series: [
        { name: 'M', data: [1, 2] },
        { name: 'T', data: [3] },
      ],
    };
    expect(stackChart(chart)).toEqual({ totals: [4, 2], max: 4 });
    expect(chartIsEmpty({ categories: ['a'], series: [{ name: 'M', data: [0] }] })).toBe(true);
    expect(chartIsEmpty(undefined)).toBe(true);
    expect(chartIsEmpty(chart)).toBe(false);
    expect(durationLabel(0)).toBe('0m');
    expect(durationLabel(7_500)).toBe('2h 05m');
    expect(durationLabel(720)).toBe('12m');
  });
});

const t = (key: string, values: Record<string, unknown> = {}) => i18n.global.t(key, values);
const CHART: Chart = { categories: ['2026-11-20'], series: [{ name: 'Movies', data: [3] }] };
const EMPTY_STATS = {
  topMovies: [
    {
      ratingKey: '9',
      title: 'Brume',
      year: '2016',
      poster: null,
      plays: 4,
      duration: 3600,
      usersWatched: 0,
    },
  ],
  topShows: [],
  popularMovies: [],
  popularShows: [],
  topUsers: [],
  topPlatforms: [],
  mostConcurrent: [],
};

async function mount(
  path: string,
  routes: Parameters<typeof fakeFetch>[0],
  role: 'admin' | 'user' = 'user',
) {
  const fetch = fakeFetch({
    'GET /api/health/services': () => ({
      body: {
        services: { tautulli: true, tracearr: true },
        instances: { radarr: [], sonarr: [] },
        ok: 2,
        total: 2,
        timestamp: '2026-11-21T12:00:00Z',
      },
    }),
    ...routes,
  });
  const services = {
    states: {
      tautulli: { configured: true, disabled: false },
      tracearr: { configured: true, disabled: false },
    },
    instances: { radarr: [], sonarr: [] },
    sidebar: {},
  };
  const app = await mountApp(path, bootstrapOf({ user: { ...ADMIN, role }, services }));
  mounted.push(app.wrapper);
  await settle();
  return { ...app, fetch };
}

describe('pages', () => {
  it('Tautulli : en cours, statistiques, graphique, historique et métadonnées', async () => {
    const chartRoutes = Object.fromEntries(
      [
        'plays',
        'activity-hour',
        'activity-dow',
        'clients-stream-type',
        'plays-source-res',
        'plays-stream-res',
        'users-stream-type',
        'concurrent',
      ].map((p) => [`GET /api/tautulli/${p}`, () => ({ body: CHART })]),
    );
    const { fetch } = await mount('/tautulli', {
      'GET /api/tautulli/now-playing': () => ({ body: ACTIVITY }),
      'GET /api/tautulli/user-names': () => ({ body: [{ name: 'alice', id: '1' }] }),
      'GET /api/tautulli/stats': () => ({ body: EMPTY_STATS }),
      'GET /api/tautulli/history': () => ({
        body: [
          {
            ratingKey: '42',
            mediaType: 'movie',
            title: 'Orbite Basse',
            grandparentTitle: null,
            year: '2019',
            episodeCode: null,
            poster: null,
            userDisplayName: 'alice',
            watchedAt: 1_763_700_000,
            percentComplete: 100,
          },
        ],
      }),
      'GET /api/tautulli/libraries': () => ({
        body: [{ name: 'Films', type: 'movie', count: 12, childCount: null }],
      }),
      'GET /api/tautulli/users': () => ({ body: [] }),
      'GET /api/tautulli/metadata/42': () => ({
        body: {
          error: null,
          metadata: {
            mediaType: 'movie',
            title: 'Orbite Basse',
            grandparentTitle: null,
            year: '2019',
            season: null,
            episode: null,
            summary: 'Résumé E2E',
            tagline: null,
            contentRating: null,
            durationMs: 6_000_000,
            genres: [],
            ratings: { critic: null, audience: null },
            directors: [],
            writers: [],
            cast: [],
            studio: null,
            releaseDate: null,
            media: {
              resolution: null,
              videoCodec: null,
              audioCodec: null,
              container: null,
              bitrateKbps: 0,
            },
          },
        },
      }),
      ...chartRoutes,
    });
    expect(document.querySelector('[data-test="session-card"]')?.textContent).toContain(
      'Orbite Basse',
    );
    expect(document.querySelector('[data-test="tautulli-stats"]')?.textContent).toContain('Brume');
    expect(document.querySelectorAll('[data-test="bar-chart"]').length).toBeGreaterThan(0);
    expect(document.querySelector('[data-test="tautulli-libraries"]')?.textContent).toContain(
      'Films',
    );
    click('[data-test="tautulli-history-row"]');
    await settle();
    expect(document.querySelector('[data-test="tautulli-metadata"]')?.textContent).toContain(
      'Résumé E2E',
    );
    expect(
      fetch.calls.some((c) => c.url.startsWith('/api/tautulli/stats?range=30&metric=plays')),
    ).toBe(true);
  });

  it('Tracearr : onglets (V9) — résumé, statistiques, historique paginé', async () => {
    let historyCalls = 0;
    const { fetch, router } = await mount('/tracearr', {
      'GET /api/tracearr/now-playing': () => ({
        body: { ...ACTIVITY, connected: false, error: 'unreachable', sessions: [] },
      }),
      'GET /api/tracearr/stats': () => ({
        body: {
          activeStreams: 0,
          totalUsers: 3,
          plays30d: 40,
          violations7d: 0,
          todayPlays: 2,
          watchTimeHours: 1.5,
          activeUsersToday: 1,
          alertsLast24h: 0,
        },
      }),
      'GET /api/tracearr/charts': () => ({
        body: {
          plays: CHART,
          concurrent: { categories: [], series: [] },
          hour: CHART,
          dow: CHART,
          platforms: CHART,
          quality: {
            directPlay: 1,
            directStream: 0,
            transcode: 1,
            total: 2,
            directPlayPercent: 50,
            directStreamPercent: 0,
            transcodePercent: 50,
          },
        },
      }),
      'GET /api/tracearr/history': () => {
        historyCalls += 1;
        return {
          body: {
            rows: [
              {
                quickLook: null,
                title: `F${historyCalls}`,
                year: null,
                mediaType: 'movie',
                poster: null,
                serverName: null,
                userKey: null,
                userDisplayName: 'bob',
                showTitle: null,
                platform: 'Web',
                watchedAt: 1_763_700_000,
                durationMs: 60_000,
                watched: true,
                percentComplete: 100,
              },
            ],
            nextCursor: historyCalls === 1 ? 'abc' : null,
          },
        };
      },
      'GET /api/tracearr/users': () => ({ body: [] }),
    });
    // Résumé : erreur de l'activité, compteurs, aperçu de l'historique, rien des autres onglets.
    expect(document.querySelector('[data-test="activity-error"]')).not.toBeNull();
    expect(document.querySelector('[data-test="tracearr-stats"]')?.textContent).toContain('40');
    expect(document.querySelectorAll('[data-test="tracearr-history-row"]')).toHaveLength(1);
    expect(document.querySelector('[data-test="tracearr-history-more"]')).toBeNull();
    expect(document.querySelector('[data-test="tracearr-users"]')).toBeNull();
    expect(fetch.calls.some((c) => c.url.startsWith('/api/tracearr/charts'))).toBe(false);
    expect(fetch.calls.some((c) => c.url === '/api/tracearr/users')).toBe(false);

    await router.push({ name: 'tracearr-stats' });
    await settle();
    expect(document.querySelector('[data-test="tracearr-quality"]')).not.toBeNull();

    await router.push({ name: 'tracearr-history' });
    await settle();
    click('[data-test="tracearr-history-more"]');
    await settle();
    expect(document.querySelectorAll('[data-test="tracearr-history-row"]')).toHaveLength(2);
    expect(fetch.calls.some((c) => c.url === '/api/tracearr/history?cursor=abc')).toBe(true);

    await router.push({ name: 'tracearr-users' });
    await settle();
    expect(document.querySelector('[data-test="tracearr-users"]')).not.toBeNull();
    expect(router.currentRoute.value.path).toBe('/tracearr/utilisateurs');
  });

  it('Tracearr : une lecture en cours s’ouvre sur son détail (V19)', async () => {
    await mount('/tracearr/en-cours', {
      'GET /api/tracearr/now-playing': () => ({
        body: {
          ...ACTIVITY,
          sessions: [
            {
              ...ACTIVITY.sessions[0],
              serverName: 'Salon',
              videoDecision: 'transcode',
              videoCodec: 'hevc',
              streamVideoCodec: 'h264',
              quickLook: { type: 'movie', id: 603 },
            },
          ],
        },
      }),
      'GET /api/tracearr/history': () => ({ body: { rows: [], nextCursor: null } }),
    });
    click('[data-test="session-card"]');
    await settle();
    const detail = document.querySelector('[data-test="session-detail"]');
    expect(detail?.querySelector('[data-test="session-detail-title"]')?.textContent).toBe(
      'Orbite Basse',
    );
    expect(detail?.querySelector('[data-test="session-detail-server"]')?.textContent).toBe('Salon');
    expect(detail?.querySelector('[data-test="session-detail-video"]')?.textContent).toBe(
      `${t('dashboard.plex.decision.transcode')} · hevc → h264`,
    );
    expect(detail?.querySelector('[data-test="session-detail-location"]')?.textContent).toBe(
      t('dashboard.plex.bandwidth.lan'),
    );
    expect(document.querySelector('[data-test="session-detail-open"]')).not.toBeNull();
    // Arrêter une lecture est réservé aux admins.
    expect(document.querySelector('[data-test="session-detail-terminate"]')).toBeNull();
  });

  it('Tracearr : un admin arrête une lecture depuis son détail, avec un message', async () => {
    const SESSION = '33333333-4444-5555-6666-777777777777';
    const { fetch } = await mount(
      '/tracearr/en-cours',
      {
        'GET /api/tracearr/now-playing': () => ({
          body: { ...ACTIVITY, sessions: [{ ...ACTIVITY.sessions[0], sessionKey: SESSION }] },
        }),
        'GET /api/tracearr/history': () => ({ body: { rows: [], nextCursor: null } }),
        [`POST /api/tracearr/streams/${SESSION}/terminate`]: () => ({ body: { ok: true } }),
      },
      'admin',
    );
    click('[data-test="session-card"]');
    await settle();
    click('[data-test="session-detail-terminate"]');
    await settle();
    expect(
      document.querySelector('[data-test="session-terminate-message"]')?.textContent,
    ).toContain('Orbite Basse');
    const input = document.querySelector<HTMLInputElement>(
      '[data-test="session-terminate-reason"] input',
    );
    if (input === null) throw new Error('champ du message absent');
    input.value = '  Pause dîner ';
    input.dispatchEvent(new Event('input'));
    await settle();
    click('[data-test="session-terminate-confirm"]');
    await settle();
    const call = fetch.calls.find((c) => c.method === 'POST');
    expect(call?.url).toBe(`/api/tracearr/streams/${SESSION}/terminate`);
    expect(call?.body).toEqual({ reason: 'Pause dîner' });
    expect(document.querySelector('[data-test="session-detail"]')).toBeNull();
  });

  it('Tracearr : un clic sur un utilisateur ouvre sa fiche (V23)', async () => {
    const KEY = 'AbCdEfGhIjKlMnOpQrStUv';
    const user = {
      key: KEY,
      displayName: 'alice',
      serverName: 'Plex Salon',
      lastSeen: 1_795_000_000,
      plays: 3,
      trustScore: 98,
    };
    const row = {
      quickLook: null,
      title: 'Film A',
      year: null,
      mediaType: 'movie',
      poster: null,
      serverName: null,
      userKey: KEY,
      userDisplayName: 'alice',
      showTitle: null,
      platform: 'Plex Web',
      watchedAt: 1_795_000_000,
      durationMs: 5_400_000,
      watched: true,
      percentComplete: 100,
    };
    const { router, fetch } = await mount('/tracearr/utilisateurs', {
      'GET /api/tracearr/users': () => ({ body: [user, { ...user, key: null, displayName: 'x' }] }),
      [`GET /api/tracearr/users/${KEY}`]: () => ({
        body: {
          user,
          stats: {
            plays: 1,
            watchTimeMs: 5_400_000,
            movies: 1,
            episodes: 0,
            lastSeen: 1_795_000_000,
            platforms: [{ name: 'Plex Web', plays: 1 }],
            topTitles: [{ name: 'Film A', plays: 1 }],
          },
          history: [row],
          scannedRows: 500,
          truncated: true,
        },
      }),
      'GET /api/tracearr/users/inconnu': () => ({ status: 404, body: { code: 'NOT_FOUND' } }),
    });
    // Cartes (V33) : les plus récemment actifs d'abord ; seules celles munies
    // d'un jeton mènent à la fiche.
    const cards = document.querySelectorAll('[data-test="tracearr-user-card"]');
    expect(cards).toHaveLength(2);
    expect(
      document.querySelectorAll('[data-test="tracearr-user-card"][data-linked="true"]'),
    ).toHaveLength(1);
    click('[data-test="tracearr-user-card"][data-linked="true"]');
    await settle();
    expect(router.currentRoute.value.name).toBe('tracearr-user');
    expect(router.currentRoute.value.path).toBe(`/tracearr/utilisateurs/${KEY}`);
    expect(fetch.calls.some((c) => c.url === `/api/tracearr/users/${KEY}`)).toBe(true);
    const stats = document.querySelector('[data-test="tracearr-user-stats"]')?.textContent ?? '';
    expect(stats).toContain('1.5');
    expect(document.querySelector('[data-test="tracearr-user-name"]')?.textContent).toContain(
      'alice',
    );
    expect(document.querySelector('[data-test="tracearr-user-platforms"]')?.textContent).toContain(
      'Plex Web',
    );
    expect(document.querySelectorAll('[data-test="tracearr-user-history-row"]')).toHaveLength(1);
    expect(document.querySelector('[data-test="tracearr-user-window"]')?.textContent).toContain(
      '500',
    );

    await router.push('/tracearr/utilisateurs/inconnu');
    await settle();
    expect(document.querySelector('[data-test="tracearr-user-not-found"]')).not.toBeNull();
  });
});

describe('graphique (V8)', () => {
  it('étiquettes de l’axe en HTML, une colonne par catégorie, clairsemées au-delà de 12', () => {
    const categories = Array.from({ length: 24 }, (_, index) => `${index}h`);
    const wrapper = mountComponent(BarChart, {
      global: { plugins: [i18n, createHubarrVuetify(resolveTheme(undefined, undefined)).plugin] },
      props: { chart: { categories, series: [{ name: 'Plays', data: categories.map(() => 1) }] } },
    });
    expect(wrapper.find('svg text').exists()).toBe(false);
    const axis = wrapper.get('[data-test="bar-chart-axis"]');
    // Une étiquette sur deux, chacune sur deux colonnes (P5d.7, V32).
    const labels = axis.findAll('span');
    expect(labels.map((label) => label.text())).toEqual(categories.filter((_, i) => i % 2 === 0));
    expect(labels[0]?.attributes('style')).toContain('span 2');
    expect(axis.attributes('style')).toContain('repeat(24');
  });
});
