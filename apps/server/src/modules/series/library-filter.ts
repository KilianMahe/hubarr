// SPDX-License-Identifier: AGPL-3.0-or-later
// Filtre, tri et pagination de la bibliothèque Sonarr normalisée : port de
// `SeriesLibraryFilter`. Fonctions pures.
//
// Sémantique propre à Sonarr : « en cours » et « terminées » comparent le
// statut de l'instance, « animés » le type de série, « manquants » = suivie,
// pas complète et au moins un épisode diffusé. Facettes : genres et chaînes,
// calculées sur la bibliothèque **non filtrée**.
//
// Écart (comme les films, D86) : le tri naturel insensible à la casse passe par
// `Intl.Collator` ; les accents se rangent avec leur lettre.

import type { SeriesLibraryQuery, SeriesLibrarySort } from '@hubarr/shared';

/** Champs de la série normalisée dont le filtre a besoin. */
export interface FilterableSeries {
  id: number | null;
  title: string;
  sortTitle: string;
  year: number | null;
  status: string;
  monitored: boolean;
  seriesType: string;
  episodeCount: number;
  percent: number;
  sizeOnDisk: number;
  sizeGb?: number | null;
  network: string | null;
  genres: readonly string[];
  addedAt: string | null;
}

export interface SeriesLibraryResult<S> {
  items: S[];
  total: number;
  libraryTotal: number;
  page: number;
  perPage: number;
  totalPages: number;
  unlimited: boolean;
  genres: string[];
  networks: string[];
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const natcasecmp = (a: string, b: string): number => collator.compare(a, b);

export function applySeriesLibraryFilter<S extends FilterableSeries>(
  series: readonly S[],
  query: SeriesLibraryQuery,
): SeriesLibraryResult<S> {
  const facets = collectFacets(series);
  const filtered = series.filter((entry) => matches(entry, query));
  filtered.sort((a, b) => compare(a, b, query.sort));
  const total = filtered.length;

  if (query.unlimited) {
    return {
      items: filtered,
      total,
      libraryTotal: series.length,
      page: 1,
      perPage: Math.max(1, total),
      totalPages: 1,
      unlimited: true,
      ...facets,
    };
  }

  const totalPages = total === 0 ? 1 : Math.ceil(total / query.perPage);
  const page = Math.min(query.page, totalPages);
  const offset = (page - 1) * query.perPage;
  return {
    items: filtered.slice(offset, offset + query.perPage),
    total,
    libraryTotal: series.length,
    page,
    perPage: query.perPage,
    totalPages,
    unlimited: false,
    ...facets,
  };
}

/** Page du filtre qui contient la série `seriesId` (lien profond `?open=`), ou `null`. */
export function pageOfSeries(
  series: readonly FilterableSeries[],
  query: SeriesLibraryQuery,
  seriesId: number,
): number | null {
  const full = applySeriesLibraryFilter(series, { ...query, page: 1, unlimited: true });
  const position = full.items.findIndex((entry) => entry.id === seriesId);
  return position < 0 ? null : Math.floor(position / query.perPage) + 1;
}

/** Suivie, incomplète et avec au moins un épisode diffusé (statut « manquants »). */
export function hasMissingEpisodes(
  entry: Pick<FilterableSeries, 'monitored' | 'percent' | 'episodeCount'>,
): boolean {
  return entry.monitored && entry.percent < 100 && entry.episodeCount > 0;
}

function collectFacets(series: readonly FilterableSeries[]): {
  genres: string[];
  networks: string[];
} {
  const genres = new Set<string>();
  const networks = new Set<string>();
  for (const entry of series) {
    for (const genre of entry.genres) if (genre !== '') genres.add(genre);
    if (entry.network !== null && entry.network !== '') networks.add(entry.network);
  }
  return {
    genres: [...genres].sort(natcasecmp),
    networks: [...networks].sort(natcasecmp),
  };
}

function matches(entry: FilterableSeries, query: SeriesLibraryQuery): boolean {
  if (query.q !== '') {
    const haystack = `${entry.title}|${entry.sortTitle}`.toLowerCase();
    if (!haystack.includes(query.q.toLowerCase())) return false;
  }

  switch (query.status) {
    case 'monitored':
      if (!entry.monitored) return false;
      break;
    case 'continuing':
      if (entry.status !== 'continuing') return false;
      break;
    case 'ended':
      if (entry.status !== 'ended') return false;
      break;
    case 'anime':
      if (entry.seriesType !== 'anime') return false;
      break;
    case 'unmonitored':
      if (entry.monitored) return false;
      break;
    case 'missing':
      if (!hasMissingEpisodes(entry)) return false;
      break;
    case 'all':
      break;
  }

  if (query.genre !== '' && !entry.genres.includes(query.genre)) return false;
  if (query.network !== '' && (entry.network ?? '') !== query.network) return false;
  return true;
}

/** Titre brut en minuscules (l'article reste en place : « The Wire » sous T), repli sur `sortTitle`. */
function titleSortKey(entry: FilterableSeries): string {
  return entry.title === '' ? entry.sortTitle : entry.title.toLowerCase();
}

function compare(a: FilterableSeries, b: FilterableSeries, sort: SeriesLibrarySort): number {
  switch (sort) {
    case 'title-asc':
      return natcasecmp(titleSortKey(a), titleSortKey(b));
    case 'title-desc':
      return natcasecmp(titleSortKey(b), titleSortKey(a));
    case 'year-desc':
      return (b.year ?? 0) - (a.year ?? 0);
    case 'year-asc':
      return (a.year ?? 0) - (b.year ?? 0);
    case 'added-desc': {
      // Dates ISO 8601 normalisées : l'ordre des chaînes est l'ordre chronologique.
      const left = b.addedAt ?? '';
      const right = a.addedAt ?? '';
      return left < right ? -1 : left > right ? 1 : 0;
    }
    case 'size-desc':
      return b.sizeOnDisk - a.sizeOnDisk;
    case 'size-asc':
      return a.sizeOnDisk - b.sizeOnDisk;
    case 'percent-desc':
      return b.percent - a.percent;
    case 'percent-asc':
      return a.percent - b.percent;
  }
}

/** Statistiques de la bibliothèque complète (bandeau de la page). */
export function seriesStats(series: readonly FilterableSeries[]): {
  total: number;
  continuing: number;
  ended: number;
  totalGb: number;
} {
  let continuing = 0;
  let ended = 0;
  let gigabytes = 0;
  for (const entry of series) {
    if (entry.status === 'continuing') continuing += 1;
    else if (entry.status === 'ended') ended += 1;
    gigabytes += entry.sizeGb ?? 0;
  }
  return { total: series.length, continuing, ended, totalGb: Math.round(gigabytes * 10) / 10 };
}
