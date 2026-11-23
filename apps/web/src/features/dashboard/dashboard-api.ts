// SPDX-License-Identifier: AGPL-3.0-or-later
// Appels de l'API du tableau de bord (`/api/tableau-de-bord/…`, P4.1) et
// logique d'affichage testée hors composants (jours de la semaine, dates
// relatives, salutation, réordonnancement de la mise en page).

import {
  addDays,
  dashboardActivitySchema,
  dashboardEmbySchema,
  dashboardHealthSchema,
  dashboardHeroSchema,
  dashboardPageSchema,
  dashboardRecentSchema,
  dashboardRequestsSchema,
  dashboardTransmissionSchema,
  dashboardTrendingSchema,
  dashboardUpcomingSchema,
  quickLookDetailSchema,
  type DashboardLayout,
  type DashboardRef,
  type UpcomingItem,
} from '@hubarr/shared';
import type { RouteLocationRaw } from 'vue-router';
import { api } from '../../app/api/client';
import { mediaDetailLocation } from '../../app/media-links';

const widget = (name: string) => `/api/tableau-de-bord/widget/${name}`;

export const dashboardApi = {
  page: (signal?: AbortSignal) => api.get('/api/tableau-de-bord', dashboardPageSchema, signal),
  hero: (signal?: AbortSignal) => api.get(widget('hero'), dashboardHeroSchema, signal),
  upcoming: (signal?: AbortSignal) => api.get(widget('upcoming'), dashboardUpcomingSchema, signal),
  requests: (signal?: AbortSignal) => api.get(widget('requests'), dashboardRequestsSchema, signal),
  health: (signal?: AbortSignal) => api.get(widget('health'), dashboardHealthSchema, signal),
  activity: (signal?: AbortSignal) => api.get(widget('plex'), dashboardActivitySchema, signal),
  emby: (signal?: AbortSignal) => api.get(widget('emby'), dashboardEmbySchema, signal),
  transmission: (signal?: AbortSignal) =>
    api.get(widget('transmission'), dashboardTransmissionSchema, signal),
  recent: (signal?: AbortSignal) => api.get(widget('recent'), dashboardRecentSchema, signal),
  trending: (signal?: AbortSignal) =>
    api.get(widget('recommendations'), dashboardTrendingSchema, signal),
  quickLook: (target: DashboardRef, signal?: AbortSignal) =>
    api.get(
      target.kind === 'tmdb'
        ? `/api/tableau-de-bord/quicklook/tmdb/${target.type}/${target.id}`
        : `/api/tableau-de-bord/quicklook/${target.type}/${encodeURIComponent(target.slug)}/${target.id}`,
      quickLookDetailSchema,
      signal,
    ),
};

/** Relectures (`setInterval` de la page d'origine) : santé 30 s, activité et Transmission 10 s. */
export const HEALTH_POLL_MS = 30_000;
export const LIVE_POLL_MS = 10_000;

/** Salutation selon l'heure (fuseau d'affichage) : soir avant 5 h, matin, après-midi, soir. */
export function greetingKey(hour: number): string {
  if (hour < 5) return 'dashboard.greeting.evening';
  if (hour < 12) return 'dashboard.greeting.morning';
  if (hour < 18) return 'dashboard.greeting.afternoon';
  return 'dashboard.greeting.evening';
}

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Clé du jour de la semaine d'un jour « AAAA-MM-JJ ». */
export function weekdayKey(day: string): string {
  const index = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return `dashboard.weekdays.${WEEKDAYS[index] ?? 'mon'}`;
}

export interface UpcomingDay {
  day: string;
  dayOfMonth: number;
  isToday: boolean;
  items: UpcomingItem[];
}

/** Grille fixe de `days` jours à partir d'aujourd'hui (`upcomingByDay`). */
export function upcomingByDay(
  today: string,
  days: number,
  items: readonly UpcomingItem[],
): UpcomingDay[] {
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i);
    return {
      day,
      dayOfMonth: Number(day.slice(8, 10)),
      isToday: i === 0,
      items: items.filter((item) => item.day === day),
    };
  });
}

/** Date relative « Aujourd'hui / Hier / il y a 3 j » (`relativeDate`), `null` sans date. */
export function relativeDate(
  iso: string | null,
  now: Date,
): { key: string; count?: number } | null {
  if (iso === null) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const days = Math.floor(Math.abs(now.getTime() - at) / 86_400_000);
  if (days === 0) return { key: 'dashboard.relative.today' };
  if (days === 1) return { key: 'dashboard.relative.yesterday' };
  if (days < 7) return { key: 'dashboard.relative.days_ago', count: days };
  if (days < 30) return { key: 'dashboard.relative.weeks_ago', count: Math.round(days / 7) };
  if (days < 365) return { key: 'dashboard.relative.months_ago', count: Math.round(days / 30) };
  return { key: 'dashboard.relative.years_ago', count: Math.round(days / 365) };
}

/** Lien vers la fiche d'un film ou d'une série (`/medias/<slug>/films/<id>`) ou TMDB. */
export function refLocation(ref: DashboardRef): RouteLocationRaw {
  if (ref.kind === 'tmdb') return { name: 'tmdb', query: { detail: `${ref.type}/${ref.id}` } };
  return mediaDetailLocation(ref.type === 'series' ? 'sonarr' : 'radarr', ref.slug, ref.id);
}

/** Déplace une section d'un cran (mode édition de la mise en page). */
export function moveSection(
  layout: DashboardLayout,
  index: number,
  delta: -1 | 1,
): DashboardLayout {
  const target = index + delta;
  if (target < 0 || target >= layout.length) return layout;
  const next = [...layout];
  const [moved] = next.splice(index, 1);
  if (moved !== undefined) next.splice(target, 0, moved);
  return next;
}
