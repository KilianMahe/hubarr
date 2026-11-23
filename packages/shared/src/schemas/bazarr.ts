// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats de l'API Bazarr (P3c.4) : pages (recherchés, films, séries,
// historique, épisodes d'une série), recherche et téléchargement de
// sous-titres, recherche automatique, état de l'index des sous-titres et
// badges des bibliothèques.

import { z } from 'zod';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

/** État d'un jeu de données de l'index : prêt, ou en cours de chargement. */
export const bazarrDatasetStateSchema = z.enum(['ready', 'warming']);

/**
 * Statut de sous-titres d'un film ou d'une série (badge) : `missing` porte le
 * nombre de sous-titres (film) ou d'épisodes (série) manquants ; `hidden` =
 * non suivi par Bazarr.
 */
export const BAZARR_STATUS_STATES = ['complete', 'missing', 'hidden'] as const;
export const bazarrStatusSchema = z.object({
  state: z.enum(BAZARR_STATUS_STATES),
  count: z.number(),
});
export type BazarrStatus = z.infer<typeof bazarrStatusSchema>;

/**
 * Badges d'une bibliothèque (Hubarr) : `hidden` quand Bazarr n'est pas lié à
 * une seule instance du service, `pending` tant que l'index n'est pas chargé.
 */
export const bazarrStatusMapSchema = z.object({
  state: z.enum(['ready', 'pending', 'hidden']),
  items: z.record(z.string(), bazarrStatusSchema),
});
export type BazarrStatusMap = z.infer<typeof bazarrStatusMapSchema>;

/** Langue d'un sous-titre (présent ou manquant). */
export const bazarrLangSchema = z.object({
  lang: z.string(),
  hi: z.boolean(),
  forced: z.boolean(),
});
export type BazarrLang = z.infer<typeof bazarrLangSchema>;

export const bazarrLangsSchema = z.object({
  present: z.array(bazarrLangSchema),
  missing: z.array(bazarrLangSchema),
});
export type BazarrLangs = z.infer<typeof bazarrLangsSchema>;

/** Langues d'un film (route n° 22) : non suivi → listes vides. */
export const bazarrMovieSubtitlesSchema = bazarrLangsSchema.extend({ tracked: z.boolean() });
export type BazarrMovieSubtitles = z.infer<typeof bazarrMovieSubtitlesSchema>;

/** Langues par épisode d'une série (route n° 23), clés = id d'épisode Sonarr. */
export const bazarrSeriesSubtitlesSchema = z.object({
  tracked: z.boolean(),
  episodes: z.record(z.string(), bazarrLangsSchema),
});
export type BazarrSeriesSubtitles = z.infer<typeof bazarrSeriesSubtitlesSchema>;

/** Compteurs de Bazarr (`/badges`). */
export const bazarrCountsSchema = z.object({
  movies: z.number(),
  episodes: z.number(),
  providers: z.number(),
});
export type BazarrCounts = z.infer<typeof bazarrCountsSchema>;

/** Élément de la rangée « les plus manquants ». */
export const bazarrMissingItemSchema = z.object({
  kind: z.enum(['movie', 'series']),
  id: z.number(),
  title: z.string(),
  year: nullableNumber,
  missingCount: z.number(),
  poster: nullableString,
});
export type BazarrMissingItem = z.infer<typeof bazarrMissingItemSchema>;

/** Page « Recherchés » (route n° 15). */
export const bazarrOverviewSchema = z.object({
  state: bazarrDatasetStateSchema,
  counts: bazarrCountsSchema,
  mostMissing: z.array(bazarrMissingItemSchema),
});
export type BazarrOverview = z.infer<typeof bazarrOverviewSchema>;

export const BAZARR_CARD_STATES = ['complete', 'missing', 'not-tracked'] as const;

/** Carte de la grille des films ou des séries. */
export const bazarrCardSchema = z.object({
  title: z.string(),
  year: nullableNumber,
  substate: z.enum(BAZARR_CARD_STATES),
  count: z.number(),
  missingLangs: z.array(z.string()),
  movieId: nullableNumber,
  seriesId: nullableNumber,
  poster: nullableString,
});
export type BazarrCard = z.infer<typeof bazarrCardSchema>;

/** Grille des films ou des séries (routes n° 16, 17). */
export const bazarrGridSchema = z.object({
  state: bazarrDatasetStateSchema,
  cards: z.array(bazarrCardSchema),
  languages: z.array(z.string()),
});
export type BazarrGrid = z.infer<typeof bazarrGridSchema>;

/** Entrée de l'historique des sous-titres. */
export const bazarrHistoryItemSchema = z.object({
  title: z.string(),
  action: nullableString,
  provider: nullableString,
  language: nullableString,
  date: nullableString,
});
export type BazarrHistoryItem = z.infer<typeof bazarrHistoryItemSchema>;

/** Historique (route n° 18) : une liste `null` = sa lecture a échoué. */
export const bazarrHistorySchema = z.object({
  movies: z.array(bazarrHistoryItemSchema).nullable(),
  episodes: z.array(bazarrHistoryItemSchema).nullable(),
});
export type BazarrHistory = z.infer<typeof bazarrHistorySchema>;

/** Épisode d'une série (route n° 19). */
export const bazarrEpisodeSchema = z.object({
  episodeId: nullableNumber,
  season: nullableNumber,
  episode: nullableNumber,
  title: nullableString,
  audioLanguages: z.array(z.string()),
  missing: z.number(),
  present: z.number(),
});
export type BazarrEpisode = z.infer<typeof bazarrEpisodeSchema>;

export const bazarrSeriesDetailSchema = z.object({
  seriesId: z.number(),
  title: nullableString,
  /** Série suivie par Bazarr ; `null` si elle n'a pas été retrouvée. */
  tracked: z.boolean().nullable(),
  episodes: z.array(bazarrEpisodeSchema),
});
export type BazarrSeriesDetail = z.infer<typeof bazarrSeriesDetailSchema>;

/** Résultat d'une recherche manuelle de sous-titres (routes n° 20, 21). */
export const bazarrSubtitleResultSchema = z.object({
  provider: z.string(),
  language: z.string(),
  hi: z.boolean(),
  forced: z.boolean(),
  originalFormat: z.boolean(),
  score: nullableNumber,
  release: z.string(),
  uploader: nullableString,
  /** Jeton de Bazarr à renvoyer pour le téléchargement. */
  subtitle: z.string(),
});
export type BazarrSubtitleResult = z.infer<typeof bazarrSubtitleResultSchema>;

export const bazarrSearchResponseSchema = z.object({
  results: z.array(bazarrSubtitleResultSchema),
});

const downloadBase = {
  hi: z.boolean().default(false),
  forced: z.boolean().default(false),
  originalFormat: z.boolean().default(false),
  provider: z.string().min(1),
  subtitle: z.string().min(1),
};

/** Téléchargement d'un sous-titre de film (route n° 24). */
export const bazarrDownloadMovieRequestSchema = z.object({
  radarrId: z.number().int().positive(),
  ...downloadBase,
});
export type BazarrDownloadMovieRequest = z.infer<typeof bazarrDownloadMovieRequestSchema>;

/** Téléchargement d'un sous-titre d'épisode (route n° 25) : Bazarr exige la série. */
export const bazarrDownloadEpisodeRequestSchema = z.object({
  seriesId: z.number().int().positive(),
  episodeId: z.number().int().positive(),
  ...downloadBase,
});
export type BazarrDownloadEpisodeRequest = z.infer<typeof bazarrDownloadEpisodeRequestSchema>;

export const BAZARR_FRESHNESS = ['fresh', 'stale', 'pending'] as const;

/** Reconstruction en ligne de l'index (route n° 28). */
export const bazarrRefreshSchema = z.object({
  ok: z.boolean(),
  movies: z.enum(BAZARR_FRESHNESS),
  series: z.enum(BAZARR_FRESHNESS),
  badges: z.enum(BAZARR_FRESHNESS),
  reason: z.enum(['breaker_open', 'fetch_failed', 'already_running']).nullable(),
});
export type BazarrRefresh = z.infer<typeof bazarrRefreshSchema>;
