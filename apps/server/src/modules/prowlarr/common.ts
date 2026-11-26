// SPDX-License-Identifier: AGPL-3.0-or-later
// Outils partagés des routes Prowlarr (P3c) : base des chemins (`/api` +
// chemin source, règle R1), garde de service, client, paramètres.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import { isUpstreamError } from '../../integrations/http';
import { ProwlarrClient } from '../../integrations/prowlarr/client';
import { apiKeyServiceClient } from '../services/clients';

export const PROWLARR_BASE = '/api/prowlarr';
/** Garde de service : désactivé ou non configuré → 409 (D67). */
export const PROWLARR_CONFIG = { service: 'prowlarr' as const };
/** Réglages et système de Prowlarr (pages ouvertes depuis les paramètres) : admins seulement. */
export const PROWLARR_ADMIN_CONFIG = { service: 'prowlarr' as const, permission: 'admin' as const };

/** Identifiant numérique positif d'un élément (`:id`). */
export const prowlarrIdParams = z.object({ id: z.coerce.number().int().positive() });

export function prowlarrClient(app: FastifyInstance): ProwlarrClient {
  return new ProwlarrClient(apiKeyServiceClient(app, 'prowlarr'));
}

/** Ressource absente de Prowlarr (404) → 404 `NOT_FOUND` de l'API. */
export async function orNotFound<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isUpstreamError(error) && error.kind === 'http' && error.info.status === 404) {
      throw new ApiError(404, 'NOT_FOUND', { service: 'prowlarr' });
    }
    throw error;
  }
}
