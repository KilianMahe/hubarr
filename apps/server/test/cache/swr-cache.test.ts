// SPDX-License-Identifier: AGPL-3.0-or-later
// Port de `StaleWhileRevalidateCacheTest`, plus le vol unique par promesse.
// Durées en ms : 60 s de fenêtre souple, 600 s de fenêtre dure.

import { describe, expect, it } from 'vitest';
import { StaleWhileRevalidateCache } from '../../src/cache/swr-cache';
import { createSwr, deferred, recordingLogger } from './helpers';

const SOFT = 60_000;
const HARD = 600_000;

describe('StaleWhileRevalidateCache : lecture et écriture', () => {
  it('read() rend null sur un miss dur', () => {
    expect(createSwr().swr.read('k', SOFT)).toBeNull();
  });

  it('une écriture se relit fraîche', () => {
    const { swr } = createSwr();
    swr.write('k', { a: 1 }, HARD);
    expect(swr.read('k', SOFT)).toEqual({ value: { a: 1 }, state: 'fresh' });
  });

  it('une entrée plus vieille que la fenêtre souple se lit périmée', () => {
    const { swr, store } = createSwr();
    swr.write('k', { a: 1 }, HARD, { fetchedAt: store.now() - 120_000 });
    expect(swr.read('k', SOFT)).toEqual({ value: { a: 1 }, state: 'stale' });
  });

  it('une enveloppe corrompue est un miss, et elle est supprimée', () => {
    const { swr, store } = createSwr();
    store.set('k', { unexpected: 'shape' }, HARD);
    expect(swr.read('k', SOFT)).toBeNull();
    expect(store.has('k')).toBe(false);
  });

  it('l’entrée disparaît à l’échéance de la fenêtre dure', () => {
    const { swr, clock } = createSwr();
    swr.write('k', ['row'], HARD);
    clock.advance(HARD - 1);
    expect(swr.read('k', SOFT)?.state).toBe('stale');
    clock.advance(1);
    expect(swr.read('k', SOFT)).toBeNull();
  });

  it('write() refuse une fenêtre dure nulle ou négative', () => {
    expect(() => {
      createSwr().swr.write('k', { a: 1 }, 0);
    }).toThrow(RangeError);
  });

  it('une écriture antidatée au-delà de la fenêtre dure ne crée pas d’entrée', () => {
    const { swr, store } = createSwr();
    swr.write('k', { a: 1 }, HARD, { fetchedAt: store.now() - 700_000 });
    expect(swr.read('k', SOFT)).toBeNull();
  });

  it('…et efface la demande de rafraîchissement devenue sans objet', () => {
    const { swr, store } = createSwr();
    swr.requestRefresh('k');
    expect(store.has('k.requested_at')).toBe(true);
    swr.write('k', { a: 1 }, HARD, { fetchedAt: store.now() - 700_000 });
    expect(store.has('k.requested_at')).toBe(false);
  });

  it('une écriture antidatée s’écrit quand il reste de la fenêtre dure, raccourcie d’autant', () => {
    const { swr, store, clock } = createSwr();
    swr.write('k', { a: 1 }, HARD, { fetchedAt: store.now() - 400_000 });
    expect(swr.read('k', 1_000_000_000)?.value).toEqual({ a: 1 });
    clock.advance(200_000);
    expect(swr.read('k', 1_000_000_000)).toBeNull();
  });

  it('write() ne retire pas le marqueur de coalescence', () => {
    const { swr, store } = createSwr();
    swr.requestRefresh('k');
    swr.write('k', { a: 1 }, HARD);
    expect(store.has('k.refreshing')).toBe(true);
  });

  it('write() efface la demande en retard', () => {
    const { swr, store } = createSwr();
    swr.requestRefresh('k');
    expect(store.has('k.requested_at')).toBe(true);
    swr.write('k', { a: 1 }, HARD);
    expect(store.has('k.requested_at')).toBe(false);
  });
});

describe('StaleWhileRevalidateCache : getOrCompute', () => {
  it('fetch une fois, puis sert le cache', async () => {
    const { swr } = createSwr();
    let calls = 0;
    const fetch = () => {
      calls += 1;
      return Promise.resolve(['row']);
    };
    const first = await swr.getOrCompute('k', SOFT, HARD, fetch);
    const second = await swr.getOrCompute('k', SOFT, HARD, fetch);
    expect(first).toEqual({ value: ['row'], state: 'fresh' });
    expect(second.value).toEqual(['row']);
    expect(calls).toBe(1);
  });

  it('ne met pas en cache un résultat vide', async () => {
    const { swr } = createSwr();
    let calls = 0;
    const fetch = () => {
      calls += 1;
      return Promise.resolve([]);
    };
    await swr.getOrCompute('k', SOFT, HARD, fetch);
    await swr.getOrCompute('k', SOFT, HARD, fetch);
    expect(calls).toBe(2);
  });

  it('une enveloppe corrompue est recalculée', async () => {
    const { swr, store } = createSwr();
    store.set('k', { unexpected: 'shape' }, HARD);
    let calls = 0;
    const result = await swr.getOrCompute('k', SOFT, HARD, () => {
      calls += 1;
      return Promise.resolve(['row']);
    });
    expect(result).toEqual({ value: ['row'], state: 'fresh' });
    expect(calls).toBe(1);
  });

  it('propage l’erreur du fetch sans laisser d’entrée', async () => {
    const { swr, store } = createSwr();
    await expect(
      swr.getOrCompute('k', SOFT, HARD, () => Promise.reject(new Error('upstream down'))),
    ).rejects.toThrow('upstream down');
    expect(store.has('k')).toBe(false);
  });

  it('déduit l’état de fetchedAt (fenêtre souple nulle : périmé)', async () => {
    const { swr } = createSwr();
    const result = await swr.getOrCompute('k', 0, HARD, () => Promise.resolve(['row']));
    expect(result).toEqual({ value: ['row'], state: 'stale' });
  });

  it('un fetch lent rend une valeur périmée si la fenêtre souple est passée pendant le fetch', async () => {
    const { swr, clock } = createSwr();
    const result = await swr.getOrCompute('k', 1_000, HARD, () => {
      clock.advance(5_000);
      return Promise.resolve(['row']);
    });
    // fetchedAt est pris à la fin du fetch : la valeur est fraîche à cet instant.
    expect(result.state).toBe('fresh');
    clock.advance(1_000);
    expect(swr.read('k', 1_000)?.state).toBe('stale');
  });

  it('un fetch en ligne non vide efface la demande en retard', async () => {
    const { swr, store } = createSwr();
    swr.requestRefresh('k');
    await swr.getOrCompute('k', SOFT, HARD, () => Promise.resolve(['row']));
    expect(store.has('k.requested_at')).toBe(false);
  });

  it('un fetch en ligne vide laisse la demande en retard', async () => {
    const { swr, store } = createSwr();
    swr.requestRefresh('k');
    await swr.getOrCompute('k', SOFT, HARD, () => Promise.resolve([]));
    expect(store.has('k.requested_at')).toBe(true);
  });

  it('vol unique : des appels concurrents partagent un seul fetch', async () => {
    const { swr } = createSwr();
    const pending = deferred<string[]>();
    let calls = 0;
    const fetch = () => {
      calls += 1;
      return pending.promise;
    };
    const all = Promise.all([
      swr.getOrCompute('k', SOFT, HARD, fetch),
      swr.getOrCompute('k', SOFT, HARD, fetch),
      swr.getOrCompute('k', SOFT, HARD, fetch),
    ]);
    pending.resolve(['row']);
    const results = await all;
    expect(calls).toBe(1);
    expect(results.map((r) => r.value)).toEqual([['row'], ['row'], ['row']]);
  });

  it('vol unique : une erreur est rendue à tous les appelants, puis le fetch suivant repart', async () => {
    const { swr } = createSwr();
    const pending = deferred<string[]>();
    const a = swr.getOrCompute('k', SOFT, HARD, () => pending.promise);
    const b = swr.getOrCompute('k', SOFT, HARD, () => pending.promise);
    pending.reject(new Error('boom'));
    await expect(a).rejects.toThrow('boom');
    await expect(b).rejects.toThrow('boom');
    const next = await swr.getOrCompute('k', SOFT, HARD, () => Promise.resolve(['ok']));
    expect(next.value).toEqual(['ok']);
  });

  it('les clés différentes ne partagent pas leur vol', async () => {
    const { swr } = createSwr();
    const a = await swr.getOrCompute('a', SOFT, HARD, () => Promise.resolve(['a']));
    const b = await swr.getOrCompute('b', SOFT, HARD, () => Promise.resolve(['b']));
    expect([a.value, b.value]).toEqual([['a'], ['b']]);
  });
});

describe('StaleWhileRevalidateCache : invalidation et courses', () => {
  it('delete() retire la valeur, le marqueur et la demande', () => {
    const { swr, store } = createSwr();
    swr.write('k', { a: 1 }, HARD);
    swr.requestRefresh('k');
    swr.delete('k');
    expect(swr.read('k', SOFT)).toBeNull();
    expect(store.has('k.refreshing')).toBe(false);
    expect(store.has('k.requested_at')).toBe(false);
  });

  it('une écriture dont le fetch a commencé avant une invalidation est abandonnée', () => {
    const { swr } = createSwr();
    const token = swr.fetchToken();
    swr.delete('k');
    swr.write('k', ['old'], HARD, { token });
    expect(swr.read('k', 45_000)).toBeNull();
  });

  it('…même dans la même milliseconde (aucune dépendance à l’horloge)', () => {
    const { swr } = createSwr(); // l'horloge factice n'avance pas
    const token = swr.fetchToken();
    swr.delete('k');
    swr.write('k', ['old'], HARD, { token });
    expect(swr.read('k', 45_000)).toBeNull();
  });

  it('une écriture dont le fetch a commencé après l’invalidation est conservée', () => {
    const { swr } = createSwr();
    swr.delete('k');
    swr.write('k', ['new'], HARD, { token: swr.fetchToken() });
    expect(swr.read('k', 45_000)?.value).toEqual(['new']);
  });

  it('l’invalidation d’une autre clé n’abandonne pas l’écriture', () => {
    const { swr } = createSwr();
    const token = swr.fetchToken();
    swr.delete('other');
    swr.write('k', ['v'], HARD, { token });
    expect(swr.read('k', 45_000)?.value).toEqual(['v']);
  });

  it('un fetch en ligne qui chevauche une invalidation est servi mais pas mis en cache', async () => {
    const { swr } = createSwr();
    const hit = await swr.getOrCompute('k', 45_000, HARD, () => {
      swr.delete('k'); // une mutation arrive pendant le fetch
      return Promise.resolve(['old']);
    });
    expect(hit.value).toEqual(['old']);
    expect(swr.read('k', 45_000)).toBeNull();
  });

  it('une lecture après invalidation ne rejoint pas le vol commencé avant', async () => {
    const { swr } = createSwr();
    const before = deferred<string[]>();
    const first = swr.getOrCompute('k', SOFT, HARD, () => before.promise);
    swr.delete('k');
    const second = swr.getOrCompute('k', SOFT, HARD, () => Promise.resolve(['new']));
    before.resolve(['old']);
    expect((await first).value).toEqual(['old']);
    expect((await second).value).toEqual(['new']);
    expect(swr.read('k', SOFT)?.value).toEqual(['new']);
  });

  it('markStale() garde la valeur mais la sert périmée', () => {
    const { swr } = createSwr();
    swr.write('k', ['v'], HARD);
    swr.markStale('k', SOFT, HARD);
    expect(swr.read('k', SOFT)).toEqual({ value: ['v'], state: 'stale' });
  });

  it('markStale() laisse passer la demande suivante malgré un marqueur actif', () => {
    const { swr, dispatched } = createSwr();
    swr.write('k', ['v'], HARD);
    swr.requestRefresh('k');
    expect(dispatched).toHaveLength(1);
    swr.markStale('k', SOFT, HARD);
    swr.requestRefresh('k');
    expect(dispatched).toHaveLength(2);
  });

  it('markStale() ne fait rien sur une clé absente', () => {
    const { swr } = createSwr();
    swr.markStale('k', SOFT, HARD);
    expect(swr.read('k', SOFT)).toBeNull();
  });
});

describe('StaleWhileRevalidateCache : demandes de rafraîchissement', () => {
  it('une seule demande par fenêtre de coalescence', () => {
    const { swr, dispatched } = createSwr();
    swr.requestRefresh('k');
    swr.requestRefresh('k');
    swr.requestRefresh('k');
    expect(dispatched).toEqual(['k']);
  });

  it('une nouvelle demande part après l’échéance du marqueur', () => {
    const { swr, dispatched, clock } = createSwr();
    swr.requestRefresh('k');
    clock.advance(StaleWhileRevalidateCache.MARKER_TTL_MS);
    swr.requestRefresh('k');
    expect(dispatched).toEqual(['k', 'k']);
  });

  it('un échec de la file retire le marqueur pour que la demande suivante réessaie', () => {
    const { swr, store } = createSwr({ throwingDispatch: true });
    expect(() => {
      swr.requestRefresh('k');
    }).not.toThrow();
    expect(store.has('k.refreshing')).toBe(false);
  });

  it('un échec de la file est journalisé en erreur', () => {
    const logger = recordingLogger();
    const { swr } = createSwr({ throwingDispatch: true, logger });
    swr.requestRefresh('k');
    expect(logger.records).toHaveLength(1);
    expect(logger.records[0]).toMatchObject({
      level: 'error',
      obj: { key: 'k', exception: 'Error', message: 'transport down' },
    });
  });

  it('refreshIsOverdue() selon l’âge de la demande', () => {
    const { swr, store } = createSwr();
    store.set('k.requested_at', store.now() - 300_000, 900_000);
    expect(swr.refreshIsOverdue('k', 180_000)).toBe(true);
    expect(swr.refreshIsOverdue('k', 600_000)).toBe(false);
    expect(swr.refreshIsOverdue('other', 0)).toBe(false);
  });
});
