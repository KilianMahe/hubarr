// SPDX-License-Identifier: AGPL-3.0-or-later
// Accès aux routes des paramètres et clés de cache TanStack Query partagées par
// les sections de la page.

import {
  INSTANCE_TYPES,
  SERVICE_SETTINGS,
  instanceListResponseSchema,
  instanceTestResponseSchema,
  serviceTestResponseSchema,
  settingsResponseSchema,
  type BootstrapServices,
  type FlatServiceId,
  type InstanceCreateRequest,
  type InstanceListResponse,
  type InstanceType,
  type InstanceUpdateRequest,
  type ServiceTestRequest,
  type SettingsResponse,
  type SettingsSaveRequest,
} from '@hubarr/shared';
import type { QueryClient } from '@tanstack/vue-query';
import { api } from '../../app/api/client';

export const SETTINGS_KEY = ['admin', 'settings'] as const;

export const fetchSettings = (signal?: AbortSignal) =>
  api.get('/api/admin/settings', settingsResponseSchema, signal);

export const saveSettings = (body: SettingsSaveRequest) =>
  api.post('/api/admin/settings', body, settingsResponseSchema);

export const testService = (service: string, body: ServiceTestRequest) =>
  api.post(
    `/api/admin/settings/test/${encodeURIComponent(service)}`,
    body,
    serviceTestResponseSchema,
  );

export const instanceActions = {
  add: (type: string, body: InstanceCreateRequest) =>
    api.post(`/api/admin/instances/${type}/add`, body, instanceListResponseSchema),
  edit: (id: number, body: InstanceUpdateRequest) =>
    api.post(`/api/admin/instances/${id}/edit`, body, instanceListResponseSchema),
  remove: (id: number) =>
    api.post(`/api/admin/instances/${id}/delete`, undefined, instanceListResponseSchema),
  setDefault: (id: number) =>
    api.post(`/api/admin/instances/${id}/set-default`, undefined, instanceListResponseSchema),
  toggle: (id: number) =>
    api.post(`/api/admin/instances/${id}/toggle-enabled`, undefined, instanceListResponseSchema),
  test: (id: number) =>
    api.post(`/api/admin/instances/${id}/test`, undefined, instanceTestResponseSchema),
};

/** Range la liste d'instances renvoyée par une mutation dans le cache de la page. */
export function storeInstances(queryClient: QueryClient, list: InstanceListResponse): void {
  queryClient.setQueryData<SettingsResponse>(SETTINGS_KEY, (current) =>
    current === undefined
      ? current
      : { ...current, instances: { ...current.instances, [list.type]: list.instances } },
  );
}

/** État des services du shell (tiroir, gardes) déduit de la page des paramètres. */
export function servicesFromSettings(settings: SettingsResponse): BootstrapServices {
  const states: BootstrapServices['states'] = {};
  for (const [id, state] of Object.entries(settings.services)) {
    states[id] = {
      configured: state.configured,
      disabled: SERVICE_SETTINGS[id as FlatServiceId].toggleable && !state.enabled,
    };
  }
  for (const type of INSTANCE_TYPES) {
    states[type] = {
      configured: settings.instances[type].some((row) => row.enabled),
      disabled: false,
    };
  }
  const instances = (type: InstanceType) =>
    settings.instances[type].map(({ slug, name, enabled, isDefault }) => ({
      slug,
      name,
      enabled,
      isDefault,
    }));
  return {
    states,
    instances: { radarr: instances('radarr'), sonarr: instances('sonarr') },
    sidebar: settings.sidebar,
  };
}
