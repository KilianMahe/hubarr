// SPDX-License-Identifier: AGPL-3.0-or-later
// Montage des pages d'administration Radarr/Sonarr (P3b) : admin connecté,
// une instance de chaque service (slugs `radarr` et `sonarr`), santé au vert.

import type { ArrKind } from '@hubarr/shared';
import type { VueWrapper } from '@vue/test-utils';
import { vi } from 'vitest';
import { ADMIN, bootstrapOf, fakeFetch, mountApp, settle } from './helpers';

const mounted: VueWrapper[] = [];

export function cleanupAdmin(): void {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = '';
}

export const ARR_SERVICES = {
  states: {
    radarr: { configured: true, disabled: false },
    sonarr: { configured: true, disabled: false },
  },
  instances: {
    radarr: [{ slug: 'radarr', name: 'Radarr', enabled: true, isDefault: true }],
    sonarr: [{ slug: 'sonarr', name: 'Sonarr', enabled: true, isDefault: true }],
  },
  sidebar: {},
};

const HEALTH = () => ({
  body: {
    services: { radarr: true, sonarr: true },
    instances: {
      radarr: [{ slug: 'radarr', name: 'Radarr', state: true }],
      sonarr: [{ slug: 'sonarr', name: 'Sonarr', state: true }],
    },
    ok: 2,
    total: 2,
    timestamp: '2026-11-18T12:00:00Z',
  },
});

/** Base des endpoints d'administration d'un service (`/api/medias/<kind>/<kind>`). */
export const adminApi = (kind: ArrKind, path: string) => `/api/medias/${kind}/${kind}${path}`;

export async function mountAdmin(path: string, routes: Parameters<typeof fakeFetch>[0] = {}) {
  const fetch = fakeFetch({ 'GET /api/health/services': HEALTH, ...routes });
  const app = await mountApp(path, bootstrapOf({ user: ADMIN, services: ARR_SERVICES }));
  mounted.push(app.wrapper);
  await settle();
  return { ...app, fetch };
}

export function click(selector: string, index = 0): void {
  const element = document.querySelectorAll<HTMLElement>(selector)[index];
  if (element === undefined) throw new Error(`introuvable : ${selector} [${index}]`);
  element.click();
}

/** Saisit une valeur dans le champ `input` (ou `textarea`) d'un élément `data-test`. */
export function type(selector: string, value: string): void {
  const root = document.querySelector<HTMLElement>(selector);
  const input = root?.matches('input, textarea') ? root : root?.querySelector('input, textarea');
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) {
    throw new Error(`champ introuvable : ${selector}`);
  }
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

/** Film complet (`movieSchema`) : recherche et ajout par les routes de la bibliothèque. */
export function fullMovie(id: number | null, overrides: Record<string, unknown> = {}) {
  return {
    id,
    tmdbId: id ?? 0,
    imdbId: null,
    title: `Movie ${id}`,
    sortTitle: `movie ${id}`,
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
    originalTitle: null,
    fanart: null,
    certification: null,
    studio: null,
    path: null,
    alternateTitles: [],
    rootFolderPath: null,
    language: null,
    languages: [],
    collection: null,
    addedAt: null,
    inCinemasAt: null,
    digitalAt: null,
    physicalAt: null,
    ratings: null,
    ratingsImdb: null,
    ratingsImdbVotes: null,
    ratingsTmdb: null,
    ratingsTmdbVotes: null,
    movieFile: null,
    ...overrides,
  };
}
