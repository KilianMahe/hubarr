// SPDX-License-Identifier: AGPL-3.0-or-later
// Cache des bibliothèques Radarr/Sonarr (liste complète, lourde) : port de
// `MediaLibraryCache`.
//
// Une clé par instance (`media.movies.<slug>`, `media.series.<slug>`), pour que
// la bibliothèque d'une instance ne masque jamais celle d'une autre. Fenêtre
// souple de 45 s : au-delà, la liste est servie aussitôt et un rafraîchissement
// est demandé en arrière-plan ; fenêtre dure de 600 s : au-delà, la lecture
// bloque et refait le fetch (la page ne s'affiche pas sans la liste). Une liste
// vide n'est jamais mise en cache. Les mutations invalident la clé
// (`invalidate`), pour que l'action de l'utilisateur soit visible aussitôt.

import type { CacheLogger, StaleWhileRevalidateCache } from './swr-cache';

export type LibraryKind = 'movies' | 'series';

export const LIBRARY_KEY_PREFIX: Record<LibraryKind, string> = {
  movies: 'media.movies.',
  series: 'media.series.',
};

export function libraryKey(kind: LibraryKind, slug: string): string {
  return LIBRARY_KEY_PREFIX[kind] + slug;
}

export class MediaLibraryCache {
  /** Fenêtre souple (`WIDGET_CACHE_TTL` du dashboard d'origine). */
  static readonly TTL_MS = 45_000;
  /** Plafond : au-delà, la lecture bloque et refait le fetch. */
  static readonly HARD_TTL_MS = 600_000;
  /** Délai sans réponse au-delà duquel un rafraîchissement demandé est signalé. */
  static readonly OVERDUE_THRESHOLD_MS = 180_000;
  /** Marqueur commun qui limite le signalement à une ligne par fenêtre. */
  static readonly OVERDUE_LOG_KEY = 'media_library.overdue_logged';

  readonly #swr: StaleWhileRevalidateCache;
  readonly #logger: CacheLogger | undefined;

  constructor(swr: StaleWhileRevalidateCache, logger?: CacheLogger) {
    this.#swr = swr;
    this.#logger = logger;
  }

  movies<T>(slug: string, fetch: () => Promise<T[]>): Promise<T[]> {
    return this.#fetchCached(libraryKey('movies', slug), fetch);
  }

  series<T>(slug: string, fetch: () => Promise<T[]>): Promise<T[]> {
    return this.#fetchCached(libraryKey('series', slug), fetch);
  }

  /** Après une mutation : invalidation dure, la lecture suivante refait le fetch. */
  invalidate(type: 'radarr' | 'sonarr', slug: string): void {
    this.#swr.delete(libraryKey(type === 'sonarr' ? 'series' : 'movies', slug));
  }

  async #fetchCached<T>(key: string, fetch: () => Promise<T[]>): Promise<T[]> {
    const hit = await this.#swr.getOrCompute(
      key,
      MediaLibraryCache.TTL_MS,
      MediaLibraryCache.HARD_TTL_MS,
      fetch,
    );
    if (hit.state === 'stale') {
      this.#swr.requestRefresh(key);
      this.#logOverdueOnce(key);
    }
    return hit.value;
  }

  /**
   * Un rafraîchissement demandé sans réponse depuis 3 min mérite l'attention
   * de l'exploitant : une ligne au plus par fenêtre, toutes requêtes confondues.
   */
  #logOverdueOnce(key: string): void {
    if (!this.#swr.refreshIsOverdue(key, MediaLibraryCache.OVERDUE_THRESHOLD_MS)) return;
    const store = this.#swr.store;
    if (store.has(MediaLibraryCache.OVERDUE_LOG_KEY)) return;
    store.set(MediaLibraryCache.OVERDUE_LOG_KEY, true, MediaLibraryCache.OVERDUE_THRESHOLD_MS);
    this.#logger?.error(
      { key, thresholdMs: MediaLibraryCache.OVERDUE_THRESHOLD_MS },
      `Library cache refresh overdue for ${key}: is the refresh queue stalled?`,
    );
  }
}
