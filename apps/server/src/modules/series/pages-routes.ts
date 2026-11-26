// SPDX-License-Identifier: AGPL-3.0-or-later
// Pages Sonarr (P3a.3) : file d'attente (suppression, téléchargement forcé,
// import des téléchargements bloqués, relecture des clients), manquants,
// cutoff, historique, liste de blocage, système, import par lot
// (`MediaController::seriesQueue*`, `seriesMissing`, `seriesCutoff`,
// `seriesHistoryPage`, `seriesBlocklist*`, `sonarrSystem`, `seriesImportBatch`).
//
// Les pages de l'original deviennent des routes Vue aux mêmes URL ; leurs
// données passent par ces endpoints (règle R1). Différences :
// formes réduites, erreurs au format commun ; l'import des téléchargements
// bloqués renvoie son bilan en 200 (`ok` faux si rien n'est parti) ; liste
// d'éléments vide → 400 `media.api.no_file`.

import {
  SONARR_PAGE_SIZE,
  arrListQueryFrom,
  arrSystemResponseSchema,
  cutoffFiltered,
  cutoffQueryFrom,
  titleMatches,
  idsRequestSchema,
  okResponseSchema,
  queueDeleteRequestSchema,
  queueImportRequestSchema,
  queueImportResponseSchema,
  seriesBlocklistPageSchema,
  seriesHistoryPageSchema,
  seriesImportBatchRequestSchema,
  seriesQueueItemSchema,
  wantedEpisodePageSchema,
  type WantedEpisode,
  commandStartedResponseSchema,
  episodeManualImportPreviewSchema,
  episodeManualImportRequestSchema,
} from '@hubarr/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { isoDate } from '../../integrations/radarr/normalize';
import type { SonarrClient } from '../../integrations/sonarr/client';
import {
  normalizeSeriesBlocklistItem,
  normalizeSeriesHistoryItem,
} from '../../integrations/sonarr/normalize-detail';
import type { SonarrEpisodeResource } from '../../integrations/sonarr/types';
import { guardServiceModule } from '../../plugins/access';
import {
  CUTOFF_FETCH_MAX,
  SONARR_SORT_KEYS,
  emptyPage,
  idsMatching,
  paginate,
  upstreamSort,
} from '../arr/list-query';
import { arrSystemResponse } from '../arr/system';
import { episodeImportFiles, normalizeEpisodePreview } from '../media/manual-import';
import {
  SERIES_BASE,
  SONARR_CONFIG,
  idParams,
  invalidateSeries,
  positiveInt,
  rawQuery,
  slugParams,
  sonarrInstance,
  sonarrOf,
} from './common';
import { sharedSeriesQueue } from '../media/queue';

const queueParams = slugParams.extend({ queueId: z.coerce.number().int().positive() });

/** Épisode manquant ou sous le seuil de qualité (pages « manquants » et « cutoff »). */
function wantedEpisode(episode: SonarrEpisodeResource): WantedEpisode[] {
  if (episode.id === undefined) return [];
  const airDate =
    episode.airDate && /^\d{4}-\d{2}-\d{2}/.test(episode.airDate)
      ? episode.airDate.slice(0, 10)
      : (isoDate(episode.airDateUtc)?.slice(0, 10) ?? null);
  return [
    {
      id: episode.id,
      seriesId: episode.seriesId ?? null,
      seriesTitle: episode.series?.title ?? '—',
      seasonNumber: episode.seasonNumber ?? 0,
      episodeNumber: episode.episodeNumber ?? 0,
      title: episode.title ?? null,
      airDate,
      airDateUtc: isoDate(episode.airDateUtc),
      quality: episode.episodeFile?.quality?.quality?.name ?? null,
    },
  ];
}

export const seriesPagesRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  guardServiceModule(app);

  const base = SERIES_BASE;
  const config = SONARR_CONFIG;
  const clientOf = (request: FastifyRequest): SonarrClient => sonarrOf(instance, request);
  const pageOf = (query: Record<string, unknown>) => positiveInt(query.page, 1);

  // ── File d'attente ──────────────────────────────────────────────────────────

  // n° 201 : file d'attente de l'instance (normalisée).
  app.get(
    `${base}/queue`,
    { config, schema: { params: slugParams, response: { 200: z.array(seriesQueueItemSchema) } } },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      return sharedSeriesQueue(instance, sonarrInstance(request));
    },
  );

  // n° 202 : retirer un élément de la file (client, liste de blocage).
  app.post(
    `${base}/queue/:queueId/delete`,
    {
      config,
      schema: {
        params: queueParams,
        body: queueDeleteRequestSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      await clientOf(request).deleteQueueItem(request.params.queueId, request.body);
      return { ok: true as const };
    },
  );

  // n° 203 : forcer le téléchargement d'un élément en attente (délai).
  app.post(
    `${base}/queue/:queueId/grab`,
    { config, schema: { params: queueParams, response: { 200: okResponseSchema } } },
    async (request) => {
      await clientOf(request).grabQueueItem(request.params.queueId);
      return { ok: true as const };
    },
  );

  /** Élément brut de la file et aperçu de son import manuel (par `downloadId`, sinon par dossier). */
  const queuePreview = async (request: FastifyRequest, queueId: number) => {
    const sonarr = clientOf(request);
    const raw = (await sonarr.rawQueue()).find((item) => item.id === queueId);
    const downloadId = raw?.downloadId ?? '';
    const folder = raw?.outputPath ?? '';
    if (raw === undefined || (downloadId === '' && folder === '')) {
      throw new ApiError(404, 'NOT_FOUND', {
        service: 'sonarr',
        details: { reason: 'media.api.queue_item_not_found' },
      });
    }
    const previews = await sonarr.manualImportPreview(
      downloadId === '' ? folder : null,
      downloadId === '' ? null : downloadId,
      false,
    );
    return { sonarr, previews, downloadId: downloadId === '' ? null : downloadId };
  };

  // Import manuel d'un élément de la file : aperçu (fichiers, épisodes reconnus, refus).
  app.get(
    `${base}/queue/:queueId/manual-import`,
    {
      config,
      schema: { params: queueParams, response: { 200: episodeManualImportPreviewSchema } },
    },
    async (request) => {
      const { previews } = await queuePreview(request, request.params.queueId);
      return { files: previews.map(normalizeEpisodePreview) };
    },
  );

  // Import manuel d'un élément de la file : fichiers choisis, série, épisodes, qualité et langues.
  app.post(
    `${base}/queue/:queueId/manual-import`,
    {
      config,
      schema: {
        params: queueParams,
        body: episodeManualImportRequestSchema,
        response: { 200: commandStartedResponseSchema },
      },
    },
    async (request) => {
      const { sonarr, previews, downloadId } = await queuePreview(request, request.params.queueId);
      const definitions = await sonarr.qualityDefinitions();
      const files = episodeImportFiles(previews, request.body, definitions, downloadId);
      const cmdId = await sonarr.manualImport(files);
      invalidateSeries(instance, request);
      return { ok: true as const, cmdId };
    },
  );

  // n° 204 : forcer le téléchargement de plusieurs éléments.
  app.post(
    `${base}/queue/grab/bulk`,
    {
      config,
      schema: { params: slugParams, body: idsRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await clientOf(request).bulkGrabQueue(request.body.ids);
      return { ok: true as const };
    },
  );

  // n° 205 : importer les téléchargements bloqués (aperçu de Sonarr, puis `ManualImport`).
  app.post(
    `${base}/queue/import`,
    {
      config,
      schema: {
        params: slugParams,
        body: queueImportRequestSchema,
        response: { 200: queueImportResponseSchema },
      },
    },
    async (request) => {
      const outcome = await clientOf(request).manualImportFromQueueItems(request.body.items);
      if (outcome.imported > 0) invalidateSeries(instance, request);
      return outcome;
    },
  );

  // n° 206 : demander à Sonarr de relire ses clients de téléchargement.
  // Simple relecture, sans effet sur la bibliothèque : ouverte au droit de lecture.
  app.post(
    `${base}/queue/refresh`,
    {
      config: { ...config, permission: 'read' },
      schema: { params: slugParams, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await clientOf(request).refreshMonitoredDownloads();
      return { ok: true as const };
    },
  );

  // ── Manquants, cutoff ───────────────────────────────────────────────────────

  // n° 154 : épisodes suivis et diffusés sans fichier.
  app.get(
    `${base}/manquants`,
    {
      config,
      schema: {
        params: slugParams,
        querystring: rawQuery,
        response: { 200: wantedEpisodePageSchema },
      },
    },
    async (request, reply) => {
      const page = pageOf(request.query);
      void reply.header('cache-control', 'no-store');
      const missing = await clientOf(request).missing(page, SONARR_PAGE_SIZE);
      return {
        records: (missing.records ?? []).flatMap(wantedEpisode),
        totalRecords: missing.totalRecords ?? 0,
        page,
        pageSize: SONARR_PAGE_SIZE,
      };
    },
  );

  // n° 155 : épisodes sous le seuil de qualité de leur profil.
  app.get(
    `${base}/cutoff`,
    {
      config,
      schema: {
        params: slugParams,
        querystring: rawQuery,
        response: { 200: wantedEpisodePageSchema },
      },
    },
    async (request, reply) => {
      // Recherche par titre de série et profil (P5c.5, V6) : liste complète, filtrée puis paginée.
      const query = cutoffQueryFrom(request.query);
      const filtered = cutoffFiltered(query);
      void reply.header('cache-control', 'no-store');
      const cutoff = await clientOf(request).cutoff(
        filtered ? 1 : query.page,
        filtered ? CUTOFF_FETCH_MAX : SONARR_PAGE_SIZE,
      );
      const records = (cutoff.records ?? [])
        .filter(
          (episode) =>
            (query.profile === 0 || episode.series?.qualityProfileId === query.profile) &&
            titleMatches(episode.series?.title ?? '', query.q),
        )
        .flatMap(wantedEpisode);
      if (filtered) return paginate(records, query.page, SONARR_PAGE_SIZE);
      return {
        records,
        totalRecords: cutoff.totalRecords ?? 0,
        page: query.page,
        pageSize: SONARR_PAGE_SIZE,
      };
    },
  );

  // ── Historique, liste de blocage ────────────────────────────────────────────

  // n° 156 : historique de l'instance.
  app.get(
    `${base}/historique`,
    {
      config,
      schema: {
        params: slugParams,
        querystring: rawQuery,
        response: { 200: seriesHistoryPageSchema },
      },
    },
    async (request, reply) => {
      // Tri par colonne et recherche par titre (P5c.5, V5) ; date décroissante par défaut.
      const query = arrListQueryFrom('history', request.query);
      void reply.header('cache-control', 'no-store');
      const sonarr = clientOf(request);
      const seriesIds = query.q === '' ? [] : await seriesIdsMatching(sonarr, request, query.q);
      if (query.q !== '' && seriesIds.length === 0) return emptyPage(query.page, SONARR_PAGE_SIZE);
      const history = await sonarr.history(
        query.page,
        SONARR_PAGE_SIZE,
        upstreamSort(SONARR_SORT_KEYS, query),
        seriesIds,
      );
      return {
        records: (history.records ?? []).map(normalizeSeriesHistoryItem),
        totalRecords: history.totalRecords ?? 0,
        page: query.page,
        pageSize: SONARR_PAGE_SIZE,
      };
    },
  );

  // n° 157 : liste de blocage de l'instance.
  app.get(
    `${base}/blocklist`,
    {
      config,
      schema: {
        params: slugParams,
        querystring: rawQuery,
        response: { 200: seriesBlocklistPageSchema },
      },
    },
    async (request, reply) => {
      const query = arrListQueryFrom('blocklist', request.query);
      const page = query.page;
      void reply.header('cache-control', 'no-store');
      const sonarr = clientOf(request);
      const seriesIds = query.q === '' ? [] : await seriesIdsMatching(sonarr, request, query.q);
      if (query.q !== '' && seriesIds.length === 0) return emptyPage(page, SONARR_PAGE_SIZE);
      const blocklist = await sonarr.blocklist(
        page,
        SONARR_PAGE_SIZE,
        upstreamSort(SONARR_SORT_KEYS, query),
        seriesIds,
      );
      // Sans série incluse, le titre vient de la bibliothèque en cache (l'original montrait l'id).
      const records = blocklist.records ?? [];
      const titles = records.every((item) => item.series?.title)
        ? new Map<number, string>()
        : await seriesTitles(sonarr, request).catch(() => new Map<number, string>());
      return {
        records: records.map((item) => normalizeSeriesBlocklistItem(item, titles)),
        totalRecords: blocklist.totalRecords ?? 0,
        page,
        pageSize: SONARR_PAGE_SIZE,
      };
    },
  );

  /** Ids des séries dont le titre contient la recherche (bibliothèque en cache SWR). */
  async function seriesIdsMatching(sonarr: SonarrClient, request: FastifyRequest, search: string) {
    const { slug } = request.params as { slug: string };
    const series = await app.cache.library.series(slug, () => sonarr.seriesList());
    return idsMatching(series, search);
  }

  /** Titres des séries de l'instance (bibliothèque en cache SWR). */
  async function seriesTitles(sonarr: SonarrClient, request: FastifyRequest) {
    const { slug } = request.params as { slug: string };
    const series = await app.cache.library.series(slug, () => sonarr.seriesList());
    return new Map(
      series.flatMap((entry) => (entry.id === null ? [] : [[entry.id, entry.title] as const])),
    );
  }

  // n° 158 : retirer une release de la liste de blocage.
  app.post(
    `${base}/blocklist/:id/delete`,
    { config, schema: { params: idParams, response: { 200: okResponseSchema } } },
    async (request) => {
      await clientOf(request).deleteBlocklistItem(request.params.id);
      return { ok: true as const };
    },
  );

  // n° 159 : en retirer plusieurs.
  app.post(
    `${base}/blocklist/bulk-delete`,
    {
      config,
      schema: { params: slugParams, body: idsRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await clientOf(request).bulkDeleteBlocklist(request.body.ids);
      return { ok: true as const };
    },
  );

  // ── Système, import par lot ─────────────────────────────────────────────────

  // n° 160 : page `/medias/{slug}/series/systeme`.
  // Journaux, disques, indexeurs et clients : administration seulement.
  app.get(
    `${base}/systeme`,
    {
      config: { ...config, permission: 'admin' },
      schema: { params: slugParams, response: { 200: arrSystemResponseSchema } },
    },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      return arrSystemResponse(clientOf(request));
    },
  );

  // n° 167 : import par lot (`POST /series/import`), sans écran dans l'original.
  app.post(
    `${base}/import/batch`,
    {
      config,
      schema: {
        params: slugParams,
        body: seriesImportBatchRequestSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      await clientOf(request).importSeries(request.body);
      invalidateSeries(instance, request);
      return { ok: true as const };
    },
  );
};
