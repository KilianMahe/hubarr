// SPDX-License-Identifier: AGPL-3.0-or-later
// Administration *arr, configuration (P3b.4) : dossiers racine, chemins
// distants, gestion des médias et nommage (exemples), interface, hôte
// (« Général »), filtres personnalisés, édition groupée de films (Radarr).
// Port de `RadarrController`/`SonarrController::rootFolder*`,
// `remotePathMapping*`, `mediaManagement*`, `ui*`, `settings*`,
// `customFilter*`, `moviesBulkUpdate`.
//
// Écarts : la configuration de l'hôte part sans clé d'API ni
// mots de passe (masqués) ; un mot de passe vide ou masqué n'est pas modifié,
// la clé d'API jamais ; les exemples de nommage sont calculés d'après les
// formats saisis (passés en paramètres, comme l'interface de l'instance) au
// lieu des formats enregistrés ; les sections annexes de « Général »
// (indexeurs, clients, listes) en échec valent `null` sans vider la page.

import {
  arrConfigPatchSchema,
  arrConfigSchema,
  arrOkSchema,
  customFilterSaveSchema,
  customFilterSchema,
  hostSettingsPageSchema,
  mediaManagementPageSchema,
  moviesBulkUpdateRequestSchema,
  namingExamplesSchema,
  remotePathMappingSaveSchema,
  remotePathMappingSchema,
  rootFolderAddRequestSchema,
  rootFolderSchema,
  uiPageSchema,
  type NamingExamples,
  type RemotePathMapping,
  type RootFolder,
} from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../http/zod';
import { SIMPLE_RESOURCES, type ArrRecord } from '../../integrations/arr/admin';
import { configPatchWithoutSecrets, maskConfigSecrets } from '../../integrations/arr/secrets';
import type { Query } from '../../integrations/http';
import {
  configNotFound,
  itemParams,
  mergeConfig,
  namedRefs,
  rawQuery,
  savedOr,
  slugParams,
  validItems,
  type AdminContext,
} from './common';
import { crudRoutes } from './profile-routes';

function rootFolderOf(record: ArrRecord): RootFolder[] {
  if (typeof record.id !== 'number' || typeof record.path !== 'string') return [];
  const size = (value: unknown) => (typeof value === 'number' ? value : null);
  return [
    {
      id: record.id,
      path: record.path,
      accessible: record.accessible !== false,
      freeSpace: size(record.freeSpace),
      totalSpace: size(record.totalSpace),
    },
  ];
}

function mappingOf(record: ArrRecord): RemotePathMapping[] {
  if (typeof record.id !== 'number') return [];
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return [
    {
      id: record.id,
      host: text(record.host),
      remotePath: text(record.remotePath),
      localPath: text(record.localPath),
    },
  ];
}

/** Paramètres d'exemples de nommage : valeurs simples de la requête seulement. */
function namingQuery(query: Record<string, unknown>): Query {
  const result: Query = {};
  for (const [key, value] of Object.entries(query)) {
    if (!/^[a-zA-Z]+$/.test(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    }
  }
  return result;
}

export function registerConfigRoutes(instance: FastifyInstance, ctx: AdminContext): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { base, config, kind } = ctx;

  // ── Général (hôte) ─────────────────────────────────────────────────────────

  // n° 380 / 479 : hôte (secrets masqués) et sections annexes en lecture.
  app.get(
    `${base}/parametres`,
    { config, schema: { params: slugParams, response: { 200: hostSettingsPageSchema } } },
    async (request) => {
      const client = ctx.clientOf(request);
      const optional = (section: 'indexer' | 'downloadclient' | 'importlist') =>
        client.config(section).catch(() => null);
      const [host, indexer, downloadClient, importList] = await Promise.all([
        client.config('host'),
        optional('indexer'),
        optional('downloadclient'),
        optional('importlist'),
      ]);
      if (host === null) throw configNotFound(kind);
      return { host: maskConfigSecrets(host), indexer, downloadClient, importList };
    },
  );

  // n° 381 / 480 : enregistrement fusionné, sans toucher aux secrets non saisis.
  app.post(
    `${base}/parametres/host/sauvegarder`,
    {
      config,
      schema: {
        params: slugParams,
        body: arrConfigPatchSchema,
        response: { 200: arrConfigSchema },
      },
    },
    async (request) =>
      maskConfigSecrets(
        await mergeConfig(ctx.clientOf(request), 'host', configPatchWithoutSecrets(request.body)),
      ),
  );

  // ── Interface ──────────────────────────────────────────────────────────────

  // n° 382 / 481 : configuration et langues (interface, infos du film).
  app.get(
    `${base}/ui`,
    { config, schema: { params: slugParams, response: { 200: uiPageSchema } } },
    async (request) => {
      const client = ctx.clientOf(request);
      const [ui, languages] = await Promise.all([
        client.config('ui'),
        client.list('/api/v3/language').catch(() => []),
      ]);
      if (ui === null) throw configNotFound(kind);
      return { config: ui, languages: namedRefs(languages) };
    },
  );

  // n° 383 / 482.
  app.post(
    `${base}/ui/sauvegarder`,
    {
      config,
      schema: {
        params: slugParams,
        body: arrConfigPatchSchema,
        response: { 200: arrConfigSchema },
      },
    },
    async (request) => mergeConfig(ctx.clientOf(request), 'ui', request.body),
  );

  // ── Gestion des médias et nommage ──────────────────────────────────────────

  // n° 412 / 511.
  app.get(
    `${base}/gestion-medias`,
    { config, schema: { params: slugParams, response: { 200: mediaManagementPageSchema } } },
    async (request) => {
      const client = ctx.clientOf(request);
      const [naming, mediaManagement] = await Promise.all([
        client.config('naming'),
        client.config('mediamanagement'),
      ]);
      if (naming === null || mediaManagement === null) throw configNotFound(kind);
      return { naming, mediaManagement };
    },
  );

  // n° 413 / 512.
  app.post(
    `${base}/gestion-medias/naming`,
    {
      config,
      schema: {
        params: slugParams,
        body: arrConfigPatchSchema,
        response: { 200: arrConfigSchema },
      },
    },
    async (request) => mergeConfig(ctx.clientOf(request), 'naming', request.body),
  );

  // n° 414 / 514.
  app.post(
    `${base}/gestion-medias/mediamanagement`,
    {
      config,
      schema: {
        params: slugParams,
        body: arrConfigPatchSchema,
        response: { 200: arrConfigSchema },
      },
    },
    async (request) => mergeConfig(ctx.clientOf(request), 'mediamanagement', request.body),
  );

  // n° 415 / 513 : exemples d'après les formats passés en paramètres.
  app.get(
    `${base}/gestion-medias/naming/examples`,
    {
      config,
      schema: {
        params: slugParams,
        querystring: rawQuery,
        response: { 200: namingExamplesSchema },
      },
    },
    async (request) => {
      const examples = await ctx
        .clientOf(request)
        .one('/api/v3/config/naming/examples', namingQuery(request.query));
      const result: NamingExamples = {};
      for (const [key, value] of Object.entries(examples ?? {})) {
        if (typeof value === 'string' || value === null) result[key] = value;
      }
      return result;
    },
  );

  // ── Dossiers racine ────────────────────────────────────────────────────────

  // n° 409 / 508.
  app.get(
    `${base}/dossiers-racine`,
    { config, schema: { params: slugParams, response: { 200: z.array(rootFolderSchema) } } },
    async (request) =>
      (await ctx.clientOf(request).list(SIMPLE_RESOURCES.rootFolders)).flatMap(rootFolderOf),
  );

  // n° 410 / 509.
  app.post(
    `${base}/dossiers-racine/ajouter`,
    {
      config,
      schema: {
        params: slugParams,
        body: rootFolderAddRequestSchema,
        response: { 200: rootFolderSchema },
      },
    },
    async (request) => {
      const saved = await ctx
        .clientOf(request)
        .create(SIMPLE_RESOURCES.rootFolders, { path: request.body.path });
      return (
        rootFolderOf(saved ?? {})[0] ?? {
          id: 0,
          path: request.body.path,
          accessible: true,
          freeSpace: null,
          totalSpace: null,
        }
      );
    },
  );

  // n° 411 / 510.
  app.post(
    `${base}/dossiers-racine/:id/supprimer`,
    { config, schema: { params: itemParams, response: { 200: arrOkSchema } } },
    async (request) => {
      await ctx.clientOf(request).remove(SIMPLE_RESOURCES.rootFolders, request.params.id);
      return { ok: true as const };
    },
  );

  // ── Chemins distants ───────────────────────────────────────────────────────

  // n° 417 / 515.
  app.get(
    `${base}/chemins-distants`,
    { config, schema: { params: slugParams, response: { 200: z.array(remotePathMappingSchema) } } },
    async (request) =>
      (await ctx.clientOf(request).list(SIMPLE_RESOURCES.remotePathMappings)).flatMap(mappingOf),
  );

  // n° 418 / 516.
  app.post(
    `${base}/chemins-distants/ajouter`,
    {
      config,
      schema: {
        params: slugParams,
        body: remotePathMappingSaveSchema,
        response: { 200: remotePathMappingSchema },
      },
    },
    async (request) => {
      const saved = await ctx
        .clientOf(request)
        .create(SIMPLE_RESOURCES.remotePathMappings, request.body);
      return mappingOf(savedOr(saved, { id: 0, ...request.body }))[0] ?? { id: 0, ...request.body };
    },
  );

  // n° 419 / 517.
  app.post(
    `${base}/chemins-distants/:id/modifier`,
    {
      config,
      schema: {
        params: itemParams,
        body: remotePathMappingSaveSchema,
        response: { 200: remotePathMappingSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const body = { ...request.body, id };
      const saved = await ctx
        .clientOf(request)
        .update(SIMPLE_RESOURCES.remotePathMappings, id, body);
      return mappingOf(savedOr(saved, body))[0] ?? body;
    },
  );

  // n° 420 / 518.
  app.post(
    `${base}/chemins-distants/:id/supprimer`,
    { config, schema: { params: itemParams, response: { 200: arrOkSchema } } },
    async (request) => {
      await ctx.clientOf(request).remove(SIMPLE_RESOURCES.remotePathMappings, request.params.id);
      return { ok: true as const };
    },
  );

  // ── Filtres personnalisés ──────────────────────────────────────────────────

  // n° 427 / 522.
  app.get(
    `${base}/filtres-personnalises`,
    { config, schema: { params: slugParams, response: { 200: z.array(customFilterSchema) } } },
    async (request) =>
      validItems(
        customFilterSchema,
        await ctx.clientOf(request).list(SIMPLE_RESOURCES.customFilters),
      ),
  );

  // n° 428-430 / 523-525.
  crudRoutes(instance, ctx, {
    segment: 'filtres-personnalises',
    path: SIMPLE_RESOURCES.customFilters,
    save: customFilterSaveSchema,
    item: customFilterSchema,
  });

  // ── Édition groupée (Radarr) ───────────────────────────────────────────────

  if (ctx.has('bulkUpdate')) {
    // n° 416 : `PUT /movie/editor` (ids et changements dans le même corps).
    app.post(
      `${base}/films/bulk-update`,
      {
        config,
        schema: {
          params: slugParams,
          body: moviesBulkUpdateRequestSchema,
          response: { 200: arrOkSchema },
        },
      },
      async (request) => {
        await ctx.clientOf(request).http.put('/api/v3/movie/editor', request.body);
        ctx.invalidateLibrary(request);
        return { ok: true as const };
      },
    );
  }
}
