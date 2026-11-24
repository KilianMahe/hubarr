// SPDX-License-Identifier: AGPL-3.0-or-later
// Calendrier (`/api/calendrier`, P4.2) : appel et logique d'affichage testée
// hors composants (filtres, grilles du mois et de la semaine, couleurs,
// titres), portée du JavaScript de `calendrier/index.html.twig`.

import {
  CALENDAR_DOWNLOAD_STATUSES,
  addDays,
  calendarResponseSchema,
  type CalendarDownloadStatus,
  type CalendarEvent,
} from '@hubarr/shared';
import { msAlbum, msHelp, msPlayCircle, msTheaters, msTv } from '../../components/symbols';
import { api } from '../../app/api/client';

export const calendarApi = {
  events: (signal?: AbortSignal) => api.get('/api/calendrier', calendarResponseSchema, signal),
};

export const CALENDAR_VIEWS = ['month', 'week', 'day'] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];
export const VIEW_STORAGE_KEY = 'hubarr.calendar-view';

export const TYPE_FILTERS = ['all', 'cinema', 'digital', 'physical', 'episode'] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];
export const STATUS_FILTERS = ['all', ...CALENDAR_DOWNLOAD_STATUSES] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

/**
 * Couleur d'un statut de téléchargement : couleur du thème Vuetify (suit le
 * thème clair ou sombre), pour `color=` des composants.
 */
export const STATUS_COLORS: Record<CalendarDownloadStatus, string> = {
  downloaded: 'success',
  downloading: 'warning',
  missing: 'error',
  upcoming: 'info',
  unmonitored: 'muted',
};

/** Même couleur en CSS (liserés, pastilles). */
export const statusCss = (status: CalendarDownloadStatus) =>
  `rgb(var(--v-theme-${STATUS_COLORS[status]}))`;

/** Icône d'un type de sortie (le type n'a plus de couleur, P5 lot 2). */
export const RELEASE_ICONS: Record<CalendarEvent['releaseType'], string> = {
  cinema: msTheaters,
  digital: msPlayCircle,
  physical: msAlbum,
  episode: msTv,
  unknown: msHelp,
};

export function matchEvent(ev: CalendarEvent, type: TypeFilter, status: StatusFilter): boolean {
  if (type !== 'all') {
    if (type === 'episode' ? ev.type !== 'episode' : ev.releaseType !== type) return false;
  }
  return status === 'all' || ev.downloadStatus === status;
}

/** Titre court d'un événement : le film, ou « Série S01E02 ». */
export function eventTitle(ev: CalendarEvent): string {
  if (ev.type === 'film') return ev.title;
  const pad = (n: number | null) => String(n ?? 0).padStart(2, '0');
  return `${ev.seriesTitle ?? ''} S${pad(ev.season)}E${pad(ev.episode)}`;
}

/** Lundi de la semaine d'un jour « AAAA-MM-JJ ». */
export function startOfWeek(day: string): string {
  const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

export interface MonthCell {
  day: string;
  inMonth: boolean;
}

/** Grille du mois (semaines complètes, lundi en tête). */
export function monthGrid(year: number, month: number): MonthCell[] {
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const start = startOfWeek(first);
  const next = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10);
  const cells: MonthCell[] = [];
  let day = start;
  while (day < next || cells.length % 7 !== 0) {
    cells.push({ day, inMonth: day.slice(0, 7) === first.slice(0, 7) });
    day = addDays(day, 1);
  }
  return cells;
}

/** Événements par jour. */
export function byDay(events: readonly CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    if (ev.date === null) continue;
    const list = map.get(ev.date) ?? [];
    list.push(ev);
    map.set(ev.date, list);
  }
  return map;
}
