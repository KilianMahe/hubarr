// SPDX-License-Identifier: AGPL-3.0-or-later
// Bibliothèque de séries Sonarr (P3a.1) : critères de filtre, de tri et de
// pagination (port de `SeriesLibraryQuery`), réponse de la page, actions en
// masse, ajout.
//
// Comme pour les films (`movie-library.ts`), la requête est partagée : le
// serveur l'analyse depuis la chaîne de requête, le front en tire une URL
// propre. Différences avec les films : 7 statuts (dont « en cours »,
// « terminées », « animés » et « épisodes manquants »), chaîne au lieu de
// qualité et de langue, tri par progression.

import { z } from 'zod';
import {
  APPLY_TAGS_MODES,
  DEFAULT_LIBRARY_PER_PAGE,
  isLibraryPerPage,
  libraryWarningSchema,
} from './movie-library';
import {
  firstQueryValue as first,
  oneOf,
  phpInt,
  symfonyBoolean,
  type RawQueryValue,
} from './query-params';
import { SERIES_TYPES, calendarEpisodeSchema, seriesSchema } from './series';

// ── Critères ────────────────────────────────────────────────────────────────

/** Filtres de statut (parité avec le JS de l'original). */
export const SERIES_LIBRARY_STATUSES = [
  'all',
  'monitored',
  'continuing',
  'ended',
  'anime',
  'unmonitored',
  'missing',
] as const;
export type SeriesLibraryStatus = (typeof SERIES_LIBRARY_STATUSES)[number];

export const SERIES_LIBRARY_SORTS = [
  'title-asc',
  'title-desc',
  'year-desc',
  'year-asc',
  'added-desc',
  'size-desc',
  'size-asc',
  'percent-desc',
  'percent-asc',
] as const;
export type SeriesLibrarySort = (typeof SERIES_LIBRARY_SORTS)[number];

export interface SeriesLibraryQuery {
  q: string;
  status: SeriesLibraryStatus;
  genre: string;
  network: string;
  sort: SeriesLibrarySort;
  page: number;
  perPage: number;
  /** Sans pagination (actions sur tout le filtre). */
  unlimited: boolean;
}

export const DEFAULT_SERIES_LIBRARY_QUERY: SeriesLibraryQuery = {
  q: '',
  status: 'all',
  genre: '',
  network: '',
  sort: 'title-asc',
  page: 1,
  perPage: DEFAULT_LIBRARY_PER_PAGE,
  unlimited: false,
};

/** Critères depuis une chaîne de requête (`SeriesLibraryQuery::fromRequest`). */
export function parseSeriesLibraryQuery(
  raw: Record<string, RawQueryValue>,
  defaultPerPage: number = DEFAULT_LIBRARY_PER_PAGE,
): SeriesLibraryQuery {
  let status = oneOf(SERIES_LIBRARY_STATUSES, first(raw.status)) ?? 'all';
  // Liens de la v1.0 de Prismarr (`?filter=`), lus seulement sans `?status=`.
  if (status === 'all' && raw.status === undefined && raw.filter !== undefined) {
    status = oneOf(SERIES_LIBRARY_STATUSES, first(raw.filter)) ?? 'all';
  }
  const fallbackPerPage = isLibraryPerPage(defaultPerPage)
    ? defaultPerPage
    : DEFAULT_LIBRARY_PER_PAGE;
  const rawPerPage = first(raw.per_page);
  const perPage = rawPerPage === undefined ? fallbackPerPage : phpInt(rawPerPage);

  return {
    q: (first(raw.q) ?? '').trim(),
    status,
    genre: (first(raw.genre) ?? '').trim(),
    network: (first(raw.network) ?? '').trim(),
    sort: oneOf(SERIES_LIBRARY_SORTS, first(raw.sort)) ?? 'title-asc',
    page: Math.max(1, phpInt(first(raw.page) ?? '1')),
    perPage: isLibraryPerPage(perPage) ? perPage : fallbackPerPage,
    unlimited: symfonyBoolean(first(raw.unlimited)),
  };
}

/** Filtre actif au-delà d'un tri ou d'une recherche : affiche les actions « filtrées ». */
export function hasActiveSeriesFilter(query: SeriesLibraryQuery): boolean {
  return query.status !== 'all' || query.genre !== '' || query.network !== '';
}

/** Nombre de critères modifiés (pastille du bouton « Filtres » sur mobile). */
export function seriesFilterCount(query: SeriesLibraryQuery): number {
  return [
    query.status !== 'all',
    query.q !== '',
    query.genre !== '',
    query.network !== '',
    query.sort !== 'title-asc',
  ].filter(Boolean).length;
}

export function seriesWithoutPagination(query: SeriesLibraryQuery): SeriesLibraryQuery {
  return { ...query, page: 1, unlimited: true };
}

/** Critères en chaîne de requête, sans les valeurs par défaut (`toQueryArray`). */
export function seriesLibraryQueryParams(
  query: SeriesLibraryQuery,
  defaultPerPage: number = DEFAULT_LIBRARY_PER_PAGE,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (query.q !== '') out.q = query.q;
  if (query.status !== 'all') out.status = query.status;
  if (query.genre !== '') out.genre = query.genre;
  if (query.network !== '') out.network = query.network;
  if (query.sort !== 'title-asc') out.sort = query.sort;
  if (query.perPage !== defaultPerPage) out.per_page = String(query.perPage);
  return out;
}

// ── Réponses ────────────────────────────────────────────────────────────────

/** Série telle que la liste l'affiche : sous-ensemble de `seriesSchema`, id obligatoire. */
export const seriesLibraryItemSchema = seriesSchema
  .pick({
    tvdbId: true,
    title: true,
    sortTitle: true,
    year: true,
    overview: true,
    poster: true,
    status: true,
    ended: true,
    monitored: true,
    seriesType: true,
    seasonCount: true,
    totalEpisodeCount: true,
    episodeCount: true,
    episodeFileCount: true,
    percent: true,
    sizeOnDisk: true,
    sizeGb: true,
    network: true,
    genres: true,
    runtime: true,
    qualityProfileId: true,
    tags: true,
    addedAt: true,
    nextAiring: true,
  })
  .extend({ id: z.number() });
export type SeriesLibraryItem = z.infer<typeof seriesLibraryItemSchema>;

export const seriesLibraryQuerySchema = z.object({
  q: z.string(),
  status: z.enum(SERIES_LIBRARY_STATUSES),
  genre: z.string(),
  network: z.string(),
  sort: z.enum(SERIES_LIBRARY_SORTS),
  page: z.number(),
  perPage: z.number(),
  unlimited: z.boolean(),
});

export const seriesLibraryResponseSchema = z.object({
  items: z.array(seriesLibraryItemSchema),
  total: z.number(),
  libraryTotal: z.number(),
  page: z.number(),
  perPage: z.number(),
  totalPages: z.number(),
  unlimited: z.boolean(),
  facets: z.object({ genres: z.array(z.string()), networks: z.array(z.string()) }),
  /** Statistiques de toute la bibliothèque. */
  stats: z.object({
    total: z.number(),
    continuing: z.number(),
    ended: z.number(),
    totalGb: z.number(),
  }),
  query: seriesLibraryQuerySchema,
  /** Épisodes des 14 prochains jours (carte « Prochains épisodes »). */
  calendar: z.array(calendarEpisodeSchema),
  /** Profil préféré de l'instance (dialogue d'ajout) ; `null` : le premier. */
  defaultQualityProfileId: z.number().nullable(),
});
export type SeriesLibraryResponse = z.infer<typeof seriesLibraryResponseSchema>;

/** Avertissements de l'instance (santé, imports bloqués) ; pas de compte d'indexeurs. */
export const seriesWarningsResponseSchema = z.object({ warnings: z.array(libraryWarningSchema) });
export type SeriesWarningsResponse = z.infer<typeof seriesWarningsResponseSchema>;

// ── Actions en masse ────────────────────────────────────────────────────────

const seriesIds = z
  .array(z.number().int().positive())
  .min(1, { message: 'media.api.no_series' })
  .max(10_000);

export const seriesIdsRequestSchema = z.object({ seriesIds });

/** Éditeur de masse (`PUT /series/editor`) : seuls les champs présents sont modifiés. */
export const seriesBulkEditRequestSchema = z.object({
  seriesIds,
  monitored: z.boolean().optional(),
  qualityProfileId: z.number().int().positive().optional(),
  seriesType: z.enum(SERIES_TYPES).optional(),
  seasonFolder: z.boolean().optional(),
  rootFolderPath: z.string().trim().min(1).max(4096).optional(),
  tags: z.array(z.number().int().nonnegative()).max(1_000).optional(),
  applyTags: z.enum(APPLY_TAGS_MODES).optional(),
});
export type SeriesBulkEditRequest = z.infer<typeof seriesBulkEditRequestSchema>;

export const seriesBulkDeleteRequestSchema = z.object({
  seriesIds,
  deleteFiles: z.boolean().default(false),
  addImportExclusion: z.boolean().default(false),
});
export type SeriesBulkDeleteRequest = z.input<typeof seriesBulkDeleteRequestSchema>;

// ── Ajout ───────────────────────────────────────────────────────────────────

/** Épisodes suivis à l'ajout (`addOptions.monitor`). */
export const SERIES_ADD_MONITOR = [
  'all',
  'future',
  'missing',
  'firstSeason',
  'lastSeason',
  'none',
] as const;

/** Série proposée par la recherche (`lookup`) : `id` non nul = déjà dans Sonarr. */
export const seriesLookupSchema = seriesSchema;

/** Ajout d'une série ; profil absent ou 0 → profil par défaut de l'instance (issue #5). */
export const seriesAddRequestSchema = z.object({
  tvdbId: z.number().int().positive(),
  qualityProfileId: z.number().int().nonnegative().default(0),
  rootFolderPath: z
    .string()
    .trim()
    .min(1, { message: 'media.series.add.pick_root_folder' })
    .max(4096),
  monitored: z.boolean().default(true),
  seasonFolder: z.boolean().default(true),
  seriesType: z.enum(SERIES_TYPES).optional(),
  monitor: z.enum(SERIES_ADD_MONITOR).default('all'),
  searchForMissing: z.boolean().default(false),
  tags: z.array(z.number().int().nonnegative()).max(1_000).optional(),
});
export type SeriesAddRequest = z.input<typeof seriesAddRequestSchema>;

export const seriesAddResponseSchema = z.object({ ok: z.literal(true), series: seriesSchema });

/** Import par lot (`POST /series/import`) : ressources Sonarr complètes, transmises telles quelles. */
export const seriesImportBatchRequestSchema = z
  .array(z.record(z.string(), z.unknown()))
  .min(1, { message: 'media.api.no_series' })
  .max(1_000);
