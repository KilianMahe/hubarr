// SPDX-License-Identifier: AGPL-3.0-or-later
// Port de `RefreshCacheKeyHandlerTest`, plus le comportement de la file
// (asynchronisme, concurrence, dédoublonnage, fermeture).

import { describe, expect, it } from 'vitest';
import { RefreshQueue, type CacheRefresher } from '../../src/cache/refresh-queue';
import { deferred, recordingLogger } from './helpers';

function refresher(prefix: string, seen: string[], run?: () => Promise<void>): CacheRefresher {
  return {
    name: prefix,
    supports: (key) => key.startsWith(prefix),
    refresh: async (key) => {
      seen.push(key);
      await run?.();
    },
  };
}

describe('RefreshQueue : routage (RefreshCacheKeyHandler)', () => {
  it('confie la clé au refresher qui la revendique', async () => {
    const a: string[] = [];
    const b: string[] = [];
    const queue = new RefreshQueue();
    queue.register(refresher('media.', a));
    queue.register(refresher('queue.', b));
    await queue.run('queue.counts.qbittorrent');
    expect(a).toEqual([]);
    expect(b).toEqual(['queue.counts.qbittorrent']);
  });

  it('appelle tous les refreshers qui revendiquent la clé et avertit', async () => {
    const a: string[] = [];
    const b: string[] = [];
    const logger = recordingLogger();
    const queue = new RefreshQueue({ logger });
    queue.register(refresher('media.', a));
    queue.register(refresher('media.movies.', b));
    await queue.run('media.movies.radarr-1');
    expect(a).toEqual(['media.movies.radarr-1']);
    expect(b).toEqual(['media.movies.radarr-1']);
    expect(logger.records).toHaveLength(1);
    expect(logger.records[0]).toMatchObject({
      level: 'warn',
      obj: { key: 'media.movies.radarr-1', count: 2 },
    });
  });

  it('une clé que personne ne revendique est abandonnée avec un avertissement', async () => {
    const a: string[] = [];
    const logger = recordingLogger();
    const queue = new RefreshQueue({ logger });
    queue.register(refresher('media.', a));
    await expect(queue.run('nope.whatever')).resolves.toBeUndefined();
    expect(a).toEqual([]);
    expect(logger.records).toEqual([
      expect.objectContaining({ level: 'warn', obj: { key: 'nope.whatever' } }),
    ]);
  });

  it('l’échec d’un refresher est journalisé sans empêcher les autres', async () => {
    const seen: string[] = [];
    const logger = recordingLogger();
    const queue = new RefreshQueue({ logger });
    queue.register({
      name: 'broken',
      supports: () => true,
      refresh: () => Promise.reject(new Error('boom')),
    });
    queue.register(refresher('k', seen));
    await queue.run('k');
    expect(seen).toEqual(['k']);
    expect(logger.records.map((r) => r.level)).toEqual(['error', 'warn']);
  });
});

describe('RefreshQueue : file', () => {
  it('enqueue() rend la main avant le rafraîchissement', async () => {
    const seen: string[] = [];
    const queue = new RefreshQueue();
    queue.register(refresher('k', seen));
    queue.enqueue('k');
    expect(seen).toEqual([]);
    await queue.idle();
    expect(seen).toEqual(['k']);
  });

  it('une clé déjà en attente n’est pas ajoutée deux fois', async () => {
    const seen: string[] = [];
    const queue = new RefreshQueue();
    queue.register(refresher('k', seen));
    queue.enqueue('k');
    queue.enqueue('k');
    await queue.idle();
    expect(seen).toEqual(['k']);
  });

  it('une clé en cours peut être redemandée', async () => {
    const seen: string[] = [];
    const gate = deferred<undefined>();
    const queue = new RefreshQueue();
    queue.register(refresher('k', seen, () => gate.promise));
    queue.enqueue('k');
    await new Promise((resolve) => setImmediate(resolve));
    expect(seen).toEqual(['k']);
    queue.enqueue('k');
    gate.resolve(undefined);
    await queue.idle();
    expect(seen).toEqual(['k', 'k']);
  });

  it('au plus deux rafraîchissements simultanés', async () => {
    let running = 0;
    let peak = 0;
    const gates = [deferred<undefined>(), deferred<undefined>(), deferred<undefined>()];
    const queue = new RefreshQueue();
    queue.register({
      name: 'slow',
      supports: () => true,
      refresh: async (key) => {
        running += 1;
        peak = Math.max(peak, running);
        await gates[Number(key)]?.promise;
        running -= 1;
      },
    });
    queue.enqueue('0');
    queue.enqueue('1');
    queue.enqueue('2');
    await new Promise((resolve) => setImmediate(resolve));
    expect(running).toBe(2);
    expect(queue.size).toBe(3);
    for (const gate of gates) gate.resolve(undefined);
    await queue.idle();
    expect(peak).toBe(2);
    expect(queue.size).toBe(0);
  });

  it('close() refuse les nouvelles clés, abandonne l’attente et attend les clés en cours', async () => {
    const seen: string[] = [];
    const gate = deferred<undefined>();
    const queue = new RefreshQueue({ concurrency: 1 });
    queue.register(refresher('', seen, () => gate.promise));
    queue.enqueue('a');
    queue.enqueue('b');
    await new Promise((resolve) => setImmediate(resolve));
    const closed = queue.close();
    expect(() => {
      queue.enqueue('c');
    }).toThrow();
    gate.resolve(undefined);
    await closed;
    expect(seen).toEqual(['a']);
  });
});
