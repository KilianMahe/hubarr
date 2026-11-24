// SPDX-License-Identifier: AGPL-3.0-or-later
// Journaux de l'application (`/api/admin/logs`), page « Journaux » des admins.

import {
  isServiceId,
  logsResponseSchema,
  type LogEntry,
  type LogLevelName,
  type LogsFilter,
} from '@hubarr/shared';
import { api } from '../../app/api/client';
import { serviceLabel } from '../../app/services';

export const LOGS_KEY = ['admin', 'logs'] as const;

/** Rafraîchissement automatique de la liste. */
export const LOGS_REFRESH_MS = 5_000;

/** Paramètres de requête des filtres (valeurs vides omises). */
export function logsSearchParams(filter: LogsFilter, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  if (filter.level !== undefined) params.set('level', filter.level);
  if (filter.service !== undefined && filter.service !== '') params.set('service', filter.service);
  if (filter.q !== undefined && filter.q.trim() !== '') params.set('q', filter.q.trim());
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

export const fetchLogs = (filter: LogsFilter, before: number | undefined, signal?: AbortSignal) =>
  api.get(
    `/api/admin/logs${logsSearchParams(filter, before === undefined ? {} : { before: String(before) })}`,
    logsResponseSchema,
    signal,
  );

/** Lien de téléchargement (`.jsonl`), relatif à `<base>`. */
export function logsExportHref(filter: LogsFilter): string {
  return `api/admin/logs/export${logsSearchParams(filter)}`;
}

/** Couleur Vuetify d'un niveau. */
export function levelColor(level: LogLevelName): string {
  if (level === 'fatal' || level === 'error') return 'error';
  if (level === 'warn') return 'warning';
  if (level === 'info') return 'info';
  return 'grey';
}

/** Nom affiché d'un service (identifiant brut s'il est inconnu). */
export function logServiceLabel(service: string): string {
  return isServiceId(service) ? serviceLabel(service) : service;
}

/** Entrée complète, telle qu'on la copie (JSON indenté). */
export function entryText(entry: LogEntry): string {
  return JSON.stringify(entry, null, 2);
}
