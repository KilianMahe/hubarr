// SPDX-License-Identifier: AGPL-3.0-or-later
// Critères des listes paginées des pages *arr (P5c.5, V5, V6) :
// historique et liste de blocage (tri par colonne, recherche par titre),
// cutoff (recherche par titre, profil de qualité). Lecture tolérante de la
// chaîne de requête : une valeur inconnue retombe sur le défaut. Les critères
// par défaut sont omis de l'URL.

import { firstQueryValue, oneOf, phpInt, type RawQueryValue } from './query-params';

export const ARR_LIST_KINDS = ['history', 'blocklist'] as const;
export type ArrListKind = (typeof ARR_LIST_KINDS)[number];

/** Colonnes triables par l'amont, par liste. */
export const ARR_LIST_SORTS = {
  history: ['date', 'title'],
  blocklist: ['date', 'title', 'source', 'indexer'],
} as const satisfies Record<ArrListKind, readonly string[]>;
export type ArrListSort = (typeof ARR_LIST_SORTS)[ArrListKind][number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** Longueur maximale d'une recherche par titre. */
export const ARR_LIST_SEARCH_MAX = 100;

export interface ArrListQuery {
  page: number;
  sort: ArrListSort;
  dir: SortDirection;
  /** Recherche sur le titre du film ou de la série ; vide : aucune. */
  q: string;
}

/** Tri par défaut : date décroissante (V5). */
export const DEFAULT_ARR_LIST_QUERY: ArrListQuery = { page: 1, sort: 'date', dir: 'desc', q: '' };

/** Sens par défaut d'une colonne : la date commence par la plus récente, le texte par A. */
export function defaultDirection(sort: ArrListSort): SortDirection {
  return sort === 'date' ? 'desc' : 'asc';
}

function searchOf(value: RawQueryValue): string {
  return (firstQueryValue(value) ?? '').trim().slice(0, ARR_LIST_SEARCH_MAX);
}

function pageOf(value: RawQueryValue): number {
  return Math.max(1, phpInt(firstQueryValue(value)));
}

export function arrListQueryFrom(
  kind: ArrListKind,
  raw: Record<string, RawQueryValue>,
): ArrListQuery {
  const sort = oneOf<ArrListSort>(ARR_LIST_SORTS[kind], firstQueryValue(raw.sort)) ?? 'date';
  return {
    page: pageOf(raw.page),
    sort,
    dir: oneOf(SORT_DIRECTIONS, firstQueryValue(raw.dir)) ?? defaultDirection(sort),
    q: searchOf(raw.q),
  };
}

/** Paramètres d'URL des critères, sans les valeurs par défaut. */
export function arrListParams(query: ArrListQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.page > 1) params.page = String(query.page);
  if (query.sort !== 'date') params.sort = query.sort;
  if (query.dir !== defaultDirection(query.sort)) params.dir = query.dir;
  if (query.q !== '') params.q = query.q;
  return params;
}

// ── Cutoff ──────────────────────────────────────────────────────────────────

export interface CutoffQuery {
  page: number;
  q: string;
  /** Profil de qualité (id) ; 0 : tous. */
  profile: number;
}

export const DEFAULT_CUTOFF_QUERY: CutoffQuery = { page: 1, q: '', profile: 0 };

export function cutoffQueryFrom(raw: Record<string, RawQueryValue>): CutoffQuery {
  return {
    page: pageOf(raw.page),
    q: searchOf(raw.q),
    profile: Math.max(0, phpInt(firstQueryValue(raw.profile))),
  };
}

export function cutoffParams(query: CutoffQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.page > 1) params.page = String(query.page);
  if (query.q !== '') params.q = query.q;
  if (query.profile > 0) params.profile = String(query.profile);
  return params;
}

/** Cutoff filtré ? Le serveur lit alors toute la liste avant de paginer. */
export function cutoffFiltered(query: CutoffQuery): boolean {
  return query.q !== '' || query.profile > 0;
}

// ── Recherche par titre ─────────────────────────────────────────────────────

/** Texte comparable : minuscules, sans accents ni espaces superflus. */
export function foldTitle(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Le titre contient-il la recherche (insensible à la casse et aux accents) ? */
export function titleMatches(title: string, search: string): boolean {
  const needle = foldTitle(search);
  return needle === '' || foldTitle(title).includes(needle);
}
