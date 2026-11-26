// SPDX-License-Identifier: AGPL-3.0-or-later
// Bibliothèques Radarr/Sonarr agrégées sur toutes les instances actives, pour
// le dashboard, la découverte et la recherche globale (P4).
//
// Chaque instance est lue par l'entrée **partagée** du cache des bibliothèques
// (`media.movies.<slug>`, MEMOIRE P2.2) : aucune copie propre au dashboard,
// donc les invalidations des pages Films/Séries l'atteignent aussi (correctif
// de `collectLibrary` dans l'original). Une instance en panne est ignorée (avec
// un avertissement) sans vider le reste. L'instance d'origine est ajoutée ici,
// jamais stockée dans le cache.
//
// Index « déjà dans la bibliothèque » (`buildLibraryIndex` de
// `TmdbController`) : par id TMDB pour les films, par id TheTVDB et TMDB pour
// les séries ; la première instance qui présente un titre l'emporte.

import type { Movie, Series } from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { LIBRARY_TIMEOUT_MS } from '../../integrations/radarr/client';
import { LIBRARY_TIMEOUT_MS as SERIES_LIBRARY_TIMEOUT_MS } from '../../integrations/sonarr/client';
import type { TmdbClient } from '../../integrations/tmdb/client';
import { listEnabledInstances, type InstanceRow } from '../instances/instances';
import { radarrClient, sonarrClient } from '../services/clients';
import type { AccessScope } from '../users/access-scope';

export interface Owned<T> {
  item: T;
  slug: string;
  instanceName: string;
}

async function collect<T>(
  app: FastifyInstance,
  type: 'radarr' | 'sonarr',
  load: (row: InstanceRow) => Promise<T[]>,
  scope?: AccessScope,
): Promise<Owned<T>[]> {
  const rows = scope === undefined ? listEnabledInstances(app.db, type) : scope.instances(type);
  const lists = await Promise.all(
    rows.map(async (row) => {
      try {
        return (await load(row)).map((item) => ({ item, slug: row.slug, instanceName: row.name }));
      } catch (error) {
        app.log.warn({ err: error, instance: row.slug }, `bibliothèque ${type} indisponible`);
        return [];
      }
    }),
  );
  return lists.flat();
}

/** Films des instances Radarr actives (celles que le compte peut lire, avec `scope`). */
export function collectMovies(app: FastifyInstance, scope?: AccessScope): Promise<Owned<Movie>[]> {
  return collect(
    app,
    'radarr',
    (row) =>
      app.cache.library.movies(row.slug, () => radarrClient(app, row).movies(LIBRARY_TIMEOUT_MS)),
    scope,
  );
}

/** Séries des instances Sonarr actives (celles que le compte peut lire, avec `scope`). */
export function collectSeries(app: FastifyInstance, scope?: AccessScope): Promise<Owned<Series>[]> {
  return collect(
    app,
    'sonarr',
    (row) =>
      app.cache.library.series(row.slug, () =>
        sonarrClient(app, row).seriesList(SERIES_LIBRARY_TIMEOUT_MS),
      ),
    scope,
  );
}

export const LIB_STATUSES = [
  'downloaded',
  'missing',
  'announced',
  'inCinemas',
  'unmonitored',
  'partial',
] as const;
export type LibStatus = (typeof LIB_STATUSES)[number];

export interface LibraryEntry {
  id: number;
  status: LibStatus;
  slug: string;
}

export interface LibraryIndex {
  movie: Map<number, LibraryEntry>;
  /** Clés `tvdb_<id>` et `tmdb_<id>`. */
  tv: Map<string, LibraryEntry>;
}

export function movieLibStatus(movie: Movie): LibStatus {
  if (!movie.monitored) return 'unmonitored';
  if (movie.hasFile) return 'downloaded';
  if (movie.status === 'announced') return 'announced';
  if (movie.status === 'inCinemas') return 'inCinemas';
  return 'missing';
}

export function seriesLibStatus(series: Series): LibStatus {
  if (!series.monitored) return 'unmonitored';
  if (series.episodeCount > 0 && series.episodeFileCount >= series.episodeCount)
    return 'downloaded';
  if (series.episodeFileCount > 0) return 'partial';
  if (series.status === 'upcoming') return 'announced';
  return 'missing';
}

/** Index des titres déjà présents dans une bibliothèque (instances lisibles, avec `scope`). */
export async function buildLibraryIndex(
  app: FastifyInstance,
  tmdb: TmdbClient | null,
  scope?: AccessScope,
): Promise<LibraryIndex> {
  const [movies, series] = await Promise.all([
    collectMovies(app, scope),
    collectSeries(app, scope),
  ]);
  const index: LibraryIndex = { movie: new Map(), tv: new Map() };
  for (const { item, slug } of movies) {
    if (item.tmdbId === null || item.tmdbId === 0 || item.id === null) continue;
    if (index.movie.has(item.tmdbId)) continue; // la première instance l'emporte
    index.movie.set(item.tmdbId, { id: item.id, status: movieLibStatus(item), slug });
  }
  for (const { item, slug } of series) {
    if (item.id === null) continue;
    const entry: LibraryEntry = { id: item.id, status: seriesLibStatus(item), slug };
    const { tvdbId, tmdbId } = item;
    if (tvdbId && !index.tv.has(`tvdb_${tvdbId}`)) index.tv.set(`tvdb_${tvdbId}`, entry);
    if (tmdbId && !index.tv.has(`tmdb_${tmdbId}`)) index.tv.set(`tmdb_${tmdbId}`, entry);
    if (tvdbId && !tmdbId && tmdb?.configured) {
      const resolved = await tmdb.findTmdbIdByTvdbId(tvdbId).catch(() => null);
      if (resolved !== null && !index.tv.has(`tmdb_${resolved}`)) {
        index.tv.set(`tmdb_${resolved}`, entry);
      }
    }
  }
  return index;
}

/** Entrée de l'index pour un élément TMDB (`movie` par id, `tv` par id TMDB). */
export function libraryEntry(
  index: LibraryIndex,
  type: 'movie' | 'tv',
  tmdbId: number,
): LibraryEntry | null {
  return (type === 'movie' ? index.movie.get(tmdbId) : index.tv.get(`tmdb_${tmdbId}`)) ?? null;
}
