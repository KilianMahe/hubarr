// SPDX-License-Identifier: AGPL-3.0-or-later
// Reconstruit `media.movies.<slug>` / `media.series.<slug>` dans la file de
// rafraîchissement, hors de toute requête : port de `MediaLibraryRefresher`.
//
// L'entrée est partagée par les pages de bibliothèque et le dashboard : le
// chemin qui la remplit décide de ce que tous affichent. Le chargement d'une
// bibliothèque est injecté par type (`loaders`) ; un type sans chargeur est
// revendiqué mais ignoré.

import type { ServiceHealthCache } from '../../integrations/http';
import { LIBRARY_KEY_PREFIX, MediaLibraryCache, type LibraryKind } from '../library-cache';
import type { CacheRefresher } from '../refresh-queue';
import type { CacheLogger, StaleWhileRevalidateCache } from '../swr-cache';

const SERVICE: Record<LibraryKind, 'radarr' | 'sonarr'> = { movies: 'radarr', series: 'sonarr' };

export interface LibraryInstance {
  slug: string;
  enabled: boolean;
}

export interface MediaLibraryRefresherDeps<I extends LibraryInstance> {
  swr: StaleWhileRevalidateCache;
  health: ServiceHealthCache;
  /** Instance du service par slug (`null` : inconnue). */
  findInstance: (service: 'radarr' | 'sonarr', slug: string) => I | null;
  /** Bibliothèque complète d'une instance (délai `LIBRARY_TIMEOUT_MS`). */
  loaders: Partial<Record<LibraryKind, (instance: I) => Promise<unknown[]>>>;
  logger?: CacheLogger;
}

export class MediaLibraryRefresher<I extends LibraryInstance> implements CacheRefresher {
  readonly name = 'media-library';
  readonly #deps: MediaLibraryRefresherDeps<I>;

  constructor(deps: MediaLibraryRefresherDeps<I>) {
    this.#deps = deps;
  }

  supports(key: string): boolean {
    return this.#parse(key) !== null;
  }

  async refresh(key: string): Promise<void> {
    const parsed = this.#parse(key);
    if (parsed === null || parsed.slug === '') return;
    const { kind, slug } = parsed;
    const { swr, health, logger } = this.#deps;

    // Idempotence : une clé déjà fraîche coûte une lecture du cache.
    if (swr.read(key, MediaLibraryCache.TTL_MS)?.state === 'fresh') return;

    const service = SERVICE[kind];
    const instance = this.#deps.findInstance(service, slug);
    if (!instance?.enabled) return;

    // Ne jamais insister auprès d'une instance que son disjoncteur vient de
    // marquer injoignable (entrée propre à l'instance, comme les clients).
    if (health.isDown(service, slug)) return;

    const load = this.#deps.loaders[kind];
    if (load === undefined) return;

    // Pris avant le fetch : une mutation qui invalide la clé pendant le fetch
    // l'emporte sur son résultat.
    const token = swr.fetchToken();
    let rows: unknown[];
    try {
      rows = await load(instance);
    } catch (error) {
      logger?.warn({ key, err: error }, 'Library refresh failed');
      return;
    }

    // Une liste vide est un fetch raté : garder l'ancienne valeur.
    if (rows.length === 0) return;

    swr.write(key, rows, MediaLibraryCache.HARD_TTL_MS, { token });
  }

  #parse(key: string): { kind: LibraryKind; slug: string } | null {
    for (const kind of ['movies', 'series'] as const) {
      const prefix = LIBRARY_KEY_PREFIX[kind];
      if (key.startsWith(prefix)) return { kind, slug: key.slice(prefix.length) };
    }
    return null;
  }
}
