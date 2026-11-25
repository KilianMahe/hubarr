// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats du profil `/api/profil/*` (P0.8, `ProfileController` d'origine).

import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '../constants/auth';
import { MEDIA_TYPES } from '../constants/domain';
import { DISPLAY_NAME_MAX_LENGTH, LIBRARY_VIEW_MODES, TORRENT_VIEWS } from '../constants/profile';
import { authUserSchema } from './auth';
import { TORRENT_FILTERS } from './torrents';

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

/**
 * Préférences du compte : mode d'affichage par défaut des bibliothèques Radarr
 * et Sonarr (`auto` : grille sur grand écran, liste étendue sur mobile), mode et
 * filtre par défaut de la liste des torrents. Chaque page s'ouvre sur ces
 * valeurs ; un changement fait sur la page ne vaut que pour la visite.
 */
export const userPreferencesSchema = z.object({
  moviesView: z.enum(['auto', ...LIBRARY_VIEW_MODES]),
  seriesView: z.enum(['auto', ...LIBRARY_VIEW_MODES]),
  torrentsView: z.enum(TORRENT_VIEWS),
  torrentsFilter: z.enum(TORRENT_FILTERS),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  moviesView: 'auto',
  seriesView: 'auto',
  torrentsView: 'table',
  torrentsFilter: 'all',
};

/**
 * Lecture tolérante (colonne JSON en base) : une valeur absente ou inconnue
 * reprend sa valeur par défaut, sans invalider les autres.
 */
export function parseUserPreferences(raw: unknown): UserPreferences {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_USER_PREFERENCES };
  for (const key of Object.keys(out) as (keyof UserPreferences)[]) {
    const parsed = userPreferencesSchema.shape[key].safeParse(source[key]);
    if (parsed.success) Object.assign(out, { [key]: parsed.data });
  }
  return out;
}
