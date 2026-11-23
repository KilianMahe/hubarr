// SPDX-License-Identifier: AGPL-3.0-or-later
// Formes normalisées des films Radarr (`RadarrClient::normalizeMovie`) et de la
// file d'attente (`normalizeQueueRecords`), que l'API renvoie au front (P2).
// Écart assumé : les dates (`addedAt`, `inCinemasAt`,
// `digitalAt`, `physicalAt`) sont des chaînes ISO 8601 au lieu d'objets
// `DateTimeImmutable` ; les autres clés sont celles de l'original.

import { z } from 'zod';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const movieMediaInfoSchema = z.object({
  videoCodec: nullableString,
  videoBitrate: nullableNumber,
  videoBitDepth: nullableNumber,
  videoFps: nullableNumber,
  videoDynamicRange: nullableString,
  resolution: nullableString,
  runTime: nullableString,
  audioCodec: nullableString,
  audioBitrate: nullableNumber,
  audioChannels: nullableNumber,
  subtitles: nullableString,
});
export type MovieMediaInfo = z.infer<typeof movieMediaInfoSchema>;

export const movieFileSummarySchema = z.object({
  size: nullableNumber,
  relativePath: nullableString,
  quality: nullableString,
  releaseGroup: nullableString,
  customFormats: z.array(z.string()),
  customFormatScore: z.number(),
  languages: z.array(z.string()),
  mediaInfo: movieMediaInfoSchema.nullable(),
});
export type MovieFileSummary = z.infer<typeof movieFileSummarySchema>;

export const movieSchema = z.object({
  id: nullableNumber,
  tmdbId: nullableNumber,
  imdbId: nullableString,
  title: z.string(),
  originalTitle: nullableString,
  /** Titre de tri en minuscules (repli sur le titre). */
  sortTitle: z.string(),
  year: nullableNumber,
  overview: nullableString,
  /** URL distante de l'affiche (TMDB), jamais une URL de l'instance. */
  poster: nullableString,
  fanart: nullableString,
  certification: nullableString,
  studio: nullableString,
  path: nullableString,
  status: z.string(),
  hasFile: z.boolean(),
  monitored: z.boolean(),
  quality: nullableString,
  qualityProfileId: nullableNumber,
  minimumAvailability: z.string(),
  alternateTitles: z.array(
    z.object({ title: z.string(), sourceType: z.string(), sourceId: nullableNumber }),
  ),
  rootFolderPath: nullableString,
  tags: z.array(z.number()),
  added: nullableString,
  language: nullableString,
  languages: z.array(z.string()),
  collection: z.object({ id: nullableNumber, title: nullableString }).nullable(),
  sizeOnDisk: z.number(),
  sizeGb: nullableNumber,
  addedAt: nullableString,
  inCinemasAt: nullableString,
  digitalAt: nullableString,
  physicalAt: nullableString,
  genres: z.array(z.string()),
  runtime: nullableNumber,
  ratings: nullableNumber,
  ratingsImdb: nullableNumber,
  ratingsImdbVotes: nullableNumber,
  ratingsTmdb: nullableNumber,
  ratingsTmdbVotes: nullableNumber,
  movieFile: movieFileSummarySchema.nullable(),
});
export type Movie = z.infer<typeof movieSchema>;

export const movieQueueItemSchema = z.object({
  id: nullableNumber,
  movieId: nullableNumber,
  title: z.string(),
  year: nullableNumber,
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
export type MovieQueueItem = z.infer<typeof movieQueueItemSchema>;
