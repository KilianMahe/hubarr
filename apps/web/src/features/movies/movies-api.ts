// SPDX-License-Identifier: AGPL-3.0-or-later
// Appels de l'API de la bibliothèque de films (`/api/medias/:slug/films…`) et
// clés de cache TanStack Query.

import {
  arrCommandStatusSchema,
  arrSystemResponseSchema,
  blocklistPageSchema,
  collectionMonitorResponseSchema,
  cutoffPageSchema,
  historyPageSchema,
  missingPageSchema,
  movieCollectionSchema,
  type QueueDeleteRequest,
  arrReleaseSchema,
  arrConfigResponseSchema,
  commandStartedResponseSchema,
  filteredIdsResponseSchema,
  libraryWarningsResponseSchema,
  filesystemResponseSchema,
  movieBlocklistItemSchema,
  movieCreditSchema,
  movieDetailSchema,
  movieEditResponseSchema,
  movieExtraFileSchema,
  movieFileSchema,
  movieFileUpdateResponseSchema,
  movieHistoryItemSchema,
  movieLibraryResponseSchema,
  movieAddResponseSchema,
  movieLookupSchema,
  movieMonitorResponseSchema,
  personFollowResponseSchema,
  personFollowingResponseSchema,
  movieQueueItemSchema,
  okResponseSchema,
  qualityDefinitionSummarySchema,
  renameProposalSchema,
  tagCreateResponseSchema,
  type MovieAddRequest,
  type MovieDeleteRequest,
  type PersonFollowRequest,
  type MovieEditRequest,
  type MovieFileUpdateRequest,
  type MovieLibraryQuery,
  type MoviesBulkDeleteRequest,
  type MoviesBulkEditRequest,
} from '@hubarr/shared';
import { z } from 'zod';
import { api } from '../../app/api/client';
import { apiParamsOf } from './library';

const base = (slug: string) => `/api/medias/${encodeURIComponent(slug)}/films`;

export const moviesKeys = {
  all: (slug: string) => ['radarr', slug] as const,
  library: (slug: string, params: string) => ['radarr', slug, 'library', params] as const,
  warnings: (slug: string) => ['radarr', slug, 'warnings'] as const,
  config: (slug: string) => ['radarr', slug, 'config'] as const,
  movie: (slug: string, id: number) => ['radarr', slug, 'movie', id] as const,
  movieSection: (slug: string, id: number, section: string) =>
    ['radarr', slug, 'movie', id, section] as const,
  qualityDefinitions: (slug: string) => ['radarr', slug, 'quality-definitions'] as const,
  following: (slug: string) => ['radarr', slug, 'person-following'] as const,
  queue: (slug: string) => ['radarr', slug, 'queue'] as const,
  page: (slug: string, name: string, params: string) =>
    ['radarr', slug, 'page', name, params] as const,
};

/** `?a=1&b=2`, ou rien sans paramètre. */
export function queryString(params: Record<string, string>): string {
  const search = new URLSearchParams(params).toString();
  return search === '' ? '' : `?${search}`;
}

export const moviesApi = {
  library: (slug: string, params: URLSearchParams, signal?: AbortSignal) =>
    api.get(`${base(slug)}?${params.toString()}`, movieLibraryResponseSchema, signal),
  warnings: (slug: string, signal?: AbortSignal) =>
    api.get(`${base(slug)}/warnings`, libraryWarningsResponseSchema, signal),
  config: (slug: string, signal?: AbortSignal) =>
    api.get(`${base(slug)}/config`, arrConfigResponseSchema, signal),
  /** Ids de tout le filtre (sans pagination) ; `searchableOnly` : suivis sans fichier. */
  filteredIds: (slug: string, query: MovieLibraryQuery, searchableOnly = false) => {
    const params = apiParamsOf({ ...query, page: 1 });
    if (searchableOnly) params.set('searchable_only', '1');
    return api.get(`${base(slug)}/filter/ids?${params.toString()}`, filteredIdsResponseSchema);
  },
  bulkRefresh: (slug: string, movieIds: number[]) =>
    api.post(`${base(slug)}/bulk/refresh`, { movieIds }, commandStartedResponseSchema),
  bulkSearch: (slug: string, movieIds: number[]) =>
    api.post(`${base(slug)}/bulk/search`, { movieIds }, commandStartedResponseSchema),
  bulkEdit: (slug: string, body: MoviesBulkEditRequest) =>
    api.post(`${base(slug)}/bulk/edit`, body, okResponseSchema),
  bulkDelete: (slug: string, body: MoviesBulkDeleteRequest) =>
    api.post(`${base(slug)}/bulk/delete`, body, okResponseSchema),
  refreshAll: (slug: string) =>
    api.post(`${base(slug)}/command/refresh-all`, undefined, commandStartedResponseSchema),
  rssSync: (slug: string) =>
    api.post(`${base(slug)}/command/rss-sync`, undefined, commandStartedResponseSchema),
  commandStatus: (slug: string, cmdId: number) =>
    api.get(`${base(slug)}/command/${cmdId}`, arrCommandStatusSchema),

  // ── Fiche film (P2.4) ──
  detail: (slug: string, id: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/${id}/detail`, movieDetailSchema, signal),
  search: (slug: string, id: number) =>
    api.post(`${base(slug)}/${id}/search`, undefined, commandStartedResponseSchema),
  refresh: (slug: string, id: number) =>
    api.post(`${base(slug)}/${id}/refresh`, undefined, commandStartedResponseSchema),
  rescan: (slug: string, id: number) =>
    api.post(`${base(slug)}/${id}/rescan`, undefined, commandStartedResponseSchema),
  monitor: (slug: string, id: number, monitored: boolean) =>
    api.post(`${base(slug)}/${id}/monitor`, { monitored }, movieMonitorResponseSchema),
  remove: (slug: string, id: number, body: MovieDeleteRequest) =>
    api.post(`${base(slug)}/${id}/delete`, body, okResponseSchema),
  edit: (slug: string, id: number, body: MovieEditRequest) =>
    api.post(`${base(slug)}/${id}/edit`, body, movieEditResponseSchema),
  credits: (slug: string, id: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/${id}/credits`, z.array(movieCreditSchema), signal),
  extras: (slug: string, id: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/${id}/extras`, z.array(movieExtraFileSchema), signal),
  files: (slug: string, id: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/${id}/files`, z.array(movieFileSchema), signal),
  deleteFile: (slug: string, fileId: number) =>
    api.post(`${base(slug)}/files/${fileId}/delete`, undefined, okResponseSchema),
  updateFile: (slug: string, fileId: number, body: MovieFileUpdateRequest) =>
    api.post(`${base(slug)}/files/${fileId}/update`, body, movieFileUpdateResponseSchema),
  qualityDefinitions: (slug: string, signal?: AbortSignal) =>
    api.get(`${base(slug)}/quality-definitions`, z.array(qualityDefinitionSummarySchema), signal),
  history: (slug: string, id: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/${id}/history`, z.array(movieHistoryItemSchema), signal),
  movieBlocklist: (slug: string, id: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/${id}/blocklist`, z.array(movieBlocklistItemSchema), signal),
  filesystem: (slug: string, path: string) =>
    api.get(`${base(slug)}/filesystem?path=${encodeURIComponent(path)}`, filesystemResponseSchema),
  createTag: (slug: string, label: string) =>
    api.post(`${base(slug)}/config/tag`, { label }, tagCreateResponseSchema),
  // ── Releases, renommage, commandes (P2.5) ──
  releases: (slug: string, id: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/${id}/releases`, z.array(arrReleaseSchema), signal),
  grab: (slug: string, id: number, guid: string, indexerId: number) =>
    api.post(`${base(slug)}/${id}/grab`, { guid, indexerId }, okResponseSchema),
  renamePreview: (slug: string, id: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/${id}/rename-preview`, z.array(renameProposalSchema), signal),
  rename: (slug: string, id: number) =>
    api.post(`${base(slug)}/${id}/rename`, undefined, commandStartedResponseSchema),
  activeCommands: (slug: string) =>
    api.get(`${base(slug)}/commands/active`, z.array(arrCommandStatusSchema)),
  queue: (slug: string, signal?: AbortSignal) =>
    api.get(`${base(slug)}/queue`, z.array(movieQueueItemSchema), signal),
  // ── Ajout, suivi de personnes (P2.6) ──
  lookup: (slug: string, term: string, signal?: AbortSignal) =>
    api.get(
      `${base(slug)}/lookup?term=${encodeURIComponent(term)}`,
      z.array(movieLookupSchema),
      signal,
    ),
  add: (slug: string, body: MovieAddRequest) =>
    api.post(`${base(slug)}/add`, body, movieAddResponseSchema),
  following: (slug: string, signal?: AbortSignal) =>
    api.get(`${base(slug)}/person/following`, personFollowingResponseSchema, signal),
  follow: (slug: string, body: PersonFollowRequest) =>
    api.post(`${base(slug)}/person/follow`, body, personFollowResponseSchema),
  unfollow: (slug: string, listId: number) =>
    api.post(`${base(slug)}/person/unfollow`, { listId }, okResponseSchema),
  // ── Pages Radarr (P2.7) ──
  refreshDownloads: (slug: string) =>
    api.post(`${base(slug)}/command/refresh-downloads`, undefined, okResponseSchema),
  queueImport: (slug: string, queueId: number) =>
    api.post(`${base(slug)}/queue/${queueId}/import`, undefined, commandStartedResponseSchema),
  queueDelete: (slug: string, queueId: number, body: QueueDeleteRequest) =>
    api.post(`${base(slug)}/queue/${queueId}/delete`, body, okResponseSchema),
  queueGrab: (slug: string, queueId: number) =>
    api.post(`${base(slug)}/queue/${queueId}/grab`, undefined, okResponseSchema),
  queueGrabBulk: (slug: string, ids: number[]) =>
    api.post(`${base(slug)}/queue/grab/bulk`, { ids }, okResponseSchema),
  missing: (slug: string, page: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/manquants?page=${page}`, missingPageSchema, signal),
  searchAllMissing: (slug: string) =>
    api.post(`${base(slug)}/recherche-manquants`, undefined, commandStartedResponseSchema),
  // Critères de liste (page, tri, recherche, filtres) déjà sérialisés (P5c.5).
  cutoff: (slug: string, params: Record<string, string>, signal?: AbortSignal) =>
    api.get(`${base(slug)}/cutoff${queryString(params)}`, cutoffPageSchema, signal),
  instanceHistory: (slug: string, params: Record<string, string>, signal?: AbortSignal) =>
    api.get(`${base(slug)}/historique${queryString(params)}`, historyPageSchema, signal),
  blocklist: (slug: string, params: Record<string, string>, signal?: AbortSignal) =>
    api.get(`${base(slug)}/blocklist${queryString(params)}`, blocklistPageSchema, signal),
  blocklistDelete: (slug: string, id: number) =>
    api.post(`${base(slug)}/blocklist/${id}/delete`, undefined, okResponseSchema),
  blocklistBulkDelete: (slug: string, ids: number[]) =>
    api.post(`${base(slug)}/blocklist/bulk-delete`, { ids }, okResponseSchema),
  collections: (slug: string, signal?: AbortSignal) =>
    api.get(`${base(slug)}/collections`, z.array(movieCollectionSchema), signal),
  collectionMonitor: (slug: string, id: number, monitored: boolean) =>
    api.post(
      `${base(slug)}/collections/${id}/monitor`,
      { monitored },
      collectionMonitorResponseSchema,
    ),
  system: (slug: string, signal?: AbortSignal) =>
    api.get(
      `/api/medias/${encodeURIComponent(slug)}/radarr/systeme`,
      arrSystemResponseSchema,
      signal,
    ),
};
