// SPDX-License-Identifier: AGPL-3.0-or-later
// Index des sous-titres Bazarr et son refresher (P3c.4) : `BazarrLangsTest`,
// `BazarrSubtitleIndex{,Swr,Datasets,Patch}Test`, `BazarrIndexRefresherTest`,
// `BazarrClientTest` (paramètres répétés, corps du téléchargement).

import { describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../../../src/cache/memory-store';
import { BazarrIndexRefresher } from '../../../src/cache/refreshers/bazarr-index';
import { StaleWhileRevalidateCache } from '../../../src/cache/swr-cache';
import { downloadForm, type BazarrClient } from '../../../src/integrations/bazarr/client';
import { extractLangs } from '../../../src/integrations/bazarr/langs';
import {
  BAZARR_KEYS,
  BAZARR_SOFT_TTL_MS,
  BazarrSubtitleIndex,
  buildMovieDatasets,
  buildSeriesDatasets,
  computeMovieStatus,
  computeSeriesStatus,
} from '../../../src/integrations/bazarr/subtitle-index';
import { ServiceHealthCache } from '../../../src/integrations/http';

function setup(
  options: { gate?: boolean; movies?: unknown[]; series?: unknown[]; fail?: boolean } = {},
) {
  let now = 1_000_000;
  const store = new MemoryStore({ now: () => now });
  const dispatched: string[] = [];
  const swr = new StaleWhileRevalidateCache({ store, dispatch: (key) => dispatched.push(key) });
  const client = {
    movies: vi.fn((ids: number[] = []) =>
      options.fail
        ? Promise.reject(new Error('down'))
        : Promise.resolve(
            ((options.movies ?? []) as { radarrId: number }[]).filter(
              (row) => ids.length === 0 || ids.includes(row.radarrId),
            ),
          ),
    ),
    series: vi.fn((ids: number[] = []) =>
      Promise.resolve(
        ((options.series ?? []) as { sonarrSeriesId: number }[]).filter(
          (row) => ids.length === 0 || ids.includes(row.sonarrSeriesId),
        ),
      ),
    ),
    badgeCounts: vi.fn(() => Promise.resolve({ movies: 4, episodes: 7, providers: 2 })),
  };
  const index = new BazarrSubtitleIndex({
    swr,
    gate: () => options.gate ?? true,
    client: () => client as unknown as BazarrClient,
  });
  const health = new ServiceHealthCache();
  const refresher = new BazarrIndexRefresher({
    index,
    health,
    client: () => client as unknown as BazarrClient,
  });
  return {
    store,
    swr,
    index,
    client,
    health,
    refresher,
    dispatched,
    tick: (ms: number) => (now += ms),
  };
}

const movie = (radarrId: number, extra: Record<string, unknown> = {}) => ({
  radarrId,
  title: `M${radarrId}`,
  year: 2020,
  profileId: 1,
  missing_subtitles: [{ code2: 'fr' }],
  ...extra,
});

describe('langues (BazarrLangsTest)', () => {
  it('code2 puis code3 puis nom, alias des drapeaux, tuple, entrées illisibles ignorées', () => {
    expect(
      extractLangs({
        subtitles: [
          { code2: 'en', code3: 'eng', name: 'English', hearing_impaired: true },
          { code3: 'fra', forced: true },
          { name: 'German' },
          ['es', '/path'],
          'it',
          { foo: 1 },
          42,
        ],
      }),
    ).toEqual({
      present: [
        { lang: 'en', hi: true, forced: false },
        { lang: 'fra', hi: false, forced: true },
        { lang: 'German', hi: false, forced: false },
        { lang: 'es', hi: false, forced: false },
        { lang: 'it', hi: false, forced: false },
      ],
      missing: [],
    });
  });
});

describe('statuts (BazarrSubtitleIndexTest)', () => {
  it('film manquant, complet, non suivi ; série sans fichier non suivie', () => {
    expect(computeMovieStatus(movie(1))).toEqual({ state: 'missing', count: 1 });
    expect(computeMovieStatus(movie(1, { missing_subtitles: [] }))).toEqual({
      state: 'complete',
      count: 0,
    });
    expect(computeMovieStatus(movie(1, { profileId: null }))).toEqual({
      state: 'hidden',
      count: 0,
    });
    expect(computeSeriesStatus({ profileId: 1, episodeFileCount: 0 })).toEqual({
      state: 'hidden',
      count: 0,
    });
    expect(
      computeSeriesStatus({ profileId: 1, episodeFileCount: 3, episodeMissingCount: 2 }),
    ).toEqual({
      state: 'missing',
      count: 2,
    });
  });

  it('jeux de données : cartes, langues triées, candidats plafonnés et ordonnés', () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      movie(i + 1, {
        missing_subtitles: Array.from({ length: (i % 5) + 1 }, () => ({
          code2: i % 2 ? 'fr' : 'de',
        })),
      }),
    );
    const data = buildMovieDatasets([...rows, { title: 'sans id' }]);
    expect(Object.keys(data.status)).toHaveLength(40);
    expect(data.grid.languages).toEqual(['de', 'fr']);
    expect(data.candidates).toHaveLength(32);
    expect(data.candidates[0]?.missingCount).toBe(5);
    const series = buildSeriesDatasets([
      { sonarrSeriesId: 2, title: 'S', year: '2019', profileId: null },
    ]);
    expect(series.grid.cards[0]).toMatchObject({
      substate: 'not-tracked',
      seriesId: 2,
      year: 2019,
    });
  });
});

describe('lectures sans appel à Bazarr (Swr, Datasets)', () => {
  it('miss dur : pending/warming, une demande par clé, aucun fetch', () => {
    const env = setup();
    expect(env.index.movieStatusMap()).toEqual({ state: 'pending', items: {} });
    expect(env.index.movieStatusMap().state).toBe('pending');
    expect(env.index.movieCards().state).toBe('warming');
    expect(env.index.badgeCounts()).toEqual({
      state: 'warming',
      counts: { movies: 0, episodes: 0, providers: 0 },
    });
    expect(env.dispatched).toEqual([BAZARR_KEYS.movies, BAZARR_KEYS.badges]);
    expect(env.client.movies).not.toHaveBeenCalled();
  });

  it('plusieurs instances : badges cachés, rien demandé', () => {
    const env = setup({ gate: false });
    expect(env.index.movieStatusMap()).toEqual({ state: 'hidden', items: {} });
    expect(env.dispatched).toEqual([]);
  });

  it('reconstruction : tous les jeux écrits d’un passage ; périmé servi et redemandé', async () => {
    const env = setup({ movies: [movie(1), movie(2, { missing_subtitles: [] })] });
    await env.refresher.refresh(BAZARR_KEYS.movies);
    expect(env.index.movieStatusMap()).toEqual({
      state: 'ready',
      items: { 1: { state: 'missing', count: 1 }, 2: { state: 'complete', count: 0 } },
    });
    expect(env.index.movieCards().grid.cards).toHaveLength(2);
    expect(env.index.badgeCounts().counts).toEqual({ movies: 4, episodes: 7, providers: 2 });
    expect(env.index.mostMissing().state).toBe('warming');
    env.tick(BAZARR_SOFT_TTL_MS + 1);
    env.dispatched.length = 0;
    expect(env.index.movieStatusMap().state).toBe('ready');
    expect(env.dispatched).toContain(BAZARR_KEYS.movies);
  });

  it('refresher : clé fraîche ignorée, disjoncteur ouvert, échec sans écrasement, badges seuls', async () => {
    const env = setup({ movies: [movie(1)] });
    await env.refresher.refresh(BAZARR_KEYS.movies);
    await env.refresher.refresh(BAZARR_KEYS.movies);
    expect(env.client.movies).toHaveBeenCalledTimes(1);
    await env.refresher.refresh(BAZARR_KEYS.badges);
    expect(env.client.badgeCounts).toHaveBeenCalledTimes(1);

    const down = setup({ movies: [movie(1)] });
    down.health.markDown('bazarr');
    await down.refresher.refresh(BAZARR_KEYS.movies);
    expect(down.client.movies).not.toHaveBeenCalled();

    const failing = setup({ fail: true });
    failing.swr.write(BAZARR_KEYS.movies, { 9: { state: 'complete', count: 0 } }, 600_000, {
      fetchedAt: failing.store.now() - 70_000,
    });
    await failing.refresher.refresh(BAZARR_KEYS.movies);
    expect(failing.index.movieStatusMap().items).toEqual({ 9: { state: 'complete', count: 0 } });
  });
});

describe('correctifs après mutation (PatchTest)', () => {
  it('refreshItem : relit l’id seul, corrige la carte sans la rajeunir, redemande', async () => {
    const env = setup({ movies: [movie(1), movie(2)] });
    await env.refresher.refresh(BAZARR_KEYS.movies);
    env.tick(10_000);
    (env.client.movies as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      movie(1, { missing_subtitles: [] }),
    ]);
    await env.index.refreshItem('movie', 1);
    expect(env.client.movies).toHaveBeenLastCalledWith([1]);
    expect(env.index.movieStatusMap().items[1]).toEqual({ state: 'complete', count: 0 });
    expect(env.index.datasetState(BAZARR_KEYS.movies)).toBe('stale');
    expect(env.dispatched).toContain(BAZARR_KEYS.movies);
  });

  it('un correctif postérieur au début d’une reconstruction survit à son écriture', () => {
    const env = setup();
    const startedAt = env.store.now();
    env.tick(5);
    // Journal écrit à la main par un refreshItem pendant le fetch.
    env.store.set(
      'bazarr_subtitle_index.patches',
      {
        'movie:1': {
          at: env.store.now(),
          kind: 'movie',
          id: 1,
          status: { state: 'complete', count: 0 },
          langs: null,
        },
        'movie:2': {
          at: startedAt - 100,
          kind: 'movie',
          id: 2,
          status: { state: 'complete', count: 0 },
          langs: null,
        },
      },
      120_000,
    );
    const [status] = env.index.applyPatchesNewerThan(
      'movie',
      startedAt,
      { 1: { state: 'missing', count: 2 }, 2: { state: 'missing', count: 1 } },
      {},
    );
    expect(status).toEqual({
      1: { state: 'complete', count: 0 },
      2: { state: 'missing', count: 1 },
    });
  });
});

describe('client (BazarrClientTest)', () => {
  it('corps de téléchargement : ids en texte, drapeaux True/False', () => {
    expect(
      downloadForm(
        { seriesid: 3, episodeid: 9 },
        {
          hi: true,
          forced: false,
          originalFormat: false,
          provider: 'opensubtitles',
          subtitle: 'tok',
        },
      ),
    ).toEqual({
      seriesid: '3',
      episodeid: '9',
      hi: 'True',
      forced: 'False',
      original_format: 'False',
      provider: 'opensubtitles',
      subtitle: 'tok',
    });
  });
});
