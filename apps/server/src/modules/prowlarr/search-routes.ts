// SPDX-License-Identifier: AGPL-3.0-or-later
// Prowlarr, recherche multi-indexeurs et grab (P3c.2) : port de
// `ProwlarrController::search` et `grab` (`ProwlarrGrabTest`).
//
// Écarts : recherche limitée à 90 s au lieu de 8 s (Prowlarr
// interroge chaque indexeur en direct), trop longue → 504 `SEARCH_TIMED_OUT` ;
// résultats sans lien de téléchargement ni lien magnet ; grab refusé par
// Prowlarr → 502 avec son message (l'original : `{ ok: false, error }` en 200).

import {
  PROWLARR_SEARCH_MIN_LENGTH,
  arrOkSchema,
  prowlarrGrabRequestSchema,
  prowlarrReleaseSchema,
  prowlarrSearchQuerySchema,
} from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { isUpstreamError } from '../../integrations/http';
import { PROWLARR_BASE, PROWLARR_CONFIG, prowlarrClient } from './common';

export function registerSearchRoutes(instance: FastifyInstance): void {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const base = PROWLARR_BASE;
  const config = PROWLARR_CONFIG;

  // n° 246 : moins de deux caractères → aucun résultat, sans appeler Prowlarr.
  app.get(
    `${base}/search`,
    {
      config,
      schema: {
        querystring: prowlarrSearchQuerySchema,
        response: { 200: z.array(prowlarrReleaseSchema) },
      },
    },
    async (request, reply) => {
      const query = request.query.q.trim();
      void reply.header('cache-control', 'no-store');
      if (query.length < PROWLARR_SEARCH_MIN_LENGTH) return [];
      try {
        return await prowlarrClient(instance).search(query, request.query.indexerId);
      } catch (error) {
        if (isUpstreamError(error) && error.kind === 'timeout') {
          throw new ApiError(504, 'SEARCH_TIMED_OUT', { service: 'prowlarr' });
        }
        throw error;
      }
    },
  );

  // n° 247 : `guid` et `indexerId` requis (400 sans appeler Prowlarr).
  app.post(
    `${base}/grab`,
    { config, schema: { body: prowlarrGrabRequestSchema, response: { 200: arrOkSchema } } },
    async (request) => {
      await prowlarrClient(instance).grab(request.body.guid, request.body.indexerId);
      return { ok: true as const };
    },
  );
}
