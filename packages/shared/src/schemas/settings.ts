// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats de la page des paramètres (`/admin/settings`) : services, instances,
// test de connexion. Les préférences d'affichage, la mise en page, les langues
// et la sauvegarde s'y ajoutent (P1.5, P1.6).
//
// Les secrets (clé d'API, mot de passe) ne sont jamais renvoyés : seule leur
// présence l'est. À l'enregistrement, un secret vide vaut « inchangé ».

import { z } from 'zod';
import {
  DIAGNOSIS_CATEGORIES,
  INSTANCE_TYPES,
  INTERNAL_FEATURES,
  type FlatServiceId,
} from '../constants/service-settings';
import { SERVICE_IDS, type ServiceId } from '../constants/services';
import {
  dashboardLayoutRequestSchema,
  dashboardLayoutSchema,
  displayPatchSchema,
  displayValuesSchema,
} from './preferences';
import { resolvedThemeSchema } from './theme';
import { exportCountsSchema } from './backup';

const FLAT_SERVICE_IDS = SERVICE_IDS.filter(
  (id): id is FlatServiceId => id !== 'radarr' && id !== 'sonarr',
);

export const flatServiceIdSchema = z.enum(FLAT_SERVICE_IDS as [FlatServiceId, ...FlatServiceId[]]);
export const serviceIdSchema = z.enum(SERVICE_IDS as [ServiceId, ...ServiceId[]]);
export const instanceTypeSchema = z.enum(INSTANCE_TYPES);

/** État d'un service à configuration unique, tel que l'affiche la page. */
export const flatServiceStateSchema = z.object({
  /** Une URL ou une clé est enregistrée (service « connecté »). */
  saved: z.boolean(),
  /** Champs requis présents **et** service activé (`HealthService::isConfigured`). */
  configured: z.boolean(),
  enabled: z.boolean(),
  url: z.string(),
  user: z.string(),
  hasApiKey: z.boolean(),
  hasPassword: z.boolean(),
});
export type FlatServiceState = z.infer<typeof flatServiceStateSchema>;

export const serviceInstanceSchema = z.object({
  id: z.number().int(),
  type: instanceTypeSchema,
  slug: z.string(),
  name: z.string(),
  url: z.string(),
  hasApiKey: z.boolean(),
  enabled: z.boolean(),
  isDefault: z.boolean(),
  position: z.number().int(),
  defaultQualityProfileId: z.number().int().nullable(),
});
export type ServiceInstance = z.infer<typeof serviceInstanceSchema>;

const SIDEBAR_VISIBILITY_IDS: [string, ...string[]] = [...INTERNAL_FEATURES, ...SERVICE_IDS];
/** Service ou page interne masquable du menu latéral. */
export const sidebarVisibilityIdSchema = z.enum(SIDEBAR_VISIBILITY_IDS);

export const aboutInfoSchema = z.object({
  version: z.string(),
  nodeVersion: z.string(),
  databasePath: z.string(),
  databaseSize: z.number().int(),
  avatarsDir: z.string(),
  userCount: z.number().int(),
  serverTime: z.string(),
  timezone: z.string(),
});
export type AboutInfo = z.infer<typeof aboutInfoSchema>;

export const settingsResponseSchema = z.object({
  services: z.record(flatServiceIdSchema, flatServiceStateSchema),
  instances: z.record(instanceTypeSchema, z.array(serviceInstanceSchema)),
  /** Visibilité dans le menu latéral (`sidebar_hide_*`), par service ou page interne. */
  sidebar: z.record(z.string(), z.boolean()),
  /** Préférences d'affichage : valeurs enregistrées ou par défaut (fuseau vide possible). */
  display: displayValuesSchema,
  /** Fuseau du système, proposé quand aucun n'est choisi (issue #12 de Prismarr). */
  systemTimezone: z.string(),
  timezones: z.array(z.string()),
  dashboard: dashboardLayoutSchema,
  /** Thème résolu, à appliquer après un changement de thème ou d'accent. */
  theme: resolvedThemeSchema,
  backup: exportCountsSchema,
  about: aboutInfoSchema,
});
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;

const trimmed = z.string().trim().max(2048);

/**
 * Modification d'un service. Champ absent : inchangé ; texte vide : effacé,
 * sauf pour un secret (inchangé, les navigateurs vident les champs mot de
 * passe) ; `clear` efface explicitement les champs effaçables ; `remove`
 * retire toute la configuration, secrets compris.
 */
export const servicePatchSchema = z.object({
  url: trimmed.optional(),
  apiKey: trimmed.optional(),
  user: trimmed.optional(),
  password: z.string().max(2048).optional(),
  enabled: z.boolean().optional(),
  clear: z.array(z.enum(['user', 'password'])).optional(),
  remove: z.boolean().optional(),
});
export type ServicePatch = z.infer<typeof servicePatchSchema>;

export const settingsSaveRequestSchema = z.object({
  services: z.partialRecord(flatServiceIdSchema, servicePatchSchema).optional(),
  sidebar: z.partialRecord(sidebarVisibilityIdSchema, z.boolean()).optional(),
  display: displayPatchSchema.optional(),
  dashboard: dashboardLayoutRequestSchema.optional(),
});
export type SettingsSaveRequest = z.infer<typeof settingsSaveRequestSchema>;

/** Valeurs du formulaire testées avant enregistrement ; vides → valeurs enregistrées. */
export const serviceTestRequestSchema = z.object({
  url: z.string().optional(),
  apiKey: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
});
export type ServiceTestRequest = z.infer<typeof serviceTestRequestSchema>;

export const serviceTestResponseSchema = z.object({
  ok: z.boolean(),
  /** Nom affiché du service. */
  service: z.string(),
  category: z.enum(DIAGNOSIS_CATEGORIES),
  http: z.number().int().nullable(),
});
export type ServiceTestResponse = z.infer<typeof serviceTestResponseSchema>;

export const okResponseSchema = z.object({ ok: z.literal(true) });

const instanceName = z.string().trim().max(100);
const instanceUrl = z.string().trim().max(2048);
const instanceSlug = z.string().trim().max(100);

/** Ajout d'une instance Radarr/Sonarr (`AdminInstancesController::add`). */
export const instanceCreateRequestSchema = z.object({
  name: instanceName,
  url: instanceUrl,
  apiKey: z.string().trim().max(256).optional(),
  /** Vide : tiré du nom. */
  slug: instanceSlug.optional(),
  enabled: z.boolean().optional(),
});
export type InstanceCreateRequest = z.infer<typeof instanceCreateRequestSchema>;

/**
 * Modification. Clé d'API vide : inchangée. `defaultQualityProfileId` absent :
 * inchangé ; `null` : aucun (premier profil disponible).
 */
export const instanceUpdateRequestSchema = instanceCreateRequestSchema.extend({
  position: z.number().int().min(0).max(10_000).optional(),
  defaultQualityProfileId: z.number().int().positive().nullable().optional(),
});
export type InstanceUpdateRequest = z.infer<typeof instanceUpdateRequestSchema>;

/** Réponse des mutations : les instances du type concerné, à jour. */
export const instanceListResponseSchema = z.object({
  type: instanceTypeSchema,
  instances: z.array(serviceInstanceSchema),
});
export type InstanceListResponse = z.infer<typeof instanceListResponseSchema>;

export const instanceTestResponseSchema = z.object({
  ok: z.boolean(),
  category: z.enum(DIAGNOSIS_CATEGORIES),
  http: z.number().int().nullable(),
});
export type InstanceTestResponse = z.infer<typeof instanceTestResponseSchema>;
