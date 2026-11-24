// SPDX-License-Identifier: AGPL-3.0-or-later
// Tampon circulaire des dernières entrées de journal, lu par la page
// « Journaux » (`GET /api/admin/logs`). Il vit en mémoire : il se vide au
// redémarrage, et les entrées les plus anciennes sont écartées au-delà de sa
// capacité. Les entrées arrivent déjà masquées (`createLogStream`).

import {
  LOG_LEVEL_NAMES,
  logLevelValue,
  type LogEntry,
  type LogLevelName,
  type LogsFilter,
} from '@hubarr/shared';

export const LOG_BUFFER_CAPACITY = 1_000;

/** Champs pino sans intérêt pour la page (processus, machine) ou repris à part. */
const OMITTED_FIELDS = new Set(['level', 'time', 'msg', 'pid', 'hostname', 'service', 'v']);

export function levelName(value: number): LogLevelName {
  const index = Math.min(Math.max(Math.floor(value / 10) - 1, 0), LOG_LEVEL_NAMES.length - 1);
  return LOG_LEVEL_NAMES[index] ?? 'info';
}

export interface LogPage {
  entries: LogEntry[];
  total: number;
  nextBefore: number | null;
}

export class LogBuffer {
  readonly capacity: number;
  /** Niveau minimal capturé (affiché par la page). */
  readonly level: LogLevelName;
  readonly #entries: LogEntry[] = [];
  #nextId = 1;

  constructor(options: { capacity?: number; level?: LogLevelName } = {}) {
    this.capacity = options.capacity ?? LOG_BUFFER_CAPACITY;
    this.level = options.level ?? 'warn';
  }

  /** Ajoute une entrée pino déjà masquée (objet JSON d'une ligne). */
  push(record: Record<string, unknown>): void {
    const level = typeof record.level === 'number' ? record.level : 30;
    if (level < logLevelValue(this.level)) return;
    const context: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!OMITTED_FIELDS.has(key)) context[key] = value;
    }
    const time = typeof record.time === 'number' ? record.time : Date.now();
    this.#entries.push({
      id: this.#nextId++,
      time: new Date(time).toISOString(),
      level: levelName(level),
      msg: typeof record.msg === 'string' ? record.msg : '',
      service: typeof record.service === 'string' ? record.service : null,
      context,
    });
    if (this.#entries.length > this.capacity) this.#entries.shift();
  }

  get size(): number {
    return this.#entries.length;
  }

  /** Services cités par les entrées du tampon, triés. */
  services(): string[] {
    const set = new Set<string>();
    for (const entry of this.#entries) if (entry.service !== null) set.add(entry.service);
    return [...set].sort();
  }

  /** Entrées correspondant aux filtres, plus récentes d'abord. */
  filter(filter: LogsFilter): LogEntry[] {
    const min = filter.level === undefined ? 0 : logLevelValue(filter.level);
    const service = filter.service === undefined || filter.service === '' ? null : filter.service;
    const needle = (filter.q ?? '').toLowerCase();
    const out: LogEntry[] = [];
    for (let index = this.#entries.length - 1; index >= 0; index--) {
      const entry = this.#entries[index];
      if (entry === undefined) continue;
      if (logLevelValue(entry.level) < min) continue;
      if (service !== null && entry.service !== service) continue;
      if (needle !== '' && !matches(entry, needle)) continue;
      out.push(entry);
    }
    return out;
  }

  /** Page de `limit` entrées antérieures à `before` (plus récentes d'abord). */
  page(filter: LogsFilter & { before?: number | undefined; limit: number }): LogPage {
    const all = this.filter(filter);
    const before = filter.before;
    const start = before === undefined ? 0 : all.findIndex((entry) => entry.id < before);
    const from = start === -1 ? all.length : start;
    const entries = all.slice(from, from + filter.limit);
    const last = entries.at(-1);
    const more = from + entries.length < all.length;
    return { entries, total: all.length, nextBefore: more && last ? last.id : null };
  }

  clear(): void {
    this.#entries.length = 0;
  }
}

function matches(entry: LogEntry, needle: string): boolean {
  if (entry.msg.toLowerCase().includes(needle)) return true;
  if (entry.service?.toLowerCase().includes(needle) === true) return true;
  return JSON.stringify(entry.context).toLowerCase().includes(needle);
}
