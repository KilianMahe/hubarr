// SPDX-License-Identifier: AGPL-3.0-or-later
// Bibliothèque de séries d'une instance Sonarr (`MediaController::series*`,
// `sonarr*Json`, P3a.1) : données de la page (filtre, tri, pagination,
// facettes, statistiques, calendrier des 14 prochains jours), avertissements,
// recherche et ajout, ids du filtre, actions en masse, commandes de l'instance,
// commandes en cours et état d'une commande, configuration (profils, dossiers,
// étiquettes).
//
// Règle R1 : `/medias/{slug}/series/…` → `/api/medias/:slug/series/…`. Droit sur
// l'instance contrôlé par la garde de service.
//
// Différences avec l'original (comme D86 et D90 pour Radarr) :
// - erreurs de Sonarr au format commun (503, 502) au lieu de `{ ok: false }` ;
// - liste d'ids vide → 400 `VALIDATION` (`media.api.no_series`) ;
// - avertissements en codes, traduits par le front ;
// - `filter/ids` lit la bibliothèque en cache au lieu de la recharger ;
// - ajout sans dossier racine refusé (l'original retombait sur `/jellyfin/Series`).

import {
  arrCommandStatusSchema,
  arrTagSchema,
  commandStartedResponseSchema,
  filteredIdsResponseSchema,
  okResponseSchema,
  parseSeriesLibraryQuery,
  qualityProfileSummarySchema,
  rootFolderSummarySchema,
  seriesAddRequestSchema,
  seriesAddResponseSchema,
  seriesBulkDeleteRequestSchema,
  seriesBulkEditRequestSchema,
  seriesLibraryResponseSchema,
  seriesLookupSchema,
  seriesWarningsResponseSchema,
  seriesWithoutPagination,
  tagCreateRequestSchema,
  tagCreateResponseSchema,
  type CalendarEpisode,
  type LibraryWarning,
  type Series,
} from '@hubarr/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { isUpstreamError } from '../../integrations/http';
import {
  LIBRARY_CALENDAR_DAYS,
  LIBRARY_TIMEOUT_MS,
  type SonarrClient,
} from '../../integrations/sonarr/client';
import { guardServiceModule } from '../../plugins/access';
import { defaultQualityProfileIdOf } from '../instances/instances';
import { commandStatusOf } from '../movies/routes';
import { sonarrClient } from '../services/clients';
import { readResolvedPreferences } from '../settings/preferences';
import {
  SERIES_BASE,
  SONARR_BASE,
  SONARR_CONFIG,
  definedFields,
  invalidateSeries,
  rawQuery,
  scalar,
  slugParams,
  sonarrInstance,
  sonarrOf,
} from './common';
import {
  applySeriesLibraryFilter,
  hasMissingEpisodes,
  pageOfSeries,
  seriesStats,
} from './library-filter';

/** Commandes encore en cours (`queued` ou `started`). */
const ACTIVE_STATUSES = new Set(['queued', 'started']);

const commandParams = slugParams.extend({ cmdId: z.coerce.number().int().nonnegative() });

/** Série de la bibliothèque, avec un id (toujours présent dans `/api/v3/series`). */
type LibrarySeries = Series & { id: number };

export const seriesRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  guardServiceModule(app);

  const base = SERIES_BASE;
  const config = SONARR_CONFIG;
  const clientOf = (request: FastifyRequest): SonarrClient => sonarrOf(instance, request);

  /** Bibliothèque complète (cache SWR par instance, D85). */
  const library = async (request: FastifyRequest): Promise<LibrarySeries[]> => {
    const row = sonarrInstance(request);
    const series = await app.cache.library.series(row.slug, () =>
      sonarrClient(instance, row).seriesList(LIBRARY_TIMEOUT_MS),
    );
    return series.filter((entry): entry is LibrarySeries => entry.id !== null);
  };
  const defaultPerPage = () => Number(readResolvedPreferences(app.db).display_page_size);

  // n° 119 : données de la page `/medias/{slug}/series`.
  app.get(
    base,
    {
      config,
      schema: {
        params: slugParams,
        querystring: rawQuery,
        response: { 200: seriesLibraryResponseSchema },
      },
    },
    async (request, reply) => {
      const sonarr = clientOf(request);
      const [series, calendar] = await Promise.all([
        library(request),
        // Carte annexe : un calendrier indisponible ne masque pas la bibliothèque.
        sonarr.calendar(LIBRARY_CALENDAR_DAYS).catch((error: unknown): CalendarEpisode[] => {
          if (isUpstreamError(error)) return [];
          throw error;
        }),
      ]);
      let query = parseSeriesLibraryQuery(request.query, defaultPerPage());
      // Lien profond `?open=<id>` : la page qui contient la série.
      const openId = Number.parseInt(scalar(request.query.open), 10);
      if (openId > 0 && !query.unlimited) {
        const page = pageOfSeries(series, query, openId);
        if (page !== null) query = { ...query, page };
      }
      const result = applySeriesLibraryFilter(series, query);
      void reply.header('cache-control', 'no-store');
      return {
        items: result.items,
        total: result.total,
        libraryTotal: result.libraryTotal,
        page: result.page,
        perPage: result.perPage,
        totalPages: result.totalPages,
        unlimited: result.unlimited,
        facets: { genres: result.genres, networks: result.networks },
        stats: seriesStats(series),
        query: { ...query, page: result.page },
        calendar,
        defaultQualityProfileId: defaultQualityProfileIdOf(sonarrInstance(request)),
      };
    },
  );

  // n° 161 : avertissements (santé, imports bloqués).
  app.get(
    `${base}/warnings`,
    { config, schema: { params: slugParams, response: { 200: seriesWarningsResponseSchema } } },
    async (request) => {
      const sonarr = clientOf(request);
      const [health, queue] = await Promise.all([sonarr.systemHealth(), sonarr.queue()]);
      const warnings: LibraryWarning[] = health.map((check) => ({
        code: 'health' as const,
        source: check.source ?? 'Sonarr',
        message: check.message ?? '?',
      }));
      const blocked = queue.filter((item) => item.trackedState === 'importBlocked').length;
      if (blocked > 0) warnings.push({ code: 'import_blocked', count: blocked });
      return { warnings };
    },
  );

  // n° 162 : recherche d'une série à ajouter (`id` non nul = déjà dans Sonarr).
  app.get(
    `${base}/lookup`,
    {
      config,
      schema: {
        params: slugParams,
        querystring: rawQuery,
        response: { 200: z.array(seriesLookupSchema) },
      },
    },
    async (request) => {
      const term = scalar(request.query.term).trim();
      if (term === '') return [];
      return clientOf(request).lookup(term);
    },
  );

  // n° 163 : ajout d'une série.
  app.post(
    `${base}/add`,
    {
      config,
      schema: {
        params: slugParams,
        body: seriesAddRequestSchema,
        response: { 200: seriesAddResponseSchema },
      },
    },
    async (request) => {
      const sonarr = clientOf(request);
      const body = request.body;
      const raw = (await sonarr.rawLookup(`tvdb:${body.tvdbId}`))[0];
      if (raw === undefined) {
        throw new ApiError(404, 'NOT_FOUND', {
          service: 'sonarr',
          details: { reason: 'media.api.series_not_found' },
        });
      }
      // Issue #5 : choix du client, sinon profil de l'instance, sinon celui de
      // la recherche, sinon 1 ; 0 vaut « absent ».
      const qualityProfileId =
        [
          body.qualityProfileId,
          defaultQualityProfileIdOf(sonarrInstance(request)) ?? 0,
          raw.qualityProfileId ?? 0,
        ].find((id) => id > 0) ?? 1;
      const series = await sonarr.addSeries({
        ...raw,
        qualityProfileId,
        rootFolderPath: body.rootFolderPath,
        monitored: body.monitored,
        seasonFolder: body.seasonFolder,
        seriesType: body.seriesType ?? raw.seriesType ?? 'standard',
        ...(body.tags === undefined ? {} : { tags: body.tags }),
        addOptions: {
          monitor: body.monitor,
          searchForMissingEpisodes: body.searchForMissing,
          searchForCutoffUnmetEpisodes: false,
        },
      });
      invalidateSeries(instance, request);
      return { ok: true as const, series };
    },
  );

  // n° 164 : ids de tout le filtre (actions « filtrées »).
  app.get(
    `${base}/filter/ids`,
    {
      config,
      schema: {
        params: slugParams,
        querystring: rawQuery,
        response: { 200: filteredIdsResponseSchema },
      },
    },
    async (request) => {
      const query = seriesWithoutPagination(parseSeriesLibraryQuery(request.query));
      // `searchable_only` : séries suivies avec au moins un épisode manquant.
      const searchableOnly = ['1', 'true', 'on', 'yes'].includes(
        scalar(request.query.searchable_only).toLowerCase(),
      );
      const ids = applySeriesLibraryFilter(await library(request), query)
        .items.filter((entry) => !searchableOnly || hasMissingEpisodes(entry))
        .map((entry) => entry.id);
      return { ids, total: ids.length };
    },
  );

  // n° 165 : éditeur de masse.
  app.post(
    `${base}/bulk/edit`,
    {
      config,
      schema: {
        params: slugParams,
        body: seriesBulkEditRequestSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      const { seriesIds, ...fields } = request.body;
      await clientOf(request).bulkUpdateSeries(seriesIds, definedFields(fields));
      invalidateSeries(instance, request);
      return { ok: true as const };
    },
  );

  // n° 166 : suppression de masse.
  app.post(
    `${base}/bulk/delete`,
    {
      config,
      schema: {
        params: slugParams,
        body: seriesBulkDeleteRequestSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      const { seriesIds, deleteFiles, addImportExclusion } = request.body;
      await clientOf(request).bulkDeleteSeries(seriesIds, { deleteFiles, addImportExclusion });
      invalidateSeries(instance, request);
      return { ok: true as const };
    },
  );

  // n° 169, 170, 171 : rechercher tous les manquants, tout actualiser, synchro RSS.
  const instanceCommand = (path: string, run: (sonarr: SonarrClient) => Promise<number | null>) => {
    app.post(
      `${base}/command/${path}`,
      { config, schema: { params: slugParams, response: { 200: commandStartedResponseSchema } } },
      async (request) => ({ ok: true as const, cmdId: await run(clientOf(request)) }),
    );
  };
  instanceCommand('missing-search', (sonarr) => sonarr.searchAllMissing());
  instanceCommand('refresh-all', (sonarr) => sonarr.refreshAllSeries());
  instanceCommand('rss-sync', (sonarr) => sonarr.rssSync());

  // n° 215 : commandes en cours (reprise du suivi au chargement de la page).
  app.get(
    `${base}/commands/active`,
    { config, schema: { params: slugParams, response: { 200: z.array(arrCommandStatusSchema) } } },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      return (await clientOf(request).commands())
        .filter((command) => ACTIVE_STATUSES.has((command.status ?? '').toLowerCase()))
        .map((command) => commandStatusOf(command, 0));
    },
  );

  // n° 216 : état d'une commande (suivi par le front toutes les 2 s).
  app.get(
    `${base}/command/:cmdId`,
    { config, schema: { params: commandParams, response: { 200: arrCommandStatusSchema } } },
    async (request, reply) => {
      const { cmdId } = request.params;
      void reply.header('cache-control', 'no-store');
      try {
        return commandStatusOf(await clientOf(request).commandStatus(cmdId), cmdId);
      } catch (error) {
        // Commande purgée par l'instance : `unknown`, comme l'original.
        if (isUpstreamError(error) && error.kind === 'http' && error.info.status === 404) {
          return commandStatusOf({}, cmdId);
        }
        throw error;
      }
    },
  );

  // ── Configuration de l'instance (dialogues d'ajout, d'édition, de masse) ──

  // n° 223 : profils de qualité (aussi lus par le dialogue d'instance, D68).
  app.get(
    `${SONARR_BASE}/quality-profiles`,
    {
      config,
      schema: { params: slugParams, response: { 200: z.array(qualityProfileSummarySchema) } },
    },
    async (request) =>
      (await clientOf(request).qualityProfiles()).map((profile) => ({
        id: profile.id ?? 0,
        name: profile.name ?? '',
      })),
  );

  // n° 224 : dossiers racine.
  app.get(
    `${SONARR_BASE}/root-folders`,
    { config, schema: { params: slugParams, response: { 200: z.array(rootFolderSummarySchema) } } },
    async (request) =>
      (await clientOf(request).rootFolders()).map((folder) => ({
        id: folder.id ?? 0,
        path: folder.path ?? '',
        accessible: folder.accessible ?? false,
        freeSpace: folder.freeSpace ?? null,
      })),
  );

  // n° 226 : étiquettes.
  app.get(
    `${SONARR_BASE}/tags-json`,
    { config, schema: { params: slugParams, response: { 200: z.array(arrTagSchema) } } },
    async (request) =>
      (await clientOf(request).tags()).map((tag) => ({ id: tag.id ?? 0, label: tag.label ?? '' })),
  );

  // n° 227 : créer une étiquette.
  app.post(
    `${SONARR_BASE}/tags-json`,
    {
      config,
      schema: {
        params: slugParams,
        body: tagCreateRequestSchema,
        response: { 200: tagCreateResponseSchema },
      },
    },
    async (request) => {
      const tag = await clientOf(request).createTag(request.body.label);
      return {
        ok: true as const,
        tag: { id: tag.id ?? 0, label: tag.label ?? request.body.label },
      };
    },
  );
};
