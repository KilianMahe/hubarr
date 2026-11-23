// SPDX-License-Identifier: AGPL-3.0-or-later
// Outils partagés des routes Radarr (`/api/medias/:slug/films…`) : paramètres,
// instance liée par la garde de service, client, cache de la bibliothèque.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import { isUpstreamError } from '../../integrations/http';
import type { RadarrClient } from '../../integrations/radarr/client';
import type { InstanceRow } from '../instances/instances';
import { radarrClient } from '../services/clients';

export const MOVIES_BASE = '/api/medias/:slug/films';
export const RADARR_CONFIG = { service: 'radarr' as const };

export const slugParams = z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/) });
export const idParams = slugParams.extend({ id: z.coerce.number().int().positive() });
export const rawQuery = z.record(z.string(), z.unknown());

/** Première valeur texte d'un paramètre de requête (`?a=1&a=2` → `1`). */
export function scalar(value: unknown): string {
  const first: unknown = Array.isArray(value) ? (value as unknown[])[0] : value;
  return typeof first === 'string' ? first : '';
}

/** Entier positif d'un paramètre de requête, sinon `fallback`. */
export function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(scalar(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function boundInstance(
  request: FastifyRequest,
  service: 'radarr' | 'sonarr' = 'radarr',
): InstanceRow {
  // Posée par la garde de service (`config.service`) avant le handler.
  if (request.instance === null) throw new ApiError(404, 'NOT_FOUND', { service });
  return request.instance;
}

export function clientOf(app: FastifyInstance, request: FastifyRequest): RadarrClient {
  return radarrClient(app, boundInstance(request));
}

/** Vide la bibliothèque en cache de l'instance après une modification. */
export function invalidateLibrary(app: FastifyInstance, request: FastifyRequest): void {
  app.cache.library.invalidate('radarr', boundInstance(request).slug);
}

/** Ressource absente de l'instance (404 de Radarr/Sonarr) → 404 `NOT_FOUND` de l'API. */
export async function orNotFound<T>(
  run: () => Promise<T>,
  service: 'radarr' | 'sonarr' = 'radarr',
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isUpstreamError(error) && error.kind === 'http' && error.info.status === 404) {
      throw new ApiError(404, 'NOT_FOUND', { service });
    }
    throw error;
  }
}
