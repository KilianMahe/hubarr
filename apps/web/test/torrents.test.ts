// SPDX-License-Identifier: AGPL-3.0-or-later
// Clients torrent (P3d) : logique de la vue (préférences, durées, âges,
// sélection, clés par client) et pages montées (qBittorrent avec VPN,
// actions, suppression groupée ; Transmission sans étiquettes, « tout
// reprendre » par sa route dédiée).

import {
  DEFAULT_USER_PREFERENCES,
  type Torrent,
  type TorrentListResponse,
  type TorrentStats,
  type UserPreferences,
} from '@hubarr/shared';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/app/plugins/i18n';
import {
  bytesToMbps,
  initialTorrentFilter,
  keepSelection,
  loadPrefs,
  mbpsToBytes,
  relativeAge,
  savePrefs,
  splitDuration,
  torrentKey,
} from '../src/features/downloads/torrents';
import { click } from './arr-admin-fixtures';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settle } from './helpers';

beforeAll(async () => {
  await setLocale('en');
});
const mounted: VueWrapper[] = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('logique', () => {
  it('préférences mémorisées par client, valeurs inconnues ignorées', () => {
    expect(loadPrefs('qbittorrent')).toEqual({ perPage: 50, sort: 'added', desc: true });
    savePrefs('qbittorrent', { perPage: 100, sort: 'name', desc: false });
    expect(loadPrefs('qbittorrent')).toEqual({ perPage: 100, sort: 'name', desc: false });
    expect(loadPrefs('deluge').perPage).toBe(50);
    localStorage.setItem('hubarr.torrents.deluge', '{"perPage":7,"sort":"zz","desc":"1"}');
    expect(loadPrefs('deluge')).toEqual({ perPage: 50, sort: 'added', desc: true });
  });

  it('filtre d’ouverture : celui du compte, « Tous » si le client ne le propose pas', () => {
    expect(initialTorrentFilter('qbittorrent', 'stalled')).toBe('stalled');
    expect(initialTorrentFilter('deluge', 'stalled')).toBe('all');
    expect(initialTorrentFilter('transmission', 'downloading')).toBe('downloading');
  });

  it('durées, âges relatifs, Mo/s', () => {
    expect(splitDuration(90_061)).toEqual({ d: 1, h: 1, m: 1, s: 1 });
    const base = 100_000_000;
    const now = base * 1000;
    expect(relativeAge(null, now)).toBeNull();
    expect(relativeAge(base - 30, now)).toEqual({ unit: 'now', n: 0 });
    expect(relativeAge(base - 7_200, now)).toEqual({ unit: 'hours', n: 2 });
    expect(relativeAge(base - 40_000_000, now)).toEqual({ unit: 'years', n: 1 });
    expect(mbpsToBytes('1,5')).toBe(1_572_864);
    expect(mbpsToBytes('')).toBe(0);
    expect(bytesToMbps(null)).toBe('');
    expect(bytesToMbps(1_572_864)).toBe('1.5');
  });

  it('sélection réduite aux torrents affichés ; clés par client avec repli', () => {
    expect([...keepSelection(new Set(['a', 'b']), ['b', 'c'])]).toEqual(['b']);
    const exists = (key: string) => key.startsWith('transmission.api');
    expect(torrentKey('transmission', 'api.empty_location', exists)).toBe(
      'transmission.api.empty_location',
    );
    expect(torrentKey('transmission', 'vpn.label', exists)).toBe('qbittorrent.vpn.label');
  });
});

const H1 = 'a'.repeat(40);
const H2 = 'b'.repeat(40);

function torrent(hash: string, overrides: Partial<Torrent> = {}): Torrent {
  return {
    hash,
    name: `Torrent ${hash.slice(0, 2)}`,
    size: 1_000_000,
    totalSize: 1_000_000,
    downloaded: 0,
    uploaded: 0,
    progress: 50,
    dlSpeed: 1024,
    upSpeed: 0,
    eta: 120,
    state: 'downloading',
    rawState: 'downloading',
    category: '',
    tags: [],
    ratio: 0.5,
    seeds: 3,
    leechs: 1,
    addedOn: 1_700_000_000,
    completedOn: null,
    savePath: '/dl',
    tracker: '',
    dlLimit: null,
    upLimit: null,
    forceStart: false,
    sequential: false,
    firstLast: false,
    ...overrides,
  };
}

const STATS: TorrentStats = {
  total: 2,
  downloading: 1,
  seeding: 0,
  paused: 1,
  completed: 0,
  errored: 0,
  stalled: 0,
  dlSpeed: 1024,
  upSpeed: 0,
  connection: 'connected',
  dlSession: 0,
  upSession: 0,
  dlAllTime: 0,
  upAllTime: 0,
  globalRatio: 1,
  freeSpace: 0,
  dlLimit: null,
  upLimit: null,
  altSpeed: false,
};

function listOf(
  torrents: Torrent[],
  extra: Partial<TorrentListResponse> = {},
): TorrentListResponse {
  return {
    torrents,
    stats: STATS,
    pagination: { page: 1, perPage: 50, total: torrents.length, totalPages: 1 },
    categories: ['movies'],
    tags: ['x'],
    ...extra,
  };
}

async function mount(
  path: string,
  routes: Parameters<typeof fakeFetch>[0],
  prefs: Partial<UserPreferences> = {},
) {
  const services = {
    states: {
      qbittorrent: { configured: true, disabled: false },
      transmission: { configured: true, disabled: false },
    },
    instances: { radarr: [], sonarr: [] },
    sidebar: {},
  };
  const fetch = fakeFetch({
    'GET /api/health/services': () => ({
      body: {
        services: { qbittorrent: true, transmission: true },
        instances: { radarr: [], sonarr: [] },
        ok: 2,
        total: 2,
        timestamp: '2026-11-21T12:00:00Z',
      },
    }),
    ...routes,
  });
  const app = await mountApp(
    path,
    bootstrapOf({
      user: ADMIN,
      services,
      userPreferences: { ...DEFAULT_USER_PREFERENCES, ...prefs },
    }),
  );
  mounted.push(app.wrapper);
  await settle();
  return { ...app, fetch };
}

describe('pages', () => {
  it('qBittorrent : liste, VPN, pause d’un torrent', async () => {
    const { fetch } = await mount('/qbittorrent', {
      'GET /api/qbittorrent/torrents': () => ({
        body: listOf([torrent(H1, { category: 'movies' }), torrent(H2, { state: 'paused' })]),
      }),
      'GET /api/qbittorrent/vpn': () => ({
        body: {
          ok: true,
          status: 'running',
          publicIp: '9.9.9.9',
          country: 'NL',
          city: null,
          region: null,
          organization: 'VPN Co',
          timezone: null,
          forwardedPort: 1,
          clientPort: 2,
          portSync: false,
        },
      }),
      [`POST /api/qbittorrent/torrent/${H1}/pause`]: () => ({ body: { ok: true } }),
    });
    expect(document.querySelectorAll('[data-test="torrent-row"]')).toHaveLength(2);
    expect(document.querySelector('[data-test="torrent-vpn"]')?.textContent).toContain('9.9.9.9');
    expect(document.querySelector('[data-test="vpn-sync"]')?.textContent).toContain('Out of sync');
    expect(document.querySelector('[data-test="torrent-filter-stalled"]')).not.toBeNull();
    click('[data-test="torrent-toggle"]');
    await settle();
    expect(
      fetch.calls.some(
        (call) => call.method === 'POST' && call.url.endsWith(`/torrent/${H1}/pause`),
      ),
    ).toBe(true);
  });

  it('s’ouvre sur le mode et le filtre des préférences du compte', async () => {
    const { fetch } = await mount(
      '/qbittorrent',
      {
        'GET /api/qbittorrent/torrents': () => ({ body: listOf([torrent(H1)]) }),
        'GET /api/qbittorrent/vpn': () => ({ status: 503, body: { code: 'SERVICE_UNREACHABLE' } }),
      },
      { torrentsView: 'list', torrentsFilter: 'downloading' },
    );
    const list = fetch.calls.find((call) => call.url.startsWith('/api/qbittorrent/torrents?'));
    expect(list?.url).toContain('filter=downloading');
    expect(document.querySelector('[data-test="torrent-rows"]')?.getAttribute('data-view')).toBe(
      'list',
    );
    expect(document.querySelector('[data-test="torrent-filter-downloading"]')?.className).toMatch(
      /active|selected/,
    );
  });

  it('suppression groupée avec les fichiers', async () => {
    const { fetch } = await mount('/qbittorrent', {
      'GET /api/qbittorrent/torrents': () => ({ body: listOf([torrent(H1), torrent(H2)]) }),
      'GET /api/qbittorrent/vpn': () => ({ status: 503, body: { code: 'SERVICE_UNREACHABLE' } }),
      'POST /api/qbittorrent/bulk/delete': () => ({ body: { ok: true } }),
    });
    click('[data-test="torrent-select-all"] input');
    await settle();
    expect(document.querySelector('[data-test="torrent-bulk"]')).not.toBeNull();
    click('[data-test="bulk-delete"]');
    await settle();
    expect(document.querySelector('[data-test="torrent-delete-message"]')?.textContent).toContain(
      '2',
    );
    click('[data-test="torrent-delete-files"] input');
    click('[data-test="torrent-delete-confirm"]');
    await settle();
    const call = fetch.calls.find((c) => c.url === '/api/qbittorrent/bulk/delete');
    expect(call?.body).toEqual({ hashes: [H1, H2], deleteFiles: true });
  });

  it('Transmission : pas d’étiquettes ni de filtre « en attente », « tout reprendre » dédié', async () => {
    const { fetch } = await mount('/transmission', {
      'GET /api/transmission/torrents': () => ({ body: listOf([torrent(H1)], { tags: [] }) }),
      'POST /api/transmission/resume-all': () => ({ body: { ok: true } }),
    });
    expect(document.querySelector('[data-test="torrents-transmission"]')).not.toBeNull();
    expect(document.querySelector('[data-test="torrent-filter-stalled"]')).toBeNull();
    expect(document.querySelector('[data-test="torrent-vpn"]')).toBeNull();
    click('[data-test="torrent-resume-all"]');
    await settle();
    expect(fetch.calls.some((call) => call.url === '/api/transmission/resume-all')).toBe(true);
  });

  it('fiche : l’onglet choisi survit à l’actualisation de la liste', async () => {
    // La vitesse change à chaque appel, comme lors d'un vrai téléchargement.
    let speed = 0;
    const app = await mount('/qbittorrent', {
      'GET /api/qbittorrent/torrents': () => ({
        body: listOf([torrent(H1, { dlSpeed: (speed += 1024) })]),
      }),
      'GET /api/qbittorrent/vpn': () => ({ status: 503, body: { code: 'SERVICE_UNREACHABLE' } }),
      [`GET /api/qbittorrent/torrent/${H1}`]: () => ({
        body: {
          properties: {
            name: 'Torrent aa',
            savePath: '/dl',
            totalSize: 1,
            pieceSize: 1,
            pieces: 1,
            comment: '',
            downloaded: 0,
            uploaded: 0,
            ratio: 0,
            addedOn: null,
            completedOn: null,
            timeElapsed: 0,
            seedingTime: 0,
            eta: null,
            seeds: 0,
            seedsTotal: 0,
            peers: 0,
            peersTotal: 0,
            dlSpeed: 0,
            upSpeed: 0,
          },
          files: [],
          trackers: [],
          peers: [],
        },
      }),
    });
    click('[data-test="torrent-row"]');
    await settle();
    click('[data-test="torrent-tab-trackers"]');
    await settle();
    const selected = () =>
      document.querySelector('[data-test="torrent-tab-trackers"]')?.getAttribute('aria-selected');
    expect(selected()).toBe('true');
    // Actualisation : la liste renvoie un nouvel objet pour le même torrent.
    await app.queryClient.invalidateQueries({ queryKey: ['torrents', 'qbittorrent'] });
    await settle();
    const listCalls = app.fetch.calls.filter((c) => c.url.startsWith('/api/qbittorrent/torrents'));
    expect(listCalls.length).toBeGreaterThan(1);
    expect(selected()).toBe('true');
  });

  it('client injoignable : alerte', async () => {
    await mount('/transmission', {
      'GET /api/transmission/torrents': () => ({
        status: 503,
        body: { code: 'SERVICE_UNREACHABLE' },
      }),
    });
    expect(document.querySelector('[data-test="torrents-error"]')).not.toBeNull();
  });
});
