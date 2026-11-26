// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats des routes `/api/auth/*` (P0.6).

import { z } from 'zod';
import { USER_ROLES } from '../constants/domain';
import { userPermissionsSchema } from './users';

/** Utilisateur tel que l'API l'expose (jamais le hash du mot de passe). */
export const authUserSchema = z.object({
  id: z.number().int(),
  email: z.string(),
  role: z.enum(USER_ROLES),
  /** Nom affiché, ou l'e-mail à défaut (`User::getDisplayName` d'origine). */
  displayName: z.string(),
  /** URL de l'avatar (`/api/profil/avatar/file/…`), ou `null` : le front affiche alors les initiales. */
  avatarUrl: z.string().nullable(),
  /** Droits par service (`hasAccess`) ; vide pour un admin, qui a tous les droits. */
  permissions: userPermissionsSchema,
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const csrfTokenResponseSchema = z.object({ token: z.string() });
export type CsrfTokenResponse = z.infer<typeof csrfTokenResponseSchema>;

export const loginRequestSchema = z.object({
  email: z.string().trim().min(1).max(320),
  // Pas de longueur minimale ici : un mauvais mot de passe est un échec d'identification, pas une erreur de validation.
  password: z.string().min(1).max(4096),
  /** « Se souvenir de moi » : cookie persistant au lieu d'un cookie de session du navigateur. */
  remember: z.boolean().default(false),
});
export type LoginRequest = z.input<typeof loginRequestSchema>;

export const loginResponseSchema = z.object({
  user: authUserSchema,
  /** Nouveau jeton CSRF : la session est régénérée à la connexion. */
  csrfToken: z.string(),
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const loginThrottledDetailsSchema = z.object({
  /** Délai avant la prochaine tentative autorisée, en secondes. */
  retryAfter: z.number().int().nonnegative(),
});
