// SPDX-License-Identifier: AGPL-3.0-or-later
// « Prochains épisodes » d'une instance Sonarr (P5c.6, V17) :
// épisodes du calendrier sur 14 jours à partir d'aujourd'hui, groupés par
// jour de diffusion, dans l'ordre des diffusions.

import { addDays, type CalendarEvent } from '@hubarr/shared';

export const UPCOMING_DAYS = 14;

export type UpcomingStatus = 'available' | 'missing' | 'upcoming';

export interface UpcomingDay {
  /** « AAAA-MM-JJ ». */
  day: string;
  episodes: CalendarEvent[];
}

/** Disponible (fichier), manquant (déjà diffusé sans fichier) ou à venir. */
export function upcomingStatus(episode: CalendarEvent, now: number): UpcomingStatus {
  if (episode.hasFile) return 'available';
  const aired = episode.airDateUtc === null ? NaN : Date.parse(episode.airDateUtc);
  return aired < now ? 'missing' : 'upcoming';
}

export function upcomingDays(
  events: readonly CalendarEvent[],
  slug: string,
  today: string,
  days = UPCOMING_DAYS,
): UpcomingDay[] {
  const last = addDays(today, days - 1);
  const byDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const day = event.date;
    if (event.type !== 'episode' || event.instanceSlug !== slug || day === null) continue;
    if (day < today || day > last) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({
      day,
      episodes: [...list].sort((a, b) => (a.airDateUtc ?? '').localeCompare(b.airDateUtc ?? '')),
    }));
}
