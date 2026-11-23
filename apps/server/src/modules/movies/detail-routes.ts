// SPDX-License-Identifier: AGPL-3.0-or-later
// Fiche d'un film Radarr (`MediaController::film*`, P2.4) : fiche, commandes
// du film (recherche, actualisation, scan), suivi, suppression, édition,
// crédits, extras, fichiers (liste, modification, suppression), définitions de
// qualité, historique, liste de blocage, explorateur de dossiers, étiquettes.
//
// Différences avec l'original :
// - formes réduites au lieu des ressources brutes de Radarr ; la fusion d'une
//   modification de fichier (qualité avec révision, langues) est faite ici ;
// - film ou fichier absent → 404 `NOT_FOUND` (au lieu de `{ ok: false }`) ;
// - les erreurs de l'instance suivent le format commun (502/503) ;
// - `filmInfo` et `filmDetail` renvoient la même fiche (l'original renvoyait
//   `[]` ou `null` pour un film inconnu).

import {
  commandStartedResponseSchema,
  filesystemResponseSchema,
  movieBlocklistItemSchema,
  movieCreditSchema,
  movieDeleteRequestSchema,
  movieDetailSchema,
  movieEditRequestSchema,
  movieEditResponseSchema,
  movieExtraFileSchema,
  movieFileSchema,
  movieFileUpdateRequestSchema,
  movieFileUpdateResponseSchema,
  movieHistoryItemSchema,
  movieMonitorRequestSchema,
  movieMonitorResponseSchema,
  okResponseSchema,
  qualityDefinitionSummarySchema,
  tagCreateRequestSchema,
  tagCreateResponseSchema,
  type MovieDetail,
} from '@hubarr/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import type { RadarrClient } from '../../integrations/radarr/client';
import type { normalizeMovie } from '../../integrations/radarr/normalize';
import {
  normalizeBlocklistItem,
  normalizeCredit,
  normalizeExtraFile,
  normalizeHistoryItem,
  normalizeMovieFile,
  qualityChoices,
} from '../../integrations/radarr/normalize-detail';
import type { RadarrMovieFileResource } from '../../integrations/radarr/types';
import { requireRole } from '../../plugins/access';
import {
  MOVIES_BASE,
  RADARR_CONFIG,
  clientOf,
  idParams,
  invalidateLibrary,
  orNotFound,
  rawQuery,
  scalar,
  slugParams,
} from './common';

const fileParams = slugParams.extend({ fileId: z.coerce.number().int().positive() });

/** Fiche normalisée ; un film sans id (impossible pour `/movie/{id}`) est refusé. */
function detailOf(movie: ReturnType<typeof normalizeMovie>): MovieDetail {
  if (movie.id === null) throw new ApiError(404, 'NOT_FOUND', { service: 'radarr' });
  return { ...movie, id: movie.id };
}

/**
 * Fusionne les champs modifiés dans le fichier brut (`filmFileUpdate`) : la
 * qualité choisie prend l'objet complet de sa définition et garde la révision
 * du fichier.
 */
export async function mergeFileChanges(
  radarr: RadarrClient,
  current: RadarrMovieFileResource,
  changes: z.infer<typeof movieFileUpdateRequestSchema>,
): Promise<RadarrMovieFileResource> {
  const merged: RadarrMovieFileResource = { ...current };
  if (changes.qualityId !== undefined) {
    const definitions = await radarr.qualityDefinitions();
    const quality = definitions.find((definition) => definition.quality?.id === changes.qualityId)
      ?.quality ?? { id: changes.qualityId };
    merged.quality = {
      quality,
      revision: current.quality?.revision ?? { version: 1, real: 0, isRepack: false },
    };
  }
  if (changes.languages !== undefined) merged.languages = changes.languages;
  if (changes.releaseGroup !== undefined) merged.releaseGroup = changes.releaseGroup;
  if (changes.edition !== undefined) merged.edition = changes.edition;
  return merged;
}

export const movieDetailRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  app.addHook('onRequest', requireRole('admin'));

  const base = MOVIES_BASE;
  const config = RADARR_CONFIG;
  const radarrOf = (request: Parameters<typeof clientOf>[1]) => clientOf(instance, request);

  // n° 121, 139 : fiche du film (relue sur l'instance, jamais depuis le cache).
  for (const suffix of ['detail', 'info']) {
    app.get(
      `${base}/:id/${suffix}`,
      { config, schema: { params: idParams, response: { 200: movieDetailSchema } } },
      async (request, reply) => {
        void reply.header('cache-control', 'no-store');
        const movie = await orNotFound(() => radarrOf(request).movie(request.params.id));
        return detailOf(movie);
      },
    );
  }

  // n° 122, 123, 124 : rechercher, actualiser, scanner le film.
  const filmCommand = (
    path: string,
    run: (radarr: RadarrClient, id: number) => Promise<number | null>,
  ) => {
    app.post(
      `${base}/:id/${path}`,
      { config, schema: { params: idParams, response: { 200: commandStartedResponseSchema } } },
      async (request) => ({
        ok: true as const,
        cmdId: await run(radarrOf(request), request.params.id),
      }),
    );
  };
  filmCommand('search', (radarr, id) => radarr.searchMovie(id));
  filmCommand('refresh', (radarr, id) => radarr.refreshMovie(id));
  filmCommand('rescan', (radarr, id) => radarr.rescanMovie(id));

  // n° 131 : suivre / ne plus suivre (bouton de la fiche et marque-page des cartes).
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
      await orNotFound(() => radarrOf(request).setMonitored(request.params.id, monitored));
      invalidateLibrary(instance, request);
      return { ok: true as const, monitored };
    },
  );

  // n° 132 : retirer le film de Radarr (avec ou sans ses fichiers).
  app.post(
    `${base}/:id/delete`,
    {
      config,
      schema: {
        params: idParams,
        body: movieDeleteRequestSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      const { deleteFiles, addImportExclusion } = request.body;
      await orNotFound(() =>
        radarrOf(request).deleteMovie(request.params.id, { deleteFiles, addImportExclusion }),
      );
      invalidateLibrary(instance, request);
      return { ok: true as const };
    },
  );

  // n° 186 : édition (suivi, disponibilité, profil, chemin, étiquettes).
  app.post(
    `${base}/:id/edit`,
    {
      config,
      schema: {
        params: idParams,
        body: movieEditRequestSchema,
        response: { 200: movieEditResponseSchema },
      },
    },
    async (request) => {
      const radarr = radarrOf(request);
      const { id } = request.params;
      const raw = await orNotFound(() => radarr.rawMovie(id));
      const changes = Object.fromEntries(
        Object.entries(request.body).filter(([, value]) => value !== undefined),
      );
      const updated = await radarr.updateMovie(id, { ...raw, ...changes });
      invalidateLibrary(instance, request);
      return { ok: true as const, movie: detailOf(updated) };
    },
  );

  // n° 140 : distribution et équipe.
  app.get(
    `${base}/:id/credits`,
    { config, schema: { params: idParams, response: { 200: z.array(movieCreditSchema) } } },
    async (request) => (await radarrOf(request).credits(request.params.id)).map(normalizeCredit),
  );

  // n° 141 : fichiers supplémentaires (sous-titres, métadonnées).
  app.get(
    `${base}/:id/extras`,
    { config, schema: { params: idParams, response: { 200: z.array(movieExtraFileSchema) } } },
    async (request) =>
      (await radarrOf(request).extraFiles(request.params.id)).map(normalizeExtraFile),
  );

  // n° 142 : fichiers du film.
  app.get(
    `${base}/:id/files`,
    { config, schema: { params: idParams, response: { 200: z.array(movieFileSchema) } } },
    async (request) =>
      (await radarrOf(request).movieFiles(request.params.id)).map(normalizeMovieFile),
  );

  // n° 143 : supprimer un fichier du disque.
  app.post(
    `${base}/files/:fileId/delete`,
    { config, schema: { params: fileParams, response: { 200: okResponseSchema } } },
    async (request) => {
      await orNotFound(() => radarrOf(request).deleteMovieFile(request.params.fileId));
      invalidateLibrary(instance, request);
      return { ok: true as const };
    },
  );

  // n° 144 : modifier la qualité, les langues, le groupe ou l'édition d'un fichier.
  app.post(
    `${base}/files/:fileId/update`,
    {
      config,
      schema: {
        params: fileParams,
        body: movieFileUpdateRequestSchema,
        response: { 200: movieFileUpdateResponseSchema },
      },
    },
    async (request) => {
      const radarr = radarrOf(request);
      const { fileId } = request.params;
      const current = await orNotFound(() => radarr.movieFile(fileId));
      const merged = await mergeFileChanges(radarr, current, request.body);
      const saved = await radarr.updateMovieFile(fileId, merged);
      // Qualité, langues et groupe alimentent la bibliothèque en cache
      // (`MediaLibraryCacheInvalidationTest`) : invalidée seulement après succès.
      invalidateLibrary(instance, request);
      return { ok: true as const, file: normalizeMovieFile(saved) };
    },
  );

  // n° 145 : qualités proposées dans le gestionnaire de fichiers.
  app.get(
    `${base}/quality-definitions`,
    {
      config,
      schema: { params: slugParams, response: { 200: z.array(qualityDefinitionSummarySchema) } },
    },
    async (request) => qualityChoices(await radarrOf(request).qualityDefinitions()),
  );

  // n° 138 : historique du film.
  app.get(
    `${base}/:id/history`,
    { config, schema: { params: idParams, response: { 200: z.array(movieHistoryItemSchema) } } },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      return (await radarrOf(request).movieHistory(request.params.id)).map(normalizeHistoryItem);
    },
  );

  // n° 183 : releases du film sur la liste de blocage.
  app.get(
    `${base}/:id/blocklist`,
    { config, schema: { params: idParams, response: { 200: z.array(movieBlocklistItemSchema) } } },
    async (request) =>
      (await radarrOf(request).movieBlocklist(request.params.id)).map(normalizeBlocklistItem),
  );

  // n° 189 : sous-dossiers d'un chemin du serveur Radarr (champ « Chemin »).
  app.get(
    `${base}/filesystem`,
    {
      config,
      schema: {
        params: slugParams,
        querystring: rawQuery,
        response: { 200: filesystemResponseSchema },
      },
    },
    async (request) => {
      const path = scalar(request.query.path) || '/';
      const result = await radarrOf(request).filesystem(path);
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

  // n° 190 : créer une étiquette (champ « Étiquettes » de l'édition).
  app.post(
    `${base}/config/tag`,
    {
      config,
      schema: {
        params: slugParams,
        body: tagCreateRequestSchema,
        response: { 200: tagCreateResponseSchema },
      },
    },
    async (request) => {
      const tag = await radarrOf(request).createTag(request.body.label);
      return {
        ok: true as const,
        tag: { id: tag.id ?? 0, label: tag.label ?? request.body.label },
      };
    },
  );
};
