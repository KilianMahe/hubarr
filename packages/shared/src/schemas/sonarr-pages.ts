// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats des pages Sonarr (P3a.3) : manquants, cutoff, historique, liste de
// blocage, file d'attente (import des téléchargements bloqués), import par lot.
// Les listes paginées par Sonarr gardent sa forme (`records`, `totalRecords`,
// `page`, `pageSize`), comme les pages Radarr ; le système reprend
// `arrSystemResponseSchema`.

import { z } from 'zod';
import { seriesHistoryItemSchema } from './series-detail';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

/** Taille de page des listes de l'instance (comme l'original). */
export const SONARR_PAGE_SIZE = 50;

function paged<T extends z.ZodType>(item: T) {
  return z.object({
    records: z.array(item),
    totalRecords: z.number(),
    page: z.number(),
    pageSize: z.number(),
  });
}

/** Épisode manquant (suivi, diffusé, sans fichier). */
export const wantedEpisodeSchema = z.object({
  id: z.number(),
  seriesId: nullableNumber,
  seriesTitle: z.string(),
  seasonNumber: z.number(),
  episodeNumber: z.number(),
  title: nullableString,
  /** Date locale de diffusion (« AAAA-MM-JJ »). */
  airDate: nullableString,
  airDateUtc: nullableString,
  /** Qualité du fichier actuel (cutoff seulement). */
  quality: nullableString,
});
export type WantedEpisode = z.infer<typeof wantedEpisodeSchema>;
export const wantedEpisodePageSchema = paged(wantedEpisodeSchema);
export type WantedEpisodePage = z.infer<typeof wantedEpisodePageSchema>;

export const seriesHistoryPageSchema = paged(seriesHistoryItemSchema);
export type SeriesHistoryPage = z.infer<typeof seriesHistoryPageSchema>;

export const seriesBlocklistItemSchema = z.object({
  id: z.number(),
  seriesId: nullableNumber,
  seriesTitle: nullableString,
  sourceTitle: nullableString,
  quality: nullableString,
  date: nullableString,
  protocol: nullableString,
  indexer: nullableString,
  message: nullableString,
  languages: z.array(z.string()),
});
export type SeriesBlocklistItem = z.infer<typeof seriesBlocklistItemSchema>;
export const seriesBlocklistPageSchema = paged(seriesBlocklistItemSchema);
export type SeriesBlocklistPage = z.infer<typeof seriesBlocklistPageSchema>;

// ── File d'attente ──────────────────────────────────────────────────────────

/** Import des téléchargements bloqués : dossier de sortie et/ou identifiant du téléchargement. */
export const queueImportRequestSchema = z.object({
  items: z
    .array(
      z.object({
        path: z.string().max(4096).default(''),
        downloadId: z.string().max(255).default(''),
      }),
    )
    .max(1_000)
    .refine(
      (items) => items.some((item) => item.path.trim() !== '' || item.downloadId.trim() !== ''),
      {
        message: 'media.api.no_file',
      },
    ),
});
export type QueueImportRequest = z.input<typeof queueImportRequestSchema>;

/**
 * Bilan de l'import (`manualImportFromQueueItems`) : `ok` faux quand rien
 * n'est parti ; `reasons` donne une raison par fichier ignoré (texte de Sonarr).
 */
export const queueImportResponseSchema = z.object({
  ok: z.boolean(),
  cmdId: nullableNumber,
  imported: z.number(),
  skipped: z.number(),
  reasons: z.array(z.string()),
});
export type QueueImportResponse = z.infer<typeof queueImportResponseSchema>;
