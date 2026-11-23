// SPDX-License-Identifier: AGPL-3.0-or-later
// Filtre, tri et pagination de la bibliothèque Radarr normalisée : port de
// `MovieLibraryFilter` (issue #19 de Prismarr). Fonctions pures.
//
// Statut, recherche, qualité, genre et langue gardent la sémantique du JS de
// l'original, pour que les compteurs restent les mêmes. Les facettes (genres,
// qualités, langues) se calculent sur la bibliothèque **non filtrée** : un
// filtre réduit la liste, jamais les choix des menus.
//
// Écart : le tri naturel insensible à la casse (`strnatcasecmp`, `SORT_NATURAL |
// SORT_FLAG_CASE`) passe par `Intl.Collator` (`numeric`, sensibilité « base ») ;
// les accents se rangent avec leur lettre (« Étoile » sous E) au lieu d'après Z.

import type { MovieLibraryQuery, MovieLibrarySort } from '@hubarr/shared';

/** Champs du film normalisé dont le filtre a besoin. */
export interface FilterableMovie {
  id: number | null;
  title: string;
  sortTitle: string;
  year: number | null;
  added: string | null;
  sizeOnDisk: number;
  sizeGb?: number | null;
  hasFile: boolean;
  monitored: boolean;
  quality: string | null;
  genres: readonly string[];
  languages: readonly string[];
}

export interface MovieLibraryResult<M> {
  /** Page de films à afficher. */
  items: M[];
  /** Nombre après filtre, avant pagination. */
  total: number;
  /** Nombre de films de la bibliothèque non filtrée. */
  libraryTotal: number;
  page: number;
  perPage: number;
  totalPages: number;
  unlimited: boolean;
  genres: string[];
  qualities: string[];
  languages: string[];
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const natcasecmp = (a: string, b: string): number => collator.compare(a, b);

export function applyMovieLibraryFilter<M extends FilterableMovie>(
  movies: readonly M[],
  query: MovieLibraryQuery,
): MovieLibraryResult<M> {
  const facets = collectFacets(movies);
  const filtered = movies.filter((movie) => matches(movie, query));
  sortInPlace(filtered, query.sort);
  const total = filtered.length;

  if (query.unlimited) {
    return {
      items: filtered,
      total,
      libraryTotal: movies.length,
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
    libraryTotal: movies.length,
    page,
    perPage: query.perPage,
    totalPages,
    unlimited: false,
    ...facets,
  };
}

/**
 * Page du filtre qui contient le film `movieId` (lien profond `?open=`), ou
 * `null` s'il n'y figure pas.
 */
export function pageOfMovie(
  movies: readonly FilterableMovie[],
  query: MovieLibraryQuery,
  movieId: number,
): number | null {
  const full = applyMovieLibraryFilter(movies, { ...query, page: 1, unlimited: true });
  const position = full.items.findIndex((movie) => movie.id === movieId);
  return position < 0 ? null : Math.floor(position / query.perPage) + 1;
}

function sortedUnique(values: Set<string>): string[] {
  return [...values].sort(natcasecmp);
}

function collectFacets(movies: readonly FilterableMovie[]): {
  genres: string[];
  qualities: string[];
  languages: string[];
} {
  const genres = new Set<string>();
  const qualities = new Set<string>();
  const languages = new Set<string>();
  for (const movie of movies) {
    for (const genre of movie.genres) if (genre !== '') genres.add(genre);
    if (movie.quality !== null && movie.quality !== '') qualities.add(movie.quality);
    // `normalizeMovie` remplace un nom de langue absent par « — ».
    for (const language of movie.languages) {
      if (language !== '' && language !== '—') languages.add(language);
    }
  }
  return {
    genres: sortedUnique(genres),
    qualities: sortedUnique(qualities),
    languages: sortedUnique(languages),
  };
}

function matches(movie: FilterableMovie, query: MovieLibraryQuery): boolean {
  if (query.q !== '') {
    const haystack = `${movie.title}|${movie.sortTitle}`.toLowerCase();
    if (!haystack.includes(query.q.toLowerCase())) return false;
  }

  switch (query.status) {
    case 'monitored':
      if (!movie.monitored) return false;
      break;
    case 'downloaded':
      if (!movie.hasFile) return false;
      break;
    case 'missing':
      // Un film non suivi sans fichier n'est pas « manquant » : il est non suivi.
      if (movie.hasFile || !movie.monitored) return false;
      break;
    case 'unmonitored':
      if (movie.monitored) return false;
      break;
    case 'all':
      break;
  }

  if (query.quality !== '' && (movie.quality ?? '') !== query.quality) return false;
  if (query.genre !== '' && !movie.genres.includes(query.genre)) return false;
  // Parité : sous-chaîne sur chaque langue (« rench » trouve « French »).
  if (query.language !== '' && !movie.languages.some((lang) => lang.includes(query.language))) {
    return false;
  }
  return true;
}

/**
 * Clé du tri par titre : le titre brut en minuscules, et non `sortTitle`, que
 * Radarr peut priver de son article selon sa langue (« The Batman » reste sous T).
 */
function titleSortKey(movie: FilterableMovie): string {
  return movie.title === '' ? movie.sortTitle : movie.title.toLowerCase();
}

function compare(a: FilterableMovie, b: FilterableMovie, sort: MovieLibrarySort): number {
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
      const left = b.added ?? '';
      const right = a.added ?? '';
      return left < right ? -1 : left > right ? 1 : 0;
    }
    case 'size-desc':
      return b.sizeOnDisk - a.sizeOnDisk;
    case 'size-asc':
      return a.sizeOnDisk - b.sizeOnDisk;
  }
}

function sortInPlace(items: FilterableMovie[], sort: MovieLibrarySort): void {
  items.sort((a, b) => compare(a, b, sort));
}

/** Statistiques de la bibliothèque complète (bandeau de la page). */
export function libraryStats(movies: readonly FilterableMovie[]): {
  total: number;
  downloaded: number;
  waiting: number;
  totalGb: number;
} {
  let downloaded = 0;
  let waiting = 0;
  let gigabytes = 0;
  for (const movie of movies) {
    if (movie.hasFile) downloaded += 1;
    else if (movie.monitored) waiting += 1;
    gigabytes += movie.sizeGb ?? 0;
  }
  return {
    total: movies.length,
    downloaded,
    waiting,
    totalGb: Math.round(gigabytes * 10) / 10,
  };
}
