// SPDX-License-Identifier: AGPL-3.0-or-later
// Appels de l'API Prowlarr (`/api/prowlarr/…`, P3c) et clés TanStack Query.

import {
  arrCommandStatusSchema,
  arrOkSchema,
  arrTagItemSchema,
  prowlarrAppProfileSchema,
  prowlarrIndexerHistorySchema,
  prowlarrIndexerToggleSchema,
  prowlarrOverviewSchema,
  prowlarrReleaseSchema,
  prowlarrTestAllSchema,
  providerListSchema,
  providerSchema,
  providerTestResponseSchema,
  type ProviderSaveRequest,
  type ProwlarrIndexerBulkRequest,
} from '@hubarr/shared';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import { api } from '../../app/api/client';
import { apiErrorText } from '../../app/api/error-text';
import type { AdminFeedback } from '../arr-admin/admin-api';

export const PROWLARR_API = '/api/prowlarr';

export const prowlarrKeys = {
  all: ['prowlarr'] as const,
  overview: ['prowlarr', 'overview'] as const,
  schema: ['prowlarr', 'indexer-schema'] as const,
  indexer: (id: number) => ['prowlarr', 'indexer', id] as const,
  history: (id: number) => ['prowlarr', 'indexer', id, 'history'] as const,
  appProfiles: ['prowlarr', 'app-profiles'] as const,
  tags: ['prowlarr', 'tags'] as const,
};

const commandStartedSchema = z.object({ ok: z.literal(true), cmdId: z.number().nullable() });

export const prowlarrApi = {
  overview: (signal?: AbortSignal) => api.get(PROWLARR_API, prowlarrOverviewSchema, signal),
  indexerSchema: (signal?: AbortSignal) =>
    api.get(`${PROWLARR_API}/indexer/schema`, providerListSchema, signal),
  indexer: (id: number, signal?: AbortSignal) =>
    api.get(`${PROWLARR_API}/indexer/${id}`, providerSchema, signal),
  addIndexer: (body: ProviderSaveRequest) =>
    api.post(`${PROWLARR_API}/indexer/add`, body, providerSchema),
  updateIndexer: (id: number, body: ProviderSaveRequest) =>
    api.post(`${PROWLARR_API}/indexer/${id}/update`, body, providerSchema),
  deleteIndexer: (id: number) => api.post(`${PROWLARR_API}/indexer/${id}/delete`, {}, arrOkSchema),
  testIndexer: (body: ProviderSaveRequest) =>
    api.post(`${PROWLARR_API}/indexer/test`, body, providerTestResponseSchema),
  toggleIndexer: (id: number) =>
    api.post(`${PROWLARR_API}/indexer/${id}/toggle`, {}, prowlarrIndexerToggleSchema),
  indexerHistory: (id: number, signal?: AbortSignal) =>
    api.get(`${PROWLARR_API}/indexer/${id}/history`, z.array(prowlarrIndexerHistorySchema), signal),
  bulkUpdate: (body: ProwlarrIndexerBulkRequest) =>
    api.post(`${PROWLARR_API}/indexer/bulk/update`, body, arrOkSchema),
  bulkDelete: (ids: number[]) =>
    api.post(`${PROWLARR_API}/indexer/bulk/delete`, { ids }, arrOkSchema),
  testAll: () => api.post(`${PROWLARR_API}/indexer/testall`, {}, prowlarrTestAllSchema),
  appProfiles: (signal?: AbortSignal) =>
    api.get(`${PROWLARR_API}/app-profiles`, z.array(prowlarrAppProfileSchema), signal),
  tags: (signal?: AbortSignal) =>
    api.get(`${PROWLARR_API}/tags`, z.array(arrTagItemSchema), signal),
  createTag: (label: string) => api.post(`${PROWLARR_API}/tag/create`, { label }, arrTagItemSchema),
  command: (name: string) => api.post(`${PROWLARR_API}/command`, { name }, commandStartedSchema),
  search: (q: string, indexerId: number | null, signal?: AbortSignal) =>
    api.get(
      `${PROWLARR_API}/search?q=${encodeURIComponent(q)}${indexerId === null ? '' : `&indexerId=${indexerId}`}`,
      z.array(prowlarrReleaseSchema),
      signal,
    ),
  grab: (guid: string, indexerId: number) =>
    api.post(`${PROWLARR_API}/grab`, { guid, indexerId }, arrOkSchema),
  commandStatus: (id: number) => api.get(`${PROWLARR_API}/command/${id}`, arrCommandStatusSchema),
};

/**
 * Données d'une page Prowlarr (`GET /api/prowlarr<path>`) : requête, bilan de
 * la dernière action, message d'échec du chargement, et `run` qui lance une
 * action puis relit la page.
 */
export function useProwlarrPage<T>(
  path: string | (() => string),
  schema: z.ZodType<T>,
  options: { enabled?: () => boolean } = {},
) {
  const { t } = useI18n();
  const resolved = computed(() => (typeof path === 'function' ? path() : path));
  const query = useQuery({
    queryKey: computed(() => [...prowlarrKeys.all, 'page', resolved.value]),
    queryFn: ({ signal }) => api.get(`${PROWLARR_API}${resolved.value}`, schema, signal),
    placeholderData: keepPreviousData,
    retry: false,
    ...(options.enabled ? { enabled: computed(options.enabled) } : {}),
  });
  const feedback = ref<AdminFeedback | null>(null);
  const error = computed(() =>
    query.isError.value ? t('prowlarr.common.error_unreachable') : null,
  );

  async function run(action: () => Promise<unknown>, errorKey: string, successText?: string) {
    try {
      await action();
      feedback.value = successText ? { type: 'success', text: successText } : null;
      await query.refetch();
      return true;
    } catch (failure) {
      feedback.value = { type: 'error', text: apiErrorText(failure, t, errorKey) };
      return false;
    }
  }

  return { query, feedback, error, run, t };
}
