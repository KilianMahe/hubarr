// SPDX-License-Identifier: AGPL-3.0-or-later
// Saisons, épisodes, fichiers et releases d'une série Sonarr (P3a.2) :
// épisodes, suivi d'un épisode et d'une saison, recherches (épisodes, saison),
// recherche interactive et grab, fichiers (liste, modification, réattribution,
// suppression), définitions de qualité (`MediaController::serieEpisodes`,
// `episode*`, `season*`, `series*File*`, `seriesQualityDefinitions`,
// `seriesReleaseGrab`).
//
// Différences avec l'original (comme D88 et D89 pour Radarr) :
// formes réduites ; la fusion d'une modification de fichier (qualité complète
// avec révision gardée, langues, groupe, type de release, drapeaux) est faite
// ici ; recherche interactive trop longue → 504 `SEARCH_TIMED_OUT`, Sonarr
// injoignable → 503 ; grab refusé → 502 avec le message de Sonarr ; fichier ou
// épisode absent → 404 ; une modification de fichier invalide la bibliothèque.

import {
  commandStartedResponseSchema,
  episodeFileReassignRequestSchema,
  episodeFileSchema,
  episodeFileUpdateRequestSchema,
  episodeFileUpdateResponseSchema,
  episodeFilesBulkUpdateRequestSchema,
  episodeMonitorRequestSchema,
  episodeSchema,
  episodeSearchRequestSchema,
  okResponseSchema,
  qualityDefinitionSummarySchema,
  releaseGrabRequestSchema,
  seasonMonitorRequestSchema,
  seriesReleaseSchema,
  type EpisodeFileUpdateRequest,
  type SeriesRelease,
} from '@hubarr/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { isUpstreamError } from '../../integrations/http';
import {
  profileScores,
  qualityChoices,
  sortReleases,
} from '../../integrations/radarr/normalize-detail';
import type { SonarrClient } from '../../integrations/sonarr/client';
import {
  normalizeEpisode,
  normalizeEpisodeFile,
  normalizeSeriesRelease,
} from '../../integrations/sonarr/normalize-detail';
import type { SonarrEpisodeFileResource } from '../../integrations/sonarr/types';
import { requireRole } from '../../plugins/access';
import {
  SERIES_BASE,
  SONARR_CONFIG,
  idParams,
  invalidateSeries,
  slugParams,
  sonarrOf,
  sonarrOrNotFound,
} from './common';

const seasonParams = slugParams.extend({
  seriesId: z.coerce.number().int().positive(),
  seasonNumber: z.coerce.number().int().nonnegative(),
});

/**
 * Fusionne les champs modifiés dans le fichier brut (`updateEpisodeFile`) : la
 * qualité choisie prend l'objet complet de sa définition et garde la révision
 * du fichier ; les autres champs ne changent que s'ils sont fournis.
 */
export async function mergeEpisodeFileChanges(
  sonarr: SonarrClient,
  current: SonarrEpisodeFileResource,
  changes: EpisodeFileUpdateRequest,
): Promise<SonarrEpisodeFileResource> {
  const merged: SonarrEpisodeFileResource = { ...current };
  if (changes.qualityId !== undefined) {
    const definitions = await sonarr.qualityDefinitions();
    const quality = definitions.find((definition) => definition.quality?.id === changes.qualityId)
      ?.quality ?? { id: changes.qualityId };
    merged.quality = {
      quality,
      revision: current.quality?.revision ?? { version: 1, real: 0, isRepack: false },
    };
  }
  if (changes.languages !== undefined) merged.languages = changes.languages;
  if (changes.releaseGroup !== undefined) merged.releaseGroup = changes.releaseGroup;
  if (changes.releaseType !== undefined) merged.releaseType = changes.releaseType;
  if (changes.indexerFlags !== undefined) merged.indexerFlags = changes.indexerFlags;
  return merged;
}

export const seriesEpisodeRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  app.addHook('onRequest', requireRole('admin'));

  const base = SERIES_BASE;
  const config = SONARR_CONFIG;
  const clientOf = (request: FastifyRequest): SonarrClient => sonarrOf(instance, request);

  /** Scores des formats du profil de la série ; un échec laisse les scores à zéro (original). */
  async function seriesScores(sonarr: SonarrClient, seriesId: number) {
    const [series, profiles] = await Promise.all([
      sonarr.rawSeries(seriesId).catch(() => null),
      sonarr.qualityProfiles().catch(() => []),
    ]);
    return profileScores(profiles.find((profile) => profile.id === series?.qualityProfileId));
  }

  /** Recherche interactive : délai dépassé → 504 dédié (les indexeurs ont tardé). */
  async function searchReleases(
    load: () => Promise<Parameters<typeof normalizeSeriesRelease>[0][]>,
    scores: ReadonlyMap<number, number>,
  ): Promise<SeriesRelease[]> {
    try {
      return sortReleases((await load()).map((release) => normalizeSeriesRelease(release, scores)));
    } catch (error) {
      if (isUpstreamError(error) && error.kind === 'timeout') {
        throw new ApiError(504, 'SEARCH_TIMED_OUT', { service: 'sonarr' });
      }
      throw error;
    }
  }

  // ── Épisodes ────────────────────────────────────────────────────────────────

  // n° 197 : épisodes de la série.
  app.get(
    `${base}/:id/episodes`,
    { config, schema: { params: idParams, response: { 200: z.array(episodeSchema) } } },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      return (await clientOf(request).episodes(request.params.id)).map(normalizeEpisode);
    },
  );

  // n° 198 : suivre / ne plus suivre un épisode.
  app.post(
    `${base}/episode/:id/monitor`,
    {
      config,
      schema: {
        params: idParams,
        body: episodeMonitorRequestSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      await sonarrOrNotFound(() =>
        clientOf(request).setEpisodeMonitored(request.params.id, request.body.monitored),
      );
      return { ok: true as const };
    },
  );

  // n° 199 : rechercher des épisodes (`EpisodeSearch`).
  app.post(
    `${base}/episode/search`,
    {
      config,
      schema: {
        params: slugParams,
        body: episodeSearchRequestSchema,
        response: { 200: commandStartedResponseSchema },
      },
    },
    async (request) => ({
      ok: true as const,
      cmdId: await clientOf(request).searchEpisodes(request.body.episodeIds),
    }),
  );

  // n° 210 : suivre / ne plus suivre une saison (la bibliothèque change).
  app.post(
    `${base}/season/monitor`,
    {
      config,
      schema: {
        params: slugParams,
        body: seasonMonitorRequestSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      const { seriesId, seasonNumber, monitored } = request.body;
      await sonarrOrNotFound(() =>
        clientOf(request).setSeasonMonitored(seriesId, seasonNumber, monitored),
      );
      invalidateSeries(instance, request);
      return { ok: true as const };
    },
  );

  // n° 200 : rechercher une saison (`SeasonSearch`).
  app.post(
    `${base}/:seriesId/season/:seasonNumber/search`,
    { config, schema: { params: seasonParams, response: { 200: commandStartedResponseSchema } } },
    async (request) => ({
      ok: true as const,
      cmdId: await clientOf(request).searchSeason(
        request.params.seriesId,
        request.params.seasonNumber,
      ),
    }),
  );

  // ── Recherche interactive ───────────────────────────────────────────────────

  // n° 213 : releases d'un épisode (jusqu'à 90 s : chaque indexeur est interrogé).
  app.get(
    `${base}/episode/:id/releases`,
    { config, schema: { params: idParams, response: { 200: z.array(seriesReleaseSchema) } } },
    async (request, reply) => {
      const sonarr = clientOf(request);
      const { id } = request.params;
      void reply.header('cache-control', 'no-store');
      const episode = await sonarr.episode(id).catch(() => null);
      const scores =
        episode?.seriesId === undefined
          ? new Map<number, number>()
          : await seriesScores(sonarr, episode.seriesId);
      return searchReleases(() => sonarr.episodeReleases(id), scores);
    },
  );

  // n° 221 : releases d'une saison (packs compris).
  app.get(
    `${base}/:seriesId/season/:seasonNumber/releases`,
    { config, schema: { params: seasonParams, response: { 200: z.array(seriesReleaseSchema) } } },
    async (request, reply) => {
      const sonarr = clientOf(request);
      const { seriesId, seasonNumber } = request.params;
      void reply.header('cache-control', 'no-store');
      const scores = await seriesScores(sonarr, seriesId);
      return searchReleases(() => sonarr.seasonReleases(seriesId, seasonNumber), scores);
    },
  );

  // n° 214 : télécharger une release choisie.
  app.post(
    `${base}/release/grab`,
    {
      config,
      schema: {
        params: slugParams,
        body: releaseGrabRequestSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      await clientOf(request).grabRelease(request.body.guid, request.body.indexerId);
      return { ok: true as const };
    },
  );

  // ── Fichiers ────────────────────────────────────────────────────────────────

  // n° 207 : fichiers de la série.
  app.get(
    `${base}/:id/files`,
    { config, schema: { params: idParams, response: { 200: z.array(episodeFileSchema) } } },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      return (await clientOf(request).episodeFiles(request.params.id)).map(normalizeEpisodeFile);
    },
  );

  // n° 208 : supprimer un fichier du disque.
  app.post(
    `${base}/file/:id/delete`,
    { config, schema: { params: idParams, response: { 200: okResponseSchema } } },
    async (request) => {
      await sonarrOrNotFound(() => clientOf(request).deleteEpisodeFile(request.params.id));
      invalidateSeries(instance, request);
      return { ok: true as const };
    },
  );

  // n° 217 : modifier un fichier (`PUT /episodefile/{id}`).
  app.post(
    `${base}/file/:id/update`,
    {
      config,
      schema: {
        params: idParams,
        body: episodeFileUpdateRequestSchema,
        response: { 200: episodeFileUpdateResponseSchema },
      },
    },
    async (request) => {
      const sonarr = clientOf(request);
      const { id } = request.params;
      const current = await sonarrOrNotFound(() => sonarr.episodeFile(id));
      const saved = await sonarr.updateEpisodeFile(
        id,
        await mergeEpisodeFileChanges(sonarr, current, request.body),
      );
      invalidateSeries(instance, request);
      return { ok: true as const, file: normalizeEpisodeFile(saved) };
    },
  );

  // n° 218 : modifier un fichier par la mise à jour complète (`PUT /episodefile/bulk`),
  // seule à accepter le type de release et les drapeaux d'indexeur.
  app.post(
    `${base}/files/bulk-update`,
    {
      config,
      schema: {
        params: slugParams,
        body: episodeFilesBulkUpdateRequestSchema,
        response: { 200: episodeFileUpdateResponseSchema },
      },
    },
    async (request) => {
      const sonarr = clientOf(request);
      const { fileId, ...changes } = request.body;
      const current = await sonarrOrNotFound(() => sonarr.episodeFile(fileId));
      const merged = await mergeEpisodeFileChanges(sonarr, current, changes);
      await sonarr.bulkUpdateEpisodeFiles([merged]);
      invalidateSeries(instance, request);
      return { ok: true as const, file: normalizeEpisodeFile(merged) };
    },
  );

  // n° 220 : réattribuer un fichier à d'autres épisodes.
  app.post(
    `${base}/file/:id/reassign`,
    {
      config,
      schema: {
        params: idParams,
        body: episodeFileReassignRequestSchema,
        response: { 200: commandStartedResponseSchema },
      },
    },
    async (request) => {
      const sonarr = clientOf(request);
      const file = await sonarrOrNotFound(() => sonarr.episodeFile(request.params.id));
      const { seriesId, episodeIds } = request.body;
      const cmdId = await sonarr.reassignEpisodeFile(file, seriesId, episodeIds);
      invalidateSeries(instance, request);
      return { ok: true as const, cmdId };
    },
  );

  // n° 219 : qualités proposées dans le gestionnaire de fichiers.
  app.get(
    `${base}/quality-definitions`,
    {
      config,
      schema: { params: slugParams, response: { 200: z.array(qualityDefinitionSummarySchema) } },
    },
    async (request) => qualityChoices(await clientOf(request).qualityDefinitions()),
  );
};
