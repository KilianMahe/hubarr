// SPDX-License-Identifier: AGPL-3.0-or-later
// Prowlarr, indexeurs (P3c.1) : page des indexeurs, CRUD, test, bascule,
// statistiques, catégories, actions groupées, test global, historique d'un
// indexeur ; profils d'application, étiquettes et commandes, utilisés par la
// page. Port de `ProwlarrController::index`, `indexer*`, `indexerHistory`,
// `appProfiles`, `tags`, `tagCreate`, `command`, `commandStatus`.
//
// Écarts : secrets des indexeurs masqués et restitués comme
// pour Radarr/Sonarr (D97, D101) ; erreurs communes au lieu de
// `{ ok: false, error }` en 200 (le test d'un indexeur garde son bilan) ;
// statistiques, santé et applications facultatives pour la page (une lecture
// en échec les laisse vides au lieu de masquer toute la page) ; nom de
// commande limité aux lettres et chiffres.

import {
  arrCommandStatusSchema,
  arrOkSchema,
  arrTagItemSchema,
  idsRequestSchema,
  prowlarrAppProfileSchema,
  prowlarrCategorySchema,
  prowlarrCommandRequestSchema,
  prowlarrIndexerBulkRequestSchema,
  prowlarrIndexerHistorySchema,
  prowlarrIndexerStatsSchema,
  prowlarrIndexerToggleSchema,
  prowlarrOverviewSchema,
  prowlarrTestAllSchema,
  tagLabelRequestSchema,
  type ArrCommandStatus,
  type ProwlarrIndexer,
} from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { isUpstreamError } from '../../integrations/http';
import { PROWLARR_INDEXERS } from '../../integrations/prowlarr/client';
import {
  indexerTotals,
  normalizeIndexer,
  statusByIndexer,
} from '../../integrations/prowlarr/normalize';
import { registerProviderFamily } from './provider-routes';
import {
  PROWLARR_BASE,
  PROWLARR_CONFIG,
  orNotFound,
  prowlarrClient,
  prowlarrIdParams,
} from './common';

const notFound = () => new ApiError(404, 'NOT_FOUND', { service: 'prowlarr' });

/** Lecture facultative de la page : un échec la laisse vide. */
function optional<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return promise.catch(() => fallback);
}

/** Seule commande ouverte au droit d'écriture : synchronisation des applications. */
const INDEXER_SYNC_COMMAND = 'ApplicationIndexerSync';

export function registerIndexerRoutes(instance: FastifyInstance): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const base = PROWLARR_BASE;
  const config = PROWLARR_CONFIG;
  const clientOf = () => prowlarrClient(instance);

  // n° 239-244 : modèles, lecture, ajout, modification, suppression, test.
  registerProviderFamily(
    instance,
    { upstream: PROWLARR_INDEXERS, segment: 'indexer', list: null },
    config,
  );

  // n° 238 : données de la page des indexeurs.
  app.get(base, { config, schema: { response: { 200: prowlarrOverviewSchema } } }, async () => {
    const client = clientOf();
    const [raw, statuses, stats, health, applications] = await Promise.all([
      client.rawIndexers(),
      optional(client.indexerStatuses(), []),
      optional(client.indexerStats(), null),
      optional(client.health(), []),
      optional(client.applications(), []),
    ]);
    const statusOf = statusByIndexer(statuses);
    const statsOf = new Map((stats?.indexers ?? []).map((item) => [item.indexerId, item]));
    const indexers = raw.flatMap((item) => {
      const id = typeof item.id === 'number' ? item.id : -1;
      return normalizeIndexer(item, statusOf.get(id) ?? null, statsOf.get(id) ?? null) ?? [];
    });
    const failing = indexers.filter((indexer: ProwlarrIndexer) => indexer.status !== null);
    return {
      indexers,
      totals: indexerTotals(indexers, failing.length),
      health,
      applications,
    };
  });

  // n° 287 : statistiques par indexeur, agent et hôte.
  app.get(
    `${base}/indexer/stats`,
    { config, schema: { response: { 200: prowlarrIndexerStatsSchema } } },
    async () => clientOf().indexerStats(),
  );

  // n° 288 : catégories par défaut.
  app.get(
    `${base}/indexer/categories`,
    { config, schema: { response: { 200: z.array(prowlarrCategorySchema) } } },
    async () => clientOf().defaultCategories(),
  );

  // n° 245 : bascule de `enable` sur l'indexeur complet de Prowlarr.
  app.post(
    `${base}/indexer/:id/toggle`,
    {
      config,
      schema: { params: prowlarrIdParams, response: { 200: prowlarrIndexerToggleSchema } },
    },
    async (request) => {
      const client = clientOf();
      const { id } = request.params;
      const raw = await orNotFound(() => client.one(`${PROWLARR_INDEXERS}/${id}`));
      if (raw === null) throw notFound();
      const enabled = raw.enable !== true;
      await client.update(PROWLARR_INDEXERS, id, { ...raw, enable: enabled });
      return { ok: true as const, enabled };
    },
  );

  // n° 249 : 30 derniers évènements de l'indexeur.
  app.get(
    `${base}/indexer/:id/history`,
    {
      config,
      schema: {
        params: prowlarrIdParams,
        response: { 200: z.array(prowlarrIndexerHistorySchema) },
      },
    },
    async (request) => clientOf().indexerHistory(request.params.id),
  );

  // n° 289.
  app.post(
    `${base}/indexer/bulk/update`,
    {
      config,
      schema: { body: prowlarrIndexerBulkRequestSchema, response: { 200: arrOkSchema } },
    },
    async (request) => {
      await clientOf().bulkUpdateIndexers(request.body);
      return { ok: true as const };
    },
  );

  // n° 290.
  app.post(
    `${base}/indexer/bulk/delete`,
    { config, schema: { body: idsRequestSchema, response: { 200: arrOkSchema } } },
    async (request) => {
      await clientOf().bulkDeleteIndexers(request.body.ids);
      return { ok: true as const };
    },
  );

  // n° 291.
  app.post(
    `${base}/indexer/testall`,
    { config, schema: { response: { 200: prowlarrTestAllSchema } } },
    async () => clientOf().testAllIndexers(),
  );

  // ── Profils d'application, étiquettes, commandes ───────────────────────────

  // n° 302.
  app.get(
    `${base}/app-profiles`,
    { config, schema: { response: { 200: z.array(prowlarrAppProfileSchema) } } },
    async () => clientOf().appProfiles(),
  );

  // n° 300.
  app.get(
    `${base}/tags`,
    { config, schema: { response: { 200: z.array(arrTagItemSchema) } } },
    async () => clientOf().tags(),
  );

  // n° 301 : l'étiquette créée (Prowlarr renvoie l'existante si le libellé est pris).
  app.post(
    `${base}/tag/create`,
    { config, schema: { body: tagLabelRequestSchema, response: { 200: arrTagItemSchema } } },
    async (request) => {
      const { label } = request.body;
      return (await clientOf().createTag(label)) ?? { id: 0, label };
    },
  );

  // n° 306 : commande lancée (synchronisation des applications…).
  app.post(
    `${base}/command`,
    {
      config,
      schema: {
        body: prowlarrCommandRequestSchema,
        response: { 200: z.object({ ok: z.literal(true), cmdId: z.number().nullable() }) },
      },
    },
    async (request) => {
      const { name } = request.body;
      // Hors synchronisation des indexeurs, une commande (sauvegarde, mise à
      // jour…) relève du système de Prowlarr : admins seulement.
      if (name !== INDEXER_SYNC_COMMAND && !request.access.admin) {
        throw new ApiError(403, 'FORBIDDEN', { service: 'prowlarr' });
      }
      return { ok: true as const, cmdId: await clientOf().command(name) };
    },
  );

  // n° 292 : état d'une commande ; purgée (404) → `unknown`.
  app.get(
    `${base}/command/:id`,
    { config, schema: { params: prowlarrIdParams, response: { 200: arrCommandStatusSchema } } },
    async (request): Promise<ArrCommandStatus> => {
      const { id } = request.params;
      const unknown: ArrCommandStatus = {
        id,
        name: '',
        status: 'unknown',
        message: null,
        queued: null,
        started: null,
        ended: null,
      };
      try {
        const command = await clientOf().commandStatus(id);
        if (command === null) return unknown;
        return {
          id: command.id ?? id,
          name: command.name ?? command.commandName ?? '',
          status: command.status ?? 'unknown',
          message: command.message ?? null,
          queued: command.queued ?? null,
          started: command.started ?? null,
          ended: command.ended ?? null,
        };
      } catch (error) {
        if (isUpstreamError(error) && error.kind === 'http' && error.info.status === 404) {
          return unknown;
        }
        throw error;
      }
    },
  );
}
