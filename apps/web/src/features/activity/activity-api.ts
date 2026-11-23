// SPDX-License-Identifier: AGPL-3.0-or-later
// Appels de l'API d'activité (`/api/tautulli/…`, `/api/tracearr/…`, P3e) et
// logique des graphiques (empilement, échelle), testée hors composants.

import {
  activitySchema,
  chartSchema,
  tautulliHistorySchema,
  tautulliLibrariesSchema,
  tautulliMetadataSchema,
  tautulliStatsSchema,
  tautulliUserNamesSchema,
  tautulliUsersSchema,
  tracearrChartsSchema,
  tracearrHistorySchema,
  tracearrStatsSchema,
  tracearrUserDetailSchema,
  tracearrUsersSchema,
  type Chart,
} from '@hubarr/shared';
import { api } from '../../app/api/client';

export const NOW_PLAYING_POLL_MS = 10_000;

export interface TautulliFilters {
  range: number;
  metric: 'plays' | 'duration';
  user: string;
}

const query = (params: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();

export const tautulliApi = {
  activity: (signal?: AbortSignal) => api.get('/api/tautulli/now-playing', activitySchema, signal),
  stats: (f: TautulliFilters, signal?: AbortSignal) =>
    api.get(`/api/tautulli/stats?${query({ ...f })}`, tautulliStatsSchema, signal),
  chart: (path: string, f: TautulliFilters & { mode?: string }, signal?: AbortSignal) =>
    api.get(`/api/tautulli/${path}?${query({ ...f })}`, chartSchema, signal),
  history: (start: number, user: string, signal?: AbortSignal) =>
    api.get(
      `/api/tautulli/history?${query({ start, length: 25, user })}`,
      tautulliHistorySchema,
      signal,
    ),
  libraries: (signal?: AbortSignal) =>
    api.get('/api/tautulli/libraries', tautulliLibrariesSchema, signal),
  users: (signal?: AbortSignal) => api.get('/api/tautulli/users', tautulliUsersSchema, signal),
  userNames: (signal?: AbortSignal) =>
    api.get('/api/tautulli/user-names', tautulliUserNamesSchema, signal),
  metadata: (ratingKey: string, signal?: AbortSignal) =>
    api.get(`/api/tautulli/metadata/${ratingKey}`, tautulliMetadataSchema, signal),
};

export const tracearrApi = {
  activity: (signal?: AbortSignal) => api.get('/api/tracearr/now-playing', activitySchema, signal),
  stats: (signal?: AbortSignal) => api.get('/api/tracearr/stats', tracearrStatsSchema, signal),
  charts: (period: string, signal?: AbortSignal) =>
    api.get(
      `/api/tracearr/charts?period=${encodeURIComponent(period)}`,
      tracearrChartsSchema,
      signal,
    ),
  history: (cursor: string | null, signal?: AbortSignal) =>
    api.get(
      `/api/tracearr/history${cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`}`,
      tracearrHistorySchema,
      signal,
    ),
  users: (signal?: AbortSignal) => api.get('/api/tracearr/users', tracearrUsersSchema, signal),
  user: (key: string, signal?: AbortSignal) =>
    api.get(`/api/tracearr/users/${encodeURIComponent(key)}`, tracearrUserDetailSchema, signal),
};

/** Couleurs des séries (thème) : une par série, dans l'ordre. */
export const SERIES_COLORS = [
  'primary',
  'info',
  'success',
  'warning',
  'error',
  'secondary',
] as const;

/** Barres empilées : total par catégorie et plafond de l'échelle. */
export function stackChart(chart: Chart): { totals: number[]; max: number } {
  const totals = chart.categories.map((_, i) =>
    chart.series.reduce((sum, serie) => sum + (serie.data[i] ?? 0), 0),
  );
  const max = Math.max(0, ...totals);
  return { totals, max: max === 0 ? 1 : max };
}

export function chartIsEmpty(chart: Chart | undefined): boolean {
  return (
    chart === undefined ||
    chart.categories.length === 0 ||
    stackChart(chart).totals.every((t) => t === 0)
  );
}

/** Durée en secondes → « 2h 05m » ou « 12m » (`secondsLabel`). */
export function durationLabel(seconds: number): string {
  if (seconds <= 0) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
