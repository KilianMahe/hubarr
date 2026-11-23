// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats de la recherche globale de la barre du haut (P4.5) :
// `MediaController::globalSearch` (bibliothèques locales) et
// `globalSearchOnline` (recherche Radarr/Sonarr en ligne).

import { z } from 'zod';
import { bazarrStatusSchema } from './bazarr';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const globalSearchQuerySchema = z.object({ q: z.string().max(200).catch('') });

export const localSearchHitSchema = z.object({
  type: z.enum(['film', 'serie']),
  id: z.number(),
  title: z.string(),
  originalTitle: nullableString,
  year: nullableNumber,
  hasFile: z.boolean(),
  poster: nullableString,
  inLibrary: z.literal(true),
  instance: z.object({ slug: z.string(), name: z.string() }),
  /** Sous-titres (Bazarr), absent si non suivi ou index pas encore chargé. */
  subtitle: bazarrStatusSchema.optional(),
});
export type LocalSearchHit = z.infer<typeof localSearchHitSchema>;
export const localSearchResponseSchema = z.array(localSearchHitSchema);

export const onlineSearchHitSchema = z.object({
  type: z.enum(['film', 'serie']),
  /** Id TMDB (film) ou TheTVDB (série) : celui qu'attend l'ajout. */
  id: z.number(),
  tmdbId: nullableNumber,
  tvdbId: nullableNumber,
  title: z.string(),
  year: nullableNumber,
  poster: nullableString,
  hasFile: z.boolean(),
  inLibrary: z.boolean(),
});
export type OnlineSearchHit = z.infer<typeof onlineSearchHitSchema>;
export const onlineSearchResponseSchema = z.array(onlineSearchHitSchema);
