// SPDX-License-Identifier: AGPL-3.0-or-later
// Appels de l'API de la découverte (`/api/decouverte/…`, P4.4) et aides
// d'affichage communes aux cartes TMDB (dashboard, découverte, recherche).

import {
  collectionSchema,
  collectionSearchSchema,
  discoverHomeSchema,
  folderSuggestionsSchema,
  genresResponseSchema,
  myRecommendationsSchema,
  personSchema,
  personSearchSchema,
  popularByYearSchema,
  resolvedMediaSchema,
  smartSearchSchema,
  tmdbDetailSchema,
  tmdbPageSchema,
  tmdbSuggestionsSchema,
  watchlistResponseSchema,
  watchlistStatusSchema,
  watchlistToggleResponseSchema,
  watchedSuggestionsSchema,
  POPULAR_YEAR_MIN,
  type DiscoverSection,
  type LibStatusValue,
  type TmdbMediaType,
  type WatchlistToggleRequest,
} from '@hubarr/shared';
import { z } from 'zod';
import { api } from '../../app/api/client';

const qs = (params: Record<string, string | number | boolean | undefined | null>) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false)
      .map(([k, v]) => [k, v === true ? '1' : String(v)]),
  ).toString();

export interface SmartSearchParams {
  q?: string | undefined;
  type?: 'all' | 'movie' | 'tv' | undefined;
  sort?: 'relevance' | 'popularity' | 'vote' | 'newest' | undefined;
  genre?: number | undefined;
  year_min?: number | undefined;
  year_max?: number | undefined;
  vote_min?: number | undefined;
  hide_owned?: boolean | undefined;
  exact?: boolean | undefined;
  /** Animés seulement (films et séries). */
  anime?: boolean | undefined;
  page?: number | undefined;
}

export interface ExplorerParams {
  type: TmdbMediaType;
  genres?: string;
  year_min?: number;
  year_max?: number;
  vote_min?: number;
  vote_count_min?: number;
  sort?: string;
  page?: number;
  /** Animés seulement, du type `type`. */
  anime?: boolean;
}

/** Titre dont la fiche est ouverte (`?detail=movie/603` dans l'URL de la page). */
export interface DetailTarget {
  type: TmdbMediaType;
  id: number;
}

/** `movie/603` → cible ; `null` si invalide. */
export function parseDetail(value: unknown): DetailTarget | null {
  const match = typeof value === 'string' ? /^(movie|tv)\/(\d+)$/.exec(value) : null;
  if (match?.[1] === undefined || match[2] === undefined) return null;
  return { type: match[1] as TmdbMediaType, id: Number(match[2]) };
}

export const discoverApi = {
  home: (signal?: AbortSignal) => api.get('/api/decouverte', discoverHomeSchema, signal),
  section: (type: DiscoverSection, page = 1, signal?: AbortSignal) =>
    api.get(`/api/decouverte/section/${type}?page=${page}`, tmdbPageSchema, signal),
  myRecommendations: (signal?: AbortSignal) =>
    api.get('/api/decouverte/mes-recommandations', myRecommendationsSchema, signal),
  folders: (signal?: AbortSignal) =>
    api.get('/api/decouverte/dossiers', folderSuggestionsSchema, signal),
  watched: (signal?: AbortSignal) =>
    api.get('/api/decouverte/regardes', watchedSuggestionsSchema, signal),
  popularByYear: (year: number, signal?: AbortSignal) =>
    api.get(`/api/decouverte/annee/${year}`, popularByYearSchema, signal),
  filter: (params: ExplorerParams, signal?: AbortSignal) =>
    api.get(`/api/decouverte/filter?${qs({ ...params })}`, tmdbPageSchema, signal),
  genres: (type: TmdbMediaType, signal?: AbortSignal) =>
    api.get(`/api/decouverte/genres/${type}`, genresResponseSchema, signal),
  resolve: (type: TmdbMediaType, id: number) =>
    api.get(`/api/decouverte/resolve/${type}/${id}`, resolvedMediaSchema),
  detail: (type: TmdbMediaType, id: number, signal?: AbortSignal) =>
    api.get(`/api/decouverte/detail/${type}/${id}`, tmdbDetailSchema, signal),
  suggestions: (type: TmdbMediaType, id: number, signal?: AbortSignal) =>
    api.get(`/api/decouverte/suggestions/${type}/${id}`, tmdbSuggestionsSchema, signal),
  smartSearch: (params: SmartSearchParams, signal?: AbortSignal) =>
    api.get(`/api/decouverte/recherche?${qs({ ...params })}`, smartSearchSchema, signal),
  collectionSearch: (q: string, signal?: AbortSignal) =>
    api.get(`/api/decouverte/collection/search?${qs({ q })}`, collectionSearchSchema, signal),
  collection: (id: number, signal?: AbortSignal) =>
    api.get(`/api/decouverte/collection/${id}`, collectionSchema, signal),
  personSearch: (q: string, signal?: AbortSignal) =>
    api.get(`/api/decouverte/person/search?${qs({ q })}`, personSearchSchema, signal),
  person: (id: number, signal?: AbortSignal) =>
    api.get(`/api/decouverte/person/${id}`, personSchema, signal),
  watchlist: (signal?: AbortSignal) =>
    api.get('/api/decouverte/watchlist', watchlistResponseSchema, signal),
  watchlistStatus: (signal?: AbortSignal) =>
    api.get('/api/decouverte/watchlist/status', watchlistStatusSchema, signal),
  watchlistToggle: (body: WatchlistToggleRequest) =>
    api.post('/api/decouverte/watchlist/toggle', body, watchlistToggleResponseSchema),
  watchlistNotes: (id: number, notes: string | null) =>
    api.post(`/api/decouverte/watchlist/notes/${id}`, { notes }, z.object({ ok: z.literal(true) })),
  watchlistRemove: (id: number) =>
    api.post(`/api/decouverte/watchlist/remove/${id}`, {}, z.object({ ok: z.literal(true) })),
};

export const discoverKeys = {
  all: ['discover'] as const,
  watchlistStatus: ['discover', 'watchlist-status'] as const,
  watchlist: ['discover', 'watchlist'] as const,
};

/** Couleur Vuetify d'un état en bibliothèque (badge des cartes). */
export function libStatusColor(status: LibStatusValue | null): string {
  switch (status) {
    case 'downloaded':
      return 'success';
    case 'partial':
      return 'info';
    case 'announced':
    case 'inCinemas':
      return 'warning';
    case 'unmonitored':
      return 'grey';
    case 'missing':
      return 'error';
    default:
      return 'success';
  }
}

/** Jours avant une sortie (badge « J-x »), `null` hors des 365 prochains jours. */
export function countdownDays(release: string | null, now = new Date()): number | null {
  if (release === null) return null;
  const at = Date.parse(release);
  if (Number.isNaN(at)) return null;
  const days = Math.ceil((at - now.getTime()) / 86_400_000);
  return days > 0 && days <= 365 ? days : null;
}

/** Années du sélecteur « Populaires en [année] » : de l'an prochain à la plus ancienne. */
export function popularYears(now = new Date(), min = POPULAR_YEAR_MIN): number[] {
  const years: number[] = [];
  for (let year = now.getFullYear() + 1; year >= min; year -= 1) years.push(year);
  return years;
}

/**
 * Bornes d'années de l'explorateur : une année précise l'emporte sur la
 * décennie (les deux s'excluent dans l'écran) ; aucune borne sans l'une ni
 * l'autre.
 */
export function explorerYearBounds(
  decade: number | null,
  year: number | null,
): Pick<ExplorerParams, 'year_min' | 'year_max'> {
  if (year !== null) return { year_min: year, year_max: year };
  if (decade !== null) return { year_min: decade, year_max: decade + 9 };
  return {};
}

/** Derniers titres consultés (page Découverte), dans le navigateur. */
export const RECENT_KEY = 'hubarr.tmdb-recent';
export const RECENT_MAX = 10;

/**
 * Sous-onglets de la page Découverte (lot 12), dans l'ordre des chips ; la
 * valeur est celle du paramètre `?onglet=` de l'URL.
 */
export const DISCOVER_TABS = ['pour-vous', 'tendances', 'mieux-notes', 'par-annee'] as const;
export type DiscoverTab = (typeof DISCOVER_TABS)[number];

/** Valeur de `?onglet=` → onglet ; `null` si absente ou inconnue. */
export function parseDiscoverTab(value: unknown): DiscoverTab | null {
  return typeof value === 'string' && (DISCOVER_TABS as readonly string[]).includes(value)
    ? (value as DiscoverTab)
    : null;
}

/**
 * Onglet affiché : celui de l'URL, sinon « Pour vous », sauf quand ce dernier
 * n'a rien à montrer (chargement terminé, aucune rangée) : « Tendances ».
 */
export function effectiveDiscoverTab(
  requested: DiscoverTab | null,
  forYou: { settled: boolean; empty: boolean },
): DiscoverTab {
  if (requested !== null) return requested;
  return forYou.settled && forYou.empty ? 'tendances' : 'pour-vous';
}
