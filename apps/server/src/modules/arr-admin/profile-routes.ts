// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration *arr, profils (P3b.2) : qualité (profils, définitions,
// limites), profils de délai, formats personnalisés, auto-tags, étiquettes.
// Port de `RadarrController`/`SonarrController::quality*`, `delayProfile*`,
// `customFormat*`, `autoTag*`, `tag*`.
//
// Écarts : une erreur de l'instance suit le format commun (502
// avec son message) au lieu de `{ ok: false, error }` en 200 ; la page des
// auto-tags renvoie aussi les modèles de conditions (`/autotagging/schema`) et
// les étiquettes, pour éditer les conditions comme celles des formats (au lieu
// d'un JSON brut) ; la suppression d'une étiquette utilisée est refusée en 409
// `media.api.tag_still_used`, pour les deux services.

import {
  arrOkSchema,
  arrTagItemSchema,
  arrTagUsageSchema,
  autoTagSaveSchema,
  autoTagSchema,
  autoTagsPageSchema,
  customFormatSaveSchema,
  customFormatSchema,
  delayProfileSchema,
  qualityDefinitionSchema,
  qualityDefinitionsSaveSchema,
  qualityLimitsSchema,
  qualityPageSchema,
  qualityProfileSaveSchema,
  qualityProfileSchema,
  specificationSchema,
  tagLabelRequestSchema,
  type QualityLimits,
} from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import {
  SIMPLE_RESOURCES,
  type ArrAdminClient,
  type ArrRecord,
} from '../../integrations/arr/admin';
import { isUpstreamError } from '../../integrations/http';
import {
  itemParams,
  namedRefs,
  savedOr,
  slugParams,
  validItems,
  type AdminContext,
} from './common';

/** Bornes des tailles d'une définition (`/qualitydefinition/limits`) ; illisibles → `null`. */
async function qualityLimits(client: ArrAdminClient): Promise<QualityLimits | null> {
  const limits = await client.one('/api/v3/qualitydefinition/limits');
  if (limits === null || typeof limits.min !== 'number' || typeof limits.max !== 'number') {
    return null;
  }
  return { min: limits.min, max: limits.max };
}

/** Étiquettes `{ id, label }` lisibles. */
function tagItems(tags: ArrRecord[]) {
  return tags.flatMap((tag) =>
    typeof tag.id === 'number' && typeof tag.label === 'string'
      ? [{ id: tag.id, label: tag.label }]
      : [],
  );
}

/** Nombre d'éléments qui utilisent une étiquette (`/tag/detail` : toutes les listes d'ids). */
function tagUsage(detail: ArrRecord): number {
  return Object.entries(detail)
    .filter(([key, value]) => key.endsWith('Ids') && Array.isArray(value))
    .reduce((total, [, value]) => total + (value as unknown[]).length, 0);
}

/**
 * Routes CRUD d'une ressource simple : ajout (`…/ajouter`), modification
 * (`…/:id/modifier`) et suppression (`…/:id/supprimer`) sous `segment`.
 */
export function crudRoutes(
  instance: FastifyInstance,
  ctx: AdminContext,
  options: {
    segment: string;
    path: string;
    save: z.ZodType<ArrRecord>;
    item: z.ZodType;
  },
): void {
  const { base, config } = ctx;
  const typed = instance.withTypeProvider<ZodTypeProvider>();

  typed.post(
    `${base}/${options.segment}/ajouter`,
    { config, schema: { params: slugParams, body: options.save, response: { 200: options.item } } },
    async (request) => {
      const body = request.body;
      return savedOr(await ctx.clientOf(request).create(options.path, body), body);
    },
  );

  typed.post(
    `${base}/${options.segment}/:id/modifier`,
    { config, schema: { params: itemParams, body: options.save, response: { 200: options.item } } },
    async (request) => {
      const body = { ...request.body, id: request.params.id };
      return savedOr(
        await ctx.clientOf(request).update(options.path, request.params.id, body),
        body,
      );
    },
  );

  typed.post(
    `${base}/${options.segment}/:id/supprimer`,
    { config, schema: { params: itemParams, response: { 200: arrOkSchema } } },
    async (request) => {
      await ctx.clientOf(request).remove(options.path, request.params.id);
      return { ok: true as const };
    },
  );
}

export function registerProfileRoutes(instance: FastifyInstance, ctx: AdminContext): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { base, config } = ctx;

  // ── Qualité ────────────────────────────────────────────────────────────────

  // n° 357 / 456 : profils, définitions, formats, langues, limites.
  app.get(
    `${base}/qualite`,
    { config, schema: { params: slugParams, response: { 200: qualityPageSchema } } },
    async (request) => {
      const client = ctx.clientOf(request);
      const [profiles, definitions, formats, languages, limits] = await Promise.all([
        client.list(SIMPLE_RESOURCES.qualityProfiles),
        client.list('/api/v3/qualitydefinition'),
        client.list(SIMPLE_RESOURCES.customFormats),
        ctx.has('profileLanguage') ? client.list('/api/v3/language') : Promise.resolve([]),
        qualityLimits(client).catch(() => null),
      ]);
      return {
        profiles,
        definitions: validItems(qualityDefinitionSchema, definitions),
        customFormats: namedRefs(formats),
        languages: namedRefs(languages),
        limits,
      };
    },
  );

  // n° 358-360 / 457-459 : profils de qualité.
  crudRoutes(instance, ctx, {
    segment: 'qualite/profils',
    path: SIMPLE_RESOURCES.qualityProfiles,
    save: qualityProfileSaveSchema,
    item: qualityProfileSchema,
  });

  // n° 361 / 460 : enregistrement groupé des définitions (`PUT /qualitydefinition/update`).
  app.post(
    `${base}/qualite/definitions/sauvegarder`,
    {
      config,
      schema: {
        params: slugParams,
        body: qualityDefinitionsSaveSchema,
        response: { 200: arrOkSchema },
      },
    },
    async (request) => {
      await ctx.clientOf(request).http.put('/api/v3/qualitydefinition/update', request.body);
      return { ok: true as const };
    },
  );

  // n° 362 / 461 : limites des tailles.
  app.get(
    `${base}/qualite/definitions/limites`,
    { config, schema: { params: slugParams, response: { 200: qualityLimitsSchema.nullable() } } },
    async (request) => qualityLimits(ctx.clientOf(request)),
  );

  // ── Profils de délai ───────────────────────────────────────────────────────

  // n° 363 / 462.
  app.get(
    `${base}/profils-delai`,
    { config, schema: { params: slugParams, response: { 200: z.array(delayProfileSchema) } } },
    async (request) => {
      const profiles = await ctx.clientOf(request).list(SIMPLE_RESOURCES.delayProfiles);
      return profiles.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
    },
  );

  // n° 364-366 / 463-465.
  crudRoutes(instance, ctx, {
    segment: 'profils-delai',
    path: SIMPLE_RESOURCES.delayProfiles,
    save: delayProfileSchema,
    item: delayProfileSchema,
  });

  // ── Formats personnalisés ──────────────────────────────────────────────────

  // n° 367 / 466.
  app.get(
    `${base}/formats`,
    { config, schema: { params: slugParams, response: { 200: z.array(customFormatSchema) } } },
    async (request) => ctx.clientOf(request).list(SIMPLE_RESOURCES.customFormats),
  );

  // n° 368 / 467 : modèles de conditions.
  app.get(
    `${base}/formats/schema`,
    { config, schema: { params: slugParams, response: { 200: z.array(specificationSchema) } } },
    async (request) => ctx.clientOf(request).schema(SIMPLE_RESOURCES.customFormats),
  );

  // n° 369-371 / 468-470.
  crudRoutes(instance, ctx, {
    segment: 'formats',
    path: SIMPLE_RESOURCES.customFormats,
    save: customFormatSaveSchema,
    item: customFormatSchema,
  });

  // ── Auto-tags ──────────────────────────────────────────────────────────────

  // n° 372 / 471 : règles, modèles de conditions, étiquettes.
  app.get(
    `${base}/auto-tags`,
    { config, schema: { params: slugParams, response: { 200: autoTagsPageSchema } } },
    async (request) => {
      const client = ctx.clientOf(request);
      const [rules, schema, tags] = await Promise.all([
        client.list(SIMPLE_RESOURCES.autoTags),
        client.schema(SIMPLE_RESOURCES.autoTags).catch(() => []),
        client.list(SIMPLE_RESOURCES.tags).catch(() => []),
      ]);
      return { rules, schema, tags: tagItems(tags) };
    },
  );

  // n° 373-375 / 472-474.
  crudRoutes(instance, ctx, {
    segment: 'auto-tags',
    path: SIMPLE_RESOURCES.autoTags,
    save: autoTagSaveSchema,
    item: autoTagSchema,
  });

  // ── Étiquettes ─────────────────────────────────────────────────────────────

  // n° 376 / 475 : étiquettes et leur usage (`/tag/detail`), triées par nom.
  app.get(
    `${base}/tags`,
    { config, schema: { params: slugParams, response: { 200: z.array(arrTagUsageSchema) } } },
    async (request) => {
      const details = await ctx.clientOf(request).list('/api/v3/tag/detail');
      return details
        .flatMap((detail) =>
          typeof detail.id === 'number' && typeof detail.label === 'string'
            ? [{ id: detail.id, label: detail.label, usage: tagUsage(detail) }]
            : [],
        )
        .sort((a, b) => a.label.localeCompare(b.label));
    },
  );

  // n° 377 / 476.
  app.post(
    `${base}/tags/ajouter`,
    {
      config,
      schema: {
        params: slugParams,
        body: tagLabelRequestSchema,
        response: { 200: arrTagItemSchema },
      },
    },
    async (request) => {
      const tag = await ctx.clientOf(request).create(SIMPLE_RESOURCES.tags, {
        label: request.body.label,
      });
      if (tag === null || typeof tag.id !== 'number') {
        throw new ApiError(502, 'UPSTREAM_ERROR', { service: ctx.kind });
      }
      return { id: tag.id, label: typeof tag.label === 'string' ? tag.label : request.body.label };
    },
  );

  // n° 378 / 477 : une étiquette encore utilisée est refusée par l'instance.
  app.post(
    `${base}/tags/:id/supprimer`,
    { config, schema: { params: itemParams, response: { 200: arrOkSchema } } },
    async (request) => {
      try {
        await ctx.clientOf(request).remove(SIMPLE_RESOURCES.tags, request.params.id);
      } catch (error) {
        const message = isUpstreamError(error) ? (error.info.message ?? '') : '';
        if (
          isUpstreamError(error) &&
          error.kind === 'http' &&
          (message.includes('still in use') || message.includes('cannot be deleted'))
        ) {
          throw new ApiError(409, 'VALIDATION', {
            service: ctx.kind,
            message: 'media.api.tag_still_used',
          });
        }
        throw error;
      }
      return { ok: true as const };
    },
  );

  // n° 379 / 478.
  app.post(
    `${base}/tags/:id/renommer`,
    {
      config,
      schema: {
        params: itemParams,
        body: tagLabelRequestSchema,
        response: { 200: arrTagItemSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const tag = await ctx
        .clientOf(request)
        .update(SIMPLE_RESOURCES.tags, id, { id, label: request.body.label });
      return { id, label: typeof tag?.label === 'string' ? tag.label : request.body.label };
    },
  );
}
