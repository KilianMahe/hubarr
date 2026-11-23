// SPDX-License-Identifier: AGPL-3.0-or-later
// Usenet et page Téléchargements (P3d.5) : filtre et tri de la file, temps
// restant, motifs NZBGet ; pages montées (file SABnzbd, historique NZBGet,
// page agrégée).

import type { UsenetDownload, UsenetQueue } from '@hubarr/shared';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/app/plugins/i18n';
import {
  formatEta,
  loadUsenetPrefs,
  nzbgetFailKey,
  visibleQueue,
} from '../src/features/usenet/usenet';
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

function item(id: string, overrides: Partial<UsenetDownload> = {}): UsenetDownload {
  return {
    id,
    name: `Job ${id}`,
    status: 'downloading',
    rawStatus: 'Downloading',
    size: 100,
    remaining: 50,
    percentage: 50,
    category: '',
    eta: null,
    speed: 0,
    fail: null,
    history: false,
    wait: null,
    completedAt: null,
    ...overrides,
  };
}

describe('logique', () => {
  it('filtre, recherche, tri (ETA inconnue en dernier)', () => {
    const items = [
      item('b', { eta: null, size: 5 }),
      item('a', { eta: 10, size: 9, status: 'paused' }),
      item('c', { eta: 5, size: 1 }),
    ];
    const names = (options: Partial<Parameters<typeof visibleQueue>[1]>) =>
      visibleQueue(items, { filter: 'all', search: '', sort: 'name', desc: false, ...options }).map(
        (i) => i.id,
      );
    expect(names({})).toEqual(['a', 'b', 'c']);
    expect(names({ sort: 'eta' })).toEqual(['c', 'a', 'b']);
    expect(names({ sort: 'size', desc: true })).toEqual(['a', 'b', 'c']);
    expect(names({ filter: 'paused' })).toEqual(['a']);
    expect(names({ search: 'JOB C' })).toEqual(['c']);
  });

  it('temps restant, motif NZBGet, préférences', () => {
    expect(formatEta(null)).toBe('—');
    expect(formatEta(3_900)).toBe('1h05');
    expect(formatEta(187)).toBe('3m07s');
    expect(formatEta(9)).toBe('9s');
    expect(nzbgetFailKey('nzbget', 'FAILURE/PAR')).toBe('usenet.nzbget_fail.par');
    expect(nzbgetFailKey('sabnzbd', 'boom')).toBeNull();
    expect(loadUsenetPrefs('sabnzbd')).toEqual({ view: 'list', sort: 'name', desc: false });
  });
});

const SERVICES = {
  states: {
    sabnzbd: { configured: true, disabled: false },
    nzbget: { configured: true, disabled: false },
    qbittorrent: { configured: true, disabled: false },
  },
  instances: { radarr: [], sonarr: [] },
  sidebar: {},
};

async function mount(path: string, routes: Parameters<typeof fakeFetch>[0]) {
  const fetch = fakeFetch({
    'GET /api/health/services': () => ({
      body: {
        services: { sabnzbd: true, nzbget: true, qbittorrent: true },
        instances: { radarr: [], sonarr: [] },
        ok: 3,
        total: 3,
        timestamp: '2026-11-21T12:00:00Z',
      },
    }),
    ...routes,
  });
  const app = await mountApp(path, bootstrapOf({ user: ADMIN, services: SERVICES }));
  mounted.push(app.wrapper);
  await settle();
  return { ...app, fetch };
}

const QUEUE: UsenetQueue = {
  paused: false,
  speed: 2048,
  speedLimit: 0,
  remaining: 50,
  active: 1,
  queued: 1,
  eta: 60,
  freeSpace: 1000,
  items: [item('SAB_1'), item('SAB_2', { status: 'queued', percentage: 0 })],
};

describe('pages', () => {
  it('file SABnzbd : lignes, historique récent, pause générale, suppression confirmée', async () => {
    const { fetch } = await mount('/usenet/sabnzbd', {
      'GET /api/usenet/sabnzbd/queue': () => ({ body: QUEUE }),
      'GET /api/usenet/sabnzbd': () => ({
        body: {
          categories: ['tv'],
          recentHistory: [item('h1', { history: true, status: 'completed', percentage: 100 })],
          historyTotal: 40,
        },
      }),
      'POST /api/usenet/sabnzbd/pause': () => ({ body: { ok: true } }),
      'POST /api/usenet/sabnzbd/item/SAB_1/delete': () => ({ body: { ok: true } }),
    });
    expect(document.querySelectorAll('[data-test="usenet-row"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-test="usenet-history-row"]')).toHaveLength(1);
    expect(document.querySelector('[data-test="usenet-history-link"]')?.textContent).toContain(
      '40',
    );
    click('[data-test="usenet-pause-all"]');
    await settle();
    expect(
      fetch.calls.some(
        (call) => call.method === 'POST' && call.url === '/api/usenet/sabnzbd/pause',
      ),
    ).toBe(true);
    click('[data-test="usenet-delete"]');
    await settle();
    click('[data-test="confirm"]');
    await settle();
    expect(fetch.calls.some((call) => call.url === '/api/usenet/sabnzbd/item/SAB_1/delete')).toBe(
      true,
    );
  });

  it('historique NZBGet paginé', async () => {
    await mount('/usenet/nzbget/history?page=2', {
      'GET /api/usenet/nzbget/history': (call) => ({
        body: {
          items: [item('9', { history: true, status: 'failed', fail: 'FAILURE/PAR' })],
          page: Number(new URL(call.url, 'http://x').searchParams.get('page')),
          totalPages: 3,
          total: 120,
        },
      }),
    });
    expect(document.querySelector('[data-test="usenet-history-page-of"]')?.textContent).toContain(
      '2',
    );
    expect(document.querySelector('[data-test="usenet-history"]')?.textContent).toContain(
      'Repair failed',
    );
  });

  it('page Téléchargements : clients configurés et éléments en cours', async () => {
    await mount('/medias/films/telechargements', {
      'GET /api/qbittorrent/poll-summary': () => ({
        body: { active: 1, items: [{ hash: 'h', state: 'downloading', name: 'Dune', size: 1 }] },
      }),
      'GET /api/usenet/sabnzbd/poll-summary': () => ({ body: { active: 2 } }),
      'GET /api/usenet/nzbget/poll-summary': () => ({
        status: 503,
        body: { code: 'SERVICE_UNREACHABLE' },
      }),
    });
    expect(document.querySelector('[data-test="downloads-qbittorrent"]')?.textContent).toContain(
      'Dune',
    );
    expect(document.querySelector('[data-test="downloads-sabnzbd"]')?.textContent).toContain('2');
    expect(document.querySelector('[data-test="downloads-nzbget"] .v-alert')).not.toBeNull();
  });
});
