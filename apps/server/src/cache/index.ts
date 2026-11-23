// SPDX-License-Identifier: AGPL-3.0-or-later
// Assemblage du cache de l'application : stockage en mémoire, cache SWR, file
// de rafraîchissement et refreshers enregistrés (PLAN §2.7).

import type { FastifyInstance } from 'fastify';
import { LIBRARY_TIMEOUT_MS } from '../integrations/radarr/client';
import { LIBRARY_TIMEOUT_MS as SERIES_LIBRARY_TIMEOUT_MS } from '../integrations/sonarr/client';
import { BazarrClient } from '../integrations/bazarr/client';
import { BazarrSubtitleIndex } from '../integrations/bazarr/subtitle-index';
import { getInstanceBySlug, listEnabledInstances } from '../modules/instances/instances';
import { tmdbClient } from '../modules/discover/tmdb';
import { SearchVocabulary } from '../modules/search/vocabulary';
import { apiKeyServiceClient, radarrClient, sonarrClient } from '../modules/services/clients';
import { MediaLibraryCache } from './library-cache';
import { MemoryStore } from './memory-store';
import { RefreshQueue } from './refresh-queue';
import { BazarrIndexRefresher } from './refreshers/bazarr-index';
import { MediaLibraryRefresher } from './refreshers/media-library';
import { SearchVocabularyRefresher } from './refreshers/search-vocabulary';
import { StaleWhileRevalidateCache } from './swr-cache';

export interface AppCache {
  store: MemoryStore;
  swr: StaleWhileRevalidateCache;
  queue: RefreshQueue;
  library: MediaLibraryCache;
  /** Index des sous-titres Bazarr (badges, pages). */
  bazarr: BazarrSubtitleIndex;
  /** Vocabulaire de correction de la recherche (P4.5). */
  vocabulary: SearchVocabulary;
}

export function createAppCache(
  app: FastifyInstance,
  options: { now?: () => number } = {},
): AppCache {
  const store = new MemoryStore(options.now ? { now: options.now } : {});
  const queue = new RefreshQueue({ logger: app.log });
  const swr = new StaleWhileRevalidateCache({
    store,
    dispatch: (key) => {
      queue.enqueue(key);
    },
    logger: app.log,
  });
  queue.register(
    new MediaLibraryRefresher({
      swr,
      health: app.upstream.health,
      findInstance: (service, slug) => getInstanceBySlug(app.db, service, slug),
      loaders: {
        movies: (row) => radarrClient(app, row).movies(LIBRARY_TIMEOUT_MS),
        series: (row) => sonarrClient(app, row).seriesList(SERIES_LIBRARY_TIMEOUT_MS),
      },
      logger: app.log,
    }),
  );
  const bazarrClient = () => new BazarrClient(apiKeyServiceClient(app, 'bazarr'));
  const bazarr = new BazarrSubtitleIndex({
    swr,
    gate: (service) => listEnabledInstances(app.db, service).length === 1,
    client: bazarrClient,
    logger: app.log,
  });
  queue.register(
    new BazarrIndexRefresher({
      index: bazarr,
      health: app.upstream.health,
      client: bazarrClient,
      logger: app.log,
    }),
  );
  const vocabulary = new SearchVocabulary({
    swr,
    tmdb: () => {
      const client = tmdbClient(app);
      return client.configured ? client : null;
    },
    logger: app.log,
  });
  queue.register(new SearchVocabularyRefresher(vocabulary, swr));
  return {
    store,
    swr,
    queue,
    library: new MediaLibraryCache(swr, app.log),
    bazarr,
    vocabulary,
  };
}

export { MediaLibraryCache, libraryKey } from './library-cache';
export { MemoryStore } from './memory-store';
export { RefreshQueue, type CacheRefresher } from './refresh-queue';
export { StaleWhileRevalidateCache, type SwrHit, type SwrState } from './swr-cache';
