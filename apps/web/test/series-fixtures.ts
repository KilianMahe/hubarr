// SPDX-License-Identifier: AGPL-3.0-or-later
// Données et montage partagés des tests des séries (bibliothèque, fiche, pages).

import {
  DEFAULT_SERIES_LIBRARY_QUERY,
  DEFAULT_USER_PREFERENCES,
  type SeriesLibraryItem,
  type AuthUser,
  type SeriesLibraryResponse,
  type UserPreferences,
} from '@hubarr/shared';
import { vi } from 'vitest';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settle } from './helpers';

/** Vues montées, démontées après chaque test par `cleanupMounted`. */
export const mounted: { unmount: () => void }[] = [];

export function cleanupMounted(): void {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = '';
}

export function seriesItem(
  id: number,
  overrides: Partial<SeriesLibraryItem> = {},
): SeriesLibraryItem {
  return {
    id,
    tvdbId: 1000 + id,
    title: `Series ${id}`,
    sortTitle: `series ${id}`,
    year: 2020,
    overview: null,
    poster: null,
    status: 'continuing',
    ended: false,
    monitored: true,
    seriesType: 'standard',
    seasonCount: 2,
    totalEpisodeCount: 20,
    episodeCount: 20,
    episodeFileCount: 10,
    percent: 50,
    sizeOnDisk: 0,
    sizeGb: null,
    network: null,
    genres: [],
    runtime: 45,
    qualityProfileId: 1,
    tags: [],
    addedAt: null,
    nextAiring: null,
    ...overrides,
  };
}

export const SONARR_SERVICES = {
  states: { sonarr: { configured: true, disabled: false } },
  instances: {
    radarr: [],
    sonarr: [{ slug: 'sonarr', name: 'Sonarr', enabled: true, isDefault: true }],
  },
  sidebar: {},
};

export function seriesLibraryOf(
  items: SeriesLibraryItem[],
  overrides: Partial<SeriesLibraryResponse> = {},
): SeriesLibraryResponse {
  return {
    items,
    total: items.length,
    libraryTotal: 3,
    page: 1,
    perPage: 200,
    totalPages: 1,
    unlimited: false,
    facets: { genres: ['Drama'], networks: ['HBO'] },
    stats: { total: 3, continuing: 2, ended: 1, totalGb: 42.5 },
    query: { ...DEFAULT_SERIES_LIBRARY_QUERY },
    calendar: [],
    defaultQualityProfileId: null,
    ...overrides,
  };
}

export const SERIES = [
  seriesItem(1, { title: 'The Wire', status: 'ended', percent: 100, episodeFileCount: 20 }),
  seriesItem(2, { title: 'Severance', network: 'Apple TV+' }),
  seriesItem(3, { title: 'Shōgun', monitored: false, episodeFileCount: 0, percent: 0 }),
];

export const SONARR_HEALTH = () => ({
  body: {
    services: { sonarr: true },
    instances: { radarr: [], sonarr: [{ slug: 'sonarr', name: 'Sonarr', state: true }] },
    ok: 1,
    total: 1,
    timestamp: '2026-11-18T12:00:00Z',
  },
});

export async function mountSeries(
  path = '/medias/sonarr/series',
  routes: Parameters<typeof fakeFetch>[0] = {},
  prefs: Partial<UserPreferences> = {},
  user: AuthUser = ADMIN,
) {
  const fetch = fakeFetch({
    'GET /api/health/services': SONARR_HEALTH,
    'GET /api/medias/sonarr/series': () => ({ body: seriesLibraryOf(SERIES) }),
    'GET /api/medias/sonarr/series/warnings': () => ({
      body: { warnings: [{ code: 'import_blocked', count: 2 }] },
    }),
    'GET /api/medias/sonarr/series/commands/active': () => ({ body: [] }),
    'GET /api/medias/sonarr/series/queue': () => ({ body: [] }),
    ...routes,
  });
  const app = await mountApp(
    path,
    bootstrapOf({
      user,
      services: SONARR_SERVICES,
      userPreferences: { ...DEFAULT_USER_PREFERENCES, ...prefs },
    }),
  );
  mounted.push(app.wrapper);
  await settle();
  return { ...app, fetch };
}

/** Compte non admin en lecture seule sur l'instance Sonarr des tests. */
export const SONARR_READER: AuthUser = {
  ...ADMIN,
  id: 2,
  role: 'user',
  permissions: { 'sonarr:sonarr': 'read' },
};

/** Élément présent mais masqué par `v-write` (page en lecture seule). */
export function hiddenByWrite(element: Element | null | undefined): boolean {
  return element instanceof HTMLElement && element.style.display === 'none';
}

export function clickIn(selector: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`introuvable : ${selector}`);
  element.click();
}
