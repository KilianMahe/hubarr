// SPDX-License-Identifier: AGPL-3.0-or-later
// `GET /api/health` (`HealthController::health` d'origine) : santé de
// l'application, publique, utilisée par le HEALTHCHECK de l'image. 503 si la
// base ne répond pas, sans jamais exposer le détail de l'erreur.
//
// `GET /api/health/services` (`servicesHealth`) : état de chaque service et de
// chaque instance Radarr/Sonarr active, pour le menu santé, le tiroir et les
// paramètres. Utilisateur connecté requis ; limité à ce qu'il peut lire. Sondes lancées en parallèle, en
// cache 10 s (`ServiceHealthMonitor`).
//
// `GET /api/health/diagnose/:service` : diagnostic passif pour la bannière des
// pages d'un service (catégorie : injoignable, identifiants refusés, hôte
// bloqué…). L'URL du service n'est renvoyée qu'aux admins.

import {
  HEALTH_FLAT_SERVICES,
  appHealthResponseSchema,
  isServiceId,
  serviceDiagnosisResponseSchema,
  servicesHealthResponseSchema,
  type ServicesHealthResponse,
} from '@hubarr/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { getInstanceBySlug, listEnabledInstances } from '../instances/instances';
import { diagnose, savedValues } from '../services/diagnose';
import type { AccessScope } from '../users/access-scope';

export interface HealthRoutesOptions {
  now?: () => number;
}

/**
 * État de chaque service et de chaque instance Radarr/Sonarr active (menu
 * santé, tiroir, paramètres, flux temps réel `health`).
 */
export async function servicesHealth(
  app: FastifyInstance,
  now: () => number = Date.now,
): Promise<ServicesHealthResponse> {
  const monitor = app.serviceHealth;
  const flat = await Promise.all(
    HEALTH_FLAT_SERVICES.map(
      async (service) => [service, await monitor.isHealthy(service)] as const,
    ),
  );
  const services: Record<string, boolean | null> = Object.fromEntries(flat);
  const instances: ServicesHealthResponse['instances'] = { radarr: [], sonarr: [] };
  for (const type of ['radarr', 'sonarr'] as const) {
    const rows = listEnabledInstances(app.db, type);
    instances[type] = await Promise.all(
      rows.map(async (row) => ({
        slug: row.slug,
        name: row.name,
        state: await monitor.isHealthy(type, row.slug),
      })),
    );
    // État du service = ET de ses instances (rouge dès qu'une est injoignable).
    const states = instances[type].map((row) => row.state).filter((state) => state !== null);
    services[type] = states.length === 0 ? null : states.every(Boolean);
  }
  const all = [
    ...flat.map(([, state]) => state),
    ...instances.radarr.map((row) => row.state),
    ...instances.sonarr.map((row) => row.state),
  ];
  const known = all.filter((state) => state !== null);
  return {
    services,
    instances,
    ok: known.filter(Boolean).length,
    total: known.length,
    timestamp: new Date(now()).toISOString(),
  };
}

/**
 * Santé limitée aux services et instances que le compte peut lire ; l'état
 * de Radarr/Sonarr et les compteurs sont recalculés sur ce qui reste.
 */
export function scopeHealth(
  health: ServicesHealthResponse,
  scope: AccessScope,
): ServicesHealthResponse {
  if (scope.admin) return health;
  const services: Record<string, boolean | null> = {};
  for (const [id, state] of Object.entries(health.services)) {
    if (isServiceId(id) && id !== 'radarr' && id !== 'sonarr' && scope.can(id, null))
      services[id] = state;
  }
  const instances: ServicesHealthResponse['instances'] = { radarr: [], sonarr: [] };
  for (const type of ['radarr', 'sonarr'] as const) {
    instances[type] = health.instances[type].filter((row) => scope.can(type, row.slug));
    const states = instances[type].map((row) => row.state).filter((state) => state !== null);
    services[type] = states.length === 0 ? null : states.every(Boolean);
  }
  const known = [
    ...Object.entries(services)
      .filter(([id]) => id !== 'radarr' && id !== 'sonarr')
      .map(([, state]) => state),
    ...instances.radarr.map((row) => row.state),
    ...instances.sonarr.map((row) => row.state),
  ].filter((state) => state !== null);
  return {
    ...health,
    services,
    instances,
    ok: known.filter(Boolean).length,
    total: known.length,
  };
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (instance, options) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const now = options.now ?? Date.now;

  app.get(
    '/api/health',
    {
      config: { access: 'public' },
      schema: { response: { 200: appHealthResponseSchema, 503: appHealthResponseSchema } },
    },
    async (request, reply) => {
      const timestamp = new Date(now()).toISOString();
      void reply.header('cache-control', 'no-store');
      try {
        app.db.get(sql`SELECT 1`);
      } catch (error) {
        request.log.error({ err: error }, 'base de données injoignable');
        return reply.code(503).send({ status: 'error', db: 'unreachable', timestamp });
      }
      return { status: 'ok', db: 'ok', timestamp } as const;
    },
  );

  app.get(
    '/api/health/services',
    { config: { access: 'user' }, schema: { response: { 200: servicesHealthResponseSchema } } },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      return scopeHealth(await servicesHealth(app, now), request.access);
    },
  );

  app.get(
    '/api/health/diagnose/:service',
    {
      config: { access: 'user' },
      schema: {
        params: z.object({ service: z.string() }),
        querystring: z.object({ instance: z.string().optional() }),
        response: { 200: serviceDiagnosisResponseSchema },
      },
    },
    async (request, reply) => {
      const { service } = request.params;
      if (!isServiceId(service)) throw new ApiError(404, 'NOT_FOUND');
      const slug = request.query.instance;
      if (!request.access.can(service, slug ?? null)) throw new ApiError(403, 'FORBIDDEN');
      const instance =
        slug !== undefined && (service === 'radarr' || service === 'sonarr')
          ? getInstanceBySlug(app.db, service, slug)
          : undefined;
      if (instance === null) throw new ApiError(404, 'NOT_FOUND');
      const result = await diagnose(app.db, service, null, app.upstream, instance?.slug);
      const url = savedValues(app.db, service, instance).url;
      void reply.header('cache-control', 'no-store');
      return { ...result, url: request.user?.role === 'admin' && url !== '' ? url : null };
    },
  );
};
