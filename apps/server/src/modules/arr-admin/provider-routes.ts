// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration *arr, intégrations (P3b.3) : indexeurs, clients de
// téléchargement, listes d'import, notifications, métadonnées (ressources à
// schéma dynamique) et exclusions d'import. Port de
// `RadarrController`/`SonarrController::indexer*`, `downloadClient*`,
// `importList*`, `notification*`, `metadata*`, `exclusion*`.
//
// Écarts : secrets masqués et restitués (D97) ; le test d'une
// notification existante envoie la ressource complète à `/notification/test`
// (l'original n'envoyait que `{ id }`, refusé par l'instance) ; l'exclusion
// d'un film part avec `movieYear` (l'original envoyait `year`, ignoré par
// Radarr) ; les exclusions sont normalisées (`externalId`, `title`, `year`)
// pour les deux services, et paginées par l'instance pour les deux.

import {
  SONARR_PAGE_SIZE,
  arrConfigPatchSchema,
  arrConfigSchema,
  arrOkSchema,
  exclusionAddRequestSchema,
  exclusionPageSchema,
  exclusionSchema,
  idsRequestSchema,
  providerListSchema,
  providerSaveRequestSchema,
  providerSchema,
  providerTestResponseSchema,
  type ArrKind,
  type Exclusion,
} from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '../../http/zod';
import {
  PROVIDER_RESOURCES,
  exclusionPath,
  type ArrAdminClient,
  type ArrRecord,
  type ProviderResource,
} from '../../integrations/arr/admin';
import { maskProviderSecrets, restoreProviderSecrets } from '../../integrations/arr/secrets';
import {
  configNotFound,
  itemParams,
  mergeConfig,
  positiveInt,
  rawQuery,
  savedOr,
  slugParams,
  type AdminContext,
} from './common';

interface ProviderRoutesOptions {
  resource: ProviderResource;
  /** Segment de l'URL d'origine (`indexeurs`, `clients-telechargement`…). */
  segment: string;
  /** Ajout permis (les métadonnées ne se créent pas). */
  add: boolean;
  /** Modèles (`…/schema`) exposés. */
  schema: boolean;
  /** Route du test d'une ressource envoyée (`tester`, `tester-payload`), ou aucune. */
  test: string | null;
  /** Test d'une ressource existante par son id (`…/:id/tester`). */
  testById: boolean;
}

/** Ressource actuelle de l'instance (`null` si absente), pour restituer ses secrets. */
async function currentOf(
  client: ArrAdminClient,
  path: string,
  id: unknown,
): Promise<ArrRecord | null> {
  if (typeof id !== 'number' || id <= 0) return null;
  return client.one(`${path}/${id}`).catch(() => null);
}

/** Routes d'une ressource à schéma dynamique. */
function providerRoutes(
  instance: FastifyInstance,
  ctx: AdminContext,
  options: ProviderRoutesOptions,
): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { base, config } = ctx;
  const path = PROVIDER_RESOURCES[options.resource];
  const prefix = `${base}/${options.segment}`;

  // Liste (page de l'original), secrets masqués.
  app.get(
    prefix,
    { config, schema: { params: slugParams, response: { 200: providerListSchema } } },
    async (request) =>
      (await ctx.clientOf(request).list(path)).map((item) => maskProviderSecrets(item)),
  );

  if (options.schema) {
    app.get(
      `${prefix}/schema`,
      { config, schema: { params: slugParams, response: { 200: providerListSchema } } },
      async (request) =>
        (await ctx.clientOf(request).schema(path)).map((item) => maskProviderSecrets(item)),
    );
  }

  if (options.add) {
    app.post(
      `${prefix}/ajouter`,
      {
        config,
        schema: {
          params: slugParams,
          body: providerSaveRequestSchema,
          response: { 200: providerSchema },
        },
      },
      async (request) => {
        const body = request.body as ArrRecord;
        return maskProviderSecrets(savedOr(await ctx.clientOf(request).create(path, body), body));
      },
    );
  }

  app.post(
    `${prefix}/:id/modifier`,
    {
      config,
      schema: {
        params: itemParams,
        body: providerSaveRequestSchema,
        response: { 200: providerSchema },
      },
    },
    async (request) => {
      const client = ctx.clientOf(request);
      const { id } = request.params;
      const current = await currentOf(client, path, id);
      const body = restoreProviderSecrets({ ...(request.body as ArrRecord), id }, current);
      return maskProviderSecrets(savedOr(await client.update(path, id, body), body), current);
    },
  );

  app.post(
    `${prefix}/:id/supprimer`,
    { config, schema: { params: itemParams, response: { 200: arrOkSchema } } },
    async (request) => {
      await ctx.clientOf(request).remove(path, request.params.id);
      return { ok: true as const };
    },
  );

  if (options.test !== null) {
    app.post(
      `${prefix}/${options.test}`,
      {
        config,
        schema: {
          params: slugParams,
          body: providerSaveRequestSchema,
          response: { 200: providerTestResponseSchema },
        },
      },
      async (request) => {
        const client = ctx.clientOf(request);
        const body = request.body as ArrRecord;
        const current = await currentOf(client, path, body.id);
        return client.test(path, restoreProviderSecrets(body, current));
      },
    );
  }

  if (options.testById) {
    app.post(
      `${prefix}/:id/tester`,
      { config, schema: { params: itemParams, response: { 200: providerTestResponseSchema } } },
      async (request) => {
        const client = ctx.clientOf(request);
        const current = await client.one(`${path}/${request.params.id}`);
        if (current === null) return { ok: false, message: null };
        return client.test(path, current);
      },
    );
  }
}

/** Exclusion normalisée (film ou série). */
function exclusionOf(kind: ArrKind, record: ArrRecord): Exclusion[] {
  if (typeof record.id !== 'number') return [];
  const number = (value: unknown) => (typeof value === 'number' && value > 0 ? value : null);
  const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);
  return kind === 'radarr'
    ? [
        {
          id: record.id,
          externalId: number(record.tmdbId),
          title: text(record.movieTitle),
          year: number(record.movieYear),
        },
      ]
    : [{ id: record.id, externalId: number(record.tvdbId), title: text(record.title), year: null }];
}

export function registerProviderRoutes(instance: FastifyInstance, ctx: AdminContext): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { base, config, kind } = ctx;

  // n° 340-346 / 443-449.
  providerRoutes(instance, ctx, {
    resource: 'notifications',
    segment: 'notifications',
    add: true,
    schema: true,
    test: 'tester-payload',
    testById: true,
  });
  // n° 384-389 / 483-488.
  providerRoutes(instance, ctx, {
    resource: 'indexers',
    segment: 'indexeurs',
    add: true,
    schema: true,
    test: 'tester',
    testById: false,
  });
  // n° 390-395 / 489-494.
  providerRoutes(instance, ctx, {
    resource: 'downloadClients',
    segment: 'clients-telechargement',
    add: true,
    schema: true,
    test: 'tester',
    testById: false,
  });
  // n° 396-400 / 495-499 (pas de test dans l'original).
  providerRoutes(instance, ctx, {
    resource: 'importLists',
    segment: 'listes-import',
    add: true,
    schema: true,
    test: null,
    testById: false,
  });
  // n° 421-424 / 519-521 : liste, modification, suppression ; modèles (Radarr).
  providerRoutes(instance, ctx, {
    resource: 'metadata',
    segment: 'metadata',
    add: false,
    schema: ctx.has('metadataConfig'),
    test: null,
    testById: false,
  });

  if (ctx.has('metadataConfig')) {
    // n° 425 : réglages des métadonnées (pays de certification).
    app.get(
      `${base}/metadata/config`,
      { config, schema: { params: slugParams, response: { 200: arrConfigSchema } } },
      async (request) => {
        const current = await ctx.clientOf(request).config('metadata');
        if (current === null) throw configNotFound(kind);
        return current;
      },
    );

    // n° 426 : enregistrement fusionné avec les réglages actuels.
    app.post(
      `${base}/metadata/config/sauvegarder`,
      {
        config,
        schema: {
          params: slugParams,
          body: arrConfigPatchSchema,
          response: { 200: arrConfigSchema },
        },
      },
      async (request) => mergeConfig(ctx.clientOf(request), 'metadata', request.body),
    );
  }

  // ── Exclusions d'import ────────────────────────────────────────────────────

  const exclusions = exclusionPath(kind);

  // n° 347 / 450 : 50 par page, triées par titre.
  app.get(
    `${base}/exclusions`,
    {
      config,
      schema: { params: slugParams, querystring: rawQuery, response: { 200: exclusionPageSchema } },
    },
    async (request) => {
      const page = positiveInt(request.query.page, 1);
      const data = await ctx.clientOf(request).one(`${exclusions}/paged`, {
        page,
        pageSize: SONARR_PAGE_SIZE,
        sortKey: kind === 'radarr' ? 'movieTitle' : 'title',
        sortDirection: 'ascending',
      });
      const records = Array.isArray(data?.records) ? (data.records as ArrRecord[]) : [];
      return {
        records: records.flatMap((record) => exclusionOf(kind, record)),
        totalRecords: typeof data?.totalRecords === 'number' ? data.totalRecords : records.length,
        page,
        pageSize: SONARR_PAGE_SIZE,
      };
    },
  );

  // n° 348 / 451.
  app.post(
    `${base}/exclusions/ajouter`,
    {
      config,
      schema: {
        params: slugParams,
        body: exclusionAddRequestSchema,
        response: { 200: exclusionSchema },
      },
    },
    async (request) => {
      const { externalId, title, year } = request.body;
      const body =
        kind === 'radarr'
          ? { tmdbId: externalId, movieTitle: title, movieYear: year }
          : { tvdbId: externalId, title };
      const saved = await ctx.clientOf(request).create(exclusions, body);
      return exclusionOf(kind, saved ?? {})[0] ?? { id: 0, externalId, title, year: year || null };
    },
  );

  // n° 349 / 452.
  app.post(
    `${base}/exclusions/:id/supprimer`,
    { config, schema: { params: itemParams, response: { 200: arrOkSchema } } },
    async (request) => {
      await ctx.clientOf(request).remove(exclusions, request.params.id);
      return { ok: true as const };
    },
  );

  // n° 350 / 453.
  app.post(
    `${base}/exclusions/bulk-supprimer`,
    {
      config,
      schema: { params: slugParams, body: idsRequestSchema, response: { 200: arrOkSchema } },
    },
    async (request) => {
      await ctx.clientOf(request).removeBulk(exclusions, request.body.ids);
      return { ok: true as const };
    },
  );
}
