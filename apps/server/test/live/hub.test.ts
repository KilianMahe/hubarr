// SPDX-License-Identifier: AGPL-3.0-or-later
// Lectures partagées et pollers du temps réel (P5.1, P5.3) : un appel par
// fenêtre quel que soit le nombre de lecteurs, poller unique par sujet tant
// qu'il a des abonnés, arrêt au dernier départ, repli après échec.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveHub, MAX_BACKOFF_MS } from '../../src/live/hub';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('lectures partagées', () => {
  it('dix lecteurs simultanés, un seul appel ; relu après la fenêtre ou une invalidation', async () => {
    let now = 0;
    const hub = new LiveHub({ now: () => now });
    let calls = 0;
    const load = async () => {
      calls += 1;
      return calls;
    };
    const values = await Promise.all(
      Array.from({ length: 10 }, () => hub.shared('k', 2_000, load)),
    );
    expect(values).toEqual(Array(10).fill(1));
    expect(calls).toBe(1);
    now = 1_500;
    expect(await hub.shared('k', 2_000, load)).toBe(1);
    now = 2_500;
    expect(await hub.shared('k', 2_000, load)).toBe(2);
    hub.invalidate('k');
    expect(await hub.shared('k', 2_000, load)).toBe(3);
    hub.invalidateAll();
    expect(await hub.shared('k', 2_000, load)).toBe(4);
    expect(hub.stats()).toMatchObject({ sharedLoads: 4, sharedHits: 10 });
  });

  it('un échec n’est pas gardé', async () => {
    const hub = new LiveHub();
    let fail = true;
    const load = async () => {
      if (fail) throw new Error('boom');
      return 'ok';
    };
    await expect(hub.shared('k', 10_000, load)).rejects.toThrow('boom');
    fail = false;
    expect(await hub.shared('k', 10_000, load)).toBe('ok');
  });
});

describe('pollers', () => {
  it('un poller pour cinq abonnés, diffusé à tous, arrêté au dernier départ', async () => {
    const hub = new LiveHub();
    let loads = 0;
    const spec = { name: 'downloads.qbittorrent', intervalMs: 3_000, load: async () => ++loads };
    const received: number[][] = Array.from({ length: 5 }, () => []);
    const stops = received.map((list) => hub.subscribe(spec, (data) => list.push(data as number)));
    await vi.advanceTimersByTimeAsync(0);
    expect(loads).toBe(1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(loads).toBe(2);
    expect(received.every((list) => list.join() === '1,2')).toBe(true);
    expect(hub.subscribers('downloads.qbittorrent')).toBe(5);
    for (const stop of stops) stop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(loads).toBe(2);
    // Nouvel abonné : la dernière valeur encore récente lui est envoyée aussitôt,
    // puis le poller repart.
    const late: unknown[] = [];
    const stop = hub.subscribe(spec, (data) => late.push(data));
    expect(late[0]).toBe(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(loads).toBe(3);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(loads).toBe(3);
    hub.close();
  });

  it('repli exponentiel après échec, plafonné, rétabli au succès', async () => {
    const hub = new LiveHub();
    let fail = true;
    let loads = 0;
    const spec = {
      name: 'health',
      intervalMs: 30_000,
      load: async () => {
        loads += 1;
        if (fail) throw new Error('down');
        return loads;
      },
    };
    const stop = hub.subscribe(spec, () => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(loads).toBe(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(loads).toBe(1); // 60 s après le premier échec
    await vi.advanceTimersByTimeAsync(30_000);
    expect(loads).toBe(2);
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
    expect(loads).toBe(3);
    fail = false;
    await vi.advanceTimersByTimeAsync(MAX_BACKOFF_MS);
    expect(loads).toBe(4);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(loads).toBe(5);
    stop();
    hub.close();
  });
});
