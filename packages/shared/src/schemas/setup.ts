// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats de l'assistant d'installation `/api/setup/*` (P0.7, `SetupController` d'origine).

import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '../constants/auth';
import { SUPPORTED_LOCALES } from '../constants/i18n';
import { authUserSchema } from './auth';

/**
 * Étape vers laquelle envoyer le visiteur (`SetupController::root`) :
 * - `welcome` : installation vierge, l'assistant commence ;
 * - `services` : l'installation vient d'être close, direction la configuration des services ;
 * - `home` : installation déjà terminée, l'assistant est fermé.
 */
export const SETUP_NEXT_STEPS = ['welcome', 'services', 'home'] as const;
export type SetupNextStep = (typeof SETUP_NEXT_STEPS)[number];

export const setupStateResponseSchema = z.object({ next: z.enum(SETUP_NEXT_STEPS) });
export type SetupStateResponse = z.infer<typeof setupStateResponseSchema>;

export const setupLocaleRequestSchema = z.object({ locale: z.enum(SUPPORTED_LOCALES) });
export type SetupLocaleRequest = z.infer<typeof setupLocaleRequestSchema>;

/**
 * Compte administrateur. Les messages d'erreur sont des clés de traduction de
 * l'original (`setup.error.*`), que le front affiche toutes à la fois.
 */
export const setupAdminRequestSchema = z
  .object({
    email: z
      .string()
      .trim()
      .max(180)
      .pipe(z.email({ error: 'setup.error.email_invalid' })),
    displayName: z.string().trim().max(100).optional(),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, { error: 'setup.error.password_too_short' })
      .max(4096),
    passwordConfirm: z.string().max(4096),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    path: ['passwordConfirm'],
    error: 'setup.error.password_mismatch',
    // Contrôlé même si un autre champ est invalide : toutes les erreurs sont signalées ensemble.
    when: (payload) =>
      typeof (payload.value as { password?: unknown }).password === 'string' &&
      typeof (payload.value as { passwordConfirm?: unknown }).passwordConfirm === 'string',
  });
export type SetupAdminRequest = z.input<typeof setupAdminRequestSchema>;

export const setupAdminResponseSchema = z.object({
  user: authUserSchema,
  /** Nouveau jeton CSRF : l'admin est connecté dans une session régénérée. */
  csrfToken: z.string(),
  next: z.literal('services'),
});
export type SetupAdminResponse = z.infer<typeof setupAdminResponseSchema>;
