// SPDX-License-Identifier: AGPL-3.0-or-later
// Pages Radarr (P2.7) : file d'attente (import forcé, suppression, grab),
// manquants et leur recherche, cutoff, historique, liste de blocage,
// collections et système (`MediaController::filmQueue*`, `filmsMissing`,
// `filmsCutoff`, `filmsHistory`, `filmsBlocklist`, `filmBlocklist*`,
// `filmsCollections`, `filmCollectionMonitor`, `filmsSearchMissing`,
// `refreshDownloads`, `radarrSystem`).
//
// Les pages de l'original (`PAGE`) deviennent des routes Vue aux mêmes URL ;
// leurs données passent par ces endpoints (règle R1 : `/api` + chemin source).
// Différences : formes réduites, erreurs au format commun ; la
// page système charge ses sections indépendamment (une section en échec vaut
// `null`) et ne lève que si toutes échouent.

import {
  RADARR_PAGE_SIZE,
  arrListQueryFrom,
  arrSystemResponseSchema,
  cutoffFiltered,
  cutoffQueryFrom,
  titleMatches,
  blocklistPageSchema,
  collectionMonitorRequestSchema,
  collectionMonitorResponseSchema,
  commandStartedResponseSchema,
  cutoffPageSchema,
  historyPageSchema,
  idsRequestSchema,
  missingPageSchema,
  movieCollectionSchema,
  movieManualImportPreviewSchema,
  movieManualImportRequestSchema,
  okResponseSchema,
  queueDeleteRequestSchema,
} from '@hubarr/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { LIBRARY_TIMEOUT_MS } from '../../integrations/radarr/client';
import { imageUrl, isoDate } from '../../integrations/radarr/normalize';
import {
  normalizeBlocklistItem,
  normalizeHistoryItem,
} from '../../integrations/radarr/normalize-detail';
import type { RadarrMovieResource } from '../../integrations/radarr/types';
import { guardServiceModule } from '../../plugins/access';
import {
  CUTOFF_FETCH_MAX,
  RADARR_SORT_KEYS,
  emptyPage,
  idsMatching,
  paginate,
  upstreamSort,
} from '../arr/list-query';
import { arrSystemResponse } from '../arr/system';
import { movieImportFiles, normalizeMoviePreview } from '../media/manual-import';
import {
  RADARR_CONFIG,
  boundInstance,
  clientOf,
  invalidateLibrary,
  positiveInt,
  rawQuery,
  scalar,
  slugParams,
} from './common';

const base = '/api/medias/:slug/films';
const queueParams = slugParams.extend({ queueId: z.coerce.number().int().positive() });
const idParam = slugParams.extend({ id: z.coerce.number().int().positive() });

/** Types d'évènement acceptés pour le filtre de l'historique (`HISTORY_EVENT_FILTERS`). */
const HISTORY_EVENT_TYPES = new Set(['1', '3', '4', '6', '8']);

export const moviePagesRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  guardServiceModule(app);

  const config = RADARR_CONFIG;
  const radarrOf = (request: Parameters<typeof clientOf>[1]) => clientOf(instance, request);
  const pageOf = (query: Record<string, unknown>) => positiveInt(query.page, 1);
  /** Ids des films dont le titre contient la recherche (bibliothèque en cache). */
  const movieIdsMatching = async (request: Parameters<typeof clientOf>[1], search: string) => {
    const row = boundInstance(request);
    const movies = await app.cache.library.movies(row.slug, () =>
      radarrOf(request).movies(LIBRARY_TIMEOUT_MS),
    );
    return idsMatching(movies, search);
  };

  // ── File d'attente ──────────────────────────────────────────────────────────

  // n° 151 : demander à Radarr de relire ses clients de téléchargement.
  // Simple relecture, sans effet sur la bibliothèque : ouverte au droit de lecture.
  app.post(
    `${base}/command/refresh-downloads`,
    {
      config: { ...config, permission: 'read' },
      schema: { params: slugParams, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await radarrOf(request).sendCommand('RefreshMonitoredDownloads');
      return { ok: true as const };
    },
  );

  // n° 173 : forcer l'import d'un téléchargement bloqué (import manuel du dossier de sortie).
  app.post(
    `${base}/queue/:queueId/import`,
    { config, schema: { params: queueParams, response: { 200: commandStartedResponseSchema } } },
    async (request) => {
      const radarr = radarrOf(request);
      const { queueId } = request.params;
      const raw = (await radarr.rawQueue()).find((item) => item.id === queueId);
      if (raw === undefined || (raw.outputPath ?? '') === '' || raw.movieId === undefined) {
        throw new ApiError(404, 'NOT_FOUND', {
          service: 'radarr',
          details: { reason: 'media.api.queue_item_not_found' },
        });
      }
      const cmdId = await radarr.manualImport([
        {
          path: raw.outputPath,
          movieId: raw.movieId,
          quality: raw.quality ?? null,
          languages: raw.languages ?? [{ id: 1, name: 'English' }],
        },
      ]);
      return { ok: true as const, cmdId };
    },
  );

  /** Élément brut de la file et aperçu de son import manuel (par `downloadId`, sinon par dossier). */
  const queuePreview = async (request: Parameters<typeof clientOf>[1], queueId: number) => {
    const radarr = radarrOf(request);
    const raw = (await radarr.rawQueue()).find((item) => item.id === queueId);
    const downloadId = raw?.downloadId ?? '';
    const folder = raw?.outputPath ?? '';
    if (raw === undefined || (downloadId === '' && folder === '')) {
      throw new ApiError(404, 'NOT_FOUND', {
        service: 'radarr',
        details: { reason: 'media.api.queue_item_not_found' },
      });
    }
    const previews = await radarr.manualImportPreview(
      downloadId !== '' ? { downloadId } : { folder },
      false,
    );
    return { radarr, previews, downloadId: downloadId === '' ? null : downloadId };
  };

  // Import manuel d'un élément de la file : aperçu (fichiers, film reconnu, refus).
  app.get(
    `${base}/queue/:queueId/manual-import`,
    {
      config,
      schema: { params: queueParams, response: { 200: movieManualImportPreviewSchema } },
    },
    async (request) => {
      const { previews } = await queuePreview(request, request.params.queueId);
      return { files: previews.map(normalizeMoviePreview) };
    },
  );

  // Import manuel d'un élément de la file : fichiers choisis, film, qualité et langues corrigés.
  app.post(
    `${base}/queue/:queueId/manual-import`,
    {
      config,
      schema: {
        params: queueParams,
        body: movieManualImportRequestSchema,
        response: { 200: commandStartedResponseSchema },
      },
    },
    async (request) => {
      const { radarr, previews, downloadId } = await queuePreview(request, request.params.queueId);
      const definitions = await radarr.qualityDefinitions();
      const files = movieImportFiles(previews, request.body, definitions, downloadId);
      const cmdId = await radarr.manualImport(files, 'auto');
      invalidateLibrary(instance, request);
      return { ok: true as const, cmdId };
    },
  );

  // n° 174 : retirer un élément de la file (client, liste de blocage, sans nouvelle recherche).
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
      await radarrOf(request).deleteQueueItem(request.params.queueId, request.body);
      return { ok: true as const };
    },
  );

  // n° 175 : forcer le téléchargement d'un élément en attente (délai).
  app.post(
    `${base}/queue/:queueId/grab`,
    { config, schema: { params: queueParams, response: { 200: okResponseSchema } } },
    async (request) => {
      await radarrOf(request).grabQueueItem(request.params.queueId);
      return { ok: true as const };
    },
  );

  // n° 176 : forcer le téléchargement de plusieurs éléments.
  app.post(
    `${base}/queue/grab/bulk`,
    {
      config,
      schema: { params: slugParams, body: idsRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await radarrOf(request).bulkGrabQueue(request.body.ids);
      return { ok: true as const };
    },
  );

  // ── Manquants, cutoff ───────────────────────────────────────────────────────

  // n° 135 : films suivis sans fichier (page `/medias/{slug}/films/manquants`).
  app.get(
    `${base}/manquants`,
    {
      config,
      schema: { params: slugParams, querystring: rawQuery, response: { 200: missingPageSchema } },
    },
    async (request) => {
      const radarr = radarrOf(request);
      const page = pageOf(request.query);
      const [missing, profiles] = await Promise.all([
        radarr.missing(page, RADARR_PAGE_SIZE),
        radarr.qualityProfiles(),
      ]);
      const profileNames = new Map(profiles.map((profile) => [profile.id, profile.name ?? null]));
      return {
        records: (missing.records ?? []).flatMap((movie: RadarrMovieResource) =>
          movie.id === undefined
            ? []
            : [
                {
                  id: movie.id,
                  title: movie.title ?? '—',
                  year: movie.year ?? null,
                  status: movie.status ?? 'unknown',
                  qualityProfile: profileNames.get(movie.qualityProfileId) ?? null,
                  releaseDate: isoDate(movie.digitalRelease) ?? isoDate(movie.inCinemas),
                  poster: imageUrl(movie, 'poster'),
                },
              ],
        ),
        totalRecords: missing.totalRecords ?? 0,
        page,
        pageSize: RADARR_PAGE_SIZE,
      };
    },
  );

  // n° 177 : rechercher tous les films manquants (`MissingMoviesSearch`).
  app.post(
    `${base}/recherche-manquants`,
    { config, schema: { params: slugParams, response: { 200: commandStartedResponseSchema } } },
    async (request) => ({ ok: true as const, cmdId: await radarrOf(request).searchAllMissing() }),
  );

  // n° 136 : films sous le seuil de qualité de leur profil.
  app.get(
    `${base}/cutoff`,
    {
      config,
      schema: { params: slugParams, querystring: rawQuery, response: { 200: cutoffPageSchema } },
    },
    async (request) => {
      // Recherche par titre et profil (P5c.5, V6) : liste complète, filtrée puis paginée.
      const query = cutoffQueryFrom(request.query);
      const filtered = cutoffFiltered(query);
      const cutoff = await radarrOf(request).cutoff(
        filtered ? 1 : query.page,
        filtered ? CUTOFF_FETCH_MAX : RADARR_PAGE_SIZE,
      );
      const records = (cutoff.records ?? []).flatMap((movie: RadarrMovieResource) =>
        movie.id === undefined ||
        (query.profile > 0 && movie.qualityProfileId !== query.profile) ||
        !titleMatches(movie.title ?? '', query.q)
          ? []
          : [
              {
                id: movie.id,
                title: movie.title ?? '—',
                year: movie.year ?? null,
                quality: movie.movieFile?.quality?.quality?.name ?? null,
                inCinemas: isoDate(movie.inCinemas),
                poster: imageUrl(movie, 'poster'),
              },
            ],
      );
      if (filtered) return paginate(records, query.page, RADARR_PAGE_SIZE);
      return {
        records,
        totalRecords: cutoff.totalRecords ?? 0,
        page: query.page,
        pageSize: RADARR_PAGE_SIZE,
      };
    },
  );

  // ── Historique, liste de blocage ────────────────────────────────────────────

  // n° 137 : historique de l'instance, filtrable par type d'évènement.
  app.get(
    `${base}/historique`,
    {
      config,
      schema: { params: slugParams, querystring: rawQuery, response: { 200: historyPageSchema } },
    },
    async (request, reply) => {
      // Tri par colonne et recherche par titre (P5c.5, V5) ; date décroissante par défaut.
      const query = arrListQueryFrom('history', request.query);
      const eventType = scalar(request.query.eventType);
      void reply.header('cache-control', 'no-store');
      const movieIds = query.q === '' ? [] : await movieIdsMatching(request, query.q);
      if (query.q !== '' && movieIds.length === 0) return emptyPage(query.page, RADARR_PAGE_SIZE);
      const history = await radarrOf(request).history({
        page: query.page,
        pageSize: RADARR_PAGE_SIZE,
        eventType: HISTORY_EVENT_TYPES.has(eventType) ? eventType : '',
        sort: upstreamSort(RADARR_SORT_KEYS, query),
        movieIds,
      });
      return {
        records: (history.records ?? []).map(normalizeHistoryItem),
        totalRecords: history.totalRecords ?? 0,
        page: query.page,
        pageSize: RADARR_PAGE_SIZE,
      };
    },
  );

  // n° 179 : liste de blocage de l'instance.
  app.get(
    `${base}/blocklist`,
    {
      config,
      schema: { params: slugParams, querystring: rawQuery, response: { 200: blocklistPageSchema } },
    },
    async (request, reply) => {
      const query = arrListQueryFrom('blocklist', request.query);
      void reply.header('cache-control', 'no-store');
      const movieIds = query.q === '' ? [] : await movieIdsMatching(request, query.q);
      if (query.q !== '' && movieIds.length === 0) return emptyPage(query.page, RADARR_PAGE_SIZE);
      const blocklist = await radarrOf(request).blocklist(
        query.page,
        RADARR_PAGE_SIZE,
        upstreamSort(RADARR_SORT_KEYS, query),
        movieIds,
      );
      return {
        records: (blocklist.records ?? []).map(normalizeBlocklistItem),
        totalRecords: blocklist.totalRecords ?? 0,
        page: query.page,
        pageSize: RADARR_PAGE_SIZE,
      };
    },
  );

  // n° 181 : retirer une release de la liste de blocage.
  app.post(
    `${base}/blocklist/:id/delete`,
    { config, schema: { params: idParam, response: { 200: okResponseSchema } } },
    async (request) => {
      await radarrOf(request).deleteBlocklistItem(request.params.id);
      return { ok: true as const };
    },
  );

  // n° 182 : en retirer plusieurs.
  app.post(
    `${base}/blocklist/bulk-delete`,
    {
      config,
      schema: { params: slugParams, body: idsRequestSchema, response: { 200: okResponseSchema } },
    },
    async (request) => {
      await radarrOf(request).bulkDeleteBlocklist(request.body.ids);
      return { ok: true as const };
    },
  );

  // ── Collections ─────────────────────────────────────────────────────────────

  // n° 178 : collections, enrichies de l'état de chaque film dans la bibliothèque.
  app.get(
    `${base}/collections`,
    {
      config,
      schema: { params: slugParams, response: { 200: z.array(movieCollectionSchema) } },
    },
    async (request) => {
      const radarr = radarrOf(request);
      const [collections, movies] = await Promise.all([
        radarr.collections(),
        radarr.rawMovies(LIBRARY_TIMEOUT_MS),
      ]);
      // tmdbId → film présent (avec ou sans fichier).
      const library = new Map<number, boolean>();
      for (const movie of movies) {
        if (movie.tmdbId) library.set(movie.tmdbId, movie.hasFile ?? false);
      }
      return collections.flatMap((collection) =>
        collection.id === undefined
          ? []
          : [
              {
                id: collection.id,
                tmdbId: collection.tmdbId ?? null,
                title: collection.title ?? '—',
                overview: collection.overview ?? null,
                poster:
                  (collection.images ?? []).find((image) => image.coverType === 'poster')
                    ?.remoteUrl ?? null,
                monitored: collection.monitored ?? false,
                qualityProfileId: collection.qualityProfileId ?? null,
                rootFolderPath: collection.rootFolderPath ?? null,
                movies: (collection.movies ?? []).map((movie) => {
                  const tmdbId = movie.tmdbId ?? null;
                  return {
                    tmdbId,
                    title: movie.title ?? '—',
                    year: movie.year ?? null,
                    poster:
                      (movie.images ?? []).find((image) => image.coverType === 'poster')
                        ?.remoteUrl ?? null,
                    hasFile: tmdbId !== null && library.get(tmdbId) === true,
                    inLibrary: tmdbId !== null && library.has(tmdbId),
                  };
                }),
              },
            ],
      );
    },
  );

  // n° 180 : suivre / ne plus suivre une collection.
  app.post(
    `${base}/collections/:id/monitor`,
    {
      config,
      schema: {
        params: idParam,
        body: collectionMonitorRequestSchema,
        response: { 200: collectionMonitorResponseSchema },
      },
    },
    async (request) => {
      const { monitored } = request.body;
      await radarrOf(request).updateCollection(request.params.id, monitored);
      // Radarr ajoute les films d'une collection suivie : la bibliothèque change.
      invalidateLibrary(instance, request);
      return { ok: true as const, monitored };
    },
  );

  // ── Système ─────────────────────────────────────────────────────────────────

  // n° 185 : page `/medias/{slug}/radarr/systeme`.
  // Journaux, disques, indexeurs et clients : administration seulement.
  app.get(
    '/api/medias/:slug/radarr/systeme',
    {
      config: { ...config, permission: 'admin' },
      schema: { params: slugParams, response: { 200: arrSystemResponseSchema } },
    },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      return arrSystemResponse(radarrOf(request));
    },
  );
};
