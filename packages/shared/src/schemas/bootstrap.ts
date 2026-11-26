// SPDX-License-Identifier: AGPL-3.0-or-later
// `GET /api/bootstrap` : ce dont le shell a besoin au premier rendu.
// Remplace les variables `window.*` de `base.html.twig`. Complété au fil des
// phases : préférences et services (P1).

import { z } from 'zod';
import { SUPPORTED_LOCALES } from '../constants/i18n';
import { authUserSchema } from './auth';
import { displayValuesSchema } from './preferences';
import { userPreferencesSchema } from './profile';
import { resolvedThemeSchema } from './theme';

/** État d'un service pour le shell (tiroir, gardes du routeur). */
export const bootstrapServiceSchema = z.object({
  /** Utilisable : champs requis présents et service activé (Radarr/Sonarr : une instance active). */
  configured: z.boolean(),
  /** Désactivé par son interrupteur. */
  disabled: z.boolean(),
});

export const bootstrapInstanceSchema = z.object({
  slug: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  isDefault: z.boolean(),
});

export const bootstrapServicesSchema = z.object({
  states: z.record(z.string(), bootstrapServiceSchema),
  instances: z.object({
    radarr: z.array(bootstrapInstanceSchema),
    sonarr: z.array(bootstrapInstanceSchema),
  }),
  /** Visibilité dans le menu latéral, par service ou page interne (`calendar`). */
  sidebar: z.record(z.string(), z.boolean()),
});
export type BootstrapServices = z.infer<typeof bootstrapServicesSchema>;

export const bootstrapResponseSchema = z.object({
  /** Vrai tant que l'assistant d'installation n'est pas terminé. */
  setupRequired: z.boolean(),
  user: authUserSchema.nullable(),
  /** Jeton CSRF de la session (anonyme au besoin). */
  csrfToken: z.string(),
  /** Langue résolue : session, puis préférence `display_language`, puis `en`. */
  locale: z.enum(SUPPORTED_LOCALES),
  /** Version de l'image (`HUBARR_VERSION`) ; vide sans session. */
  version: z.string(),
  /** Thème actif (`display_theme` + `display_theme_color`), résolu en couleurs. */
  theme: resolvedThemeSchema,
  /** Services configurés et instances ; vide sans session authentifiée. */
  services: bootstrapServicesSchema,
  /**
   * Préférences d'affichage résolues (fuseau du système si aucun n'est choisi) ;
   * valeurs par défaut sans session.
   */
  preferences: displayValuesSchema,
  /** Préférences du compte connecté (valeurs par défaut sans session). */
  userPreferences: userPreferencesSchema,
});
export type BootstrapResponse = z.infer<typeof bootstrapResponseSchema>;
