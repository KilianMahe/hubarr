// SPDX-License-Identifier: AGPL-3.0-or-later
// Assemblage dans l'application : une lecture périmée sert l'ancienne liste,
// puis la file recharge la bibliothèque Radarr hors de la requête ; stockage
// borné.

import type { FastifyInstance } from 'fastify';
import { MockAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app';
import { MediaLibraryCache, MemoryStore, libraryKey } from '../../src/cache';
import type { AppDatabase } from '../../src/db/client';
import { createInstance, type InstanceRow } from '../../src/modules/instances/instances';
import { createClock, createTestDatabase, UNUSED_DATA_DIR } from '../helpers';

const noDns = { resolve: () => Promise.resolve<string[]>([]) };

describe('cache de l’application', () => {
  let database: AppDatabase;
  let agent: MockAgent;
  let app: FastifyInstance;
  let radarr: InstanceRow;
  let clock: ReturnType<typeof createClock>;

  beforeEach(async () => {
    database = await createTestDatabase();
    agent = new MockAgent();
    agent.disableNetConnect();
    clock = createClock();
    app = buildApp({
      database,
      dataDir: UNUSED_DATA_DIR,
      dispatcher: agent,
      now: clock.now,
      ...noDns,
    });
    radarr = await createInstance(
      database.db,
      'radarr',
      { name: 'Films', url: 'http://radarr.test', apiKey: 'k' },
      noDns,
    );
  });
  afterEach(async () => {
    await app.close();
    await agent.close();
  });

  it('une lecture périmée sert l’ancienne liste et la file la recharge depuis Radarr', async () => {
    let calls = 0;
    agent
      .get('http://radarr.test')
      .intercept({ path: '/api/v3/movie' })
      .reply(() => {
        calls += 1;
        return { statusCode: 200, data: [{ id: 42, title: 'Nouveau', year: 2026 }] };
      });
    const key = libraryKey('movies', radarr.slug);
    app.cache.swr.write(key, [{ id: 1 }], MediaLibraryCache.HARD_TTL_MS, {
      fetchedAt: clock.now() - 120_000,
    });

    const served = await app.cache.library.movies(radarr.slug, () =>
      Promise.reject(new Error('pas de fetch en ligne sur une entrée périmée')),
    );
    expect(served).toEqual([{ id: 1 }]);
    expect(calls).toBe(0);

    await app.cache.queue.idle();
    expect(calls).toBe(1);
    const hit = app.cache.swr.read<{ id: number; title: string }[]>(key, MediaLibraryCache.TTL_MS);
    expect(hit?.state).toBe('fresh');
    expect(hit?.value[0]).toMatchObject({ id: 42, title: 'Nouveau' });
  });

  it('une instance injoignable n’est pas réinterrogée tant que le disjoncteur est ouvert', async () => {
    agent
      .get('http://radarr.test')
      .intercept({ path: '/api/v3/movie' })
      .replyWithError(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
    const key = libraryKey('movies', radarr.slug);
    app.cache.swr.write(key, [{ id: 1 }], MediaLibraryCache.HARD_TTL_MS, {
      fetchedAt: clock.now() - 120_000,
    });

    await app.cache.queue.run(key);
    expect(app.upstream.health.isDown('radarr', radarr.slug)).toBe(true);
    // Un second passage ne fait aucun appel (l'interception unique est consommée).
    await expect(app.cache.queue.run(key)).resolves.toBeUndefined();
    expect(app.cache.swr.read(key, MediaLibraryCache.TTL_MS)?.value).toEqual([{ id: 1 }]);
  });
});

describe('MemoryStore', () => {
  it('expire les entrées et évince la moins récemment lue', () => {
    const clock = createClock();
    const store = new MemoryStore({ maxEntries: 2, now: clock.now });
    store.set('a', 1, 1_000);
    store.set('b', 2, 1_000);
    expect(store.get('a')).toBe(1); // « a » devient la plus récente
    store.set('c', 3, 1_000);
    expect(store.has('b')).toBe(false);
    expect(store.has('a')).toBe(true);
    clock.advance(1_000);
    expect(store.has('a')).toBe(false);
    expect(store.has('c')).toBe(false);
  });

  it('une durée nulle supprime l’entrée au lieu de la créer', () => {
    const store = new MemoryStore();
    store.set('a', 1, 1_000);
    store.set('a', 2, 0);
    expect(store.has('a')).toBe(false);
  });
});
