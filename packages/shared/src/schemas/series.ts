// SPDX-License-Identifier: AGPL-3.0-or-later
// Formes normalisées des séries Sonarr (`SonarrClient::normalizeSeries`), de la
// file d'attente (`normalizeQueueRecords`) et du calendrier
// (`normalizeCalendarEntries`), que l'API renvoie au front (P3a).
//
// Écarts assumés : dates en ISO 8601 au lieu d'objets
// `DateTimeImmutable` (comme D83) ; le calendrier garde la date locale de
// diffusion (`airDate`, « AAAA-MM-JJ ») **et** l'instant
// (`airDateUtc`) ; images : `remoteUrl` seulement, jamais l'URL de l'instance.

import { z } from 'zod';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const SERIES_TYPES = ['standard', 'daily', 'anime'] as const;
export type SeriesType = (typeof SERIES_TYPES)[number];

/** Suivi des nouvelles saisons (`monitorNewItems`). */
export const MONITOR_NEW_ITEMS = ['all', 'none'] as const;

export const seasonSummarySchema = z.object({
  seasonNumber: z.number(),
  monitored: z.boolean(),
  episodeCount: z.number(),
  episodeFileCount: z.number(),
  totalEpisodeCount: z.number(),
  sizeOnDisk: z.number(),
  /** Pourcentage d'épisodes présents (arrondi), 0 sans épisode diffusé. */
  percent: z.number(),
});
export type SeasonSummary = z.infer<typeof seasonSummarySchema>;

export const seriesSchema = z.object({
  id: nullableNumber,
  tvdbId: nullableNumber,
  tmdbId: nullableNumber,
  imdbId: nullableString,
  title: z.string(),
  /** Titre de tri en minuscules (repli sur le titre). */
  sortTitle: z.string(),
  year: nullableNumber,
  overview: nullableString,
  /** URL distante (TheTVDB, TMDB…), jamais une URL de l'instance. */
  poster: nullableString,
  fanart: nullableString,
  banner: nullableString,
  /** `continuing`, `ended`, `upcoming`, `deleted` ou `unknown`. */
  status: z.string(),
  ended: z.boolean(),
  monitored: z.boolean(),
  seriesType: z.string(),
  seasonCount: z.number(),
  totalEpisodeCount: z.number(),
  /** Épisodes diffusés et suivis (base du pourcentage). */
  episodeCount: z.number(),
  episodeFileCount: z.number(),
  percent: z.number(),
  sizeOnDisk: z.number(),
  sizeGb: nullableNumber,
  runtime: nullableNumber,
  certification: nullableString,
  network: nullableString,
  airTime: nullableString,
  path: nullableString,
  qualityProfileId: nullableNumber,
  rootFolderPath: nullableString,
  seasonFolder: z.boolean(),
  monitorNewItems: z.string(),
  tags: z.array(z.number()),
  genres: z.array(z.string()),
  /** Note (sur 10) de la source de métadonnées. */
  ratings: nullableNumber,
  seasons: z.array(seasonSummarySchema),
  addedAt: nullableString,
  firstAired: nullableString,
  nextAiring: nullableString,
  previousAiring: nullableString,
  /** Titres alternatifs (résolution d'un torrent, P3d.4) ; absent s'il n'y en a pas. */
  alternateTitles: z.array(z.string()).optional(),
});
export type Series = z.infer<typeof seriesSchema>;

export const seriesQueueItemSchema = z.object({
  id: nullableNumber,
  seriesId: nullableNumber,
  /** Épisode concerné (un même téléchargement peut en couvrir plusieurs). */
  episodeId: nullableNumber,
  seriesTitle: z.string(),
  /** « S01E02 — Titre », ou le titre de la release sans épisode connu. */
  episode: z.string(),
  size: z.number(),
  sizeleft: z.number(),
  status: z.string(),
  trackedStatus: z.string(),
  trackedState: z.string(),
  quality: z.string(),
  protocol: z.string(),
  eta: nullableString,
  indexer: nullableString,
  downloadId: nullableString,
  outputPath: nullableString,
  downloadClient: nullableString,
  statusMessages: z.array(z.object({ title: z.string(), messages: z.array(z.string()) })),
});
export type SeriesQueueItem = z.infer<typeof seriesQueueItemSchema>;

export const calendarEpisodeSchema = z.object({
  id: nullableNumber,
  seriesId: nullableNumber,
  tvdbId: nullableNumber,
  tmdbId: nullableNumber,
  seriesTitle: z.string(),
  poster: nullableString,
  fanart: nullableString,
  season: z.number(),
  episode: z.number(),
  title: z.string(),
  overview: nullableString,
  /** Date locale de diffusion (« AAAA-MM-JJ »), celle des guides TV. */
  airDate: nullableString,
  /** Instant de diffusion (ISO 8601). */
  airDateUtc: nullableString,
  hasFile: z.boolean(),
  monitored: z.boolean(),
  runtime: nullableNumber,
  network: nullableString,
  genres: z.array(z.string()),
});
export type CalendarEpisode = z.infer<typeof calendarEpisodeSchema>;
