// SPDX-License-Identifier: AGPL-3.0-or-later
// Bibliothèque de films d'une instance Radarr (`MediaController`, P2.3) :
// données de la page (filtre, tri, pagination, facettes, statistiques),
// avertissements, ids du filtre, actions en masse, commandes et configuration.
//
// Règle R1 : `/medias/{slug}/films/…` → `/api/medias/:slug/films/…`. Le
// contrôleur d'origine était réservé aux admins ; la garde de service lie
// l'instance du slug (`request.instance`).
//
// Différences avec l'original :
// - les erreurs de Radarr ne renvoient plus `{ ok: false }` en 200 mais le
//   format d'erreur commun (503 injoignable, 502 erreur de l'instance) ;
// - une liste d'ids vide → 400 `VALIDATION` (`media.api.no_movies_selected`) ;
// - les avertissements sont des codes, traduits par le front ;
// - `filter/ids` lit la bibliothèque en cache (comme la page affichée) au lieu
//   de la recharger.

import {
  arrCommandStatusSchema,
  arrConfigResponseSchema,
  commandStartedResponseSchema,
  filteredIdsResponseSchema,
  libraryWarningsResponseSchema,
  movieIdsRequestSchema,
  movieLibraryResponseSchema,
  moviesBulkDeleteRequestSchema,
  moviesBulkEditRequestSchema,
  okResponseSchema,
  parseMovieLibraryQuery,
  qualityProfileSummarySchema,
  rootFolderSummarySchema,
  withoutPagination,
  type ArrCommandStatus,
  type LibraryWarning,
  type Movie,
} from '@hubarr/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../http/zod';
import type { ArrCommand } from '../../integrations/arr/client';
import { isUpstreamError } from '../../integrations/http';
import { LIBRARY_TIMEOUT_MS, type RadarrClient } from '../../integrations/radarr/client';
import { requireRole } from '../../plugins/access';
import { defaultQualityProfileIdOf } from '../instances/instances';
import { radarrClient } from '../services/clients';
import { readResolvedPreferences } from '../settings/preferences';
import { MOVIES_BASE, RADARR_CONFIG, boundInstance, rawQuery, scalar, slugParams } from './common';
import { applyMovieLibraryFilter, libraryStats, pageOfMovie } from './library-filter';

const commandParams = slugParams.extend({ cmdId: z.coerce.number().int().nonnegative() });

/** Film de la bibliothèque, avec un id (toujours présent dans `/api/v3/movie`). */
type LibraryMovie = Movie & { id: number };

/** Statut d'une commande, ou `unknown` quand l'instance ne la connaît plus (404). */
export function commandStatusOf(command: ArrCommand, fallbackId: number): ArrCommandStatus {
  return {
    id: command.id ?? fallbackId,
    name: command.name ?? command.commandName ?? '',
    status: command.status ?? 'unknown',
    message: command.message ?? null,
    queued: command.queued ?? null,
    started: command.started ?? null,
    ended: command.ended ?? null,
  };
}

export const movieRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  app.addHook('onRequest', requireRole('admin'));

  const base = MOVIES_BASE;
  const config = RADARR_CONFIG;
  const clientOf = (request: FastifyRequest): RadarrClient =>
    radarrClient(instance, boundInstance(request));

  /** Bibliothèque complète (cache SWR par instance, D85). */
  const library = async (request: FastifyRequest): Promise<LibraryMovie[]> => {
    const row = boundInstance(request);
    const movies = await app.cache.library.movies(row.slug, () =>
      radarrClient(instance, row).movies(LIBRARY_TIMEOUT_MS),
    );
    return movies.filter((movie): movie is LibraryMovie => movie.id !== null);
  };
  const invalidate = (request: FastifyRequest) => {
    app.cache.library.invalidate('radarr', boundInstance(request).slug);
  };
  const defaultPerPage = () => Number(readResolvedPreferences(app.db).display_page_size);

  // n° 118 : données de la page `/medias/{slug}/films`.
  app.get(
    base,
    {
      config,
      schema: {
        params: slugParams,
        querystring: rawQuery,
        response: { 200: movieLibraryResponseSchema },
      },
    },
    async (request, reply) => {
      const movies = await library(request);
      let query = parseMovieLibraryQuery(request.query, defaultPerPage());
      // Lien profond `?open=<id>` (badge d'un torrent…) : la page qui contient le film.
      const openId = Number.parseInt(scalar(request.query.open), 10);
      if (openId > 0 && !query.unlimited) {
        const page = pageOfMovie(movies, query, openId);
        if (page !== null) query = { ...query, page };
      }
      const result = applyMovieLibraryFilter(movies, query);
      void reply.header('cache-control', 'no-store');
      return {
        items: result.items,
        total: result.total,
        libraryTotal: result.libraryTotal,
        page: result.page,
        perPage: result.perPage,
        totalPages: result.totalPages,
        unlimited: result.unlimited,
        facets: { genres: result.genres, qualities: result.qualities, languages: result.languages },
        stats: libraryStats(movies),
        query: { ...query, page: result.page },
      };
    },
  );

  // n° 120 : avertissements de l'instance.
  app.get(
    `${base}/warnings`,
    { config, schema: { params: slugParams, response: { 200: libraryWarningsResponseSchema } } },
    async (request) => {
      const radarr = clientOf(request);
      const [indexers, health, queue] = await Promise.all([
        radarr.indexers(),
        radarr.systemHealth(),
        radarr.queue(),
      ]);
      const indexerCount = indexers.filter(
        (indexer) =>
          indexer.enableAutomaticSearch === true || indexer.enableInteractiveSearch === true,
      ).length;
      const warnings: LibraryWarning[] = [];
      if (indexerCount === 0) warnings.push({ code: 'no_indexer' });
      for (const check of health) {
        warnings.push({
          code: 'health',
          source: check.source ?? 'Radarr',
          message: check.message ?? '?',
        });
      }
      const blocked = queue.filter((item) => item.trackedState === 'importBlocked').length;
      if (blocked > 0) warnings.push({ code: 'import_blocked', count: blocked });
      return { warnings, indexerCount };
    },
  );

  // n° 146 : ids de tout le filtre (actions « filtrées »).
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
      const query = withoutPagination(parseMovieLibraryQuery(request.query));
      const searchableOnly = ['1', 'true', 'on', 'yes'].includes(
        scalar(request.query.searchable_only).toLowerCase(),
      );
      const ids = applyMovieLibraryFilter(await library(request), query)
        .items.filter((movie) => !searchableOnly || (!movie.hasFile && movie.monitored))
        .map((movie) => movie.id);
      return { ids, total: ids.length };
    },
  );

  // n° 147, 148 : actualiser, rechercher une sélection.
  const bulkCommand = (path: string, command: 'RefreshMovie' | 'MoviesSearch') => {
    app.post(
      `${base}/bulk/${path}`,
      {
        config,
        schema: {
          params: slugParams,
          body: movieIdsRequestSchema,
          response: { 200: commandStartedResponseSchema },
        },
      },
      async (request) => {
        const cmdId = await clientOf(request).commandId(command, {
          movieIds: request.body.movieIds,
        });
        return { ok: true as const, cmdId };
      },
    );
  };
  bulkCommand('refresh', 'RefreshMovie');
  bulkCommand('search', 'MoviesSearch');

  // n° 149 : éditeur de masse.
  app.post(
    `${base}/bulk/edit`,
    {
      config,
      schema: {
        params: slugParams,
        body: moviesBulkEditRequestSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      const { movieIds, ...fields } = request.body;
      // Seuls les champs fournis partent à Radarr (les `isset` de l'original).
      const changes = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      ) as Partial<{ [K in keyof typeof fields]: Exclude<(typeof fields)[K], undefined> }>;
      await clientOf(request).bulkUpdateMovies(movieIds, changes);
      invalidate(request);
      return { ok: true as const };
    },
  );

  // n° 150 : suppression de masse.
  app.post(
    `${base}/bulk/delete`,
    {
      config,
      schema: {
        params: slugParams,
        body: moviesBulkDeleteRequestSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      const { movieIds, deleteFiles, addImportExclusion } = request.body;
      await clientOf(request).bulkDeleteMovies(movieIds, { deleteFiles, addImportExclusion });
      invalidate(request);
      return { ok: true as const };
    },
  );

  // n° 152, 153 : tout actualiser, synchro RSS.
  const instanceCommand = (path: string, run: (radarr: RadarrClient) => Promise<number | null>) => {
    app.post(
      `${base}/command/${path}`,
      {
        config,
        schema: { params: slugParams, response: { 200: commandStartedResponseSchema } },
      },
      async (request) => ({ ok: true as const, cmdId: await run(clientOf(request)) }),
    );
  };
  instanceCommand('refresh-all', (radarr) => radarr.refreshAllMovies());
  instanceCommand('rss-sync', (radarr) => radarr.rssSync());

  // n° 126 : état d'une commande (suivi par le front toutes les 2 s).
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

  // n° 187, 188, 194 : profils, dossiers racine, configuration des dialogues.
  const qualityProfiles = async (radarr: RadarrClient) =>
    (await radarr.qualityProfiles()).map((profile) => ({
      id: profile.id ?? 0,
      name: profile.name ?? '',
    }));
  const rootFolders = async (radarr: RadarrClient) =>
    (await radarr.rootFolders()).map((folder) => ({
      id: folder.id ?? 0,
      path: folder.path ?? '',
      accessible: folder.accessible ?? false,
      freeSpace: folder.freeSpace ?? null,
    }));

  app.get(
    `${base}/quality-profiles`,
    {
      config,
      schema: { params: slugParams, response: { 200: z.array(qualityProfileSummarySchema) } },
    },
    async (request) => qualityProfiles(clientOf(request)),
  );

  app.get(
    `${base}/root-folders`,
    { config, schema: { params: slugParams, response: { 200: z.array(rootFolderSummarySchema) } } },
    async (request) => rootFolders(clientOf(request)),
  );

  app.get(
    `${base}/config`,
    { config, schema: { params: slugParams, response: { 200: arrConfigResponseSchema } } },
    async (request) => {
      const radarr = clientOf(request);
      const [profiles, folders, tags] = await Promise.all([
        qualityProfiles(radarr),
        rootFolders(radarr),
        radarr.tags(),
      ]);
      return {
        qualityProfiles: profiles,
        rootFolders: folders,
        tags: tags.map((tag) => ({ id: tag.id ?? 0, label: tag.label ?? '' })),
        defaultQualityProfileId: defaultQualityProfileIdOf(boundInstance(request)),
      };
    },
  );
};
