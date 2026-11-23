// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats de l'API Usenet (P3d.5) : SABnzbd et NZBGet partagent une forme de
// téléchargement et de file (`UsenetDownload`, `UsenetQueueSnapshot` de
// l'original), en `camelCase`.

import { z } from 'zod';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const USENET_CLIENTS = ['sabnzbd', 'nzbget'] as const;
export const usenetClientIdSchema = z.enum(USENET_CLIENTS);
export type UsenetClientId = z.infer<typeof usenetClientIdSchema>;

export function isUsenetClientId(value: unknown): value is UsenetClientId {
  return typeof value === 'string' && (USENET_CLIENTS as readonly string[]).includes(value);
}

/** États normalisés (`UsenetStatus`). */
export const USENET_STATUSES = [
  'downloading',
  'queued',
  'fetching',
  'paused',
  'verifying',
  'extracting',
  'moving',
  'completed',
  'failed',
  'unknown',
] as const;
export const usenetStatusSchema = z.enum(USENET_STATUSES);
export type UsenetStatus = z.infer<typeof usenetStatusSchema>;

export const usenetDownloadSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: usenetStatusSchema,
  /** Statut brut du client (info-bulle, motif d'échec NZBGet). */
  rawStatus: z.string(),
  size: z.number(),
  remaining: z.number(),
  /** 0 à 100, une décimale. */
  percentage: z.number(),
  category: z.string(),
  /** Secondes restantes, `null` si inconnu. */
  eta: nullableNumber,
  /** Octets/s (SABnzbd ne donne pas de vitesse par élément : 0). */
  speed: z.number(),
  fail: nullableString,
  history: z.boolean(),
  /** Attente (secondes) pendant la récupération d'un NZB depuis une URL. */
  wait: nullableNumber,
  /** Fin du téléchargement (secondes Unix), historique seulement. */
  completedAt: nullableNumber,
});
export type UsenetDownload = z.infer<typeof usenetDownloadSchema>;

export const usenetQueueSchema = z.object({
  paused: z.boolean(),
  speed: z.number(),
  /** Limite en octets/s, 0 = illimité. */
  speedLimit: z.number(),
  remaining: z.number(),
  active: z.number(),
  queued: z.number(),
  eta: nullableNumber,
  freeSpace: z.number(),
  items: z.array(usenetDownloadSchema),
});
export type UsenetQueue = z.infer<typeof usenetQueueSchema>;

/** Données de la page de la file (catégories, historique récent). */
export const usenetOverviewSchema = z.object({
  categories: z.array(z.string()),
  recentHistory: z.array(usenetDownloadSchema),
  historyTotal: z.number(),
});
export type UsenetOverview = z.infer<typeof usenetOverviewSchema>;

export const USENET_HISTORY_PAGE_SIZE = 50;

export const usenetHistorySchema = z.object({
  items: z.array(usenetDownloadSchema),
  page: z.number(),
  totalPages: z.number(),
  total: z.number(),
});
export type UsenetHistory = z.infer<typeof usenetHistorySchema>;

export const usenetPollSummarySchema = z.object({ active: z.number() });

export const usenetBulkRequestSchema = z.object({
  ids: z.array(z.union([z.string(), z.number()])).max(5_000),
});
export const usenetBulkResponseSchema = z.object({ ok: z.boolean(), count: z.number() });
export type UsenetBulkResponse = z.infer<typeof usenetBulkResponseSchema>;
export const usenetSpeedLimitRequestSchema = z.object({ mbps: z.number().nonnegative() });
export const usenetAddUrlRequestSchema = z.object({
  url: z.string().max(4_096),
  category: z.string().max(200).nullish(),
});
export const usenetAddFileRequestSchema = z.object({
  files: z
    .array(z.object({ name: z.string().max(255), content: z.string() }))
    .min(1)
    .max(50),
  category: z.string().max(200).nullish(),
});
