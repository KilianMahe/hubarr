// SPDX-License-Identifier: AGPL-3.0-or-later
// Prowlarr, ressources à schéma (P3c.3) : applications, clients de
// téléchargement, notifications — liste, modèles, lecture, ajout,
// modification, suppression, test ; profils d'application. Port de
// `ProwlarrController::application*`, `downloadClient*`, `notification*`,
// `appProfile*`.
//
// Une seule fabrique sert les trois familles, sur le modèle
// de l'administration Radarr/Sonarr (D101) : secrets masqués et restitués,
// refus de Prowlarr en 502 avec son message, test rendu en bilan.

import {
  arrOkSchema,
  prowlarrAppProfileRequestSchema,
  prowlarrAppProfileSchema,
  providerListSchema,
  providerSaveRequestSchema,
  providerSchema,
  providerTestResponseSchema,
  type ProwlarrAppProfile,
} from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import type { ArrRecord } from '../../integrations/arr/admin';
import { maskProviderSecrets, restoreProviderSecrets } from '../../integrations/arr/secrets';
import type { ProwlarrClient } from '../../integrations/prowlarr/client';
import {
  PROWLARR_BASE,
  PROWLARR_CONFIG,
  orNotFound,
  prowlarrClient,
  prowlarrIdParams,
} from './common';

export interface ProwlarrProviderFamily {
  /** Chemin de l'API de Prowlarr (`/api/v1/applications`). */
  upstream: string;
  /** Segment des routes d'élément (`application`, `downloadclient`, `notification`). */
  segment: string;
  /** Chemin de la liste (`/applications`, `/download-clients`), ou aucun. */
  list: string | null;
}

export const PROWLARR_PROVIDER_FAMILIES = {
  // n° 251-257.
  applications: { upstream: '/api/v1/applications', segment: 'application', list: '/applications' },
  // n° 258-263, liste de la page n° 273.
  downloadClients: {
    upstream: '/api/v1/downloadclient',
    segment: 'downloadclient',
    list: '/download-clients',
  },
  // n° 264-269, liste de la page n° 274.
  notifications: {
    upstream: '/api/v1/notification',
    segment: 'notification',
    list: '/notifications',
  },
} as const satisfies Record<string, ProwlarrProviderFamily>;

const notFound = () => new ApiError(404, 'NOT_FOUND', { service: 'prowlarr' });

/** Ressource actuelle de Prowlarr (`null` si absente), pour restituer ses secrets. */
export async function currentResource(
  client: ProwlarrClient,
  upstream: string,
  id: unknown,
): Promise<ArrRecord | null> {
  if (typeof id !== 'number' || id <= 0) return null;
  return client.one(`${upstream}/${id}`).catch(() => null);
}

/** Routes d'une famille : `GET <list>`, `/<segment>/schema|:id|add|:id/update|:id/delete|test`. */
export function registerProviderFamily(
  instance: FastifyInstance,
  family: ProwlarrProviderFamily,
): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const config = PROWLARR_CONFIG;
  const { upstream } = family;
  const prefix = `${PROWLARR_BASE}/${family.segment}`;
  const clientOf = () => prowlarrClient(instance);

  if (family.list !== null) {
    app.get(
      `${PROWLARR_BASE}${family.list}`,
      { config, schema: { response: { 200: providerListSchema } } },
      async () => (await clientOf().list(upstream)).map((item) => maskProviderSecrets(item)),
    );
  }

  app.get(
    `${prefix}/schema`,
    { config, schema: { response: { 200: providerListSchema } } },
    async () => (await clientOf().schema(upstream)).map((item) => maskProviderSecrets(item)),
  );

  app.get(
    `${prefix}/:id`,
    { config, schema: { params: prowlarrIdParams, response: { 200: providerSchema } } },
    async (request) => {
      const item = await orNotFound(() => clientOf().one(`${upstream}/${request.params.id}`));
      if (item === null) throw notFound();
      return maskProviderSecrets(item);
    },
  );

  app.post(
    `${prefix}/add`,
    { config, schema: { body: providerSaveRequestSchema, response: { 200: providerSchema } } },
    async (request) => {
      const body = request.body as ArrRecord;
      return maskProviderSecrets((await clientOf().create(upstream, body)) ?? body);
    },
  );

  app.post(
    `${prefix}/:id/update`,
    {
      config,
      schema: {
        params: prowlarrIdParams,
        body: providerSaveRequestSchema,
        response: { 200: providerSchema },
      },
    },
    async (request) => {
      const client = clientOf();
      const { id } = request.params;
      const current = await currentResource(client, upstream, id);
      const body = restoreProviderSecrets({ ...(request.body as ArrRecord), id }, current);
      return maskProviderSecrets((await client.update(upstream, id, body)) ?? body, current);
    },
  );

  app.post(
    `${prefix}/:id/delete`,
    { config, schema: { params: prowlarrIdParams, response: { 200: arrOkSchema } } },
    async (request) => {
      await clientOf().remove(upstream, request.params.id);
      return { ok: true as const };
    },
  );

  app.post(
    `${prefix}/test`,
    {
      config,
      schema: { body: providerSaveRequestSchema, response: { 200: providerTestResponseSchema } },
    },
    async (request) => {
      const client = clientOf();
      const body = request.body as ArrRecord;
      const current = await currentResource(client, upstream, body.id);
      return client.test(upstream, restoreProviderSecrets(body, current));
    },
  );
}

/** Profil enregistré, relu sous sa forme normalisée (corps vide → l'envoi). */
function profileOf(saved: ArrRecord | null, sent: ProwlarrAppProfile): ProwlarrAppProfile {
  const parsed = prowlarrAppProfileSchema.safeParse(saved);
  return parsed.success ? parsed.data : sent;
}

export function registerProviderRoutes(instance: FastifyInstance): void {
  for (const family of Object.values(PROWLARR_PROVIDER_FAMILIES)) {
    registerProviderFamily(instance, family);
  }

  const app = instance.withTypeProvider<ZodTypeProvider>();
  const config = PROWLARR_CONFIG;
  const path = '/api/v1/appprofile';

  // n° 303.
  app.post(
    `${PROWLARR_BASE}/app-profile/add`,
    {
      config,
      schema: {
        body: prowlarrAppProfileRequestSchema,
        response: { 200: prowlarrAppProfileSchema },
      },
    },
    async (request) =>
      profileOf(await prowlarrClient(instance).create(path, request.body), {
        id: 0,
        ...request.body,
      }),
  );

  // n° 304.
  app.post(
    `${PROWLARR_BASE}/app-profile/:id/update`,
    {
      config,
      schema: {
        params: prowlarrIdParams,
        body: prowlarrAppProfileRequestSchema,
        response: { 200: prowlarrAppProfileSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const body = { id, ...request.body };
      return profileOf(await prowlarrClient(instance).update(path, id, body), body);
    },
  );

  // n° 305 : refusé par Prowlarr si un indexeur l'utilise encore (502 avec son message).
  app.post(
    `${PROWLARR_BASE}/app-profile/:id/delete`,
    { config, schema: { params: prowlarrIdParams, response: { 200: arrOkSchema } } },
    async (request) => {
      await prowlarrClient(instance).remove(path, request.params.id);
      return { ok: true as const };
    },
  );
}
