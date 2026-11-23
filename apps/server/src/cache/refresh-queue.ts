// SPDX-License-Identifier: AGPL-3.0-or-later
// File de rafraîchissement en processus : remplace le transport `async` de
// Messenger, le service s6 `messenger-worker` et `RefreshCacheKeyHandler`
// (PLAN §2.7).
//
// `enqueue()` rend la main aussitôt : les rafraîchissements ne tournent jamais
// pendant la requête qui les demande. Au plus `concurrency` (2) tournent en
// même temps ; une clé déjà en attente n'est pas ajoutée une seconde fois.
//
// Chaque clé est confiée à **tous** les refreshers qui la revendiquent, pas au
// premier : leurs domaines doivent être disjoints, et un chevauchement est
// signalé par un avertissement au lieu d'élire un gagnant selon l'ordre
// d'enregistrement. Une clé que personne ne revendique est abandonnée avec un
// avertissement (jamais d'exception : rien ne surveillerait les échecs).

import type { CacheLogger } from './swr-cache';

/**
 * Sait reconstruire une entrée de cache. Obligations (reprises de
 * `CacheRefresherInterface`) :
 *  - domaines de `supports()` disjoints entre refreshers ;
 *  - ne rien faire si le disjoncteur du service est ouvert ;
 *  - ne jamais écrire un fetch vide ou raté (garder l'ancienne valeur) ;
 *  - être idempotent : relire le cache et s'arrêter s'il est déjà frais.
 */
export interface CacheRefresher {
  readonly name: string;
  supports(key: string): boolean;
  refresh(key: string): Promise<void>;
}

export interface RefreshQueueOptions {
  logger?: CacheLogger;
  /** Nombre de rafraîchissements simultanés (2 par défaut). */
  concurrency?: number;
}

export class RefreshQueue {
  static readonly DEFAULT_CONCURRENCY = 2;

  readonly #refreshers: CacheRefresher[] = [];
  readonly #pending: string[] = [];
  readonly #queued = new Set<string>();
  readonly #logger: CacheLogger | undefined;
  readonly #concurrency: number;
  #running = 0;
  #closed = false;
  #idleWaiters: (() => void)[] = [];

  constructor(options: RefreshQueueOptions = {}) {
    this.#logger = options.logger;
    this.#concurrency = Math.max(1, options.concurrency ?? RefreshQueue.DEFAULT_CONCURRENCY);
  }

  register(refresher: CacheRefresher): void {
    this.#refreshers.push(refresher);
  }

  /** Lève si la file est fermée (le cache SWR journalise et retire son marqueur). */
  enqueue(key: string): void {
    if (this.#closed) throw new Error('file de rafraîchissement fermée');
    if (this.#queued.has(key)) return;
    this.#queued.add(key);
    this.#pending.push(key);
    // Jamais dans la pile d'appel de la requête.
    setImmediate(() => {
      this.#drain();
    });
  }

  /** Nombre de clés en attente ou en cours. */
  get size(): number {
    return this.#pending.length + this.#running;
  }

  /** Résolue quand plus rien n'est en attente ni en cours. */
  idle(): Promise<void> {
    if (this.size === 0) return Promise.resolve();
    return new Promise((resolve) => this.#idleWaiters.push(resolve));
  }

  /** Refuse les nouvelles clés, abandonne celles en attente et attend celles en cours. */
  async close(): Promise<void> {
    this.#closed = true;
    for (const key of this.#pending.splice(0)) this.#queued.delete(key);
    await this.idle();
  }

  /** Confie une clé à ses refreshers, tout de suite (tests, et cœur de la file). */
  async run(key: string): Promise<void> {
    const matching = this.#refreshers.filter((refresher) => refresher.supports(key));
    if (matching.length === 0) {
      this.#logger?.warn({ key }, 'RefreshCacheKey: no refresher claims this key');
      return;
    }
    for (const refresher of matching) {
      try {
        await refresher.refresh(key);
      } catch (error) {
        this.#logger?.error(
          { key, refresher: refresher.name, err: error },
          'RefreshCacheKey: refresher failed',
        );
      }
    }
    if (matching.length > 1) {
      this.#logger?.warn(
        { key, count: matching.length, refreshers: matching.map((r) => r.name) },
        'RefreshCacheKey: multiple refreshers claim this key',
      );
    }
  }

  #drain(): void {
    while (this.#running < this.#concurrency && this.#pending.length > 0) {
      const key = this.#pending.shift();
      if (key === undefined) break;
      this.#queued.delete(key);
      this.#running += 1;
      void this.run(key).finally(() => {
        this.#running -= 1;
        this.#drain();
        this.#notifyIdle();
      });
    }
    this.#notifyIdle();
  }

  #notifyIdle(): void {
    if (this.size !== 0) return;
    for (const resolve of this.#idleWaiters.splice(0)) resolve();
  }
}
