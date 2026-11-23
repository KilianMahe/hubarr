// SPDX-License-Identifier: AGPL-3.0-or-later
// Prowlarr, recherche et grab (P3c.2) : tri et carte montée.

import type { ProwlarrRelease } from '@hubarr/shared';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setLocale } from '../src/app/plugins/i18n';
import { sortReleases } from '../src/features/prowlarr/search';
import { click, type } from './arr-admin-fixtures';
import { settle } from './helpers';
import { cleanupProwlarr, indexer, mountProwlarr, overview } from './prowlarr-fixtures';

beforeAll(async () => {
  await setLocale('en');
});
afterEach(cleanupProwlarr);

function release(guid: string, overrides: Partial<ProwlarrRelease> = {}): ProwlarrRelease {
  return {
    guid,
    title: `Release ${guid}`,
    size: 1_000_000_000,
    age: 2,
    ageHours: 48,
    indexerId: 1,
    indexer: 'YTS',
    seeders: 10,
    leechers: 1,
    protocol: 'torrent',
    imdbId: null,
    tmdbId: null,
    tvdbId: null,
    categories: [],
    infoUrl: null,
    publishDate: null,
    indexerFlags: [],
    fileName: null,
    ...overrides,
  };
}

describe('tri des résultats', () => {
  it('ordre de Prowlarr sans clé ; seeds absentes en dernier', () => {
    const list = [
      release('a', { seeders: 5 }),
      release('b', { seeders: null }),
      release('c', { seeders: 50 }),
    ];
    expect(sortReleases(list, { key: null, ascending: true }).map((r) => r.guid)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(sortReleases(list, { key: 'seeders', ascending: false }).map((r) => r.guid)).toEqual([
      'c',
      'a',
      'b',
    ]);
    expect(sortReleases(list, { key: 'title', ascending: true }).map((r) => r.guid)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});

describe('carte de recherche', () => {
  it('recherche, compte, lien http(s) seulement, grab', async () => {
    const { fetch } = await mountProwlarr('/prowlarr', {
      'GET /api/prowlarr': () => ({ body: overview([indexer(1)]) }),
      'GET /api/prowlarr/search': () => ({
        body: [
          release('g1', { infoUrl: 'https://tracker.example/1' }),
          release('g2', { indexerId: 1 }),
        ],
      }),
      'POST /api/prowlarr/grab': () => ({ body: { ok: true } }),
    });
    type('[data-test="prowlarr-search-input"]', 'dune');
    await settle();
    click('[data-test="prowlarr-search-submit"]');
    await settle();
    expect(fetch.calls.find((call) => call.url.startsWith('/api/prowlarr/search'))?.url).toBe(
      '/api/prowlarr/search?q=dune',
    );
    expect(document.querySelector('[data-test="prowlarr-search-count"]')?.textContent).toContain(
      '2',
    );
    expect(document.querySelectorAll('[data-test="prowlarr-release"]')).toHaveLength(2);
    expect(
      document.querySelector('[data-test="prowlarr-search"] a[href="https://tracker.example/1"]'),
    ).not.toBeNull();
    click('[data-test="prowlarr-grab"]', 1);
    await settle();
    expect(fetch.calls.find((call) => call.url === '/api/prowlarr/grab')?.body).toEqual({
      guid: 'g2',
      indexerId: 1,
    });
  });
});
