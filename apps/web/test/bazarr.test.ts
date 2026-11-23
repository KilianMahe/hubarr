// SPDX-License-Identifier: AGPL-3.0-or-later
// Bazarr (P3c.4) : filtres de la grille et pages montées (préchauffage,
// accueil, grille et recherche de sous-titres, historique, épisodes).

import type { BazarrCard, BazarrGrid } from '@hubarr/shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../src/app/plugins/i18n';
import { filterCards } from '../src/features/bazarr/grid';
import { click, type } from './arr-admin-fixtures';
import { settle } from './helpers';
import { cleanupProwlarr as cleanup, mountProwlarr as mount } from './prowlarr-fixtures';

beforeAll(async () => {
  await setLocale('en');
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const card = (title: string, overrides: Partial<BazarrCard> = {}): BazarrCard => ({
  title,
  year: 2020,
  substate: 'missing',
  count: 1,
  missingLangs: ['fr'],
  movieId: 1,
  seriesId: null,
  poster: null,
  ...overrides,
});

describe('grille', () => {
  it('recherche, segment, langue et tri', () => {
    const cards = [
      card('Dune', { count: 1 }),
      card('Alien', { count: 3, missingLangs: ['de'] }),
      card('Up', { substate: 'complete', count: 0, missingLangs: [] }),
    ];
    const base = { q: '', segment: 'all', lang: '', sort: 'title-asc' } as const;
    expect(filterCards(cards, base).map((c) => c.title)).toEqual(['Alien', 'Dune', 'Up']);
    expect(filterCards(cards, { ...base, sort: 'missing-desc' }).map((c) => c.title)).toEqual([
      'Alien',
      'Dune',
      'Up',
    ]);
    expect(filterCards(cards, { ...base, segment: 'complete' }).map((c) => c.title)).toEqual([
      'Up',
    ]);
    expect(filterCards(cards, { ...base, lang: 'de' }).map((c) => c.title)).toEqual(['Alien']);
    expect(filterCards(cards, { ...base, q: 'DU' }).map((c) => c.title)).toEqual(['Dune']);
  });
});

const READY_GRID: BazarrGrid = {
  state: 'ready',
  languages: ['fr'],
  cards: [card('Dune', { movieId: 7 }), card('Up', { substate: 'complete', count: 0, movieId: 8 })],
};

describe('pages', () => {
  it('accueil en préchauffage : relances bornées puis bouton « Réessayer »', async () => {
    let calls = 0;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fetch } = await mount('/bazarr', {
      'GET /api/bazarr': () => {
        calls += 1;
        return {
          body: {
            state: 'warming',
            counts: { movies: 0, episodes: 0, providers: 0 },
            mostMissing: [],
          },
        };
      },
      'POST /api/bazarr/refresh': () => ({
        body: { ok: true, movies: 'fresh', series: 'fresh', badges: 'fresh', reason: null },
      }),
    });
    expect(document.querySelector('[data-test="bazarr-warming"]')).not.toBeNull();
    expect(document.querySelector('[data-test="bazarr-warming-retry"]')).toBeNull();
    for (const delay of [3_000, 5_000, 8_000]) {
      await vi.advanceTimersByTimeAsync(delay);
      await settle();
    }
    expect(calls).toBeGreaterThanOrEqual(4);
    click('[data-test="bazarr-warming-retry"]');
    await settle();
    expect(fetch.calls.some((call) => call.url === '/api/bazarr/refresh')).toBe(true);
  });

  it('accueil prêt : tuiles, plus manquants, recherche automatique', async () => {
    const { fetch } = await mount('/bazarr', {
      'GET /api/bazarr': () => ({
        body: {
          state: 'ready',
          counts: { movies: 4, episodes: 9, providers: 2 },
          mostMissing: [
            { kind: 'series', id: 5, title: 'Show', year: 2019, missingCount: 3, poster: null },
          ],
        },
      }),
      'POST /api/bazarr/auto/series/5': () => ({ body: { ok: true } }),
    });
    expect(document.querySelector('[data-test="bazarr-tile-episodes"]')?.textContent).toContain(
      '9',
    );
    expect(document.querySelector('[data-test="bazarr-missing"] a')?.getAttribute('href')).toBe(
      '/bazarr/series/5',
    );
    click('[data-test="bazarr-auto"]');
    await settle();
    expect(fetch.calls.some((call) => call.url === '/api/bazarr/auto/series/5')).toBe(true);
  });

  it('films : filtre, recherche d’un film, téléchargement d’un sous-titre', async () => {
    const { fetch } = await mount('/bazarr/movies', {
      'GET /api/bazarr/movies': () => ({ body: READY_GRID }),
      'GET /api/bazarr/search/movie/7': () => ({
        body: {
          results: [
            {
              provider: 'opensubtitles',
              language: 'French',
              hi: true,
              forced: false,
              originalFormat: false,
              score: 90,
              release: 'Dune.1080p',
              uploader: null,
              subtitle: 'tok',
            },
          ],
        },
      }),
      'POST /api/bazarr/download/movie': () => ({ body: { ok: true } }),
    });
    expect(document.querySelectorAll('[data-test="bazarr-card"]')).toHaveLength(2);
    click('[data-test="bazarr-segment-complete"]');
    await settle();
    expect(document.querySelectorAll('[data-test="bazarr-card"]')).toHaveLength(1);
    click('[data-test="bazarr-segment-all"]');
    type('[data-test="bazarr-grid-search"]', 'dune');
    await settle();
    click('[data-test="bazarr-card"]');
    await settle();
    expect(document.querySelectorAll('[data-test="bazarr-result"]')).toHaveLength(1);
    click('[data-test="bazarr-download"]');
    await settle();
    expect(fetch.calls.find((call) => call.url === '/api/bazarr/download/movie')?.body).toEqual({
      radarrId: 7,
      hi: true,
      forced: false,
      originalFormat: false,
      provider: 'opensubtitles',
      subtitle: 'tok',
    });
  });

  it('historique : la liste en échec affiche son erreur, l’autre reste', async () => {
    await mount('/bazarr/history', {
      'GET /api/bazarr/history': () => ({
        body: {
          movies: [{ title: 'Dune', action: '1', provider: 'os', language: 'French', date: null }],
          episodes: null,
        },
      }),
    });
    expect(document.querySelectorAll('[data-test="bazarr-history-row"]')).toHaveLength(1);
    expect(document.querySelector('[data-test="bazarr-history-episodes"]')?.textContent).toContain(
      'Bazarr',
    );
  });

  it('épisodes : recherche par épisode, téléchargement avec la série', async () => {
    const { fetch } = await mount('/bazarr/series/5', {
      'GET /api/bazarr/series/5': () => ({
        body: {
          seriesId: 5,
          title: 'Show',
          tracked: true,
          episodes: [
            {
              episodeId: 11,
              season: 1,
              episode: 1,
              title: 'Pilot',
              audioLanguages: ['English'],
              missing: 1,
              present: 0,
            },
            {
              episodeId: 12,
              season: 1,
              episode: 2,
              title: 'Two',
              audioLanguages: [],
              missing: 0,
              present: 1,
            },
          ],
        },
      }),
      'GET /api/bazarr/search/episode/11': () => ({
        body: {
          results: [
            {
              provider: 'p',
              language: 'French',
              hi: false,
              forced: false,
              originalFormat: false,
              score: null,
              release: '',
              uploader: null,
              subtitle: 's',
            },
          ],
        },
      }),
      'POST /api/bazarr/download/episode': () => ({ body: { ok: true } }),
    });
    expect(document.body.textContent).toContain('Show');
    expect(document.querySelectorAll('[data-test="bazarr-episode-search"]')).toHaveLength(1);
    click('[data-test="bazarr-episode-search"]');
    await settle();
    click('[data-test="bazarr-download"]');
    await settle();
    expect(
      fetch.calls.find((call) => call.url === '/api/bazarr/download/episode')?.body,
    ).toMatchObject({
      seriesId: 5,
      episodeId: 11,
    });
  });
});
