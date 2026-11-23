// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats de la fiche série (`#modal-serie` de `series.html.twig`, P3a) :
// recherche des épisodes manquants, suivi, épisodes, fichiers, historique,
// releases, renommage, édition, suppression.
//
// Écart assumé (comme D88 pour les films) : l'original renvoyait
// les ressources brutes de Sonarr et laissait le navigateur reconstruire les
// objets à renvoyer (qualité avec révision, langues). Hubarr renvoie des formes
// réduites et c'est le serveur qui fusionne les modifications.

import { z } from 'zod';
import { arrNamedItemSchema, arrReleaseSchema } from './movie-detail';
import { MONITOR_NEW_ITEMS, SERIES_TYPES, seriesSchema } from './series';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

/**
 * Recherche des épisodes manquants d'une série (`serieSearch`) : saisons
 * entièrement manquantes en `SeasonSearch` (packs), le reste en un
 * `EpisodeSearch` groupé. `count` = épisodes manquants (0 : rien à chercher).
 */
export const seriesSearchResponseSchema = z.object({
  ok: z.literal(true),
  /** Première commande lancée (suivie par le front), `null` si rien n'est parti. */
  cmdId: nullableNumber,
  count: z.number(),
});
export type SeriesSearchResponse = z.infer<typeof seriesSearchResponseSchema>;

/** Fiche d'une série : la ressource normalisée, toujours avec un id. */
export const seriesDetailSchema = seriesSchema.extend({ id: z.number() });
export type SeriesDetail = z.infer<typeof seriesDetailSchema>;

// ── Épisodes ────────────────────────────────────────────────────────────────

export const episodeSchema = z.object({
  id: z.number(),
  seriesId: nullableNumber,
  seasonNumber: z.number(),
  episodeNumber: z.number(),
  title: nullableString,
  /** Date locale de diffusion (« AAAA-MM-JJ »). */
  airDate: nullableString,
  airDateUtc: nullableString,
  overview: nullableString,
  hasFile: z.boolean(),
  monitored: z.boolean(),
  /** 0 sans fichier, comme Sonarr. */
  episodeFileId: z.number(),
  runtime: nullableNumber,
});
export type Episode = z.infer<typeof episodeSchema>;

export const episodeMonitorRequestSchema = z.object({ monitored: z.boolean().default(true) });

export const episodeSearchRequestSchema = z.object({
  episodeIds: z.array(z.number().int().positive()).min(1).max(10_000),
});
export type EpisodeSearchRequest = z.infer<typeof episodeSearchRequestSchema>;

export const seasonMonitorRequestSchema = z.object({
  seriesId: z.number().int().positive(),
  seasonNumber: z.number().int().nonnegative(),
  monitored: z.boolean().default(true),
});
export type SeasonMonitorRequest = z.input<typeof seasonMonitorRequestSchema>;

// ── Fichiers ────────────────────────────────────────────────────────────────

/** Types de release d'un fichier d'épisode (gestionnaire de fichiers). */
export const RELEASE_TYPES = ['singleEpisode', 'multiEpisode', 'seasonPack'] as const;
export type ReleaseType = (typeof RELEASE_TYPES)[number];

/** Drapeaux d'indexeur proposés par le gestionnaire de fichiers (masque de bits de Sonarr). */
export const INDEXER_FLAGS = [
  { value: 0, label: null },
  { value: 1, label: 'G_Freeleech' },
  { value: 2, label: 'G_Halfleech' },
  { value: 4, label: 'G_DoubleUpload' },
  { value: 8, label: 'PTP_Golden' },
  { value: 16, label: 'PTP_Approved' },
  { value: 32, label: 'HDB_Internal' },
  { value: 64, label: 'AHD_Internal' },
  { value: 128, label: 'G_Scene' },
] as const;

export const episodeMediaInfoSchema = z.object({
  videoCodec: nullableString,
  videoBitDepth: nullableNumber,
  videoDynamicRange: nullableString,
  videoFps: nullableNumber,
  resolution: nullableString,
  runTime: nullableString,
  scanType: nullableString,
  audioCodec: nullableString,
  audioChannels: nullableNumber,
  audioLanguages: nullableString,
  subtitles: nullableString,
});
export type EpisodeMediaInfo = z.infer<typeof episodeMediaInfoSchema>;

export const episodeFileSchema = z.object({
  id: z.number(),
  seriesId: nullableNumber,
  seasonNumber: z.number(),
  relativePath: nullableString,
  path: nullableString,
  size: z.number(),
  dateAdded: nullableString,
  quality: arrNamedItemSchema.nullable(),
  /** Version de la qualité (v2 = repack…). */
  qualityVersion: z.number(),
  languages: z.array(arrNamedItemSchema),
  releaseGroup: nullableString,
  releaseType: nullableString,
  indexerFlags: z.number(),
  customFormats: z.array(z.string()),
  customFormatScore: z.number(),
  mediaInfo: episodeMediaInfoSchema.nullable(),
});
export type EpisodeFile = z.infer<typeof episodeFileSchema>;

/** Modification d'un fichier : seuls les champs présents changent (les `isset` de l'original). */
export const episodeFileUpdateRequestSchema = z.object({
  qualityId: z.number().int().nonnegative().optional(),
  languages: z
    .array(z.object({ id: z.number().int(), name: z.string().max(100) }))
    .min(1)
    .max(100)
    .optional(),
  releaseGroup: z.string().max(255).nullable().optional(),
  releaseType: z.enum(RELEASE_TYPES).optional(),
  indexerFlags: z.number().int().nonnegative().max(2_147_483_647).optional(),
});
export type EpisodeFileUpdateRequest = z.infer<typeof episodeFileUpdateRequestSchema>;

export const episodeFileUpdateResponseSchema = z.object({
  ok: z.literal(true),
  file: episodeFileSchema,
});

/** Mise à jour complète d'un fichier (`PUT /episodefile/bulk`), désigné dans le corps. */
export const episodeFilesBulkUpdateRequestSchema = episodeFileUpdateRequestSchema.extend({
  fileId: z.number().int().positive(),
});
export type EpisodeFilesBulkUpdateRequest = z.infer<typeof episodeFilesBulkUpdateRequestSchema>;

/** Réattribution d'un fichier à d'autres épisodes (commande `ManualImport`). */
export const episodeFileReassignRequestSchema = z.object({
  seriesId: z.number().int().positive(),
  episodeIds: z.array(z.number().int().positive()).min(1).max(1_000),
});
export type EpisodeFileReassignRequest = z.infer<typeof episodeFileReassignRequestSchema>;

// ── Historique ──────────────────────────────────────────────────────────────

/** Type d'évènement de Sonarr v4 (`grabbed`, `downloadFolderImported`…). */
export const seriesHistoryItemSchema = z.object({
  id: z.number(),
  seriesId: nullableNumber,
  episodeId: nullableNumber,
  eventType: z.string(),
  date: nullableString,
  quality: nullableString,
  sourceTitle: nullableString,
  /** Épisode concerné (`includeEpisode`). */
  episode: z
    .object({ seasonNumber: z.number(), episodeNumber: z.number(), title: nullableString })
    .nullable(),
  /** Série concernée (page d'historique de l'instance). */
  series: z.object({ title: z.string() }).nullable(),
  indexer: nullableString,
  releaseTitle: nullableString,
  importedPath: nullableString,
  downloadClient: nullableString,
  protocol: nullableString,
  reason: nullableString,
});
export type SeriesHistoryItem = z.infer<typeof seriesHistoryItemSchema>;

// ── Releases (recherche interactive) ────────────────────────────────────────

/**
 * Release d'une recherche d'épisode ou de saison : la forme commune aux films,
 * plus le découpage en saison et épisodes (l'étiquette est construite par le
 * front : « Saison 1 », « 1x02, 1x03 », numérotation TVDB).
 */
export const seriesReleaseSchema = arrReleaseSchema.extend({
  fullSeason: z.boolean(),
  episodeRequested: z.boolean(),
  seasonNumber: nullableNumber,
  episodeNumbers: z.array(z.number()),
  mappedSeasonNumber: nullableNumber,
  mappedEpisodeNumbers: z.array(z.number()),
  releaseGroup: z.string(),
});
export type SeriesRelease = z.infer<typeof seriesReleaseSchema>;

// ── Renommage ───────────────────────────────────────────────────────────────

export const seriesRenameProposalSchema = z.object({
  episodeFileId: nullableNumber,
  seasonNumber: z.number(),
  episodeNumbers: z.array(z.number()),
  existingPath: nullableString,
  newPath: nullableString,
});
export type SeriesRenameProposal = z.infer<typeof seriesRenameProposalSchema>;

/** Fichiers à renommer ; aucun = toute la série (`RenameSeries`). */
export const seriesRenameRequestSchema = z.object({
  fileIds: z.array(z.number().int().positive()).max(10_000).default([]),
});
export type SeriesRenameRequest = z.input<typeof seriesRenameRequestSchema>;

// ── Édition, suppression ────────────────────────────────────────────────────

/** Édition d'une série : seuls les champs présents changent. */
export const seriesEditRequestSchema = z.object({
  monitored: z.boolean().optional(),
  monitorNewItems: z.enum(MONITOR_NEW_ITEMS).optional(),
  seasonFolder: z.boolean().optional(),
  qualityProfileId: z.number().int().positive().optional(),
  seriesType: z.enum(SERIES_TYPES).optional(),
  rootFolderPath: z.string().trim().min(1).max(4096).optional(),
  path: z.string().trim().min(1).max(4096).optional(),
  tags: z.array(z.number().int().nonnegative()).max(1_000).optional(),
});
export type SeriesEditRequest = z.infer<typeof seriesEditRequestSchema>;

export const seriesEditResponseSchema = z.object({
  ok: z.literal(true),
  series: seriesDetailSchema,
});

export const seriesDeleteRequestSchema = z.object({
  deleteFiles: z.boolean().default(false),
  addImportExclusion: z.boolean().default(false),
});
export type SeriesDeleteRequest = z.input<typeof seriesDeleteRequestSchema>;
