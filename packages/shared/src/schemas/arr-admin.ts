// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats de l'administration Radarr/Sonarr (P3b, `RadarrController` et
// `SonarrController`) : un seul jeu de schémas pour les deux services, la
// différence passant par `kind` et des drapeaux de capacité (`ARR_ADMIN_CAPABILITIES`).
//
// Les ressources d'administration sont, pour l'essentiel, celles de l'instance
// renvoyées telles quelles : leurs champs varient d'une implémentation à
// l'autre (indexeurs, clients, notifications…) et d'une version à l'autre.
// Les schémas sont donc **ouverts** (`z.looseObject`) : ils typent les champs
// lus par Hubarr et laissent passer les autres. Les secrets ne
// passent jamais : les champs « mot de passe » et « clé d'API » sont masqués
// par le serveur (`ARR_SECRET_MASK`) et restitués à l'enregistrement.

import { z } from 'zod';

export const ARR_KINDS = ['radarr', 'sonarr'] as const;
export type ArrKind = (typeof ARR_KINDS)[number];
export const arrKindSchema = z.enum(ARR_KINDS);

/** Valeur renvoyée à la place d'un secret ; renvoyée telle quelle, elle garde le secret actuel. */
export const ARR_SECRET_MASK = '********';

/**
 * Écarts entre Radarr et Sonarr (P3b) :
 * - `rename` : page de renommage (Radarr ; Sonarr renomme depuis la fiche série) ;
 * - `suggestions` : films proposés par les listes d'import (Radarr ; la page
 *   « suggestions » de Sonarr est l'import de bibliothèque) ;
 * - `metadataConfig` : réglages des métadonnées (Radarr) ;
 * - `bulkUpdate` : édition groupée par l'API d'administration (Radarr) ;
 * - `profileLanguage` : langue d'un profil de qualité (Radarr ; Sonarr v4 n'en a plus) ;
 * - `calendar` : page calendrier de l'instance (Sonarr).
 */
export const ARR_ADMIN_CAPABILITIES = {
  radarr: {
    rename: true,
    suggestions: true,
    metadataConfig: true,
    bulkUpdate: true,
    profileLanguage: true,
    calendar: false,
  },
  sonarr: {
    rename: false,
    suggestions: false,
    metadataConfig: false,
    bulkUpdate: false,
    profileLanguage: false,
    calendar: true,
  },
} as const satisfies Record<ArrKind, Record<string, boolean>>;
export type ArrAdminCapability = keyof (typeof ARR_ADMIN_CAPABILITIES)['radarr'];

const nullableString = z.string().nullable();
const optionalNullableString = z.string().nullable().optional();
const idOptional = z.number().int().optional();
const tagIds = z.array(z.number().int()).optional();

/** Résultat d'une action sans retour. */
export const arrOkSchema = z.object({ ok: z.literal(true) });

/** Commande lancée par une action (sauvegarde, mise à jour, renommage, tâche). */
export const arrCommandStartedSchema = z.object({
  ok: z.literal(true),
  cmdId: z.number().nullable(),
});
export type ArrCommandStarted = z.infer<typeof arrCommandStartedSchema>;

/** Liste paginée par l'instance, gardée sous sa forme. */
export function arrPaged<T extends z.ZodType>(item: T) {
  return z.object({
    records: z.array(item),
    totalRecords: z.number(),
    page: z.number(),
    pageSize: z.number(),
  });
}

// ── Ressources à schéma dynamique (« providers ») ───────────────────────────

/** Option d'un champ `select` (valeur numérique ou texte selon le champ). */
export const providerSelectOptionSchema = z.looseObject({
  value: z.union([z.number(), z.string()]),
  name: optionalNullableString,
  order: z.number().optional(),
  hint: optionalNullableString,
});
export type ProviderSelectOption = z.infer<typeof providerSelectOptionSchema>;

/** Champ d'une ressource (`fields[]`), décrit par l'instance. */
export const providerFieldSchema = z.looseObject({
  name: z.string(),
  label: optionalNullableString,
  value: z.unknown().optional(),
  type: optionalNullableString,
  advanced: z.boolean().optional(),
  /** `hidden` ou `hiddenIfNotSet` (absent : visible). */
  hidden: optionalNullableString,
  helpText: optionalNullableString,
  helpTextWarning: optionalNullableString,
  helpLink: optionalNullableString,
  unit: optionalNullableString,
  placeholder: optionalNullableString,
  /** `normal`, `password`, `apiKey`, `userName`. */
  privacy: optionalNullableString,
  section: optionalNullableString,
  order: z.number().optional(),
  isFloat: z.boolean().optional(),
  selectOptions: z.array(providerSelectOptionSchema).nullable().optional(),
  selectOptionsProviderAction: optionalNullableString,
});
export type ProviderField = z.infer<typeof providerFieldSchema>;

/**
 * Indexeur, client de téléchargement, liste d'import, notification ou
 * consommateur de métadonnées (et leurs modèles `/schema`). Les champs propres
 * à chaque famille (`enableRss`, `onGrab`, `supportsOnGrab`, `protocol`,
 * `priority`, `enableAuto`…) passent tels quels.
 */
export const providerSchema = z.looseObject({
  id: idOptional,
  name: optionalNullableString,
  implementation: optionalNullableString,
  implementationName: optionalNullableString,
  configContract: optionalNullableString,
  infoLink: optionalNullableString,
  tags: tagIds,
  fields: z.array(providerFieldSchema).optional(),
});
export type Provider = z.infer<typeof providerSchema>;
export const providerListSchema = z.array(providerSchema);

/** Ressource à enregistrer ou à tester (`collectPayload` du dialogue de l'original). */
export const providerSaveRequestSchema = z.looseObject({
  name: z.string().trim().min(1, { message: 'media.arr_admin.schema_modal.error_name_required' }),
  implementation: z.string().min(1),
  configContract: z.string().min(1),
  implementationName: optionalNullableString,
  tags: tagIds,
  fields: z.array(z.looseObject({ name: z.string(), value: z.unknown().optional() })),
});
export type ProviderSaveRequest = z.infer<typeof providerSaveRequestSchema>;

/**
 * Bilan d'un test : refus de validation de l'instance → `ok` faux et son
 * message (200, comme l'original), plutôt qu'une erreur.
 */
export const providerTestResponseSchema = z.object({
  ok: z.boolean(),
  message: nullableString,
});
export type ProviderTestResponse = z.infer<typeof providerTestResponseSchema>;

// ── Qualité ─────────────────────────────────────────────────────────────────

export const qualityRefSchema = z.looseObject({
  id: z.number(),
  name: optionalNullableString,
  source: optionalNullableString,
  resolution: z.number().optional(),
});

/** Élément d'un profil : une qualité, ou un groupe (`items` non vide, id ≥ 1000). */
export interface QualityProfileItem {
  id?: number | undefined;
  name?: string | null | undefined;
  quality?: z.infer<typeof qualityRefSchema> | null | undefined;
  items?: QualityProfileItem[] | undefined;
  allowed?: boolean | undefined;
  [key: string]: unknown;
}
export const qualityProfileItemSchema: z.ZodType<QualityProfileItem> = z.lazy(() =>
  z.looseObject({
    id: z.number().optional(),
    name: optionalNullableString,
    quality: qualityRefSchema.nullable().optional(),
    items: z.array(qualityProfileItemSchema).optional(),
    allowed: z.boolean().optional(),
  }),
);

export const qualityProfileSchema = z.looseObject({
  id: idOptional,
  name: optionalNullableString,
  upgradeAllowed: z.boolean().optional(),
  cutoff: z.number().optional(),
  items: z.array(qualityProfileItemSchema).optional(),
  minFormatScore: z.number().optional(),
  cutoffFormatScore: z.number().optional(),
  minUpgradeFormatScore: z.number().optional(),
  formatItems: z
    .array(z.looseObject({ format: z.number(), name: optionalNullableString, score: z.number() }))
    .optional(),
  language: z.looseObject({ id: z.number(), name: optionalNullableString }).nullable().optional(),
});
export type QualityProfile = z.infer<typeof qualityProfileSchema>;

export const qualityProfileSaveSchema = qualityProfileSchema.extend({
  name: z.string().trim().min(1, { message: 'media.arr_admin.quality.error_name_required' }),
});
export type QualityProfileSave = z.infer<typeof qualityProfileSaveSchema>;

export const qualityDefinitionSchema = z.looseObject({
  id: z.number(),
  quality: qualityRefSchema.optional(),
  title: optionalNullableString,
  weight: z.number().optional(),
  minSize: z.number().nullable().optional(),
  maxSize: z.number().nullable().optional(),
  preferredSize: z.number().nullable().optional(),
});
export type QualityDefinition = z.infer<typeof qualityDefinitionSchema>;
export const qualityDefinitionsSaveSchema = z.array(qualityDefinitionSchema).min(1);

/** Bornes des tailles (Mo par minute). */
export const qualityLimitsSchema = z.object({
  min: z.number(),
  max: z.number(),
});
export type QualityLimits = z.infer<typeof qualityLimitsSchema>;

export const namedRefSchema = z.object({ id: z.number(), name: z.string() });
export type NamedRef = z.infer<typeof namedRefSchema>;

export const qualityPageSchema = z.object({
  profiles: z.array(qualityProfileSchema),
  definitions: z.array(qualityDefinitionSchema),
  customFormats: z.array(namedRefSchema),
  languages: z.array(namedRefSchema),
  limits: qualityLimitsSchema.nullable(),
});
export type QualityPage = z.infer<typeof qualityPageSchema>;

// ── Profils de délai ────────────────────────────────────────────────────────

export const delayProfileSchema = z.looseObject({
  id: idOptional,
  enableUsenet: z.boolean().optional(),
  enableTorrent: z.boolean().optional(),
  preferredProtocol: optionalNullableString,
  usenetDelay: z.number().optional(),
  torrentDelay: z.number().optional(),
  bypassIfHighestQuality: z.boolean().optional(),
  bypassIfAboveCustomFormatScore: z.boolean().optional(),
  minimumCustomFormatScore: z.number().optional(),
  order: z.number().optional(),
  tags: tagIds,
});
export type DelayProfile = z.infer<typeof delayProfileSchema>;

// ── Formats personnalisés, auto-tags ────────────────────────────────────────

/** Condition d'un format personnalisé ou d'une règle d'auto-tagging. */
export const specificationSchema = z.looseObject({
  id: idOptional,
  name: optionalNullableString,
  implementation: optionalNullableString,
  implementationName: optionalNullableString,
  negate: z.boolean().optional(),
  required: z.boolean().optional(),
  fields: z.array(providerFieldSchema).optional(),
});
export type Specification = z.infer<typeof specificationSchema>;

export const customFormatSchema = z.looseObject({
  id: idOptional,
  name: optionalNullableString,
  includeCustomFormatWhenRenaming: z.boolean().optional(),
  specifications: z.array(specificationSchema).optional(),
});
export type CustomFormat = z.infer<typeof customFormatSchema>;
export const customFormatSaveSchema = customFormatSchema.extend({
  name: z.string().trim().min(1, { message: 'media.arr_admin.custom_formats.error_name_required' }),
});

export const autoTagSchema = z.looseObject({
  id: idOptional,
  name: optionalNullableString,
  removeTagsAutomatically: z.boolean().optional(),
  tags: tagIds,
  specifications: z.array(specificationSchema).optional(),
});
export type AutoTag = z.infer<typeof autoTagSchema>;
export const autoTagSaveSchema = autoTagSchema.extend({
  name: z.string().trim().min(1, { message: 'media.arr_admin.auto_tags.err_name_required' }),
});

/** Page des auto-tags : règles, modèles de conditions et étiquettes (noms des ids). */
export const autoTagsPageSchema = z.object({
  rules: z.array(autoTagSchema),
  schema: z.array(specificationSchema),
  tags: z.array(z.object({ id: z.number(), label: z.string() })),
});
export type AutoTagsPage = z.infer<typeof autoTagsPageSchema>;

// ── Étiquettes ──────────────────────────────────────────────────────────────

/** Étiquette et nombre d'éléments qui l'utilisent (`/tag/detail`). */
export const arrTagUsageSchema = z.object({
  id: z.number(),
  label: z.string(),
  usage: z.number(),
});
export type ArrTagUsage = z.infer<typeof arrTagUsageSchema>;

export const tagLabelRequestSchema = z.object({
  label: z.string().trim().min(1, { message: 'media.api.label_required' }).max(100),
});
export const arrTagItemSchema = z.object({ id: z.number(), label: z.string() });
export type ArrTagItem = z.infer<typeof arrTagItemSchema>;

// ── Exclusions, dossiers, chemins distants, filtres ─────────────────────────

/**
 * Exclusion d'import : film (`tmdbId`, `movieTitle`, `movieYear`) ou série
 * (`tvdbId`, `title`), normalisée en `externalId`, `title`, `year`.
 */
export const exclusionSchema = z.object({
  id: z.number(),
  externalId: z.number().nullable(),
  title: nullableString,
  year: z.number().nullable(),
});
export type Exclusion = z.infer<typeof exclusionSchema>;
export const exclusionPageSchema = arrPaged(exclusionSchema);
export type ExclusionPage = z.infer<typeof exclusionPageSchema>;
export const exclusionAddRequestSchema = z.object({
  externalId: z.number().int().positive(),
  title: z.string().trim().max(500).default(''),
  year: z.number().int().min(0).max(3000).default(0),
});
export type ExclusionAddRequest = z.infer<typeof exclusionAddRequestSchema>;

export const rootFolderSchema = z.object({
  id: z.number(),
  path: z.string(),
  accessible: z.boolean(),
  freeSpace: z.number().nullable(),
  totalSpace: z.number().nullable(),
});
export type RootFolder = z.infer<typeof rootFolderSchema>;
export const rootFolderAddRequestSchema = z.object({
  path: z.string().trim().min(1, { message: 'media.api.path_required' }).max(4096),
});

export const remotePathMappingSchema = z.object({
  id: z.number(),
  host: z.string(),
  remotePath: z.string(),
  localPath: z.string(),
});
export type RemotePathMapping = z.infer<typeof remotePathMappingSchema>;
export const remotePathMappingSaveSchema = z.object({
  host: z.string().trim().min(1).max(500),
  remotePath: z.string().trim().min(1).max(4096),
  localPath: z.string().trim().min(1).max(4096),
});
export type RemotePathMappingSave = z.infer<typeof remotePathMappingSaveSchema>;

/** Filtre personnalisé de l'interface de l'instance (`type`, `label`, `filters`). */
export const customFilterSchema = z.looseObject({
  id: idOptional,
  type: optionalNullableString,
  label: optionalNullableString,
  filters: z
    .array(z.looseObject({ key: z.string(), value: z.unknown(), type: z.string() }))
    .optional(),
});
export type CustomFilter = z.infer<typeof customFilterSchema>;
export const customFilterSaveSchema = customFilterSchema.extend({
  type: z.string().trim().min(1),
  label: z.string().trim().min(1, { message: 'media.api.label_required' }),
});

// ── Configurations (hôte, interface, nommage, gestion des médias…) ──────────

/** Section de configuration de l'instance (`/config/<nom>`), ouverte. */
export const arrConfigSchema = z.looseObject({ id: idOptional });
export type ArrConfig = z.infer<typeof arrConfigSchema>;
/** Modification partielle d'une section (fusionnée avec la section actuelle). */
export const arrConfigPatchSchema = z.record(z.string(), z.unknown());

export const hostSettingsPageSchema = z.object({
  host: arrConfigSchema.nullable(),
  indexer: arrConfigSchema.nullable(),
  downloadClient: arrConfigSchema.nullable(),
  importList: arrConfigSchema.nullable(),
});
export type HostSettingsPage = z.infer<typeof hostSettingsPageSchema>;

export const uiPageSchema = z.object({
  config: arrConfigSchema,
  languages: z.array(namedRefSchema),
});
export type UiPage = z.infer<typeof uiPageSchema>;

export const mediaManagementPageSchema = z.object({
  naming: arrConfigSchema,
  mediaManagement: arrConfigSchema,
});
export type MediaManagementPage = z.infer<typeof mediaManagementPageSchema>;

/** Exemples de nommage (`/config/naming/examples`), selon le service. */
export const namingExamplesSchema = z.record(z.string(), z.string().nullable());
export type NamingExamples = z.infer<typeof namingExamplesSchema>;

/** Édition groupée de films par l'API d'administration (Radarr, `PUT /movie/editor`). */
export const moviesBulkUpdateRequestSchema = z.looseObject({
  movieIds: z
    .array(z.number().int().positive())
    .min(1, { message: 'media.api.no_movies_selected' })
    .max(10_000),
});
export type MoviesBulkUpdateRequest = z.infer<typeof moviesBulkUpdateRequestSchema>;

// ── Système : sauvegardes, mises à jour, tâches, commandes, journaux ────────

export const backupSchema = z.object({
  id: z.number(),
  name: z.string(),
  /** `scheduled`, `manual`, `update`. */
  type: nullableString,
  size: z.number().nullable(),
  time: nullableString,
});
export type Backup = z.infer<typeof backupSchema>;

export const updateSchema = z.object({
  version: z.string(),
  branch: nullableString,
  releaseDate: nullableString,
  installed: z.boolean(),
  installable: z.boolean(),
  latest: z.boolean(),
  changes: z.object({ new: z.array(z.string()), fixed: z.array(z.string()) }),
});
export type ArrUpdate = z.infer<typeof updateSchema>;

export const updatesPageSchema = z.object({
  /** Version installée (`null` si le statut est illisible). */
  version: nullableString,
  /** Instance en conteneur : la mise à jour passe par l'image. */
  docker: z.boolean(),
  updates: z.array(updateSchema),
});
export type UpdatesPage = z.infer<typeof updatesPageSchema>;

export const systemTaskSchema = z.object({
  id: z.number(),
  name: z.string(),
  /** Nom de la commande à lancer (`taskName`). */
  taskName: z.string(),
  /** Intervalle en minutes. */
  interval: z.number().nullable(),
  lastExecution: nullableString,
  nextExecution: nullableString,
  lastDuration: nullableString,
});
export type SystemTask = z.infer<typeof systemTaskSchema>;

export const taskRunRequestSchema = z.object({
  commandName: z
    .string()
    .trim()
    .min(1, { message: 'media.api.command_name_required' })
    .max(200)
    .regex(/^[A-Za-z0-9]+$/),
});

export const arrCommandSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
  message: nullableString,
  queued: nullableString,
  started: nullableString,
  ended: nullableString,
  duration: nullableString,
});
export type ArrCommandSummary = z.infer<typeof arrCommandSummarySchema>;

export const logFileSchema = z.object({ filename: z.string(), lastWriteTime: nullableString });
export const logRecordSchema = z.object({
  time: nullableString,
  level: z.string(),
  logger: nullableString,
  message: nullableString,
  exception: nullableString,
});
export type LogRecord = z.infer<typeof logRecordSchema>;
export const LOGS_PAGE_SIZE = 100;
export const LOG_LEVELS = ['info', 'debug', 'warn', 'error'] as const;
export const logsPageSchema = arrPaged(logRecordSchema).extend({ files: z.array(logFileSchema) });
export type LogsPage = z.infer<typeof logsPageSchema>;

// ── Statistiques, parseur ───────────────────────────────────────────────────

const countEntry = z.object({ name: z.string(), count: z.number() });
export const diskSummarySchema = z.object({
  path: nullableString,
  label: nullableString,
  freeSpace: z.number(),
  totalSpace: z.number(),
});

/** Statistiques de la bibliothèque (films pour Radarr, séries pour Sonarr). */
export const libraryStatsSchema = z.object({
  total: z.number(),
  monitored: z.number(),
  /** Taille totale (octets). */
  sizeOnDisk: z.number(),
  disks: z.array(diskSummarySchema),
  genres: z.array(countEntry),
  /** Radarr : films avec fichier, manquants, qualités, décennies. */
  hasFile: z.number().nullable(),
  missing: z.number().nullable(),
  qualities: z.array(z.object({ name: z.string(), count: z.number(), size: z.number() })),
  decades: z.array(countEntry),
  /** Sonarr : séries en cours, terminées, réseaux. */
  continuing: z.number().nullable(),
  ended: z.number().nullable(),
  networks: z.array(countEntry),
});
export type LibraryStats = z.infer<typeof libraryStatsSchema>;

export const parseResultSchema = z.object({
  title: nullableString,
  parsedTitle: nullableString,
  year: z.number().nullable(),
  quality: nullableString,
  edition: nullableString,
  releaseGroup: nullableString,
  languages: z.array(z.string()),
  /** Sonarr : saison et épisodes (« S01E02 »). */
  episode: nullableString,
  match: z.object({ id: z.number(), title: z.string(), year: z.number().nullable() }).nullable(),
});
export type ParseResult = z.infer<typeof parseResultSchema>;
export const parsePageSchema = z.object({ result: parseResultSchema.nullable() });

// ── Import de bibliothèque, suggestions, renommage ──────────────────────────

export const libraryImportPageSchema = z.object({
  rootFolders: z.array(z.object({ id: z.number(), path: z.string() })),
  qualityProfiles: z.array(namedRefSchema),
});
export type LibraryImportPage = z.infer<typeof libraryImportPageSchema>;
export const libraryImportScanRequestSchema = z.object({
  folder: z.string().trim().min(1, { message: 'media.api.path_required' }).max(4096),
});
export const libraryImportScanSchema = z.object({
  folders: z.array(z.object({ name: z.string(), path: z.string(), size: z.number().nullable() })),
});
export type LibraryImportScan = z.infer<typeof libraryImportScanSchema>;

export const suggestionSchema = z.object({
  tmdbId: z.number(),
  title: z.string(),
  year: z.number().nullable(),
  overview: nullableString,
  /** Affiche TMDB (jamais une URL d'instance). */
  poster: nullableString,
  runtime: z.number().nullable(),
  studio: nullableString,
  genres: z.array(z.string()),
  ratings: z.object({ imdb: z.number().nullable(), tmdb: z.number().nullable() }),
  inLibrary: z.boolean(),
  recommended: z.boolean(),
  trending: z.boolean(),
  popular: z.boolean(),
});
export type Suggestion = z.infer<typeof suggestionSchema>;
export const suggestionsPageSchema = z.object({
  movies: z.array(suggestionSchema),
  qualityProfiles: z.array(namedRefSchema),
  rootFolders: z.array(z.object({ id: z.number(), path: z.string() })),
});
export type SuggestionsPage = z.infer<typeof suggestionsPageSchema>;

/** Page de renommage ; les propositions reprennent `renameProposalSchema` de la fiche film. */
export const renamePageSchema = z.object({
  movies: z.array(z.object({ id: z.number(), title: z.string(), year: z.number().nullable() })),
});
