// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration des comptes (`/api/admin/users`) et lignes de l'éditeur de
// droits : une par service configuré, une par instance pour Radarr/Sonarr,
// regroupées par famille comme le tiroir.

import {
  SERVICES,
  SERVICE_FAMILIES,
  SERVICE_IDS,
  SERVICE_SETTINGS,
  arrOkSchema,
  managedUserSchema,
  permissionKey,
  userListResponseSchema,
  type BootstrapServices,
  type ServiceFamily,
  type ServiceId,
  type UserCreateRequest,
  type UserPermissions,
  type UserUpdateRequest,
} from '@hubarr/shared';
import { api } from '../../app/api/client';

export const USERS_KEY = ['admin', 'users'] as const;

export const usersApi = {
  list: (signal?: AbortSignal) => api.get('/api/admin/users', userListResponseSchema, signal),
  create: (body: UserCreateRequest) => api.post('/api/admin/users/create', body, managedUserSchema),
  save: (id: number, body: UserUpdateRequest) =>
    api.post(`/api/admin/users/${id}/save`, body, managedUserSchema),
  remove: (id: number) => api.post(`/api/admin/users/${id}/delete`, {}, arrOkSchema),
};

export interface PermissionRow {
  /** Clé du droit (`prowlarr`, `radarr:4k`). */
  key: string;
  service: ServiceId;
  label: string;
}

export interface PermissionGroup {
  family: ServiceFamily;
  rows: PermissionRow[];
}

/**
 * Lignes de l'éditeur : services configurés (instances pour Radarr/Sonarr),
 * plus tout droit déjà accordé sur un service qui ne l'est plus, pour pouvoir
 * le retirer.
 */
export function permissionGroups(
  services: BootstrapServices,
  granted: UserPermissions,
): PermissionGroup[] {
  const rows: PermissionRow[] = [];
  for (const id of SERVICE_IDS) {
    const label = SERVICE_SETTINGS[id].label;
    if (id === 'radarr' || id === 'sonarr') {
      for (const instance of services.instances[id]) {
        const key = permissionKey(id, instance.slug);
        rows.push({ key, service: id, label: `${label} · ${instance.name}` });
      }
      continue;
    }
    if (services.states[id]?.configured === true || granted[id] !== undefined)
      rows.push({ key: id, service: id, label });
  }
  return SERVICE_FAMILIES.map((family) => ({
    family,
    rows: rows.filter((row) => SERVICES[row.service].family === family),
  })).filter((group) => group.rows.length > 0);
}
