// SPDX-License-Identifier: AGPL-3.0-or-later
// Tri et recherche des listes paginées Radarr/Sonarr (P5c.5, V5, V6, MEMOIRE
// D141) : colonnes traduites en clés de tri de l'amont, recherche par titre
// résolue en ids dans la bibliothèque en cache (filtres `movieIds` /
// `seriesIds` de l'amont : pagination exacte), pagination locale du cutoff
// filtré (l'API `wanted/cutoff` n'a pas de filtre par titre ni par profil).

import { titleMatches, type ArrListQuery, type ArrListSort } from '@hubarr/shared';
import type { ArrSort } from '../../integrations/radarr/client';

/** Clés de tri de Radarr v5 et Sonarr v4 (en-têtes triables de leur interface). */
export const RADARR_SORT_KEYS: Record<ArrListSort, string> = {
  date: 'date',
  title: 'movieMetadata.sortTitle',
  source: 'sourceTitle',
  indexer: 'indexer',
};
export const SONARR_SORT_KEYS: Record<ArrListSort, string> = {
  date: 'date',
  title: 'series.sortTitle',
  source: 'sourceTitle',
  indexer: 'indexer',
};

export function upstreamSort(keys: Record<ArrListSort, string>, query: ArrListQuery): ArrSort {
  return { key: keys[query.sort], direction: query.dir === 'asc' ? 'ascending' : 'descending' };
}

/** Au-delà, la recherche est trop vague : les premiers titres trouvés suffisent. */
export const SEARCH_ID_LIMIT = 200;

/** Ids des titres qui contiennent la recherche (insensible à la casse et aux accents). */
export function idsMatching(
  entries: readonly { id: number | null; title: string }[],
  search: string,
): number[] {
  const ids: number[] = [];
  for (const entry of entries) {
    if (entry.id === null || !titleMatches(entry.title, search)) continue;
    ids.push(entry.id);
    if (ids.length >= SEARCH_ID_LIMIT) break;
  }
  return ids;
}

export interface Page<T> {
  records: T[];
  totalRecords: number;
  page: number;
  pageSize: number;
}

export function emptyPage<T>(page: number, pageSize: number): Page<T> {
  return { records: [], totalRecords: 0, page, pageSize };
}

/** Page `page` d'une liste déjà filtrée. */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const start = (page - 1) * pageSize;
  return {
    records: items.slice(start, start + pageSize),
    totalRecords: items.length,
    page,
    pageSize,
  };
}

/** Taille de la lecture complète du cutoff filtré. */
export const CUTOFF_FETCH_MAX = 2_000;
