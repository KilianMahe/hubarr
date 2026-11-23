// SPDX-License-Identifier: AGPL-3.0-or-later
// Filtres des collections Radarr (P5c.5, V6), côté client : la
// liste est chargée en entier. Recherche sur le titre de la collection ou de
// l'un de ses films ; suivie, non suivie, ou avec des films manquants (absents
// ou sans fichier).

import { titleMatches, type MovieCollection } from '@hubarr/shared';

export const COLLECTION_FILTERS = ['all', 'monitored', 'unmonitored', 'missing'] as const;
export type CollectionFilter = (typeof COLLECTION_FILTERS)[number];

export function collectionFilterOf(value: unknown): CollectionFilter {
  return COLLECTION_FILTERS.find((filter) => filter === value) ?? 'all';
}

function passes(collection: MovieCollection, filter: CollectionFilter): boolean {
  switch (filter) {
    case 'monitored':
      return collection.monitored;
    case 'unmonitored':
      return !collection.monitored;
    case 'missing':
      return collection.movies.some((movie) => !movie.hasFile);
    default:
      return true;
  }
}

function matches(collection: MovieCollection, search: string): boolean {
  return (
    titleMatches(collection.title, search) ||
    collection.movies.some((movie) => titleMatches(movie.title, search))
  );
}

export function filterCollections(
  list: readonly MovieCollection[],
  search: string,
  filter: CollectionFilter,
): MovieCollection[] {
  return list.filter((collection) => passes(collection, filter) && matches(collection, search));
}

/** Nombre de collections par filtre (compteurs des puces), recherche appliquée. */
export function collectionFilterCounts(
  list: readonly MovieCollection[],
  search: string,
): Record<CollectionFilter, number> {
  const found = list.filter((collection) => matches(collection, search));
  return Object.fromEntries(
    COLLECTION_FILTERS.map((filter) => [filter, found.filter((c) => passes(c, filter)).length]),
  ) as Record<CollectionFilter, number>;
}
