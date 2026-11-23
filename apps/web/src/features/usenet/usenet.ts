// SPDX-License-Identifier: AGPL-3.0-or-later
// Logique de la page Usenet (P3d.5), testée hors composants : appels de
// l'API, filtre et tri de la file (`visibleQueue`, `sortItems`), temps
// restant, motif d'échec NZBGet, préférences.

import {
  arrOkSchema,
  usenetBulkResponseSchema,
  usenetHistorySchema,
  usenetOverviewSchema,
  usenetQueueSchema,
  type UsenetClientId,
  type UsenetDownload,
} from '@hubarr/shared';
import { api } from '../../app/api/client';

export const USENET_POLL_MS = 3_000;
export const USENET_SORTS = ['name', 'size', 'progress', 'speed', 'eta'] as const;
export type UsenetSort = (typeof USENET_SORTS)[number];
export const USENET_FILTERS = [
  'all',
  'downloading',
  'fetching',
  'queued',
  'paused',
  'verifying',
  'extracting',
] as const;

export const usenetKeys = {
  all: (client: UsenetClientId) => ['usenet', client] as const,
  queue: (client: UsenetClientId) => ['usenet', client, 'queue'] as const,
  overview: (client: UsenetClientId) => ['usenet', client, 'overview'] as const,
  history: (client: UsenetClientId, page: number) => ['usenet', client, 'history', page] as const,
};

export function usenetApi(client: UsenetClientId) {
  const base = `/api/usenet/${client}`;
  return {
    queue: (signal?: AbortSignal) => api.get(`${base}/queue`, usenetQueueSchema, signal),
    overview: (signal?: AbortSignal) => api.get(base, usenetOverviewSchema, signal),
    history: (page: number, signal?: AbortSignal) =>
      api.get(`${base}/history?page=${page}`, usenetHistorySchema, signal),
    pauseAll: () => api.post(`${base}/pause`, {}, arrOkSchema),
    resumeAll: () => api.post(`${base}/resume`, {}, arrOkSchema),
    item: (id: string, verb: 'pause' | 'resume' | 'delete') =>
      api.post(`${base}/item/${encodeURIComponent(id)}/${verb}`, {}, arrOkSchema),
    bulk: (verb: 'pause' | 'resume' | 'delete', ids: string[]) =>
      api.post(`${base}/bulk/${verb}`, { ids }, usenetBulkResponseSchema),
    speedLimit: (mbps: number) => api.post(`${base}/speed-limit`, { mbps }, arrOkSchema),
    addUrl: (url: string, category: string | null) =>
      api.post(`${base}/add`, { url, category }, arrOkSchema),
    addFiles: (files: { name: string; content: string }[], category: string | null) =>
      api.post(`${base}/add-file`, { files, category }, arrOkSchema),
  };
}

/** File affichée : filtre d'état, recherche dans le nom, tri (inconnu en dernier pour l'ETA). */
export function visibleQueue(
  items: readonly UsenetDownload[],
  options: { filter: string; search: string; sort: UsenetSort; desc: boolean },
): UsenetDownload[] {
  const needle = options.search.trim().toLowerCase();
  const dir = options.desc ? -1 : 1;
  const value = (item: UsenetDownload): number => {
    switch (options.sort) {
      case 'size':
        return item.size;
      case 'progress':
        return item.percentage;
      case 'speed':
        return item.speed;
      case 'eta':
        return item.eta ?? Number.POSITIVE_INFINITY;
      default:
        return 0;
    }
  };
  return items
    .filter((item) => options.filter === 'all' || item.status === options.filter)
    .filter((item) => needle === '' || item.name.toLowerCase().includes(needle))
    .sort((a, b) => {
      if (options.sort === 'name') {
        const va = a.name.toLowerCase();
        const vb = b.name.toLowerCase();
        return va < vb ? -dir : va > vb ? dir : 0;
      }
      const diff = value(a) - value(b);
      return Number.isNaN(diff) ? 0 : diff * dir;
    });
}

/** Temps restant compact (`eta` de l'original) : « 1h05 », « 3m07s », « 9s ». */
export function formatEta(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  if (m > 0) return `${m}m${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Clé du motif d'échec NZBGet (`FAILURE/PAR` → `usenet.nzbget_fail.par`), sinon `null`. */
export function nzbgetFailKey(client: UsenetClientId, fail: string | null): string | null {
  if (client !== 'nzbget' || fail === null) return null;
  const reason = (fail.split('/')[1] ?? '').toLowerCase();
  return reason === '' ? null : `usenet.nzbget_fail.${reason}`;
}

export interface UsenetPrefs {
  view: 'list' | 'table' | 'compact';
  sort: UsenetSort;
  desc: boolean;
}

export function loadUsenetPrefs(
  client: UsenetClientId,
  storage: Storage = localStorage,
): UsenetPrefs {
  try {
    const raw = JSON.parse(
      storage.getItem(`hubarr.usenet.${client}`) ?? '{}',
    ) as Partial<UsenetPrefs>;
    const view = (['list', 'table', 'compact'] as const).find((value) => value === raw.view);
    const sort = USENET_SORTS.find((value) => value === raw.sort);
    return {
      view: view ?? 'list',
      sort: sort ?? 'name',
      desc: typeof raw.desc === 'boolean' ? raw.desc : false,
    };
  } catch {
    return { view: 'list', sort: 'name', desc: false };
  }
}

export function saveUsenetPrefs(
  client: UsenetClientId,
  prefs: UsenetPrefs,
  storage: Storage = localStorage,
): void {
  storage.setItem(`hubarr.usenet.${client}`, JSON.stringify(prefs));
}
