// SPDX-License-Identifier: AGPL-3.0-or-later
// Module d'activité des serveurs média (P3e) : les 19 routes de
// `TautulliController`, les 8 de `TracearrController` et les 3
// d'`EmbyController`, sous `/api/<service>` (R1). Ouvert à tout utilisateur
// connecté, comme l'original (`ROLE_USER`) ; garde de service.
//
// Écarts : les fragments HTML de l'original (en cours,
// statistiques, historique, bibliothèques, utilisateurs, métadonnées) sont
// des réponses JSON rendues par des composants Vue ; `now-playing` renvoie
// l'activité normalisée. Comme l'original, une panne du service donne une
// forme vide (200) plutôt qu'une erreur, sauf pour la garde « non configuré »
// (409 commun). Les affiches passent par les proxys d'images (types
// matriciels seulement, cache privé d'un jour).

import {
  activitySchema,
  type Activity,
  chartSchema,
  quickLookSchema,
  tautulliChartQuerySchema,
  tautulliHistorySchema,
  tautulliLibrariesSchema,
  tautulliMetadataSchema,
  tautulliStatsSchema,
  tautulliUserNamesSchema,
  tautulliUsersSchema,
  tracearrChartsSchema,
  tracearrHistorySchema,
  tracearrStatsSchema,
  tracearrUserDetailSchema,
  tracearrUsersSchema,
} from '@hubarr/shared';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import type { ProxiedImage } from '../../integrations/activity/common';
import { EmbyClient, embyBaseUrl } from '../../integrations/activity/emby';
import { TautulliClient } from '../../integrations/activity/tautulli';
import { TracearrClient } from '../../integrations/activity/tracearr';
import { HttpClient, apiKeyHeader, apiKeyQuery, bearer } from '../../integrations/http';
import { hasRequiredFields, readServiceConfig } from '../services/config';

type Service = 'tautulli' | 'tracearr' | 'emby';

export function httpFor(app: FastifyInstance, service: Service): HttpClient | null {
  const config = readServiceConfig(app.db, service);
  if (!hasRequiredFields(service, config)) return null;
  return new HttpClient({
    service,
    baseUrl: service === 'emby' ? embyBaseUrl(config.url) : config.url,
    auth:
      service === 'tautulli'
        ? apiKeyQuery('apikey', config.apiKey)
        : service === 'tracearr'
          ? bearer(config.apiKey)
          : apiKeyHeader('X-Emby-Token', config.apiKey),
    health: app.upstream.health,
    logger: app.log,
    ...(app.upstream.dispatcher ? { dispatcher: app.upstream.dispatcher } : {}),
  });
}

function sendImage(reply: FastifyReply, image: ProxiedImage | null, service: Service) {
  if (image === null) throw new ApiError(404, 'NOT_FOUND', { service });
  return reply
    .type(image.contentType)
    .header('cache-control', 'private, max-age=86400')
    .send(Buffer.from(image.body));
}

/** Fraîcheur de l'activité partagée (relue toutes les 10 s par les pages). */
export const ACTIVITY_SHARED_TTL_MS = 5_000;

/**
 * Activité normalisée d'un serveur média, partagée entre les pages, le
 * tableau de bord, la pastille du tiroir et le flux temps réel (P5.1).
 */
export function sharedActivity(app: FastifyInstance, service: Service): Promise<Activity> {
  return app.live.shared(`activity.${service}`, ACTIVITY_SHARED_TTL_MS, () => {
    const config = readServiceConfig(app.db, service);
    const configured = hasRequiredFields(service, config);
    const http = httpFor(app, service);
    if (service === 'tautulli')
      return new TautulliClient(http).activity(config.enabled, configured);
    if (service === 'emby') return new EmbyClient(http).activity(config.enabled, configured);
    return new TracearrClient(http, app.cache.store).activity(config.enabled, configured);
  });
}

const metricOf = (metric: string) => (metric === 'duration' ? 'duration' : 'plays');

export const activityRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const tautulli = () => new TautulliClient(httpFor(instance, 'tautulli'));
  const tracearr = () => new TracearrClient(httpFor(instance, 'tracearr'), instance.cache.store);
  const emby = () => new EmbyClient(httpFor(instance, 'emby'));

  // ── Tautulli (n° 531-549) ────────────────────────────────────────────────
  const tConfig = { service: 'tautulli' as const };
  const tActivity = () => sharedActivity(instance, 'tautulli');
  for (const path of ['activity', 'now-playing']) {
    app.get(
      `/api/tautulli/${path}`,
      { config: tConfig, schema: { response: { 200: activitySchema } } },
      tActivity,
    );
  }
  app.get(
    '/api/tautulli/image',
    { config: tConfig, schema: { querystring: z.object({ img: z.string().catch('') }) } },
    async (request, reply) =>
      sendImage(reply, await tautulli().image(request.query.img), 'tautulli'),
  );
  app.get(
    '/api/tautulli/metadata/:ratingKey',
    {
      config: tConfig,
      schema: {
        params: z.object({ ratingKey: z.string().regex(/^\d+$/) }),
        response: { 200: tautulliMetadataSchema },
      },
    },
    async (request) => tautulli().metadata(request.params.ratingKey),
  );
  app.get(
    '/api/tautulli/quicklook/:ratingKey',
    {
      config: tConfig,
      schema: {
        params: z.object({ ratingKey: z.string().regex(/^\d+$/) }),
        response: { 200: quickLookSchema },
      },
    },
    async (request) =>
      (await tautulli().resolveTmdbId(request.params.ratingKey)) ?? { type: null, id: null },
  );
  app.get(
    '/api/tautulli/stats',
    {
      config: tConfig,
      schema: { querystring: tautulliChartQuerySchema, response: { 200: tautulliStatsSchema } },
    },
    async (request) =>
      tautulli().homeStats(request.query.range, request.query.metric, request.query.user),
  );
  app.get(
    '/api/tautulli/plays',
    {
      config: tConfig,
      schema: { querystring: tautulliChartQuerySchema, response: { 200: chartSchema } },
    },
    async (request) => {
      const { range, metric, user, mode } = request.query;
      return tautulli().chart(
        mode === 'stream' ? 'get_plays_by_stream_type' : 'get_plays_by_date',
        range,
        metricOf(metric),
        user,
      );
    },
  );
  const charts: [string, string][] = [
    ['activity-hour', 'get_plays_by_hourofday'],
    ['activity-dow', 'get_plays_by_dayofweek'],
    ['clients-stream-type', 'get_stream_type_by_top_10_platforms'],
    ['plays-source-res', 'get_plays_by_source_resolution'],
    ['plays-stream-res', 'get_plays_by_stream_resolution'],
    ['users-stream-type', 'get_stream_type_by_top_10_users'],
  ];
  for (const [path, cmd] of charts) {
    app.get(
      `/api/tautulli/${path}`,
      {
        config: tConfig,
        schema: { querystring: tautulliChartQuerySchema, response: { 200: chartSchema } },
      },
      async (request) =>
        tautulli().chart(
          cmd,
          request.query.range,
          metricOf(request.query.metric),
          request.query.user,
        ),
    );
  }
  app.get(
    '/api/tautulli/concurrent',
    {
      config: tConfig,
      schema: { querystring: tautulliChartQuerySchema, response: { 200: chartSchema } },
    },
    async (request) =>
      tautulli().chart(
        'get_concurrent_streams_by_stream_type',
        request.query.range,
        null,
        request.query.user,
      ),
  );
  app.get(
    '/api/tautulli/history',
    {
      config: tConfig,
      schema: {
        querystring: z.object({
          length: z.coerce.number().int().catch(25),
          start: z.coerce.number().int().catch(0),
          user: z.string().catch(''),
        }),
        response: { 200: tautulliHistorySchema },
      },
    },
    async (request) =>
      tautulli().history(request.query.length, request.query.start, request.query.user),
  );
  app.get(
    '/api/tautulli/libraries',
    { config: tConfig, schema: { response: { 200: tautulliLibrariesSchema } } },
    () => tautulli().libraries(),
  );
  app.get(
    '/api/tautulli/users',
    { config: tConfig, schema: { response: { 200: tautulliUsersSchema } } },
    () => tautulli().usersTable(),
  );
  app.get(
    '/api/tautulli/user-names',
    { config: tConfig, schema: { response: { 200: tautulliUserNamesSchema } } },
    () => tautulli().userNames(),
  );

  // ── Tracearr (n° 570-576) ────────────────────────────────────────────────
  const trConfig = { service: 'tracearr' as const };
  const trActivity = () => sharedActivity(instance, 'tracearr');
  for (const path of ['activity', 'now-playing']) {
    app.get(
      `/api/tracearr/${path}`,
      { config: trConfig, schema: { response: { 200: activitySchema } } },
      trActivity,
    );
  }
  app.get(
    '/api/tracearr/stats',
    { config: trConfig, schema: { response: { 200: tracearrStatsSchema } } },
    () => tracearr().stats(),
  );
  app.get(
    '/api/tracearr/charts',
    {
      config: trConfig,
      schema: {
        querystring: z.object({ period: z.string().catch('month') }),
        response: { 200: tracearrChartsSchema },
      },
    },
    async (request) => tracearr().charts(request.query.period),
  );
  app.get(
    '/api/tracearr/history',
    {
      config: trConfig,
      schema: {
        querystring: z.object({ cursor: z.string().catch('') }),
        response: { 200: tracearrHistorySchema },
      },
    },
    async (request) => {
      const cursor = request.query.cursor.trim();
      return tracearr().history(cursor === '' ? null : cursor);
    },
  );
  app.get(
    '/api/tracearr/users',
    { config: trConfig, schema: { response: { 200: tracearrUsersSchema } } },
    () => tracearr().users(),
  );
  // Fiche d'un utilisateur (P5d.2, V23) : historique et statistiques.
  app.get(
    '/api/tracearr/users/:id',
    {
      config: trConfig,
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: tracearrUserDetailSchema },
      },
    },
    async (request) => {
      const detail = await tracearr().userDetail(request.params.id);
      if (detail === null) throw new ApiError(404, 'NOT_FOUND', { service: 'tracearr' });
      return detail;
    },
  );
  app.get(
    '/api/tracearr/image',
    {
      config: trConfig,
      schema: {
        querystring: z.object({ server: z.string().catch(''), img: z.string().catch('') }),
      },
    },
    async (request, reply) =>
      sendImage(reply, await tracearr().image(request.query.server, request.query.img), 'tracearr'),
  );

  // ── Emby (n° 64-66) ──────────────────────────────────────────────────────
  const eConfig = { service: 'emby' as const };
  app.get(
    '/api/emby/activity',
    { config: eConfig, schema: { response: { 200: activitySchema } } },
    () => sharedActivity(instance, 'emby'),
  );
  app.get(
    '/api/emby/image',
    { config: eConfig, schema: { querystring: z.object({ item: z.string().catch('') }) } },
    async (request, reply) => sendImage(reply, await emby().image(request.query.item), 'emby'),
  );
  app.get(
    '/api/emby/quicklook/:itemId',
    {
      config: eConfig,
      schema: {
        params: z.object({ itemId: z.string().regex(/^[0-9a-fA-F]{1,32}$/) }),
        response: { 200: quickLookSchema },
      },
    },
    async (request) =>
      (await emby().resolveTmdbId(request.params.itemId)) ?? { type: null, id: null },
  );
};
