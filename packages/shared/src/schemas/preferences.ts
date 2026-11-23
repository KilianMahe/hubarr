// SPDX-License-Identifier: AGPL-3.0-or-later
// Préférences d'affichage, mise en page du tableau de bord et langues (P1.5).

import { z } from 'zod';
import {
  DASHBOARD_SECTIONS,
  DISPLAY_OPTION_KEYS,
  type DisplayOptionKey,
} from '../constants/display';

const displayKeySchema = z.enum(DISPLAY_OPTION_KEYS as [DisplayOptionKey, ...DisplayOptionKey[]]);

/** Valeurs résolues de toutes les préférences (fuseau vide : celui du système). */
export const displayValuesSchema = z.record(displayKeySchema, z.string());

/** Modification : valeur hors liste ou vide → retour à la valeur par défaut. */
export const displayPatchSchema = z.partialRecord(displayKeySchema, z.string().max(64));

export const dashboardSectionSchema = z.enum(DASHBOARD_SECTIONS);

export const dashboardLayoutSchema = z.array(
  z.object({ key: dashboardSectionSchema, visible: z.boolean() }),
);
export type DashboardLayout = z.infer<typeof dashboardLayoutSchema>;

/**
 * Mise en page envoyée (`dashboardLayout` d'origine) : ordre et sections
 * masquées ; clés inconnues ou en double ignorées.
 */
export const dashboardLayoutRequestSchema = z.object({
  order: z.array(z.string().max(32)).max(32),
  hidden: z.array(z.string().max(32)).max(32),
});
export type DashboardLayoutRequest = z.infer<typeof dashboardLayoutRequestSchema>;

const languageOption = z.object({ id: z.number().int(), name: z.string() });

export const arrLanguagesSchema = z.object({
  slug: z.string(),
  name: z.string(),
  current: z.number().int().nullable(),
  /** Radarr seulement (`movieInfoLanguage`) ; Sonarr v4 n'a plus de langue globale. */
  currentInfo: z.number().int().nullable(),
  available: z.array(languageOption),
  error: z.boolean(),
});

const codeLanguagesSchema = z.object({
  configured: z.boolean(),
  current: z.string().nullable(),
  available: z.record(z.string(), z.string()),
  error: z.boolean(),
});

/** Section « Langues » (`loadServiceLanguages`). */
export const languagesResponseSchema = z.object({
  hubarr: z.object({ ui: z.string(), metadata: z.string() }),
  radarr: z.array(arrLanguagesSchema),
  sonarr: z.array(arrLanguagesSchema),
  prowlarr: codeLanguagesSchema,
  seerr: codeLanguagesSchema,
});
export type LanguagesResponse = z.infer<typeof languagesResponseSchema>;

const slugMap = z.record(z.string(), z.number().int().positive());

/** Enregistrement (`languagesSave`) : seuls les champs présents sont appliqués. */
export const languagesSaveRequestSchema = z.object({
  hubarrUi: z.string().optional(),
  hubarrMetadata: z.string().optional(),
  radarrUi: slugMap.optional(),
  radarrInfo: slugMap.optional(),
  sonarrUi: slugMap.optional(),
  prowlarrUi: z.string().optional(),
  seerrUi: z.string().optional(),
});
export type LanguagesSaveRequest = z.infer<typeof languagesSaveRequestSchema>;

export const languagesSaveResponseSchema = z.object({
  /** Noms des instances ou services dont l'enregistrement a échoué. */
  failed: z.array(z.string()),
  locale: z.string(),
});
export type LanguagesSaveResponse = z.infer<typeof languagesSaveResponseSchema>;
