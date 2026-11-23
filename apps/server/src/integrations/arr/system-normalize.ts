// SPDX-License-Identifier: AGPL-3.0-or-later
// Formes réduites des ressources système des API *arr (Radarr, Sonarr,
// Prowlarr) : sauvegardes, mises à jour, tâches planifiées, journaux. Communes
// à l'administration Radarr/Sonarr (P3b.5) et à Prowlarr (P3c.3).

import type { ArrUpdate, Backup, LogRecord, SystemTask } from '@hubarr/shared';
import { isoDate } from '../radarr/normalize';
import type { ArrRecord } from './admin';

export const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
export const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);
export const record = (value: unknown): ArrRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as ArrRecord) : {};
/** Date ISO 8601 d'un champ texte (illisible → `null`). */
export const date = (value: unknown): string | null => isoDate(text(value));
export const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export function backupOf(item: ArrRecord): Backup[] {
  if (typeof item.id !== 'number') return [];
  return [
    {
      id: item.id,
      name: text(item.name) ?? `#${item.id}`,
      type: text(item.type),
      size: num(item.size),
      time: date(item.time),
    },
  ];
}

export function updateOf(item: ArrRecord): ArrUpdate[] {
  const version = text(item.version);
  if (version === null) return [];
  const changes = record(item.changes);
  return [
    {
      version,
      branch: text(item.branch),
      releaseDate: date(item.releaseDate),
      installed: item.installed === true,
      installable: item.installable === true,
      latest: item.latest === true,
      changes: { new: strings(changes.new), fixed: strings(changes.fixed) },
    },
  ];
}

export function taskOf(item: ArrRecord): SystemTask[] {
  if (typeof item.id !== 'number') return [];
  return [
    {
      id: item.id,
      name: text(item.name) ?? text(item.taskName) ?? `#${item.id}`,
      taskName: text(item.taskName) ?? '',
      interval: num(item.interval),
      lastExecution: date(item.lastExecution),
      nextExecution: date(item.nextExecution),
      lastDuration: text(item.lastDuration),
    },
  ];
}

export function logOf(item: ArrRecord): LogRecord {
  const exception = text(item.exception);
  return {
    time: date(item.time),
    level: (text(item.level) ?? 'info').toLowerCase(),
    logger: text(item.logger),
    message: text(item.message),
    exception: exception === null ? null : exception.slice(0, 2000),
  };
}
