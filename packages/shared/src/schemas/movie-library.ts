// SPDX-License-Identifier: AGPL-3.0-or-later
// Bibliothèque de films Radarr (P2.3) : critères de filtre, de tri et de
// pagination (port de `MovieLibraryQuery`), réponse de la page, actions en masse,
// commandes et configuration de l'instance.
//
// La requête est partagée : le serveur l'analyse depuis la chaîne de requête,
// le front l'utilise pour construire une URL propre (valeurs par défaut retirées).

import { z } from 'zod';
import { movieSchema } from './movies';
import {
  firstQueryValue as first,
  oneOf,
  phpInt as toInt,
  symfonyBoolean as toBoolean,
  type RawQueryValue as RawValue,
} from './query-params';

// ── Critères ────────────────────────────────────────────────────────────────

/** Filtres de statut (parité avec le JS de l'original). */
export const MOVIE_LIBRARY_STATUSES = [
  'all',
  'monitored',
  'downloaded',
  'missing',
  'unmonitored',
] as const;
export type MovieLibraryStatus = (typeof MOVIE_LIBRARY_STATUSES)[number];

export const MOVIE_LIBRARY_SORTS = [
  'title-asc',
  'title-desc',
  'year-desc',
  'year-asc',
  'added-desc',
  'size-desc',
  'size-asc',
] as const;
export type MovieLibrarySort = (typeof MOVIE_LIBRARY_SORTS)[number];

export const LIBRARY_PER_PAGE = [50, 100, 200, 500] as const;
export const DEFAULT_LIBRARY_PER_PAGE = 200;

export interface MovieLibraryQuery {
  q: string;
  status: MovieLibraryStatus;
  quality: string;
  genre: string;
  language: string;
  sort: MovieLibrarySort;
  page: number;
  perPage: number;
  /** Sans pagination (actions sur tout le filtre). */
  unlimited: boolean;
}

export const DEFAULT_MOVIE_LIBRARY_QUERY: MovieLibraryQuery = {
  q: '',
  status: 'all',
  quality: '',
  genre: '',
  language: '',
  sort: 'title-asc',
  page: 1,
  perPage: DEFAULT_LIBRARY_PER_PAGE,
  unlimited: false,
};

export function isLibraryPerPage(value: number): boolean {
  return (LIBRARY_PER_PAGE as readonly number[]).includes(value);
}

/**
 * Critères depuis une chaîne de requête (`MovieLibraryQuery::fromRequest`) :
 * une valeur inconnue (statut, tri, taille de page) retombe sur le défaut,
 * plutôt que d'être refusée, pour qu'un lien ancien ou bricolé s'ouvre quand même.
 */
export function parseMovieLibraryQuery(
  raw: Record<string, RawValue>,
  defaultPerPage: number = DEFAULT_LIBRARY_PER_PAGE,
): MovieLibraryQuery {
  let status = oneOf(MOVIE_LIBRARY_STATUSES, first(raw.status)) ?? 'all';
  // Liens de la v1.0 de Prismarr (`?filter=`), lus seulement sans `?status=`.
  if (status === 'all' && raw.status === undefined && raw.filter !== undefined) {
    status = oneOf(MOVIE_LIBRARY_STATUSES, first(raw.filter)) ?? 'all';
  }

  const fallbackPerPage = isLibraryPerPage(defaultPerPage)
    ? defaultPerPage
    : DEFAULT_LIBRARY_PER_PAGE;
  const rawPerPage = first(raw.per_page);
  const perPage = rawPerPage === undefined ? fallbackPerPage : toInt(rawPerPage);

  return {
    q: (first(raw.q) ?? '').trim(),
    status,
    quality: (first(raw.quality) ?? '').trim(),
    genre: (first(raw.genre) ?? '').trim(),
    language: (first(raw.language) ?? '').trim(),
    sort: oneOf(MOVIE_LIBRARY_SORTS, first(raw.sort)) ?? 'title-asc',
    page: Math.max(1, toInt(first(raw.page) ?? '1')),
    perPage: isLibraryPerPage(perPage) ? perPage : fallbackPerPage,
    unlimited: toBoolean(first(raw.unlimited)),
  };
}

/** Filtre actif au-delà d'un tri ou d'une recherche : affiche les actions « filtrées ». */
export function hasActiveLibraryFilter(query: MovieLibraryQuery): boolean {
  return (
    query.status !== 'all' || query.quality !== '' || query.genre !== '' || query.language !== ''
  );
}

/** Nombre de critères modifiés (pastille du bouton « Filtres » sur mobile). */
export function libraryFilterCount(query: MovieLibraryQuery): number {
  return [
    query.status !== 'all',
    query.q !== '',
    query.quality !== '',
    query.genre !== '',
    query.language !== '',
    query.sort !== 'title-asc',
  ].filter(Boolean).length;
}

/** Même requête sans pagination : actions en masse sur tout le filtre. */
export function withoutPagination(query: MovieLibraryQuery): MovieLibraryQuery {
  return { ...query, page: 1, unlimited: true };
}

/**
 * Critères en chaîne de requête, sans les valeurs par défaut (`toQueryArray`) :
 * un formulaire vide donne une URL propre. La page n'y figure pas ; l'appelant
 * l'ajoute au besoin. `defaultPerPage` = taille de page des préférences.
 */
export function movieLibraryQueryParams(
  query: MovieLibraryQuery,
  defaultPerPage: number = DEFAULT_LIBRARY_PER_PAGE,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (query.q !== '') out.q = query.q;
  if (query.status !== 'all') out.status = query.status;
  if (query.quality !== '') out.quality = query.quality;
  if (query.genre !== '') out.genre = query.genre;
  if (query.language !== '') out.language = query.language;
  if (query.sort !== 'title-asc') out.sort = query.sort;
  if (query.perPage !== defaultPerPage) out.per_page = String(query.perPage);
  return out;
}

// ── Réponses ────────────────────────────────────────────────────────────────

/** Film tel que la liste l'affiche : sous-ensemble de `movieSchema`, id obligatoire. */
export const movieLibraryItemSchema = movieSchema
  .pick({
    tmdbId: true,
    imdbId: true,
    title: true,
    sortTitle: true,
    year: true,
    overview: true,
    poster: true,
    status: true,
    hasFile: true,
    monitored: true,
    quality: true,
    qualityProfileId: true,
    minimumAvailability: true,
    tags: true,
    added: true,
    sizeOnDisk: true,
    sizeGb: true,
    genres: true,
    runtime: true,
  })
  .extend({ id: z.number() });
export type MovieLibraryItem = z.infer<typeof movieLibraryItemSchema>;

export const movieLibraryQuerySchema = z.object({
  q: z.string(),
  status: z.enum(MOVIE_LIBRARY_STATUSES),
  quality: z.string(),
  genre: z.string(),
  language: z.string(),
  sort: z.enum(MOVIE_LIBRARY_SORTS),
  page: z.number(),
  perPage: z.number(),
  unlimited: z.boolean(),
});

export const movieLibraryResponseSchema = z.object({
  items: z.array(movieLibraryItemSchema),
  /** Nombre après filtre, avant pagination. */
  total: z.number(),
  /** Nombre de films de la bibliothèque non filtrée. */
  libraryTotal: z.number(),
  page: z.number(),
  perPage: z.number(),
  totalPages: z.number(),
  unlimited: z.boolean(),
  /** Valeurs des listes de filtre, sur toute la bibliothèque. */
  facets: z.object({
    genres: z.array(z.string()),
    qualities: z.array(z.string()),
    languages: z.array(z.string()),
  }),
  /** Statistiques de toute la bibliothèque (elles ne bougent pas avec le filtre). */
  stats: z.object({
    total: z.number(),
    downloaded: z.number(),
    /** Suivis sans fichier. */
    waiting: z.number(),
    totalGb: z.number(),
  }),
  /** Critères appliqués (page recalculée par `open`, taille de page par défaut). */
  query: movieLibraryQuerySchema,
});
export type MovieLibraryResponse = z.infer<typeof movieLibraryResponseSchema>;

/** Avertissement de l'instance ; le texte est construit par le front (clés i18n). */
export const libraryWarningSchema = z.discriminatedUnion('code', [
  z.object({ code: z.literal('no_indexer') }),
  z.object({ code: z.literal('health'), source: z.string(), message: z.string() }),
  z.object({ code: z.literal('import_blocked'), count: z.number() }),
]);
export type LibraryWarning = z.infer<typeof libraryWarningSchema>;

export const libraryWarningsResponseSchema = z.object({
  warnings: z.array(libraryWarningSchema),
  /** Indexeurs actifs (recherche automatique ou interactive). */
  indexerCount: z.number(),
});
export type LibraryWarningsResponse = z.infer<typeof libraryWarningsResponseSchema>;

export const filteredIdsResponseSchema = z.object({
  ids: z.array(z.number()),
  total: z.number(),
});
export type FilteredIdsResponse = z.infer<typeof filteredIdsResponseSchema>;

// ── Commandes ───────────────────────────────────────────────────────────────

export const commandStartedResponseSchema = z.object({
  ok: z.literal(true),
  cmdId: z.number().nullable(),
});
export type CommandStartedResponse = z.infer<typeof commandStartedResponseSchema>;

/** État d'une commande *arr (`unknown` : l'instance ne la connaît plus). */
export const arrCommandStatusSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
  message: z.string().nullable(),
  queued: z.string().nullable(),
  started: z.string().nullable(),
  ended: z.string().nullable(),
});
export type ArrCommandStatus = z.infer<typeof arrCommandStatusSchema>;

// ── Actions en masse ────────────────────────────────────────────────────────

const movieIds = z
  .array(z.number().int().positive())
  .min(1, { message: 'media.api.no_movies_selected' })
  .max(10_000);

export const movieIdsRequestSchema = z.object({ movieIds });
export type MovieIdsRequest = z.infer<typeof movieIdsRequestSchema>;

export const MINIMUM_AVAILABILITIES = ['announced', 'inCinemas', 'released'] as const;
export const APPLY_TAGS_MODES = ['add', 'remove', 'replace'] as const;
export type ApplyTagsMode = (typeof APPLY_TAGS_MODES)[number];

/** Éditeur de masse : seuls les champs présents sont modifiés. */
export const moviesBulkEditRequestSchema = z.object({
  movieIds,
  monitored: z.boolean().optional(),
  qualityProfileId: z.number().int().positive().optional(),
  minimumAvailability: z.enum(MINIMUM_AVAILABILITIES).optional(),
  rootFolderPath: z.string().trim().min(1).max(4096).optional(),
  tags: z.array(z.number().int().nonnegative()).max(1_000).optional(),
  applyTags: z.enum(APPLY_TAGS_MODES).optional(),
});
export type MoviesBulkEditRequest = z.infer<typeof moviesBulkEditRequestSchema>;

export const moviesBulkDeleteRequestSchema = z.object({
  movieIds,
  deleteFiles: z.boolean().default(false),
  addImportExclusion: z.boolean().default(false),
});
export type MoviesBulkDeleteRequest = z.input<typeof moviesBulkDeleteRequestSchema>;

// ── Configuration de l'instance ─────────────────────────────────────────────

export const qualityProfileSummarySchema = z.object({ id: z.number(), name: z.string() });
export type QualityProfileSummary = z.infer<typeof qualityProfileSummarySchema>;

export const rootFolderSummarySchema = z.object({
  id: z.number(),
  path: z.string(),
  accessible: z.boolean(),
  freeSpace: z.number().nullable(),
});
export type RootFolderSummary = z.infer<typeof rootFolderSummarySchema>;

export const arrTagSchema = z.object({ id: z.number(), label: z.string() });
export type ArrTag = z.infer<typeof arrTagSchema>;

export const arrConfigResponseSchema = z.object({
  qualityProfiles: z.array(qualityProfileSummarySchema),
  rootFolders: z.array(rootFolderSummarySchema),
  tags: z.array(arrTagSchema),
  /** Profil préféré de l'instance (ajout) ; `null` : le premier de la liste. */
  defaultQualityProfileId: z.number().nullable(),
});
export type ArrConfigResponse = z.infer<typeof arrConfigResponseSchema>;
