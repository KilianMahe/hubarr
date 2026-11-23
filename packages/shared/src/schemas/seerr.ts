// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats de l'API Seerr / Jellyseerr (P3f). Les ressources de Seerr
// (demandes, utilisateurs, réglages, serveurs Radarr/Sonarr, règles, tâches)
// varient selon la version : schémas **ouverts** (`z.looseObject`), seuls les
// champs lus par Hubarr sont typés (même exception que D97). Les secrets
// (clés d'API de Seerr, de Jellyfin et des serveurs *arr) ne sortent jamais :
// remplacés par `SEERR_SECRET_MASK`.

import { z } from 'zod';

export const SEERR_SECRET_MASK = '********';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();
export const seerrObjectSchema = z.looseObject({});
export type SeerrObject = z.infer<typeof seerrObjectSchema>;

export const SEERR_REQUEST_FILTERS = [
  'all',
  'pending',
  'approved',
  'processing',
  'available',
  'partial',
  'unavailable',
  'failed',
] as const;

/** Statut affiché d'une demande (`enrichRequest`) : clé i18n et couleur. */
export const seerrRequestStatusSchema = z.enum([
  'declined',
  'available',
  'partially_available',
  'processing',
  'approved',
  'pending',
  'unknown',
]);
export type SeerrRequestStatus = z.infer<typeof seerrRequestStatusSchema>;

export const seerrRequestSchema = z.looseObject({
  id: z.number(),
  status: z.number().optional(),
  type: z.string().optional(),
  /** Fiche TMDB de l'élément, lue par Seerr (affiches TMDB seulement). */
  tmdb: z
    .object({
      title: z.string(),
      overview: z.string(),
      posterPath: nullableString,
      backdropPath: nullableString,
      releaseDate: nullableString,
      voteAverage: nullableNumber,
      genres: z.array(z.string()),
    })
    .nullable(),
  displayStatus: seerrRequestStatusSchema,
});
export type SeerrRequest = z.infer<typeof seerrRequestSchema>;

export const seerrPageInfoSchema = z.object({
  pages: z.number(),
  results: z.number(),
  page: z.number(),
});

export const seerrRequestCountsSchema = z.looseObject({
  pending: z.number().optional(),
  approved: z.number().optional(),
  processing: z.number().optional(),
  available: z.number().optional(),
  declined: z.number().optional(),
  total: z.number().optional(),
});

export const seerrRequestsPageSchema = z.object({
  requests: z.array(seerrRequestSchema),
  pageInfo: seerrPageInfoSchema,
  counts: seerrRequestCountsSchema,
  status: seerrObjectSchema.nullable(),
});
export type SeerrRequestsPage = z.infer<typeof seerrRequestsPageSchema>;

export const seerrRequestsQuerySchema = z.object({
  filter: z.string().catch('all'),
  type: z.string().catch(''),
  sort: z.string().catch('added'),
  page: z.coerce.number().int().catch(1),
});

export const seerrPendingCountSchema = z.object({ pending: z.number() });
export const seerrOkSchema = z.object({ ok: z.literal(true) });
export const seerrOkDataSchema = z.object({ ok: z.literal(true), data: z.unknown() });

/** Rôle d'un utilisateur d'après ses permissions (`decodeRole`). */
export const SEERR_ROLES = ['admin', 'manager', 'user', 'limited'] as const;
export type SeerrRole = (typeof SEERR_ROLES)[number];

export function seerrRoleOf(permissions: number): SeerrRole {
  if (permissions & 2) return 'admin';
  if (permissions & 8) return 'manager';
  if (permissions & 32) return 'user';
  return 'limited';
}

/**
 * Arbre des permissions de l'écran utilisateur (`user_detail.html.twig`) :
 * `parent` = case cochée et grisée quand le parent l'est ; `requires` = grisée
 * tant qu'aucun prérequis n'est coché ; `need4k` = masquée sans serveur 4K.
 * Clés i18n `jellyseerr.user_detail.perms.<clé>_label` / `_desc`.
 */
export interface SeerrPermission {
  bit: number;
  key: string;
  section?: string;
  parent?: number;
  requires?: number[];
  need4k?: boolean;
}
export const SEERR_PERMISSION_TREE: readonly SeerrPermission[] = [
  { bit: 2, key: 'admin', section: 'section_general' },
  { bit: 8, key: 'manage_users' },
  { bit: 16, key: 'manage_requests' },
  { bit: 8192, key: 'advanced_requests', parent: 16 },
  { bit: 16384, key: 'view_requests', parent: 16 },
  { bit: 67108864, key: 'view_recents', parent: 16 },
  { bit: 134217728, key: 'view_jf_playlists', parent: 16 },
  { bit: 32, key: 'request' },
  { bit: 262144, key: 'request_movies', parent: 32 },
  { bit: 524288, key: 'request_tv', parent: 32 },
  { bit: 128, key: 'auto_approve', section: 'section_auto_approve', requires: [32] },
  { bit: 256, key: 'auto_approve_movies', parent: 128, requires: [32, 262144] },
  { bit: 512, key: 'auto_approve_tv', parent: 128, requires: [32, 524288] },
  { bit: 8388608, key: 'auto_request', section: 'section_auto_request', requires: [32] },
  { bit: 16777216, key: 'auto_request_movies', parent: 8388608, requires: [32, 262144] },
  { bit: 33554432, key: 'auto_request_tv', parent: 8388608, requires: [32, 524288] },
  { bit: 1024, key: 'request_4k', section: 'section_4k', requires: [32], need4k: true },
  { bit: 2048, key: 'request_movies_4k', parent: 1024, requires: [32, 262144], need4k: true },
  { bit: 4096, key: 'request_tv_4k', parent: 1024, requires: [32, 524288], need4k: true },
  {
    bit: 32768,
    key: 'auto_approve_4k',
    section: 'section_auto_approve_4k',
    requires: [1024],
    need4k: true,
  },
  {
    bit: 65536,
    key: 'auto_approve_movies_4k',
    parent: 32768,
    requires: [1024, 2048],
    need4k: true,
  },
  { bit: 131072, key: 'auto_approve_tv_4k', parent: 32768, requires: [1024, 4096], need4k: true },
  { bit: 1048576, key: 'manage_issues', section: 'section_issues' },
  { bit: 4194304, key: 'create_issues', parent: 1048576 },
  { bit: 2097152, key: 'view_issues', parent: 1048576 },
  { bit: 268435456, key: 'manage_blocklist', section: 'section_blocklist' },
  { bit: 1073741824, key: 'view_blocklist', parent: 268435456 },
];

export const seerrUserSchema = z.looseObject({
  id: z.number(),
  displayName: z.string().optional(),
  email: z.string().optional(),
  permissions: z.number().optional(),
  role: z.enum(SEERR_ROLES),
});
export type SeerrUser = z.infer<typeof seerrUserSchema>;

export const seerrUsersPageSchema = z.object({
  users: z.array(seerrUserSchema),
  counts: seerrRequestCountsSchema,
});

export const seerrUserDetailSchema = z.object({
  user: seerrUserSchema,
  quota: seerrObjectSchema.nullable(),
  settings: seerrObjectSchema,
  notifications: seerrObjectSchema,
  requests: z.array(seerrRequestSchema),
  defaultPermissions: z.number(),
  has4k: z.boolean(),
  languages: z.array(seerrObjectSchema),
  regions: z.array(seerrObjectSchema),
});
export type SeerrUserDetail = z.infer<typeof seerrUserDetailSchema>;

export const seerrSettingsPageSchema = z.object({
  main: seerrObjectSchema,
  languages: z.array(seerrObjectSchema),
  regions: z.array(seerrObjectSchema),
});

export const seerrServicesPageSchema = z.object({
  radarr: z.array(seerrObjectSchema),
  sonarr: z.array(seerrObjectSchema),
  radarrProfiles: z.record(z.string(), seerrObjectSchema.nullable()),
  sonarrProfiles: z.record(z.string(), seerrObjectSchema.nullable()),
  rules: z.array(seerrObjectSchema),
  users: z.array(seerrObjectSchema),
  genres: z.array(seerrObjectSchema),
  languages: z.array(seerrObjectSchema),
});
export type SeerrServicesPage = z.infer<typeof seerrServicesPageSchema>;

export const seerrAboutSchema = z.object({
  about: seerrObjectSchema,
  status: seerrObjectSchema,
  requestCounts: seerrObjectSchema,
  totalUsers: z.number(),
  issueCounts: seerrObjectSchema,
});

export const SEERR_RELEASE_SECTIONS = [
  'security',
  'features',
  'fixes',
  'refactor',
  'performance',
] as const;
export const seerrReleaseSchema = z.object({
  version: z.string(),
  tag: z.string(),
  date: nullableString,
  url: z.string(),
  current: z.boolean(),
  sections: z.partialRecord(z.enum(SEERR_RELEASE_SECTIONS), z.array(z.string())),
});
export const seerrUpdatesSchema = z.object({
  status: seerrObjectSchema,
  releases: z.array(seerrReleaseSchema),
});
export type SeerrRelease = z.infer<typeof seerrReleaseSchema>;

export const seerrLogsSchema = z.object({
  logs: z.array(seerrObjectSchema),
  pageInfo: seerrPageInfoSchema,
});

export const seerrTasksSchema = z.object({
  jobs: z.array(seerrObjectSchema),
  cache: seerrObjectSchema,
});

export const seerrJellyfinUsersSchema = z.object({
  users: z.array(seerrObjectSchema),
  mediaServerLogin: z.boolean(),
});

export const seerrServiceInfoSchema = z.looseObject({
  profiles: z.array(seerrObjectSchema).optional(),
  rootFolders: z.array(seerrObjectSchema).optional(),
});

export const seerrCreateUserSchema = z.object({
  email: z.string().max(320),
  password: z.string().max(1024),
});
export const seerrImportUsersSchema = z.object({ jellyfinUserIds: z.array(z.string()).max(1000) });
export const seerrPasswordSchema = z.object({ password: z.string().max(1024) });
export const seerrPermissionsSchema = z.object({ permissions: z.number().int().nonnegative() });
export const seerrScheduleSchema = z.object({ schedule: z.string().max(200) });
export const seerrServiceTestSchema = z.looseObject({
  type: z.enum(['radarr', 'sonarr']).optional(),
});
