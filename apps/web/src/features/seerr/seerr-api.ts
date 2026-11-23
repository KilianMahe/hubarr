// SPDX-License-Identifier: AGPL-3.0-or-later
// Appels de l'API Seerr (`/api/jellyseerr/…`, P3f), clés TanStack Query,
// pages de la navigation et logique des permissions (arbre de l'écran
// utilisateur), testée hors composants.

import {
  SEERR_PERMISSION_TREE,
  seerrAboutSchema,
  seerrJellyfinUsersSchema,
  seerrLogsSchema,
  seerrObjectSchema,
  seerrOkDataSchema,
  seerrOkSchema,
  seerrPendingCountSchema,
  seerrRequestSchema,
  seerrRequestsPageSchema,
  seerrServiceInfoSchema,
  seerrServicesPageSchema,
  seerrSettingsPageSchema,
  seerrTasksSchema,
  seerrUpdatesSchema,
  seerrUserDetailSchema,
  seerrUsersPageSchema,
} from '@hubarr/shared';
import { z } from 'zod';
import { api } from '../../app/api/client';

const BASE = '/api/jellyseerr';
const qs = (params: Record<string, string | number>) =>
  new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();

export const seerrApi = {
  requests: (
    params: { filter: string; type: string; sort: string; page: number },
    signal?: AbortSignal,
  ) => api.get(`${BASE}?${qs(params)}`, seerrRequestsPageSchema, signal),
  pendingCount: (signal?: AbortSignal) =>
    api.get(`${BASE}/pending-count`, seerrPendingCountSchema, signal),
  request: (id: number, signal?: AbortSignal) =>
    api.get(`${BASE}/request/${id}`, seerrRequestSchema, signal),
  requestAction: (id: number, action: 'approve' | 'decline' | 'retry' | 'delete') =>
    api.post(`${BASE}/request/${id}/${action}`, {}, seerrOkSchema),
  editRequest: (id: number, body: Record<string, unknown>) =>
    api.post(`${BASE}/request/${id}/edit`, body, seerrOkDataSchema),
  serviceInfo: (type: 'radarr' | 'sonarr', signal?: AbortSignal) =>
    api.get(`${BASE}/service/${type}`, seerrServiceInfoSchema, signal),
  usersList: (signal?: AbortSignal) => api.get(`${BASE}/users`, z.array(seerrObjectSchema), signal),
  users: (signal?: AbortSignal) => api.get(`${BASE}/utilisateurs`, seerrUsersPageSchema, signal),
  user: (id: number, signal?: AbortSignal) =>
    api.get(`${BASE}/utilisateurs/${id}`, seerrUserDetailSchema, signal),
  createUser: (email: string, password: string) =>
    api.post(`${BASE}/utilisateurs/create`, { email, password }, seerrOkDataSchema),
  jellyfinUsers: (signal?: AbortSignal) =>
    api.get(`${BASE}/service/jellyfin-users`, seerrJellyfinUsersSchema, signal),
  importJellyfin: (jellyfinUserIds: string[]) =>
    api.post(`${BASE}/utilisateurs/import-jellyfin`, { jellyfinUserIds }, seerrOkSchema),
  userAction: (
    id: number,
    path: 'delete' | 'password' | 'notifications' | 'settings' | 'permissions' | 'quotas',
    body: unknown = {},
  ) => api.post(`${BASE}/utilisateurs/${id}/${path}`, body, seerrOkSchema),
  settings: (path: '' | '/utilisateurs', signal?: AbortSignal) =>
    api.get(`${BASE}/parametres${path}`, seerrSettingsPageSchema, signal),
  saveSettings: (body: Record<string, unknown>) =>
    api.post(`${BASE}/parametres/save`, body, seerrOkSchema),
  jellyfin: (signal?: AbortSignal) =>
    api.get(`${BASE}/parametres/jellyfin`, seerrObjectSchema, signal),
  jellyfinSync: () => api.post(`${BASE}/service/jellyfin-sync`, {}, seerrOkSchema),
  services: (signal?: AbortSignal) =>
    api.get(`${BASE}/parametres/services`, seerrServicesPageSchema, signal),
  saveServer: (kind: 'radarr' | 'sonarr', id: number | null, body: Record<string, unknown>) =>
    api.post(
      id === null
        ? `${BASE}/parametres/services/${kind}/create`
        : `${BASE}/parametres/services/${kind}/${id}/save`,
      body,
      seerrOkSchema,
    ),
  deleteServer: (kind: 'radarr' | 'sonarr', id: number) =>
    api.post(`${BASE}/parametres/services/${kind}/${id}/delete`, {}, seerrOkSchema),
  testServer: (kind: 'radarr' | 'sonarr', body: Record<string, unknown>) =>
    api.post(`${BASE}/parametres/services/test`, { ...body, type: kind }, seerrOkDataSchema),
  saveRule: (body: Record<string, unknown>) =>
    api.post(`${BASE}/parametres/services/rules/save`, body, seerrOkSchema),
  deleteRule: (id: number) =>
    api.post(`${BASE}/parametres/services/rules/${id}/delete`, {}, seerrOkSchema),
  about: (signal?: AbortSignal) => api.get(`${BASE}/parametres/a-propos`, seerrAboutSchema, signal),
  updates: (signal?: AbortSignal) =>
    api.get(`${BASE}/parametres/mises-a-jour`, seerrUpdatesSchema, signal),
  logs: (page: number, filter: string, signal?: AbortSignal) =>
    api.get(`${BASE}/parametres/logs?${qs({ page, filter })}`, seerrLogsSchema, signal),
  tasks: (signal?: AbortSignal) =>
    api.get(`${BASE}/parametres/taches-cache`, seerrTasksSchema, signal),
  job: (jobId: string, action: 'run' | 'cancel') =>
    api.post(`${BASE}/job/${encodeURIComponent(jobId)}/${action}`, {}, seerrOkDataSchema),
  schedule: (jobId: string, schedule: string) =>
    api.post(`${BASE}/job/${encodeURIComponent(jobId)}/schedule`, { schedule }, seerrOkDataSchema),
  flushCache: (cacheId?: string) =>
    api.post(
      cacheId === undefined
        ? `${BASE}/cache/flush`
        : `${BASE}/cache/${encodeURIComponent(cacheId)}/flush`,
      {},
      seerrOkSchema,
    ),
};

/** Premier texte non vide parmi les valeurs (texte, nombre ou booléen), sinon ''. */
export function text(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value !== '') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return '';
}

/** Champ d'un objet de Seerr (lecture tolérante). */
export function field<T>(
  row: Record<string, unknown> | null | undefined,
  key: string,
  fallback: T,
): T {
  const value = row?.[key];
  return value === undefined || value === null ? fallback : (value as T);
}

/**
 * État d'une case de permission (`user_detail.html.twig`) : cochée par son
 * bit ou par l'admin ; grisée quand son parent est coché (elle l'est alors
 * aussi) ou qu'aucun prérequis n'est coché ; masquée sans serveur 4K.
 */
export function permissionState(
  bit: number,
  permissions: number,
  has4k: boolean,
): { checked: boolean; disabled: boolean; hidden: boolean } {
  const node = SEERR_PERMISSION_TREE.find((p) => p.bit === bit);
  if (node === undefined) return { checked: false, disabled: true, hidden: true };
  const admin = (permissions & 2) !== 0 && bit !== 2;
  const parentOn = node.parent !== undefined && (permissions & node.parent) !== 0;
  const missing =
    node.requires !== undefined && !node.requires.some((req) => (permissions & req) !== 0);
  return {
    checked: admin || parentOn || (permissions & bit) !== 0,
    disabled: admin || parentOn || missing,
    hidden: node.need4k === true && !has4k,
  };
}

/** Bascule d'une permission ; décocher un parent laisse ses enfants tels quels. */
export function togglePermission(permissions: number, bit: number): number {
  return (permissions & bit) !== 0 ? permissions & ~bit : permissions | bit;
}

/** Affiche TMDB (dimensionnée) d'une demande. */
export function tmdbImage(path: string | null | undefined, size = 'w185'): string | null {
  return typeof path === 'string' && path.startsWith('/')
    ? `https://image.tmdb.org/t/p/${size}${path}`
    : null;
}

export const STATUS_COLORS: Record<string, string> = {
  declined: 'error',
  available: 'success',
  partially_available: 'teal',
  processing: 'purple',
  approved: 'info',
  pending: 'warning',
  unknown: 'grey',
};

export const STATUS_KEYS: Record<string, string> = {
  declined: 'jellyseerr.status.request.declined',
  available: 'jellyseerr.status.media.available',
  partially_available: 'jellyseerr.status.media.partially_available',
  processing: 'jellyseerr.status.request.processing',
  approved: 'jellyseerr.status.request.approved',
  pending: 'jellyseerr.status.request.pending',
  unknown: 'common.labels.unknown',
};
