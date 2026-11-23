// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats des pages Radarr (P2.7) : file d'attente, manquants, cutoff,
// historique, liste de blocage, collections, système. Les listes paginées par
// Radarr gardent sa forme (`records`, `totalRecords`, `page`, `pageSize`).

import { z } from 'zod';
import { movieBlocklistItemSchema, movieHistoryItemSchema } from './movie-detail';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

/** Taille de page des listes de l'instance (comme l'original). */
export const RADARR_PAGE_SIZE = 50;

function paged<T extends z.ZodType>(item: T) {
  return z.object({
    records: z.array(item),
    totalRecords: z.number(),
    page: z.number(),
    pageSize: z.number(),
  });
}

export const missingMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  year: nullableNumber,
  status: z.string(),
  /** Nom du profil de qualité du film. */
  qualityProfile: nullableString,
  /** Sortie numérique, à défaut en salles (ISO 8601). */
  releaseDate: nullableString,
  poster: nullableString,
});
export type MissingMovie = z.infer<typeof missingMovieSchema>;
export const missingPageSchema = paged(missingMovieSchema);
export type MissingPage = z.infer<typeof missingPageSchema>;

export const cutoffMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  year: nullableNumber,
  /** Qualité actuelle du fichier (sous le seuil du profil). */
  quality: nullableString,
  inCinemas: nullableString,
  poster: nullableString,
});
export type CutoffMovie = z.infer<typeof cutoffMovieSchema>;
export const cutoffPageSchema = paged(cutoffMovieSchema);
export type CutoffPage = z.infer<typeof cutoffPageSchema>;

export const historyPageSchema = paged(movieHistoryItemSchema);
export type HistoryPage = z.infer<typeof historyPageSchema>;

/** Filtres de l'historique : types d'évènement numériques de Radarr. */
export const HISTORY_EVENT_FILTERS = [
  { value: '', key: 'media.films_history.event_all' },
  { value: '1', key: 'media.films_history.event_grabbed' },
  { value: '3', key: 'media.films_history.event_imported' },
  { value: '4', key: 'media.films_history.event_failed' },
  { value: '6', key: 'media.films_history.event_deleted' },
  { value: '8', key: 'media.films_history.event_renamed' },
] as const;

export const blocklistPageSchema = paged(movieBlocklistItemSchema);
export type BlocklistPage = z.infer<typeof blocklistPageSchema>;

export const idsRequestSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(10_000),
});
export type IdsRequest = z.infer<typeof idsRequestSchema>;

// ── File d'attente ──────────────────────────────────────────────────────────

export const queueDeleteRequestSchema = z.object({
  removeFromClient: z.boolean().default(false),
  blocklist: z.boolean().default(false),
  skipRedownload: z.boolean().default(false),
});
export type QueueDeleteRequest = z.input<typeof queueDeleteRequestSchema>;

// ── Collections ─────────────────────────────────────────────────────────────

export const collectionMovieSchema = z.object({
  tmdbId: nullableNumber,
  title: z.string(),
  year: nullableNumber,
  poster: nullableString,
  hasFile: z.boolean(),
  inLibrary: z.boolean(),
});
export type CollectionMovie = z.infer<typeof collectionMovieSchema>;

export const movieCollectionSchema = z.object({
  id: z.number(),
  tmdbId: nullableNumber,
  title: z.string(),
  overview: nullableString,
  poster: nullableString,
  monitored: z.boolean(),
  qualityProfileId: nullableNumber,
  rootFolderPath: nullableString,
  movies: z.array(collectionMovieSchema),
});
export type MovieCollection = z.infer<typeof movieCollectionSchema>;

export const collectionMonitorRequestSchema = z.object({ monitored: z.boolean().default(true) });
export const collectionMonitorResponseSchema = z.object({
  ok: z.literal(true),
  monitored: z.boolean(),
});

// ── Système ─────────────────────────────────────────────────────────────────

export const arrSystemResponseSchema = z.object({
  status: z
    .object({
      version: nullableString,
      osName: nullableString,
      osVersion: nullableString,
      runtimeVersion: nullableString,
      databaseVersion: nullableString,
      startTime: nullableString,
      urlBase: nullableString,
      isDocker: z.boolean().nullable(),
    })
    .nullable(),
  health: z
    .array(z.object({ type: z.string(), source: nullableString, message: nullableString }))
    .nullable(),
  diskSpace: z
    .array(
      z.object({
        path: nullableString,
        label: nullableString,
        freeSpace: z.number(),
        totalSpace: z.number(),
      }),
    )
    .nullable(),
  downloadClients: z
    .array(z.object({ name: z.string(), implementation: nullableString, enable: z.boolean() }))
    .nullable(),
  indexers: z
    .array(
      z.object({
        name: z.string(),
        enableRss: z.boolean(),
        enableAutomaticSearch: z.boolean(),
        enableInteractiveSearch: z.boolean(),
      }),
    )
    .nullable(),
  logs: z
    .array(
      z.object({
        time: nullableString,
        level: z.string(),
        message: nullableString,
        exception: nullableString,
      }),
    )
    .nullable(),
});
export type ArrSystemResponse = z.infer<typeof arrSystemResponseSchema>;
