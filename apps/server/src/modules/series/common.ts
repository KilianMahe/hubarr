// SPDX-License-Identifier: AGPL-3.0-or-later
// Outils partagés des routes Sonarr (`/api/medias/:slug/series…` et
// `/api/medias/:slug/sonarr…`) : instance liée par la garde de service, client,
// cache de la bibliothèque. Les paramètres communs viennent des routes Radarr.

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SonarrClient } from '../../integrations/sonarr/client';
import type { InstanceRow } from '../instances/instances';
import { boundInstance, orNotFound } from '../movies/common';
import { sonarrClient } from '../services/clients';

export { idParams, positiveInt, rawQuery, scalar, slugParams } from '../movies/common';

export const SERIES_BASE = '/api/medias/:slug/series';
export const SONARR_BASE = '/api/medias/:slug/sonarr';
export const SONARR_CONFIG = { service: 'sonarr' as const };

export function sonarrInstance(request: FastifyRequest): InstanceRow {
  return boundInstance(request, 'sonarr');
}

export function sonarrOf(app: FastifyInstance, request: FastifyRequest): SonarrClient {
  return sonarrClient(app, sonarrInstance(request));
}

/** Vide la bibliothèque en cache de l'instance après une modification. */
export function invalidateSeries(app: FastifyInstance, request: FastifyRequest): void {
  app.cache.library.invalidate('sonarr', sonarrInstance(request).slug);
}

/** Série, épisode ou fichier absent de l'instance → 404 `NOT_FOUND`. */
export function sonarrOrNotFound<T>(run: () => Promise<T>): Promise<T> {
  return orNotFound(run, 'sonarr');
}

/** Seuls les champs fournis partent à l'instance (les `isset` de l'original). */
export function definedFields<T extends object>(
  fields: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}
