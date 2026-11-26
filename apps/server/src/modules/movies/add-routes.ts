// SPDX-License-Identifier: AGPL-3.0-or-later
// Ajout de films et suivi de personnes sur une instance Radarr
// (`MediaController::filmLookup`, `filmLookupTmdb`, `filmAdd`,
// `filmsPersonFollow`, `filmsPersonUnfollow`, `filmsPersonFollowing`, P2.6).
//
// Suivre une personne = créer une liste d'import « TMDb Person » (Radarr ajoute
// ensuite ses films). Différences avec l'original :
// - la liste prend le profil par défaut de l'instance s'il est réglé (l'original
//   prenait toujours le premier profil) et le premier dossier racine, sans le
//   repli `/jellyfin/Films` codé en dur ;
// - erreurs au format commun (un ajout refusé, un film déjà présent : 502 avec
//   le message de Radarr) au lieu de `{ ok: false }` en 200.

import {
  movieAddRequestSchema,
  movieAddResponseSchema,
  movieLookupSchema,
  okResponseSchema,
  personFollowRequestSchema,
  personFollowResponseSchema,
  personFollowingResponseSchema,
  personUnfollowRequestSchema,
} from '@hubarr/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import type {
  RadarrImportListResource,
  RadarrMovieResource,
} from '../../integrations/radarr/types';
import { guardServiceModule } from '../../plugins/access';
import { defaultQualityProfileIdOf } from '../instances/instances';
import {
  MOVIES_BASE,
  RADARR_CONFIG,
  boundInstance,
  clientOf,
  invalidateLibrary,
  positiveInt,
  rawQuery,
  scalar,
  slugParams,
} from './common';

const PERSON_IMPLEMENTATION = 'TMDbPersonImport';

/** Id TMDb de la personne d'une liste « TMDb Person », sinon `null`. */
export function personIdOf(list: RadarrImportListResource): number | null {
  if (list.implementation !== PERSON_IMPLEMENTATION) return null;
  const field = (list.fields ?? []).find((candidate) => candidate.name === 'personId');
  const raw = field?.value;
  const id =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Cases de la liste selon le rôle de la personne (`personCast*` de l'original). */
export function personFields(
  template: RadarrImportListResource,
  personId: number,
  type: 'cast' | 'crew',
  job: string,
): NonNullable<RadarrImportListResource['fields']> {
  const values: Record<string, unknown> = {
    personId: String(personId),
    personCast: type === 'cast',
    personCastDirector: job === 'Director',
    personCastProducer: job === 'Producer' || job === 'Executive Producer',
    personCastWriting: job === 'Screenplay' || job === 'Writer',
    personCastSound: job === 'Music' || job === 'Original Music Composer',
  };
  return (template.fields ?? []).map((field) =>
    field.name !== undefined && field.name !== null && field.name in values
      ? { ...field, value: values[field.name] }
      : field,
  );
}

export const movieAddRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  guardServiceModule(app);

  const base = MOVIES_BASE;
  const config = RADARR_CONFIG;
  const radarrOf = (request: Parameters<typeof clientOf>[1]) => clientOf(instance, request);

  // n° 133 : recherche d'un film à ajouter (id renseigné = déjà dans Radarr).
  app.get(
    `${base}/lookup`,
    {
      config,
      schema: {
        params: slugParams,
        querystring: rawQuery,
        response: { 200: z.array(movieLookupSchema) },
      },
    },
    async (request) => {
      const term = scalar(request.query.term).trim();
      if (term === '') return [];
      return radarrOf(request).lookupMovies(term);
    },
  );

  // n° 184 : un film par son id TMDb (`null` sans id ou s'il est inconnu).
  app.get(
    `${base}/lookup/tmdb`,
    {
      config,
      schema: {
        params: slugParams,
        querystring: rawQuery,
        response: { 200: movieLookupSchema.nullable() },
      },
    },
    async (request) => {
      const tmdbId = positiveInt(request.query.tmdbId, 0);
      if (tmdbId === 0) return null;
      return radarrOf(request).lookupByTmdb(tmdbId);
    },
  );

  // n° 134 : ajout ; sans profil choisi, celui par défaut de l'instance (issue #5).
  app.post(
    `${base}/add`,
    {
      config,
      schema: {
        params: slugParams,
        body: movieAddRequestSchema,
        response: { 200: movieAddResponseSchema },
      },
    },
    async (request) => {
      const body = request.body;
      const qualityProfileId =
        body.qualityProfileId > 0
          ? body.qualityProfileId
          : (defaultQualityProfileIdOf(boundInstance(request)) ?? 0);
      const payload: RadarrMovieResource = {
        tmdbId: body.tmdbId,
        title: body.title,
        year: body.year,
        qualityProfileId,
        monitored: body.monitored,
        minimumAvailability: body.minimumAvailability,
        addOptions: { searchForMovie: body.searchForMovie },
        ...(body.path !== undefined && body.path !== ''
          ? { path: body.path }
          : { rootFolderPath: body.rootFolderPath ?? '' }),
      };
      const movie = await radarrOf(request).addMovie(payload);
      invalidateLibrary(instance, request);
      return { ok: true as const, movie, movieId: movie.id };
    },
  );

  // n° 193 : personnes suivies (id TMDb → id de la liste).
  app.get(
    `${base}/person/following`,
    { config, schema: { params: slugParams, response: { 200: personFollowingResponseSchema } } },
    async (request) => {
      const following: Record<string, number> = {};
      for (const list of await radarrOf(request).importLists()) {
        const personId = personIdOf(list);
        if (personId !== null && list.id !== undefined) following[String(personId)] = list.id;
      }
      return following;
    },
  );

  // n° 191 : suivre une personne (liste d'import TMDb Person).
  app.post(
    `${base}/person/follow`,
    {
      config,
      schema: {
        params: slugParams,
        body: personFollowRequestSchema,
        response: { 200: personFollowResponseSchema },
      },
    },
    async (request) => {
      const radarr = radarrOf(request);
      const { personTmdbId, personName, type, job } = request.body;
      const existing = (await radarr.importLists()).find(
        (list) => personIdOf(list) === personTmdbId,
      );
      if (existing) return { ok: true as const, listId: existing.id ?? null, already: true };

      const template = (await radarr.importListSchema()).find(
        (schema) => schema.implementation === PERSON_IMPLEMENTATION,
      );
      if (template === undefined) {
        throw new ApiError(502, 'UPSTREAM_ERROR', {
          service: 'radarr',
          message: 'TMDbPersonImport',
          details: { reason: 'media.api.tmdb_person_schema_missing' },
        });
      }
      const [profiles, folders] = await Promise.all([
        radarr.qualityProfiles(),
        radarr.rootFolders(),
      ]);
      const preferred = defaultQualityProfileIdOf(boundInstance(request));
      const profileId =
        profiles.find((profile) => profile.id === preferred)?.id ?? profiles[0]?.id ?? 1;
      const created = await radarr.createImportList({
        ...template,
        name: personName,
        enabled: true,
        enableAuto: false,
        searchOnAdd: false,
        qualityProfileId: profileId,
        rootFolderPath: folders[0]?.path ?? '',
        minimumAvailability: 'announced',
        fields: personFields(template, personTmdbId, type, job),
      });
      return { ok: true as const, listId: created.id ?? null, already: false };
    },
  );

  // n° 192 : ne plus suivre (supprime la liste).
  app.post(
    `${base}/person/unfollow`,
    {
      config,
      schema: {
        params: slugParams,
        body: personUnfollowRequestSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      await radarrOf(request).deleteImportList(request.body.listId);
      return { ok: true as const };
    },
  );
};
