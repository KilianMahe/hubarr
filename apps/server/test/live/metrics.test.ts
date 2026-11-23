// SPDX-License-Identifier: AGPL-3.0-or-later
// Métriques du cache (P5.3) : compteurs du cache SWR et des lectures
// partagées, journalisés en mode debug seulement quand ils changent.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app';
import { metricsSnapshot, startMetricsLog } from '../../src/live/metrics';
import { UNUSED_DATA_DIR, createTestDatabase } from '../helpers';

afterEach(() => {
  vi.useRealTimers();
});

describe('métriques du cache', () => {
  it('compteurs du cache SWR et des lectures partagées ; journal debug à chaque changement', async () => {
    const app = buildApp({ database: await createTestDatabase(), dataDir: UNUSED_DATA_DIR });
    const { swr } = app.cache;
    expect(swr.read('absent', 1_000)).toBeNull();
    await swr.getOrCompute('k', 60_000, 600_000, async () => [1]);
    swr.read('k', 60_000);
    swr.requestRefresh('k');
    await app.live.shared('s', 1_000, async () => 1);
    await app.live.shared('s', 1_000, async () => 2);
    expect(metricsSnapshot(app)).toMatchObject({
      swr: { misses: 2, computes: 1, fresh: 1, refreshRequests: 1 },
      shared: { hits: 1, loads: 1 },
      topics: [],
    });

    vi.useFakeTimers();
    const debug = vi.spyOn(app.log, 'debug').mockImplementation(() => undefined);
    Object.defineProperty(app.log, 'level', { value: 'debug', configurable: true });
    const stop = startMetricsLog(app, 1_000);
    vi.advanceTimersByTime(1_000);
    vi.advanceTimersByTime(1_000);
    expect(debug).toHaveBeenCalledTimes(1);
    swr.read('k', 60_000);
    vi.advanceTimersByTime(1_000);
    expect(debug).toHaveBeenCalledTimes(2);
    stop();
    vi.useRealTimers();
    await app.close();
  });
});
