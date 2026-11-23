// SPDX-License-Identifier: AGPL-3.0-or-later
// Aides des tests du cache : journal enregistreur, cache SWR sur horloge factice.

import { MemoryStore } from '../../src/cache/memory-store';
import { StaleWhileRevalidateCache, type CacheLogger } from '../../src/cache/swr-cache';
import { createClock } from '../helpers';

export interface LogRecord {
  level: 'warn' | 'error';
  obj: Record<string, unknown>;
  msg: string;
}

export function recordingLogger(): CacheLogger & { records: LogRecord[] } {
  const records: LogRecord[] = [];
  return {
    records,
    warn: (obj, msg) => records.push({ level: 'warn', obj: obj as Record<string, unknown>, msg }),
    error: (obj, msg) => records.push({ level: 'error', obj: obj as Record<string, unknown>, msg }),
  };
}

export function createSwr(options: { throwingDispatch?: boolean; logger?: CacheLogger } = {}): {
  swr: StaleWhileRevalidateCache;
  store: MemoryStore;
  clock: ReturnType<typeof createClock>;
  dispatched: string[];
} {
  const clock = createClock();
  const store = new MemoryStore({ now: clock.now });
  const dispatched: string[] = [];
  const swr = new StaleWhileRevalidateCache({
    store,
    dispatch: (key) => {
      if (options.throwingDispatch === true) throw new Error('transport down');
      dispatched.push(key);
    },
    ...(options.logger ? { logger: options.logger } : {}),
  });
  return { swr, store, clock, dispatched };
}

/** Promesse résolue à la main (fetch « en vol »). */
export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
