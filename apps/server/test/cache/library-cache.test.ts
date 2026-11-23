// SPDX-License-Identifier: AGPL-3.0-or-later
// Port de `MediaLibraryCacheTest`.

import { describe, expect, it } from 'vitest';
import { MediaLibraryCache } from '../../src/cache/library-cache';
import { createSwr, recordingLogger } from './helpers';

const KEY = 'media.movies.radarr-1';

function counting<T>(rows: T[]): { fetch: () => Promise<T[]>; calls: () => number } {
  let calls = 0;
  return {
    fetch: () => {
      calls += 1;
      return Promise.resolve(rows);
    },
    calls: () => calls,
  };
}

describe('MediaLibraryCache', () => {
  it('fetch une fois, puis sert le cache', async () => {
    const cache = new MediaLibraryCache(createSwr().swr);
    const source = counting([{ id: 1 }]);
    expect(await cache.movies('radarr-1', source.fetch)).toEqual([{ id: 1 }]);
    expect(await cache.movies('radarr-1', source.fetch)).toEqual([{ id: 1 }]);
    expect(source.calls()).toBe(1);
  });

  it('ne met pas en cache une liste vide', async () => {
    const cache = new MediaLibraryCache(createSwr().swr);
    const source = counting<{ id: number }>([]);
    await cache.movies('radarr-1', source.fetch);
    await cache.movies('radarr-1', source.fetch);
    expect(source.calls()).toBe(2);
  });

  it('une clé par instance', async () => {
    const cache = new MediaLibraryCache(createSwr().swr);
    expect(await cache.movies('radarr-1', () => Promise.resolve([{ id: 1 }]))).toEqual([{ id: 1 }]);
    expect(await cache.movies('radarr-4k', () => Promise.resolve([{ id: 99 }]))).toEqual([
      { id: 99 },
    ]);
  });

  it('films et séries ne se mélangent pas', async () => {
    const cache = new MediaLibraryCache(createSwr().swr);
    expect(await cache.movies('x-1', () => Promise.resolve([{ id: 1 }]))).toEqual([{ id: 1 }]);
    expect(await cache.series('x-1', () => Promise.resolve([{ id: 2 }]))).toEqual([{ id: 2 }]);
  });

  it('invalidate() force un nouveau fetch', async () => {
    const cache = new MediaLibraryCache(createSwr().swr);
    const source = counting([{ id: 1 }]);
    await cache.movies('radarr-1', source.fetch);
    cache.invalidate('radarr', 'radarr-1');
    await cache.movies('radarr-1', source.fetch);
    expect(source.calls()).toBe(2);
  });

  it('invalider Sonarr ne vise que les séries', async () => {
    const cache = new MediaLibraryCache(createSwr().swr);
    const movies = counting([{ id: 1 }]);
    const series = counting([{ id: 2 }]);
    await cache.movies('s-1', movies.fetch);
    await cache.series('s-1', series.fetch);
    cache.invalidate('sonarr', 's-1');
    await cache.movies('s-1', movies.fetch);
    await cache.series('s-1', series.fetch);
    expect(movies.calls()).toBe(1);
    expect(series.calls()).toBe(2);
  });

  it('une entrée périmée est servie telle quelle, sans fetch en ligne', async () => {
    const { swr, store } = createSwr();
    swr.write(KEY, [{ id: 1 }], MediaLibraryCache.HARD_TTL_MS, {
      fetchedAt: store.now() - 120_000,
    });
    const source = counting([{ id: 2 }]);
    expect(await new MediaLibraryCache(swr).movies('radarr-1', source.fetch)).toEqual([{ id: 1 }]);
    expect(source.calls()).toBe(0);
  });

  it('une lecture périmée demande un rafraîchissement', async () => {
    const { swr, store, dispatched } = createSwr();
    swr.write(KEY, [{ id: 1 }], MediaLibraryCache.HARD_TTL_MS, {
      fetchedAt: store.now() - 120_000,
    });
    await new MediaLibraryCache(swr).movies('radarr-1', () => Promise.resolve([{ id: 2 }]));
    expect(store.has(`${KEY}.refreshing`)).toBe(true);
    expect(dispatched).toEqual([KEY]);
  });

  it('une lecture fraîche ne demande rien', async () => {
    const { swr, dispatched } = createSwr();
    const cache = new MediaLibraryCache(swr);
    await cache.movies('radarr-1', () => Promise.resolve([{ id: 1 }]));
    await cache.movies('radarr-1', () => Promise.resolve([{ id: 1 }]));
    expect(dispatched).toEqual([]);
  });

  it('un miss dur bloque et fetch en ligne', async () => {
    const cache = new MediaLibraryCache(createSwr().swr);
    const source = counting([{ id: 7 }]);
    expect(await cache.movies('radarr-1', source.fetch)).toEqual([{ id: 7 }]);
    expect(source.calls()).toBe(1);
  });

  it('une demande en retard n’est signalée qu’une fois sur deux lectures', async () => {
    const { swr, store } = createSwr();
    swr.write(KEY, [{ id: 1 }], MediaLibraryCache.HARD_TTL_MS, {
      fetchedAt: store.now() - 120_000,
    });
    swr.requestRefresh(KEY);
    store.set(`${KEY}.requested_at`, store.now() - 200_000, 900_000);
    store.delete(`${KEY}.refreshing`);

    const logger = recordingLogger();
    const cache = new MediaLibraryCache(swr, logger);
    await cache.movies('radarr-1', () => Promise.resolve([{ id: 2 }]));
    await cache.movies('radarr-1', () => Promise.resolve([{ id: 2 }]));

    const errors = logger.records.filter((r) => r.level === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.msg).toContain(KEY);
  });

  it('une lecture périmée pas encore en retard ne journalise rien', async () => {
    const { swr, store } = createSwr();
    swr.write(KEY, [{ id: 1 }], MediaLibraryCache.HARD_TTL_MS, {
      fetchedAt: store.now() - 120_000,
    });
    const logger = recordingLogger();
    await new MediaLibraryCache(swr, logger).movies('radarr-1', () => Promise.resolve([{ id: 2 }]));
    expect(logger.records).toEqual([]);
  });
});
