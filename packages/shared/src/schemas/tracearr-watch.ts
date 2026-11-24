// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats du « Vu » via Tracearr (lot 7) :
//   GET  /api/profil/tracearr        association du compte et état de la synchronisation
//   POST /api/profil/tracearr        choix de son identité Tracearr (`key: null` : aucune)
//   POST /api/admin/tracearr/resync  réimport complet des lectures (admin)
//   GET  /api/tracearr/watched       titres vus par l'utilisateur connecté
// Les identités Tracearr ne sont désignées que par un jeton opaque (`key`),
// jamais par leur identifiant.

import { z } from 'zod';

/** Pourquoi l'association est indisponible. */
export const TRACEARR_LINK_UNAVAILABLE = ['unconfigured', 'unsupported', 'unreachable'] as const;

export const tracearrAccountSchema = z.object({ key: z.string(), name: z.string() });
export type TracearrAccount = z.infer<typeof tracearrAccountSchema>;

export const tracearrSyncStatusSchema = z.object({
  /** Dernier passage (ISO 8601 UTC), `null` avant le premier. */
  lastRunAt: z.string().nullable(),
  /** Code d'erreur du dernier passage, `null` s'il a réussi. */
  error: z.string().nullable(),
  /** Lectures importées pour cette identité. */
  plays: z.number().int().nonnegative(),
});
export type TracearrSyncStatus = z.infer<typeof tracearrSyncStatusSchema>;

export const tracearrLinkSchema = z.object({
  /** `null` : association possible ; sinon la raison. */
  unavailable: z.enum(TRACEARR_LINK_UNAVAILABLE).nullable(),
  accounts: z.array(tracearrAccountSchema),
  /** Identité associée (`name` à `null` si Tracearr ne la connaît plus). */
  linked: z.object({ key: z.string(), name: z.string().nullable() }).nullable(),
  sync: tracearrSyncStatusSchema.nullable(),
});
export type TracearrLink = z.infer<typeof tracearrLinkSchema>;

export const tracearrLinkRequestSchema = z.object({
  key: z
    .string()
    .regex(/^[A-Za-z0-9_-]{22}$/)
    .nullable(),
});
export type TracearrLinkRequest = z.infer<typeof tracearrLinkRequestSchema>;

/** Épisode vu : `[saison, épisode]`. */
const episodeRefSchema = z.tuple([z.number().int(), z.number().int()]);

export const tracearrWatchedSchema = z.object({
  /** Un compte Tracearr est associé à l'utilisateur connecté. */
  linked: z.boolean(),
  /** ID TMDB des films vus. */
  movies: z.array(z.number().int()),
  /** Séries dont au moins un épisode est vu, avec les épisodes vus (sans doublon). */
  shows: z.array(
    z.object({
      tmdbId: z.number().int().nullable(),
      tvdbId: z.number().int().nullable(),
      episodes: z.array(episodeRefSchema),
    }),
  ),
});
export type TracearrWatched = z.infer<typeof tracearrWatchedSchema>;
