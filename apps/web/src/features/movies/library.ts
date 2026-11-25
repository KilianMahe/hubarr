// SPDX-License-Identifier: AGPL-3.0-or-later
// Logique pure de la bibliothèque de films (P2.3) : critères ↔ URL, liens de
// pagination (`_library_pagination.html.twig`), statut affiché d'un film,
// étagères, sélection par plage, et lecture des messages de commande Radarr
// (JS inline de `films.html.twig`).

import {
  LIBRARY_VIEW_MODES,
  movieLibraryQueryParams,
  parseMovieLibraryQuery,
  type LibraryViewMode,
  type MovieLibraryItem,
  type MovieLibraryQuery,
} from '@hubarr/shared';
import type { LocationQuery, LocationQueryRaw } from 'vue-router';

// ── Critères ↔ URL ──────────────────────────────────────────────────────────

/** L'URL est la source de vérité des filtres (comme le formulaire GET d'origine). */
export function queryFromRoute(query: LocationQuery, defaultPerPage: number): MovieLibraryQuery {
  return parseMovieLibraryQuery(query, defaultPerPage);
}

/** Paramètres d'URL propres : valeurs par défaut retirées, page seulement au-delà de 1. */
export function routeQueryOf(
  query: MovieLibraryQuery,
  defaultPerPage: number,
  page = 1,
): LocationQueryRaw {
  const params: LocationQueryRaw = movieLibraryQueryParams(query, defaultPerPage);
  if (page > 1) params.page = String(page);
  return params;
}

/** Paramètres de l'API (page et lien profond compris). */
export function apiParamsOf(query: MovieLibraryQuery, open?: number): URLSearchParams {
  const params = new URLSearchParams(movieLibraryQueryParams(query, -1));
  if (query.page > 1) params.set('page', String(query.page));
  if (open !== undefined && open > 0) params.set('open', String(open));
  return params;
}

// ── Pagination ──────────────────────────────────────────────────────────────

export type PageLink = number | 'gap';

/**
 * « 1 2 … 5 6 7 … 12 » : première et dernière page, la page courante et
 * `windowSize` pages de chaque côté, des ellipses entre les deux.
 */
export function paginationLinks(page: number, last: number, windowSize = 2): PageLink[] {
  if (last <= 1) return [];
  const links: PageLink[] = [1];
  const start = Math.max(2, page - windowSize);
  const end = Math.min(last - 1, page + windowSize);
  if (start > 2) links.push('gap');
  for (let current = start; current <= end; current += 1) links.push(current);
  if (end < last - 1) links.push('gap');
  links.push(last);
  return links;
}

/** Bornes affichées « a – b sur n » (`null` : aucun résultat). */
export function pageRange(
  page: number,
  perPage: number,
  total: number,
): { first: number; last: number } | null {
  if (total === 0) return null;
  return { first: (page - 1) * perPage + 1, last: Math.min(page * perPage, total) };
}

/** Saut direct à une page : affiché à partir de 5 pages. */
export const PAGE_JUMP_MIN_PAGES = 5;

// ── Statut d'un film ────────────────────────────────────────────────────────

export type MovieDisplayStatus = 'downloaded' | 'unavailable' | 'missing' | 'unmonitored';

/** Pastille de la carte : téléchargé, suivi pas encore sorti, suivi manquant, non suivi. */
export function displayStatusOf(
  movie: Pick<MovieLibraryItem, 'hasFile' | 'monitored' | 'status'>,
): MovieDisplayStatus {
  if (movie.hasFile) return 'downloaded';
  if (movie.monitored && (movie.status === 'announced' || movie.status === 'inCinemas')) {
    return 'unavailable';
  }
  return movie.monitored ? 'missing' : 'unmonitored';
}

/** Couleur Vuetify de chaque statut. */
export const STATUS_COLORS: Record<MovieDisplayStatus, string> = {
  downloaded: 'success',
  unavailable: 'info',
  missing: 'warning',
  unmonitored: 'muted',
};

/** Puce de statut (texte court) : les films « indisponibles » restent « manquants ». */
export function statusLabelKey(status: MovieDisplayStatus): string {
  if (status === 'downloaded') return 'media.films.status.downloaded';
  if (status === 'unmonitored') return 'media.films.status.unmonitored';
  return 'media.films.status.missing';
}

// ── Étagères ────────────────────────────────────────────────────────────────

export type ShelfKey = 'downloaded' | 'missing' | 'unmonitored';
export const SHELF_KEYS: readonly ShelfKey[] = ['downloaded', 'missing', 'unmonitored'];

/** Films de la page groupés par étagère ; les étagères vides disparaissent. */
export function shelvesOf<M extends Pick<MovieLibraryItem, 'hasFile' | 'monitored'>>(
  items: readonly M[],
): { key: ShelfKey; items: M[] }[] {
  const groups: Record<ShelfKey, M[]> = { downloaded: [], missing: [], unmonitored: [] };
  for (const item of items) {
    if (item.hasFile) groups.downloaded.push(item);
    else if (item.monitored) groups.missing.push(item);
    else groups.unmonitored.push(item);
  }
  return SHELF_KEYS.filter((key) => groups[key].length > 0).map((key) => ({
    key,
    items: groups[key],
  }));
}

// ── Sélection ───────────────────────────────────────────────────────────────

/**
 * Clic en mode sélection : bascule l'élément ; Maj+clic sélectionne toute la
 * plage depuis le dernier élément cliqué. Renvoie la nouvelle sélection.
 */
export function toggleSelection(
  selected: ReadonlySet<number>,
  orderedIds: readonly number[],
  id: number,
  anchor: number | null,
  shift: boolean,
): Set<number> {
  const next = new Set(selected);
  const index = orderedIds.indexOf(id);
  const anchorIndex = anchor === null ? -1 : orderedIds.indexOf(anchor);
  if (shift && anchorIndex >= 0 && index >= 0) {
    const [from, to] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex];
    for (const rangeId of orderedIds.slice(from, to + 1)) next.add(rangeId);
    return next;
  }
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// ── Commandes Radarr ────────────────────────────────────────────────────────

/** Film en cours dans le message d'une recherche (« … for [Dune] »). */
export function searchedTitle(message: string): string | null {
  return /for\s+\[(.+?)\]/i.exec(message)?.[1] ?? null;
}

/** Téléchargements lancés d'après le message final (« 3 reports downloaded »). */
export function downloadedCount(message: string): number {
  const match = /(\d+)\s+reports?\s+(?:downloaded|grabbed)/i.exec(message);
  return match?.[1] === undefined ? 0 : Number.parseInt(match[1], 10);
}

export type CommandOutcome = 'completed' | 'failed' | 'running';

/** État d'une commande : terminée, en échec, ou encore en cours (`queued`, `started`…). */
export function commandOutcome(status: string): CommandOutcome {
  const normalized = status.toLowerCase();
  if (normalized === 'completed') return 'completed';
  if (normalized === 'failed' || normalized === 'aborted' || normalized === 'cancelled') {
    return 'failed';
  }
  return 'running';
}

// ── Vues ────────────────────────────────────────────────────────────────────

export const VIEW_MODES = LIBRARY_VIEW_MODES;
export type ViewMode = LibraryViewMode;

/**
 * Mode d'ouverture d'une bibliothèque : préférence du compte, ou `auto` (grille
 * sur grand écran, liste étendue sur mobile).
 */
export function initialViewMode(preference: ViewMode | 'auto', wide: boolean): ViewMode {
  if (preference !== 'auto') return preference;
  return wide ? 'grid' : 'extended';
}

// ── Utilitaires des actions par film ────────────────────────────────────────

/** Dernier segment d'un chemin (`a/b/c.mkv` → `c.mkv`), vide si absent. */
export function fileName(path: string | null): string {
  return (path ?? '').split('/').pop() ?? '';
}

/** `map` asynchrone avec au plus `limit` appels en parallèle, ordre conservé. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Téléchargements lancés d'après le message final, `null` s'il est illisible
 * (l'original n'annonçait « aucun résultat » que sur un « 0 reports » explicite).
 */
export function reportedDownloads(message: string): number | null {
  const match = /(\d+)\s+reports?\s+(?:downloaded|grabbed)/i.exec(message);
  return match?.[1] === undefined ? null : Number.parseInt(match[1], 10);
}

/** Commandes dont le suivi reprend au chargement de la page (`RADARR_POLL_CMDS`). */
export const TRACKED_COMMANDS: Record<string, string> = {
  MoviesSearch: 'media.films.warnings_cmd_search',
  MissingMoviesSearch: 'media.films.warnings_cmd_missing_search',
  RenameMovie: 'media.films.warnings_cmd_rename',
  ManualImport: 'media.films.warnings_cmd_import',
};
