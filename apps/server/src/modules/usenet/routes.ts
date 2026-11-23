// SPDX-License-Identifier: AGPL-3.0-or-later
// Module Usenet (P3d.5) : les 15 routes de `UsenetController` sous
// `/api/usenet/:client` (`sabnzbd` ou `nzbget`), plus les données des deux
// pages (`GET /api/usenet/:client` : catégories et historique récent ;
// `…/history?page=` : historique paginé). Réservé aux admins ; garde de
// service selon le client.
//
// Écarts : client non configuré → 409 commun (l'original :
// redirection ou 403) ; client injoignable → 503 commun et refus → 502 avec
// `usenet.api.action_failed` (l'original : 502 dans les deux cas) ; NZB
// envoyés en JSON base64. Historique récent gardé 45 s dans le cache de
// l'application (jamais un historique vide, `testFailedHistoryFetchIsNotCached`).

import {
  USENET_HISTORY_PAGE_SIZE,
  arrOkSchema,
  usenetAddFileRequestSchema,
  usenetAddUrlRequestSchema,
  usenetBulkRequestSchema,
  usenetBulkResponseSchema,
  usenetClientIdSchema,
  usenetHistorySchema,
  usenetOverviewSchema,
  usenetPollSummarySchema,
  usenetQueueSchema,
  usenetSpeedLimitRequestSchema,
  type UsenetClientId,
  type UsenetDownload,
} from '@hubarr/shared';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import {
  HttpClient,
  UpstreamError,
  apiKeyQuery,
  basicAuth,
  urlBlockedReason,
} from '../../integrations/http';
import { NzbgetClient, SabnzbdClient, type UsenetClient } from '../../integrations/usenet/clients';
import { requireRole } from '../../plugins/access';
import { isServiceConfigured, readServiceConfig } from '../services/config';

export const RECENT_HISTORY_LIMIT = 15;
export const RECENT_HISTORY_TTL_MS = 45_000;
export const recentHistoryKey = (client: UsenetClientId) => `usenet.recent_history.${client}`;

const clientParams = z.object({ client: usenetClientIdSchema });
const itemParams = z.object({
  client: usenetClientIdSchema,
  id: z.string().regex(/^[A-Za-z0-9_.-]+$/),
});
const ok = { 200: arrOkSchema };

/** Texte saisi sans espaces autour ; vide ou absent → `null`. */
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? null : trimmed;
}

/** Client Usenet du service (sans état : reconstruit à chaque requête, D82). */
export function usenetClient(app: FastifyInstance, id: UsenetClientId): UsenetClient {
  if (!isServiceConfigured(app.db, id)) throw new UpstreamError('not_configured', { service: id });
  const config = readServiceConfig(app.db, id);
  const http = new HttpClient({
    service: id,
    baseUrl: config.url,
    auth:
      id === 'sabnzbd'
        ? apiKeyQuery('apikey', config.apiKey)
        : basicAuth(config.user, config.password),
    health: app.upstream.health,
    logger: app.log,
    ...(app.upstream.dispatcher ? { dispatcher: app.upstream.dispatcher } : {}),
  });
  return id === 'sabnzbd' ? new SabnzbdClient(http) : new NzbgetClient(http);
}

/** Fraîcheur de la file partagée (relue toutes les 3 s par la page). */
export const USENET_SHARED_TTL_MS = 2_000;

/** File Usenet partagée entre la page, le résumé et le flux temps réel (P5.1). */
export function sharedUsenetQueue(app: FastifyInstance, id: UsenetClientId) {
  return app.live.shared(`usenet.${id}.queue`, USENET_SHARED_TTL_MS, () =>
    usenetClient(app, id).queue(),
  );
}

/** Refus du client → 502 traduit ; injoignable ou non configuré → erreur commune. */
async function action(task: () => Promise<void>): Promise<{ ok: true }> {
  try {
    await task();
  } catch (error) {
    if (error instanceof UpstreamError && !error.unreachable && error.kind !== 'not_configured') {
      throw new ApiError(502, 'UPSTREAM_ERROR', {
        service: error.service,
        message: 'usenet.api.action_failed',
      });
    }
    throw error;
  }
  return { ok: true };
}

export const usenetRoutes: FastifyPluginAsync = async (instance) => {
  instance.addHook('onRequest', requireRole('admin'));
  // Garde de service selon le paramètre `:client` (la garde commune lit `config.service`).
  instance.addHook('preHandler', async (request: FastifyRequest) => {
    const client = (request.params as { client?: unknown } | undefined)?.client;
    const parsed = usenetClientIdSchema.safeParse(client);
    if (!parsed.success) return;
    if (!isServiceConfigured(instance.db, parsed.data)) {
      const disabled = !readServiceConfig(instance.db, parsed.data).enabled;
      throw new ApiError(409, 'SERVICE_NOT_CONFIGURED', {
        service: parsed.data,
        details: {
          reason: disabled ? 'disabled' : 'missing',
          name: parsed.data === 'sabnzbd' ? 'SABnzbd' : 'NZBGet',
        },
      });
    }
  });
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const base = '/api/usenet/:client';
  const clientOf = (id: UsenetClientId) => usenetClient(instance, id);

  async function recentHistory(
    id: UsenetClientId,
  ): Promise<{ items: UsenetDownload[]; total: number }> {
    const key = recentHistoryKey(id);
    const cached = instance.cache.store.get(key) as
      { items: UsenetDownload[]; total: number } | undefined;
    if (cached !== undefined) return cached;
    const result = await clientOf(id).historyPage(0, RECENT_HISTORY_LIMIT);
    if (result.items.length > 0) instance.cache.store.set(key, result, RECENT_HISTORY_TTL_MS);
    return result;
  }

  // Données de la page de la file (n° 598) : catégories, historique récent.
  app.get(
    base,
    { schema: { params: clientParams, response: { 200: usenetOverviewSchema } } },
    async (request) => {
      const client = clientOf(request.params.client);
      const [categories, history] = await Promise.allSettled([
        client.categories(),
        recentHistory(request.params.client),
      ]);
      return {
        categories: categories.status === 'fulfilled' ? categories.value : [],
        recentHistory: history.status === 'fulfilled' ? history.value.items : [],
        historyTotal: history.status === 'fulfilled' ? history.value.total : 0,
      };
    },
  );

  // Historique paginé (n° 599), page ramenée dans les bornes.
  app.get(
    `${base}/history`,
    {
      schema: {
        params: clientParams,
        querystring: z.object({ page: z.coerce.number().int().catch(1) }),
        response: { 200: usenetHistorySchema },
      },
    },
    async (request) => {
      const client = clientOf(request.params.client);
      const perPage = USENET_HISTORY_PAGE_SIZE;
      let page = Math.max(1, request.query.page);
      let result = await client.historyPage((page - 1) * perPage, perPage);
      const totalPages = Math.max(1, Math.ceil(result.total / perPage));
      if (page > totalPages) {
        page = totalPages;
        result = await client.historyPage((page - 1) * perPage, perPage);
      }
      return { items: result.items, page, totalPages, total: result.total };
    },
  );

  app.get(
    `${base}/queue`,
    { schema: { params: clientParams, response: { 200: usenetQueueSchema } } },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      return sharedUsenetQueue(instance, request.params.client);
    },
  );

  app.get(
    `${base}/poll-summary`,
    { schema: { params: clientParams, response: { 200: usenetPollSummarySchema } } },
    async (request) => ({
      active: (await sharedUsenetQueue(instance, request.params.client)).active,
    }),
  );

  app.post(`${base}/pause`, { schema: { params: clientParams, response: ok } }, (request) =>
    action(() => clientOf(request.params.client).pauseAll()),
  );
  app.post(`${base}/resume`, { schema: { params: clientParams, response: ok } }, (request) =>
    action(() => clientOf(request.params.client).resumeAll()),
  );
  app.post(`${base}/item/:id/pause`, { schema: { params: itemParams, response: ok } }, (request) =>
    action(() => clientOf(request.params.client).pauseItem(request.params.id)),
  );
  app.post(`${base}/item/:id/resume`, { schema: { params: itemParams, response: ok } }, (request) =>
    action(() => clientOf(request.params.client).resumeItem(request.params.id)),
  );
  // Suppression : fichiers partiels compris, comme l'original.
  app.post(`${base}/item/:id/delete`, { schema: { params: itemParams, response: ok } }, (request) =>
    action(() => clientOf(request.params.client).deleteItem(request.params.id, true)),
  );

  app.post(
    `${base}/speed-limit`,
    { schema: { params: clientParams, body: usenetSpeedLimitRequestSchema, response: ok } },
    (request) => {
      const { mbps } = request.body;
      const bytes = mbps > 0 ? Math.round(mbps * 1024 * 1024) : 0;
      return action(() => clientOf(request.params.client).setSpeedLimit(bytes));
    },
  );

  app.post(
    `${base}/add`,
    { schema: { params: clientParams, body: usenetAddUrlRequestSchema, response: ok } },
    async (request) => {
      const url = request.body.url.trim();
      const category = blankToNull(request.body.category);
      if (url === '') throw new ApiError(400, 'VALIDATION', { message: 'usenet.api.add_no_url' });
      let blocked: string | null;
      try {
        blocked = await urlBlockedReason(url, instance.upstream.resolve);
      } catch {
        blocked = 'malformed';
      }
      if (blocked !== null)
        throw new ApiError(400, 'VALIDATION', { message: 'usenet.api.add_bad_url' });
      return action(() => clientOf(request.params.client).addUrl(url, category));
    },
  );

  app.post(
    `${base}/add-file`,
    { schema: { params: clientParams, body: usenetAddFileRequestSchema, response: ok } },
    (request) => {
      const files = request.body.files
        .map((file) => ({
          name: blankToNull(file.name.replaceAll('\0', '').split(/[\\/]/).pop()) ?? 'upload.nzb',
          content: Buffer.from(file.content, 'base64'),
        }))
        .filter((file) => file.content.length > 0);
      if (files.length === 0)
        throw new ApiError(400, 'VALIDATION', { message: 'usenet.api.add_no_file' });
      const category = blankToNull(request.body.category);
      return action(() => clientOf(request.params.client).addFiles(files, category));
    },
  );

  // Actions groupées : chaque id à son tour ; `ok` faux si l'une échoue.
  for (const verb of ['pause', 'resume', 'delete'] as const) {
    app.post(
      `${base}/bulk/${verb}`,
      {
        schema: {
          params: clientParams,
          body: usenetBulkRequestSchema,
          response: { 200: usenetBulkResponseSchema },
        },
      },
      async (request) => {
        const ids = request.body.ids;
        if (ids.length === 0) {
          throw new ApiError(400, 'VALIDATION', { message: 'usenet.api.action_failed' });
        }
        const client = clientOf(request.params.client);
        let count = 0;
        let allOk = true;
        for (const id of ids) {
          try {
            const key = String(id);
            if (verb === 'pause') await client.pauseItem(key);
            else if (verb === 'resume') await client.resumeItem(key);
            else await client.deleteItem(key, true);
            count += 1;
          } catch (error) {
            allOk = false;
            instance.log.warn({ err: error }, `usenet: action groupée ${verb} en échec`);
          }
        }
        return { ok: allOk, count };
      },
    );
  }
};
