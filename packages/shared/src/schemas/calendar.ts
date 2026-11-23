// SPDX-License-Identifier: AGPL-3.0-or-later
// Contrats du calendrier (P4.2) : sorties Radarr (cinéma, numérique,
// physique) et épisodes Sonarr de toutes les instances actives, dédoublonnés
// (`CalendrierController::index`).

import { z } from 'zod';

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();

export const CALENDAR_RELEASE_TYPES = [
  'cinema',
  'digital',
  'physical',
  'unknown',
  'episode',
] as const;
export type CalendarReleaseType = (typeof CALENDAR_RELEASE_TYPES)[number];

export const calendarEventSchema = z.object({
  type: z.enum(['film', 'episode']),
  releaseType: z.enum(CALENDAR_RELEASE_TYPES),
  /** Jour de l'événement (« AAAA-MM-JJ ») ; `null` pour un film sans date. */
  date: nullableString,
  /** Instant de diffusion d'un épisode (ISO 8601), pour afficher l'heure. */
  airDateUtc: nullableString,
  /** Titre du film, ou de l'épisode. */
  title: z.string(),
  seriesTitle: nullableString,
  season: nullableNumber,
  episode: nullableNumber,
  year: nullableNumber,
  poster: nullableString,
  fanart: nullableString,
  overview: nullableString,
  status: nullableString,
  hasFile: z.boolean(),
  monitored: z.boolean(),
  /** Id du film (Radarr) ou de la série (Sonarr) dans l'instance. */
  id: nullableNumber,
  runtime: nullableNumber,
  studio: nullableString,
  network: nullableString,
  genres: z.array(z.string()),
  certification: nullableString,
  instanceSlug: z.string(),
  instanceName: z.string(),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

export const calendarResponseSchema = z.object({
  events: z.array(calendarEventSchema),
  totalFilms: z.number(),
  totalEpisodes: z.number(),
  radarrFailed: z.boolean(),
  sonarrFailed: z.boolean(),
  radarrConfigured: z.boolean(),
  sonarrConfigured: z.boolean(),
});
export type CalendarResponse = z.infer<typeof calendarResponseSchema>;
