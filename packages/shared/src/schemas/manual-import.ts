// SPDX-License-Identifier: AGPL-3.0-or-later
// Import manuel d'un téléchargement de la file d'attente (Radarr, Sonarr) :
// l'aperçu de l'instance (fichiers, correspondance proposée, qualité, langues,
// motifs de refus), puis l'import des fichiers choisis avec la correspondance
// corrigée. Les chemins envoyés doivent figurer dans l'aperçu du téléchargement.

import { z } from 'zod';
import { arrNamedItemSchema } from './movie-detail';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

const previewFileBase = {
  /** Chemin complet sur le serveur de l'instance (clé de l'import). */
  path: z.string(),
  /** Chemin relatif au téléchargement, pour l'affichage. */
  name: z.string(),
  size: z.number(),
  quality: arrNamedItemSchema.nullable(),
  languages: z.array(arrNamedItemSchema),
  releaseGroup: nullableString,
  /** Motifs de refus de l'import automatique (textes de l'instance). */
  rejections: z.array(z.string()),
};

export const movieManualImportFileSchema = z.object({
  ...previewFileBase,
  movie: z.object({ id: z.number(), title: z.string(), year: nullableNumber }).nullable(),
});
export type MovieManualImportFile = z.infer<typeof movieManualImportFileSchema>;

export const manualImportEpisodeSchema = z.object({
  id: z.number(),
  seasonNumber: z.number(),
  episodeNumber: z.number(),
  title: nullableString,
});
export type ManualImportEpisode = z.infer<typeof manualImportEpisodeSchema>;

export const episodeManualImportFileSchema = z.object({
  ...previewFileBase,
  series: z.object({ id: z.number(), title: z.string() }).nullable(),
  seasonNumber: nullableNumber,
  episodes: z.array(manualImportEpisodeSchema),
});
export type EpisodeManualImportFile = z.infer<typeof episodeManualImportFileSchema>;

export const movieManualImportPreviewSchema = z.object({
  files: z.array(movieManualImportFileSchema),
});
export type MovieManualImportPreview = z.infer<typeof movieManualImportPreviewSchema>;

export const episodeManualImportPreviewSchema = z.object({
  files: z.array(episodeManualImportFileSchema),
});
export type EpisodeManualImportPreview = z.infer<typeof episodeManualImportPreviewSchema>;

const importFileBase = {
  path: z.string().min(1).max(4_096),
  /** Id de la qualité (pas de la définition). */
  qualityId: z.number().int().nonnegative(),
  languages: z.array(arrNamedItemSchema).max(100),
  releaseGroup: z.string().max(255).nullable(),
};

export const movieManualImportRequestSchema = z.object({
  files: z
    .array(z.object({ ...importFileBase, movieId: z.number().int().positive() }))
    .min(1)
    .max(1_000),
});
export type MovieManualImportRequest = z.infer<typeof movieManualImportRequestSchema>;

export const episodeManualImportRequestSchema = z.object({
  files: z
    .array(
      z.object({
        ...importFileBase,
        seriesId: z.number().int().positive(),
        episodeIds: z.array(z.number().int().positive()).min(1).max(1_000),
      }),
    )
    .min(1)
    .max(1_000),
});
export type EpisodeManualImportRequest = z.infer<typeof episodeManualImportRequestSchema>;
