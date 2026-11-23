// SPDX-License-Identifier: AGPL-3.0-or-later
// Fabrique du client TMDB : clé d'API des paramètres, langue des métadonnées
// (`display_metadata_language`), cache en mémoire de l'application.

import type { FastifyInstance } from 'fastify';
import { HttpClient, apiKeyQuery } from '../../integrations/http';
import { TMDB_TIMEOUT_MS, TmdbClient } from '../../integrations/tmdb/client';
import { tmdbApiOrigin } from '../../integrations/tmdb/origin';
import { hasRequiredFields, readServiceConfig } from '../services/config';
import { readResolvedPreferences } from '../settings/preferences';

/** Client TMDB ; `configured` vaut `false` si TMDB est désactivé ou sans clé. */
export function tmdbClient(app: FastifyInstance): TmdbClient {
  const config = readServiceConfig(app.db, 'tmdb');
  const usable = config.enabled && hasRequiredFields('tmdb', config);
  const http = usable
    ? new HttpClient({
        service: 'tmdb',
        baseUrl: tmdbApiOrigin(),
        auth: apiKeyQuery('api_key', config.apiKey),
        health: app.upstream.health,
        logger: app.log,
        timeoutMs: TMDB_TIMEOUT_MS,
        ...(app.upstream.dispatcher ? { dispatcher: app.upstream.dispatcher } : {}),
      })
    : null;
  return new TmdbClient({
    http,
    store: app.cache.store,
    locale: readResolvedPreferences(app.db).display_metadata_language,
    logger: app.log,
  });
}
