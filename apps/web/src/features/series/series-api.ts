// SPDX-License-Identifier: AGPL-3.0-or-later
// Appels de l'API des séries (`/api/medias/:slug/series…`, `/sonarr…`) et clés
// de cache TanStack Query.

import { queryString } from '../movies/movies-api';
import {
  arrCommandStatusSchema,
  arrSystemResponseSchema,
  queueImportResponseSchema,
  seriesBlocklistPageSchema,
  seriesHistoryPageSchema,
  seriesQueueItemSchema,
  wantedEpisodePageSchema,
  type QueueDeleteRequest,
  type QueueImportRequest,
  episodeFileSchema,
  episodeFileUpdateResponseSchema,
  episodeSchema,
  filesystemResponseSchema,
  qualityDefinitionSummarySchema,
  seriesDetailSchema,
  seriesEditResponseSchema,
  seriesHistoryItemSchema,
  seriesReleaseSchema,
  seriesRenameProposalSchema,
  type EpisodeFileReassignRequest,
  type EpisodeFilesBulkUpdateRequest,
  type SeasonMonitorRequest,
  type SeriesDeleteRequest,
  type SeriesEditRequest,
  arrTagSchema,
  commandStartedResponseSchema,
  filteredIdsResponseSchema,
  movieMonitorResponseSchema,
  okResponseSchema,
  qualityProfileSummarySchema,
  rootFolderSummarySchema,
  seriesAddResponseSchema,
  seriesLibraryResponseSchema,
  seriesLookupSchema,
  seriesSearchResponseSchema,
  seriesWarningsResponseSchema,
  tagCreateResponseSchema,
  type SeriesAddRequest,
  type SeriesBulkDeleteRequest,
  type SeriesBulkEditRequest,
  type SeriesLibraryQuery,
  episodeManualImportPreviewSchema,
  type EpisodeManualImportRequest,
} from '@hubarr/shared';
import { z } from 'zod';
import { api } from '../../app/api/client';
import { seriesApiParamsOf } from './library';

const encode = (slug: string) => encodeURIComponent(slug);
const base = (slug: string) => `/api/medias/${encode(slug)}/series`;
const sonarrBase = (slug: string) => `/api/medias/${encode(slug)}/sonarr`;

export const seriesKeys = {
  all: (slug: string) => ['sonarr', slug] as const,
  library: (slug: string, params: string) => ['sonarr', slug, 'library', params] as const,
  warnings: (slug: string) => ['sonarr', slug, 'warnings'] as const,
  config: (slug: string) => ['sonarr', slug, 'config'] as const,
  series: (slug: string, id: number) => ['sonarr', slug, 'series', id] as const,
  seriesSection: (slug: string, id: number, section: string) =>
    ['sonarr', slug, 'series', id, section] as const,
  qualityDefinitions: (slug: string) => ['sonarr', slug, 'quality-definitions'] as const,
  queue: (slug: string) => ['sonarr', slug, 'queue'] as const,
  manualImport: (slug: string, queueId: number) =>
    ['sonarr', slug, 'manual-import', queueId] as const,
  page: (slug: string, name: string, params: string) =>
    ['sonarr', slug, 'page', name, params] as const,
};

/** Profils, dossiers racine et étiquettes de l'instance (dialogues). */
export interface SonarrConfig {
  qualityProfiles: z.infer<typeof qualityProfileSummarySchema>[];
  rootFolders: z.infer<typeof rootFolderSummarySchema>[];
  tags: z.infer<typeof arrTagSchema>[];
}

export const seriesApi = {
  library: (slug: string, params: URLSearchParams, signal?: AbortSignal) =>
    api.get(`${base(slug)}?${params.toString()}`, seriesLibraryResponseSchema, signal),
  warnings: (slug: string, signal?: AbortSignal) =>
    api.get(`${base(slug)}/warnings`, seriesWarningsResponseSchema, signal),
  /** Ids de tout le filtre (sans pagination) ; `searchableOnly` : séries avec épisodes manquants. */
  filteredIds: (slug: string, query: SeriesLibraryQuery, searchableOnly = false) => {
    const params = seriesApiParamsOf({ ...query, page: 1 });
    if (searchableOnly) params.set('searchable_only', '1');
    return api.get(`${base(slug)}/filter/ids?${params.toString()}`, filteredIdsResponseSchema);
  },
  bulkEdit: (slug: string, body: SeriesBulkEditRequest) =>
    api.post(`${base(slug)}/bulk/edit`, body, okResponseSchema),
  bulkDelete: (slug: string, body: SeriesBulkDeleteRequest) =>
    api.post(`${base(slug)}/bulk/delete`, body, okResponseSchema),
  missingSearch: (slug: string) =>
    api.post(`${base(slug)}/command/missing-search`, undefined, commandStartedResponseSchema),
  refreshAll: (slug: string) =>
    api.post(`${base(slug)}/command/refresh-all`, undefined, commandStartedResponseSchema),
  rssSync: (slug: string) =>
    api.post(`${base(slug)}/command/rss-sync`, undefined, commandStartedResponseSchema),
  commandStatus: (slug: string, cmdId: number) =>
    api.get(`${base(slug)}/command/${cmdId}`, arrCommandStatusSchema),
  activeCommands: (slug: string) =>
    api.get(`${base(slug)}/commands/active`, z.array(arrCommandStatusSchema)),
  lookup: (slug: string, term: string, signal?: AbortSignal) =>
    api.get(
      `${base(slug)}/lookup?term=${encodeURIComponent(term)}`,
      z.array(seriesLookupSchema),
      signal,
    ),
  add: (slug: string, body: SeriesAddRequest) =>
    api.post(`${base(slug)}/add`, body, seriesAddResponseSchema),
  // ── Actions sur une série ──
  refresh: (slug: string, id: number) =>
    api.post(`${base(slug)}/${id}/refresh`, undefined, commandStartedResponseSchema),
  /** Analyse des fichiers de la série (`RescanSeries`, P5c.6). */
  rescan: (slug: string, id: number) =>
    api.post(`${base(slug)}/${id}/rescan`, undefined, commandStartedResponseSchema),
  search: (slug: string, id: number) =>
    api.post(`${base(slug)}/${id}/search`, undefined, seriesSearchResponseSchema),
  monitor: (slug: string, id: number, monitored: boolean) =>
    api.post(`${base(slug)}/${id}/monitor`, { monitored }, movieMonitorResponseSchema),
  // ── Fiche (P3a.2) ──
  info: (slug: string, id: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/${id}/info`, seriesDetailSchema, signal),
  episodes: (slug: string, id: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/${id}/episodes`, z.array(episodeSchema), signal),
  files: (slug: string, id: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/${id}/files`, z.array(episodeFileSchema), signal),
  history: (slug: string, id: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/${id}/history`, z.array(seriesHistoryItemSchema), signal),
  edit: (slug: string, id: number, body: SeriesEditRequest) =>
    api.post(`${base(slug)}/${id}/edit`, body, seriesEditResponseSchema),
  remove: (slug: string, id: number, body: SeriesDeleteRequest) =>
    api.post(`${base(slug)}/${id}/delete`, body, okResponseSchema),
  episodeMonitor: (slug: string, episodeId: number, monitored: boolean) =>
    api.post(`${base(slug)}/episode/${episodeId}/monitor`, { monitored }, okResponseSchema),
  episodeSearch: (slug: string, episodeIds: number[]) =>
    api.post(`${base(slug)}/episode/search`, { episodeIds }, commandStartedResponseSchema),
  seasonSearch: (slug: string, id: number, season: number) =>
    api.post(
      `${base(slug)}/${id}/season/${season}/search`,
      undefined,
      commandStartedResponseSchema,
    ),
  seasonMonitor: (slug: string, body: SeasonMonitorRequest) =>
    api.post(`${base(slug)}/season/monitor`, body, okResponseSchema),
  renamePreview: (slug: string, id: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/${id}/rename`, z.array(seriesRenameProposalSchema), signal),
  rename: (slug: string, id: number, fileIds: number[]) =>
    api.post(`${base(slug)}/${id}/rename`, { fileIds }, commandStartedResponseSchema),
  episodeReleases: (slug: string, episodeId: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/episode/${episodeId}/releases`, z.array(seriesReleaseSchema), signal),
  seasonReleases: (slug: string, id: number, season: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/${id}/season/${season}/releases`, z.array(seriesReleaseSchema), signal),
  grab: (slug: string, guid: string, indexerId: number) =>
    api.post(`${base(slug)}/release/grab`, { guid, indexerId }, okResponseSchema),
  deleteFile: (slug: string, fileId: number) =>
    api.post(`${base(slug)}/file/${fileId}/delete`, undefined, okResponseSchema),
  updateFile: (slug: string, body: EpisodeFilesBulkUpdateRequest) =>
    api.post(`${base(slug)}/files/bulk-update`, body, episodeFileUpdateResponseSchema),
  reassignFile: (slug: string, fileId: number, body: EpisodeFileReassignRequest) =>
    api.post(`${base(slug)}/file/${fileId}/reassign`, body, commandStartedResponseSchema),
  qualityDefinitions: (slug: string, signal?: AbortSignal) =>
    api.get(`${base(slug)}/quality-definitions`, z.array(qualityDefinitionSummarySchema), signal),
  filesystem: (slug: string, path: string) =>
    api.get(
      `${sonarrBase(slug)}/filesystem?path=${encodeURIComponent(path)}`,
      filesystemResponseSchema,
    ),
  // ── File d'attente et pages (P3a.3) ──
  queue: (slug: string, signal?: AbortSignal) =>
    api.get(`${base(slug)}/queue`, z.array(seriesQueueItemSchema), signal),
  manualImportPreview: (slug: string, queueId: number, signal?: AbortSignal) =>
    api.get(
      `${base(slug)}/queue/${queueId}/manual-import`,
      episodeManualImportPreviewSchema,
      signal,
    ),
  manualImport: (slug: string, queueId: number, body: EpisodeManualImportRequest) =>
    api.post(`${base(slug)}/queue/${queueId}/manual-import`, body, commandStartedResponseSchema),
  queueDelete: (slug: string, queueId: number, body: QueueDeleteRequest) =>
    api.post(`${base(slug)}/queue/${queueId}/delete`, body, okResponseSchema),
  queueGrab: (slug: string, queueId: number) =>
    api.post(`${base(slug)}/queue/${queueId}/grab`, undefined, okResponseSchema),
  queueGrabBulk: (slug: string, ids: number[]) =>
    api.post(`${base(slug)}/queue/grab/bulk`, { ids }, okResponseSchema),
  queueImport: (slug: string, body: QueueImportRequest) =>
    api.post(`${base(slug)}/queue/import`, body, queueImportResponseSchema),
  queueRefresh: (slug: string) =>
    api.post(`${base(slug)}/queue/refresh`, undefined, okResponseSchema),
  missing: (slug: string, page: number, signal?: AbortSignal) =>
    api.get(`${base(slug)}/manquants?page=${page}`, wantedEpisodePageSchema, signal),
  // Critères de liste (page, tri, recherche, filtres) déjà sérialisés (P5c.5).
  cutoff: (slug: string, params: Record<string, string>, signal?: AbortSignal) =>
    api.get(`${base(slug)}/cutoff${queryString(params)}`, wantedEpisodePageSchema, signal),
  instanceHistory: (slug: string, params: Record<string, string>, signal?: AbortSignal) =>
    api.get(`${base(slug)}/historique${queryString(params)}`, seriesHistoryPageSchema, signal),
  blocklist: (slug: string, params: Record<string, string>, signal?: AbortSignal) =>
    api.get(`${base(slug)}/blocklist${queryString(params)}`, seriesBlocklistPageSchema, signal),
  blocklistDelete: (slug: string, id: number) =>
    api.post(`${base(slug)}/blocklist/${id}/delete`, undefined, okResponseSchema),
  blocklistBulkDelete: (slug: string, ids: number[]) =>
    api.post(`${base(slug)}/blocklist/bulk-delete`, { ids }, okResponseSchema),
  system: (slug: string, signal?: AbortSignal) =>
    api.get(`${base(slug)}/systeme`, arrSystemResponseSchema, signal),
  // ── Configuration de l'instance ──
  qualityProfiles: (slug: string, signal?: AbortSignal) =>
    api.get(`${sonarrBase(slug)}/quality-profiles`, z.array(qualityProfileSummarySchema), signal),
  rootFolders: (slug: string, signal?: AbortSignal) =>
    api.get(`${sonarrBase(slug)}/root-folders`, z.array(rootFolderSummarySchema), signal),
  tags: (slug: string, signal?: AbortSignal) =>
    api.get(`${sonarrBase(slug)}/tags-json`, z.array(arrTagSchema), signal),
  createTag: (slug: string, label: string) =>
    api.post(`${sonarrBase(slug)}/tags-json`, { label }, tagCreateResponseSchema),
  /** Les trois listes des dialogues, chargées ensemble (comme l'original). */
  async config(slug: string, signal?: AbortSignal): Promise<SonarrConfig> {
    const [qualityProfiles, rootFolders, tags] = await Promise.all([
      seriesApi.qualityProfiles(slug, signal),
      seriesApi.rootFolders(slug, signal),
      seriesApi.tags(slug, signal),
    ]);
    return { qualityProfiles, rootFolders, tags };
  },
};
