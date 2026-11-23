// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats de l'API Prowlarr (P3c) : page des indexeurs (`/api/prowlarr`),
// indexeurs normalisés, statistiques, catégories, actions groupées, test
// global, historique d'un indexeur, profils d'application, étiquettes et
// commandes.
//
// Un indexeur brut (`GET /api/prowlarr/indexer/:id`, modèles `/schema`) est
// une ressource à schéma dynamique, décrite par `providerSchema` (D97) : ses
// secrets sont masqués par le serveur (`ARR_SECRET_MASK`).

import { z } from 'zod';
import { APPLY_TAGS_MODES } from './movie-library';

const nullableString = z.string().nullable();

/** Protocole d'un indexeur (`DownloadProtocol` de Prowlarr). */
export const PROWLARR_PROTOCOLS = ['torrent', 'usenet', 'unknown'] as const;
/** Confidentialité d'un indexeur (`IndexerPrivacy`). */
export const PROWLARR_PRIVACIES = ['public', 'semiPrivate', 'private'] as const;

/** Filtre de la liste des indexeurs (sélecteur de l'original). */
export const PROWLARR_INDEXER_FILTERS = [
  'all',
  'enabled',
  'disabled',
  'torrent',
  'usenet',
] as const;
export type ProwlarrIndexerFilter = (typeof PROWLARR_INDEXER_FILTERS)[number];

/** Compteurs d'un indexeur tirés de `/indexerstats` (colonnes de la liste). */
export const prowlarrIndexerCountersSchema = z.object({
  queries: z.number(),
  grabs: z.number(),
  /** Requêtes et grabs en échec, additionnés comme l'original. */
  failures: z.number(),
});

/** Échec récent d'un indexeur (`/indexerstatus`). */
export const prowlarrIndexerStatusSchema = z.object({
  disabledTill: nullableString,
  mostRecentFailure: nullableString,
});

/** Indexeur de la liste (`normalizeIndexer` de l'original, réduit à ce qui s'affiche). */
export const prowlarrIndexerSchema = z.object({
  id: z.number(),
  name: z.string(),
  definitionName: nullableString,
  description: nullableString,
  language: nullableString,
  protocol: z.string(),
  privacy: nullableString,
  enabled: z.boolean(),
  supportsRss: z.boolean(),
  supportsSearch: z.boolean(),
  appProfileId: z.number().nullable(),
  priority: z.number(),
  tags: z.array(z.number()),
  added: nullableString,
  /** Catégories de premier niveau annoncées par l'indexeur. */
  categoryCount: z.number(),
  /** Échec en cours, `null` si l'indexeur n'en a pas. */
  status: prowlarrIndexerStatusSchema.nullable(),
  /** Compteurs de l'indexeur, `null` si Prowlarr n'en donne pas. */
  counters: prowlarrIndexerCountersSchema.nullable(),
});
export type ProwlarrIndexer = z.infer<typeof prowlarrIndexerSchema>;

/** Tuiles de la page (`getStats` de l'original). */
export const prowlarrIndexerTotalsSchema = z.object({
  total: z.number(),
  enabled: z.number(),
  failing: z.number(),
  torrent: z.number(),
  usenet: z.number(),
});
export type ProwlarrIndexerTotals = z.infer<typeof prowlarrIndexerTotalsSchema>;

/** Problème signalé par Prowlarr (`/health`). */
export const prowlarrHealthSchema = z.object({
  source: nullableString,
  /** `notice`, `warning` ou `error`. */
  type: z.string(),
  message: z.string(),
});
export type ProwlarrHealth = z.infer<typeof prowlarrHealthSchema>;

/** Application connectée (Radarr, Sonarr…), sans ses réglages. */
export const prowlarrApplicationSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  implementationName: nullableString,
});
export type ProwlarrApplicationSummary = z.infer<typeof prowlarrApplicationSummarySchema>;

/** Données de la page des indexeurs (route n° 238). */
export const prowlarrOverviewSchema = z.object({
  indexers: z.array(prowlarrIndexerSchema),
  totals: prowlarrIndexerTotalsSchema,
  health: z.array(prowlarrHealthSchema),
  applications: z.array(prowlarrApplicationSummarySchema),
});
export type ProwlarrOverview = z.infer<typeof prowlarrOverviewSchema>;

/** Statistiques d'un indexeur (`IndexerStatistics`). */
export const prowlarrIndexerStatisticsSchema = z.object({
  indexerId: z.number(),
  indexerName: nullableString,
  averageResponseTime: z.number(),
  averageGrabResponseTime: z.number(),
  numberOfQueries: z.number(),
  numberOfGrabs: z.number(),
  numberOfRssQueries: z.number(),
  numberOfAuthQueries: z.number(),
  numberOfFailedQueries: z.number(),
  numberOfFailedGrabs: z.number(),
  numberOfFailedRssQueries: z.number(),
  numberOfFailedAuthQueries: z.number(),
});
export type ProwlarrIndexerStatistics = z.infer<typeof prowlarrIndexerStatisticsSchema>;

/** Nombre de requêtes ou de grabs par agent ou par hôte. */
export const prowlarrStatsCountSchema = z.object({
  name: z.string(),
  queries: z.number(),
  grabs: z.number(),
});

/** Statistiques des indexeurs (route n° 287). */
export const prowlarrIndexerStatsSchema = z.object({
  indexers: z.array(prowlarrIndexerStatisticsSchema),
  userAgents: z.array(prowlarrStatsCountSchema),
  hosts: z.array(prowlarrStatsCountSchema),
});
export type ProwlarrIndexerStats = z.infer<typeof prowlarrIndexerStatsSchema>;

/** Sous-catégorie Newznab/Torznab. */
export const prowlarrSubCategorySchema = z.object({ id: z.number(), name: z.string() });

/** Catégorie et ses sous-catégories (catégories par défaut, capacités d'un indexeur). */
export const prowlarrCategorySchema = z.object({
  id: z.number(),
  name: z.string(),
  subCategories: z.array(prowlarrSubCategorySchema),
});
export type ProwlarrCategory = z.infer<typeof prowlarrCategorySchema>;

/** Modification groupée (`IndexerBulkResource`) : champ absent, inchangé. */
export const prowlarrIndexerBulkRequestSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(10_000),
  enable: z.boolean().optional(),
  appProfileId: z.number().int().positive().optional(),
  priority: z.number().int().min(1).max(50).optional(),
  tags: z.array(z.number().int().nonnegative()).optional(),
  applyTags: z.enum(APPLY_TAGS_MODES).optional(),
});
export type ProwlarrIndexerBulkRequest = z.infer<typeof prowlarrIndexerBulkRequestSchema>;

/** Bascule d'un indexeur (route n° 245). */
export const prowlarrIndexerToggleSchema = z.object({ ok: z.literal(true), enabled: z.boolean() });

/** Résultat du test d'un indexeur dans le test global. */
export const prowlarrTestResultSchema = z.object({
  id: z.number(),
  isValid: z.boolean(),
  /** Motifs du refus, réunis (`propriété : message ; …`). */
  message: nullableString,
});
export type ProwlarrTestResult = z.infer<typeof prowlarrTestResultSchema>;

/** Test global (route n° 291) : `ok` faux si un indexeur au moins échoue. */
export const prowlarrTestAllSchema = z.object({
  ok: z.boolean(),
  results: z.array(prowlarrTestResultSchema),
});
export type ProwlarrTestAll = z.infer<typeof prowlarrTestAllSchema>;

/** Évènement de l'historique d'un indexeur (onglet de la fiche). */
export const prowlarrIndexerHistorySchema = z.object({
  id: z.number(),
  date: nullableString,
  /** `indexerRss`, `indexerQuery`, `releaseGrabbed`, `indexerAuth`… */
  eventType: nullableString,
  successful: z.boolean(),
  query: nullableString,
  source: nullableString,
});
export type ProwlarrIndexerHistory = z.infer<typeof prowlarrIndexerHistorySchema>;

/** Profil d'application (`AppProfileResource`). */
export const prowlarrAppProfileSchema = z.object({
  id: z.number(),
  name: z.string(),
  enableRss: z.boolean(),
  enableAutomaticSearch: z.boolean(),
  enableInteractiveSearch: z.boolean(),
  minimumSeeders: z.number(),
});
export type ProwlarrAppProfile = z.infer<typeof prowlarrAppProfileSchema>;

/** Commande lancée (route n° 306) : nom en lettres et chiffres seulement. */
export const prowlarrCommandRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'media.api.command_name_required' })
    .max(200)
    .regex(/^[A-Za-z0-9]+$/),
});

// ── Recherche multi-indexeurs (P3c.2) ───────────────────────────────────────

/** Longueur minimale d'une recherche (l'original : `strlen($query) < 2` → aucun résultat). */
export const PROWLARR_SEARCH_MIN_LENGTH = 2;

/** Recherche (route n° 246) : `indexerId` absent = tous les indexeurs. */
export const prowlarrSearchQuerySchema = z.object({
  q: z.string().default(''),
  indexerId: z.coerce.number().int().positive().optional(),
});

/**
 * Résultat d'une recherche. Ni lien de téléchargement ni lien magnet : ce
 * sont des adresses de Prowlarr porteuses de sa clé ; le lien
 * d'information n'est gardé qu'en http(s).
 */
export const prowlarrReleaseSchema = z.object({
  guid: z.string(),
  title: z.string(),
  size: z.number(),
  age: z.number(),
  ageHours: z.number(),
  indexerId: z.number().nullable(),
  indexer: z.string(),
  seeders: z.number().nullable(),
  leechers: z.number().nullable(),
  protocol: z.string(),
  imdbId: z.number().nullable(),
  tmdbId: z.number().nullable(),
  tvdbId: z.number().nullable(),
  categories: z.array(z.object({ id: z.number(), name: z.string() })),
  infoUrl: nullableString,
  publishDate: nullableString,
  indexerFlags: z.array(z.string()),
  fileName: nullableString,
});
export type ProwlarrRelease = z.infer<typeof prowlarrReleaseSchema>;

/** Grab d'un résultat (route n° 247) : Prowlarr l'envoie au client de l'indexeur. */
export const prowlarrGrabRequestSchema = z.object({
  guid: z.string().min(1),
  indexerId: z.number().int().positive(),
});

// ── Intégrations, réglages et système (P3c.3) ───────────────────────────────

/** Profil d'application à enregistrer (`modal-profile` de `prowlarr/apps.html.twig`). */
export const prowlarrAppProfileRequestSchema = z.object({
  name: z.string().trim().min(1, { message: 'media.arr_admin.schema_modal.error_name_required' }),
  enableRss: z.boolean(),
  enableAutomaticSearch: z.boolean(),
  enableInteractiveSearch: z.boolean(),
  minimumSeeders: z.number().int().min(0).max(10_000),
});
export type ProwlarrAppProfileRequest = z.infer<typeof prowlarrAppProfileRequestSchema>;

/** Usage d'une étiquette (`/tag/detail`). */
export const prowlarrTagDetailSchema = z.object({
  id: z.number(),
  label: z.string(),
  indexerIds: z.array(z.number()),
  applicationIds: z.array(z.number()),
  notificationIds: z.array(z.number()),
  indexerProxyIds: z.array(z.number()),
});
export type ProwlarrTagDetail = z.infer<typeof prowlarrTagDetailSchema>;

/** Évènement de l'historique (`prowlarr/history.html.twig`). */
export const prowlarrHistoryRecordSchema = z.object({
  id: z.number(),
  indexerId: z.number().nullable(),
  date: nullableString,
  eventType: nullableString,
  successful: z.boolean(),
  source: nullableString,
  query: nullableString,
  queryType: nullableString,
  categories: nullableString,
  queryResults: z.number().nullable(),
  elapsedTime: z.number().nullable(),
});
export type ProwlarrHistoryRecord = z.infer<typeof prowlarrHistoryRecordSchema>;

/** Taille de page de l'historique (n° 248 : 50, page de l'original : 100). */
export const PROWLARR_HISTORY_PAGE_SIZE = 50;

export const prowlarrHistoryPageSchema = z.object({
  records: z.array(prowlarrHistoryRecordSchema),
  totalRecords: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export type ProwlarrHistoryPage = z.infer<typeof prowlarrHistoryPageSchema>;

/** Statut de Prowlarr (`/system/status`), sans chemin de démarrage ni base d'URL. */
export const prowlarrStatusSchema = z.object({
  version: nullableString,
  branch: nullableString,
  osName: nullableString,
  osVersion: nullableString,
  runtimeName: nullableString,
  runtimeVersion: nullableString,
  startTime: nullableString,
  appData: nullableString,
  migrationVersion: z.number().nullable(),
  authentication: nullableString,
  databaseType: nullableString,
  databaseVersion: nullableString,
  isDocker: z.boolean(),
});
export type ProwlarrStatus = z.infer<typeof prowlarrStatusSchema>;

/** Taille de page des journaux (page de l'original). */
export const PROWLARR_LOGS_PAGE_SIZE = 100;
