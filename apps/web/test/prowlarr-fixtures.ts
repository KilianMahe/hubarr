// SPDX-License-Identifier: AGPL-3.0-or-later
// Montage des pages Prowlarr (P3c) : admin connecté, Prowlarr configuré et
// joignable ; données de la page des indexeurs.

import type { ProwlarrIndexer, ProwlarrOverview } from '@hubarr/shared';
import type { VueWrapper } from '@vue/test-utils';
import { vi } from 'vitest';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settle } from './helpers';

const mounted: VueWrapper[] = [];

export function cleanupProwlarr(): void {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = '';
}

export const PROWLARR_SERVICES = {
  states: {
    prowlarr: { configured: true, disabled: false },
    bazarr: { configured: true, disabled: false },
  },
  instances: { radarr: [], sonarr: [] },
  sidebar: {},
};

const HEALTH = () => ({
  body: {
    services: { prowlarr: true, bazarr: true },
    instances: { radarr: [], sonarr: [] },
    ok: 2,
    total: 2,
    timestamp: '2026-11-21T12:00:00Z',
  },
});

export function indexer(id: number, overrides: Partial<ProwlarrIndexer> = {}): ProwlarrIndexer {
  return {
    id,
    name: `Indexer ${id}`,
    definitionName: `def${id}`,
    description: null,
    language: 'en-US',
    protocol: 'torrent',
    privacy: 'public',
    enabled: true,
    supportsRss: true,
    supportsSearch: true,
    appProfileId: 1,
    priority: 25,
    tags: [],
    added: '2026-01-02T03:04:05Z',
    categoryCount: 2,
    status: null,
    counters: { queries: 10, grabs: 2, failures: 0 },
    ...overrides,
  };
}

export function overview(indexers: ProwlarrIndexer[] = [indexer(1)]): ProwlarrOverview {
  return {
    indexers,
    totals: {
      total: indexers.length,
      enabled: indexers.filter((item) => item.enabled).length,
      failing: indexers.filter((item) => item.status !== null).length,
      torrent: indexers.filter((item) => item.protocol === 'torrent').length,
      usenet: indexers.filter((item) => item.protocol === 'usenet').length,
    },
    health: [],
    applications: [{ id: 1, name: 'Radarr', implementationName: 'Radarr' }],
  };
}

export async function mountProwlarr(path: string, routes: Parameters<typeof fakeFetch>[0] = {}) {
  const fetch = fakeFetch({ 'GET /api/health/services': HEALTH, ...routes });
  const app = await mountApp(path, bootstrapOf({ user: ADMIN, services: PROWLARR_SERVICES }));
  mounted.push(app.wrapper);
  await settle();
  return { ...app, fetch };
}
