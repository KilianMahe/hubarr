// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats du profil `/api/profil/*` (P0.8, `ProfileController` d'origine).

import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '../constants/auth';
import { MEDIA_TYPES } from '../constants/domain';
import { DISPLAY_NAME_MAX_LENGTH } from '../constants/profile';
import { authUserSchema } from './auth';

/** Élément de la watchlist tel que le profil le prévisualise. */
export const profileWatchlistItemSchema = z.object({
  tmdbId: z.number().int(),
  mediaType: z.enum(MEDIA_TYPES),
  title: z.string(),
  /** Chemin TMDB (`/abc.jpg`), servi par `image.tmdb.org`. */
  posterPath: z.string().nullable(),
  year: z.number().int().nullable(),
});
export type ProfileWatchlistItem = z.infer<typeof profileWatchlistItemSchema>;

export const profileResponseSchema = z.object({
  user: authUserSchema,
  /** Nom affiché tel que saisi (vide si absent), pour pré-remplir le formulaire. */
  displayNameRaw: z.string(),
  /** Dates ISO 8601 UTC. */
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  watchlist: z.object({
    count: z.number().int().nonnegative(),
    /** Les 4 derniers ajouts, du plus récent au plus ancien. */
    recent: z.array(profileWatchlistItemSchema),
  }),
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

const optionalPassword = z.string().max(4096).default('');

/**
 * Formulaire du profil : nom affiché, et changement de mot de passe si l'un des
 * trois champs est rempli. Les messages sont les clés de l'original
 * (`flash.password.*`) ; le mot de passe actuel est en plus vérifié par le serveur.
 */
export const profileUpdateRequestSchema = z
  .object({
    displayName: z.string().trim().max(DISPLAY_NAME_MAX_LENGTH).default(''),
    currentPassword: optionalPassword,
    newPassword: optionalPassword,
    confirmPassword: optionalPassword,
  })
  .superRefine((data, ctx) => {
    const { currentPassword, newPassword, confirmPassword } = data;
    if (currentPassword === '' && newPassword === '' && confirmPassword === '') return;
    if (currentPassword === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['currentPassword'],
        message: 'flash.password.current_wrong',
      });
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      ctx.addIssue({ code: 'custom', path: ['newPassword'], message: 'flash.password.too_short' });
    }
    if (newPassword !== confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'flash.password.mismatch',
      });
    }
  });
export type ProfileUpdateRequest = z.input<typeof profileUpdateRequestSchema>;
