// SPDX-License-Identifier: AGPL-3.0-or-later
// Recherche interactive, grab, renommage et commandes actives d'une instance
// Radarr (`MediaController::filmReleases`, `filmGrab`, `filmRenamePreview`,
// `filmRename`, `filmsCommandsActive`, P2.5), et file d'attente (`filmQueue`,
// avancée de P2.7 : la recherche de la fiche la consulte pour son bilan).
//
// Différences avec l'original :
// - recherche interactive trop longue → 504 `SEARCH_TIMED_OUT` ; Radarr
//   injoignable → 503 comme ailleurs (l'original renvoyait 504 dans les deux cas) ;
// - un grab refusé par Radarr suit le format d'erreur commun (502, message de
//   l'instance) au lieu de `{ ok: false, error }` en 200.

import {
  arrCommandStatusSchema,
  arrReleaseSchema,
  commandStartedResponseSchema,
  movieQueueItemSchema,
  okResponseSchema,
  releaseGrabRequestSchema,
  renameProposalSchema,
} from '@hubarr/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { isUpstreamError } from '../../integrations/http';
import {
  normalizeRelease,
  profileScores,
  sortReleases,
} from '../../integrations/radarr/normalize-detail';
import { guardServiceModule } from '../../plugins/access';
import { sharedMovieQueue } from '../media/queue';
import {
  MOVIES_BASE,
  RADARR_CONFIG,
  boundInstance,
  clientOf,
  idParams,
  slugParams,
} from './common';
import { commandStatusOf } from './routes';

/** Commandes encore en cours (`queued` ou `started`). */
const ACTIVE_STATUSES = new Set(['queued', 'started']);

export const movieReleaseRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  guardServiceModule(app);

  const base = MOVIES_BASE;
  const config = RADARR_CONFIG;
  const radarrOf = (request: Parameters<typeof clientOf>[1]) => clientOf(instance, request);

  // n° 125 : commandes en cours (reprise du suivi au chargement de la page).
  app.get(
    `${base}/commands/active`,
    { config, schema: { params: slugParams, response: { 200: z.array(arrCommandStatusSchema) } } },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      return (await radarrOf(request).commands())
        .filter((command) => ACTIVE_STATUSES.has((command.status ?? '').toLowerCase()))
        .map((command) => commandStatusOf(command, 0));
    },
  );

  // n° 127 : recherche interactive (jusqu'à 90 s : chaque indexeur est interrogé).
  app.get(
    `${base}/:id/releases`,
    { config, schema: { params: idParams, response: { 200: z.array(arrReleaseSchema) } } },
    async (request, reply) => {
      const radarr = radarrOf(request);
      const { id } = request.params;
      void reply.header('cache-control', 'no-store');
      // Scores du profil du film : un échec laisse les scores à zéro, comme l'original.
      const [movie, profiles] = await Promise.all([
        radarr.rawMovie(id).catch(() => null),
        radarr.qualityProfiles().catch(() => []),
      ]);
      const profile = profiles.find((candidate) => candidate.id === movie?.qualityProfileId);
      try {
        const scores = profileScores(profile);
        return sortReleases(await radarr.releases(id)).map((release) =>
          normalizeRelease(release, scores),
        );
      } catch (error) {
        if (isUpstreamError(error) && error.kind === 'timeout') {
          throw new ApiError(504, 'SEARCH_TIMED_OUT', { service: 'radarr' });
        }
        throw error;
      }
    },
  );

  // n° 128 : télécharger une release choisie.
  app.post(
    `${base}/:id/grab`,
    {
      config,
      schema: {
        params: idParams,
        body: releaseGrabRequestSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      await radarrOf(request).grabRelease(request.body.guid, request.body.indexerId);
      return { ok: true as const };
    },
  );

  // n° 129 : renommages proposés pour les fichiers du film.
  app.get(
    `${base}/:id/rename-preview`,
    { config, schema: { params: idParams, response: { 200: z.array(renameProposalSchema) } } },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      return (await radarrOf(request).renameProposals(request.params.id)).map((proposal) => ({
        movieFileId: proposal.movieFileId ?? null,
        existingPath: proposal.existingPath ?? null,
        newPath: proposal.newPath ?? null,
      }));
    },
  );

  // n° 130 : renommer les fichiers du film (commande `RenameMovie`).
  app.post(
    `${base}/:id/rename`,
    { config, schema: { params: idParams, response: { 200: commandStartedResponseSchema } } },
    async (request) => ({
      ok: true as const,
      cmdId: await radarrOf(request).executeRename(request.params.id),
    }),
  );

  // n° 172 : file d'attente de l'instance (normalisée).
  app.get(
    `${base}/queue`,
    { config, schema: { params: slugParams, response: { 200: z.array(movieQueueItemSchema) } } },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      return sharedMovieQueue(instance, boundInstance(request));
    },
  );
};
