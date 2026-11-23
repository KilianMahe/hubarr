// SPDX-License-Identifier: AGPL-3.0-or-later
// Fiche d'une série Sonarr (`MediaController::serie*`, `seriesRefresh`,
// `seriesHistory`, `seriesRename*`, `sonarrFilesystemJson`) : fiche, actualiser,
// rechercher les épisodes manquants, suivre, éditer, supprimer, historique,
// renommage, explorateur de dossiers. Saisons, épisodes, fichiers et releases :
// `episode-routes.ts`.
//
// Différences avec l'original : série absente → 404
// `NOT_FOUND` (l'original renvoyait `[]` ou `{ ok: false }`) ; erreurs de Sonarr
// au format commun ; « aucun épisode manquant » renvoyé en `count: 0` (traduit
// par le front) au lieu d'un message en français ; formes réduites.

import {
  commandStartedResponseSchema,
  filesystemResponseSchema,
  movieMonitorRequestSchema,
  movieMonitorResponseSchema,
  okResponseSchema,
  seriesDeleteRequestSchema,
  seriesDetailSchema,
  seriesEditRequestSchema,
  seriesEditResponseSchema,
  seriesHistoryItemSchema,
  seriesRenameProposalSchema,
  seriesRenameRequestSchema,
  seriesSearchResponseSchema,
  type Series,
  type SeriesDetail,
} from '@hubarr/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import type { SonarrClient } from '../../integrations/sonarr/client';
import {
  normalizeRenameProposal,
  normalizeSeriesHistoryItem,
} from '../../integrations/sonarr/normalize-detail';
import type { SonarrEpisodeResource } from '../../integrations/sonarr/types';
import { requireRole } from '../../plugins/access';
import {
  SERIES_BASE,
  SONARR_BASE,
  SONARR_CONFIG,
  definedFields,
  idParams,
  invalidateSeries,
  rawQuery,
  scalar,
  slugParams,
  sonarrOf,
  sonarrOrNotFound,
} from './common';

/** Fiche normalisée ; une série sans id (impossible pour `/series/{id}`) est refusée. */
function detailOf(series: Series): SeriesDetail {
  if (series.id === null) throw new ApiError(404, 'NOT_FOUND', { service: 'sonarr' });
  return { ...series, id: series.id };
}

export interface SeriesSearchPlan {
  /** Saisons dont tous les épisodes suivis et diffusés manquent (au moins deux). */
  seasons: number[];
  /** Épisodes isolés, cherchés ensemble. */
  episodeIds: number[];
  /** Épisodes manquants au total. */
  count: number;
}

/**
 * Plan de recherche d'une série (`serieSearch`) : épisodes suivis, diffusés
 * (date passée), sans fichier, spéciaux exclus. Une saison entièrement
 * manquante (plus d'un épisode) part en `SeasonSearch`, pour trouver un pack.
 */
export function planSeriesSearch(
  episodes: readonly Pick<
    SonarrEpisodeResource,
    'id' | 'seasonNumber' | 'monitored' | 'airDateUtc' | 'hasFile'
  >[],
  now: number,
): SeriesSearchPlan {
  const missing = new Map<number, number[]>();
  const aired = new Map<number, number>();
  for (const episode of episodes) {
    const season = episode.seasonNumber ?? 0;
    if (season === 0 || episode.monitored !== true) continue;
    const time = episode.airDateUtc ? Date.parse(episode.airDateUtc) : NaN;
    if (!(time <= now)) continue;
    aired.set(season, (aired.get(season) ?? 0) + 1);
    if (episode.hasFile !== true && episode.id !== undefined) {
      missing.set(season, [...(missing.get(season) ?? []), episode.id]);
    }
  }
  const plan: SeriesSearchPlan = { seasons: [], episodeIds: [], count: 0 };
  for (const [season, ids] of missing) {
    plan.count += ids.length;
    if (ids.length === aired.get(season) && ids.length > 1) plan.seasons.push(season);
    else plan.episodeIds.push(...ids);
  }
  return plan;
}

export interface SeriesDetailRoutesOptions {
  now?: () => number;
}

export const seriesDetailRoutes: FastifyPluginAsync<SeriesDetailRoutesOptions> = async (
  instance,
  options,
) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  app.addHook('onRequest', requireRole('admin'));

  const base = SERIES_BASE;
  const config = SONARR_CONFIG;
  const now = options.now ?? Date.now;
  const clientOf = (request: Parameters<typeof sonarrOf>[1]): SonarrClient =>
    sonarrOf(instance, request);

  // n° 168 : actualiser et analyser une série (`RefreshSeries`).
  app.post(
    `${base}/:id/refresh`,
    { config, schema: { params: idParams, response: { 200: commandStartedResponseSchema } } },
    async (request) => ({
      ok: true as const,
      cmdId: await clientOf(request).refreshSeries(request.params.id),
    }),
  );

  // Hubarr (P5c.6, V18) : analyser les fichiers d'une série (`RescanSeries`),
  // depuis une ligne de la file d'attente ; Radarr a son équivalent (n° 124).
  app.post(
    `${base}/:id/rescan`,
    { config, schema: { params: idParams, response: { 200: commandStartedResponseSchema } } },
    async (request) => ({
      ok: true as const,
      cmdId: await clientOf(request).rescanSeries(request.params.id),
    }),
  );

  // n° 228 : rechercher les épisodes manquants (suivis et diffusés) d'une série.
  app.post(
    `${base}/:id/search`,
    { config, schema: { params: idParams, response: { 200: seriesSearchResponseSchema } } },
    async (request) => {
      const sonarr = clientOf(request);
      const { id } = request.params;
      const plan = planSeriesSearch(await sonarr.episodes(id), now());
      const commands: (number | null)[] = [];
      for (const season of plan.seasons) commands.push(await sonarr.searchSeason(id, season));
      if (plan.episodeIds.length > 0) commands.push(await sonarr.searchEpisodes(plan.episodeIds));
      // La première commande est suivie par le front ; les autres tournent en parallèle.
      const cmdId = commands.find((command) => command !== null) ?? null;
      return { ok: true as const, cmdId, count: plan.count };
    },
  );

  // n° 229 : suivre / ne plus suivre (fiche et marque-page des cartes).
  app.post(
    `${base}/:id/monitor`,
    {
      config,
      schema: {
        params: idParams,
        body: movieMonitorRequestSchema,
        response: { 200: movieMonitorResponseSchema },
      },
    },
    async (request) => {
      const { monitored } = request.body;
      await sonarrOrNotFound(() => clientOf(request).setMonitored(request.params.id, monitored));
      invalidateSeries(instance, request);
      return { ok: true as const, monitored };
    },
  );

  // n° 196 : fiche de la série (relue sur l'instance, jamais depuis le cache).
  app.get(
    `${base}/:id/info`,
    { config, schema: { params: idParams, response: { 200: seriesDetailSchema } } },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      return detailOf(await sonarrOrNotFound(() => clientOf(request).series(request.params.id)));
    },
  );

  // n° 222 : édition (suivi, nouvelles saisons, dossiers par saison, profil, type, chemin, étiquettes).
  app.post(
    `${base}/:id/edit`,
    {
      config,
      schema: {
        params: idParams,
        body: seriesEditRequestSchema,
        response: { 200: seriesEditResponseSchema },
      },
    },
    async (request) => {
      const sonarr = clientOf(request);
      const { id } = request.params;
      const raw = await sonarrOrNotFound(() => sonarr.rawSeries(id));
      const updated = await sonarr.updateSeries(id, { ...raw, ...definedFields(request.body) });
      invalidateSeries(instance, request);
      return { ok: true as const, series: detailOf(updated) };
    },
  );

  // n° 230 : retirer la série de Sonarr (avec ou sans ses fichiers).
  app.post(
    `${base}/:id/delete`,
    {
      config,
      schema: {
        params: idParams,
        body: seriesDeleteRequestSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      const { deleteFiles, addImportExclusion } = request.body;
      await sonarrOrNotFound(() =>
        clientOf(request).deleteSeries(request.params.id, { deleteFiles, addImportExclusion }),
      );
      invalidateSeries(instance, request);
      return { ok: true as const };
    },
  );

  // n° 209 : historique de la série (100 derniers évènements, épisodes compris).
  app.get(
    `${base}/:id/history`,
    {
      config,
      schema: { params: idParams, response: { 200: z.array(seriesHistoryItemSchema) } },
    },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      return (await clientOf(request).seriesHistory(request.params.id)).map(
        normalizeSeriesHistoryItem,
      );
    },
  );

  // n° 211 : renommages proposés pour les fichiers de la série.
  app.get(
    `${base}/:id/rename`,
    {
      config,
      schema: { params: idParams, response: { 200: z.array(seriesRenameProposalSchema) } },
    },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      return (await clientOf(request).renameProposals(request.params.id)).map(
        normalizeRenameProposal,
      );
    },
  );

  // n° 212 : renommer les fichiers choisis (`RenameFiles`), sinon toute la série.
  app.post(
    `${base}/:id/rename`,
    {
      config,
      schema: {
        params: idParams,
        body: seriesRenameRequestSchema,
        response: { 200: commandStartedResponseSchema },
      },
    },
    async (request) => ({
      ok: true as const,
      cmdId: await clientOf(request).executeRename(request.params.id, request.body.fileIds),
    }),
  );

  // n° 225 : sous-dossiers d'un chemin du serveur Sonarr (champ « Chemin » de l'édition).
  app.get(
    `${SONARR_BASE}/filesystem`,
    {
      config,
      schema: {
        params: slugParams,
        querystring: rawQuery,
        response: { 200: filesystemResponseSchema },
      },
    },
    async (request) => {
      const result = await clientOf(request).filesystem(scalar(request.query.path) || '/');
      return {
        parent: result.parent ?? null,
        directories: (result.directories ?? []).flatMap((directory) =>
          directory.path === undefined || directory.path === null
            ? []
            : [{ name: directory.name ?? directory.path, path: directory.path }],
        ),
      };
    },
  );
};
