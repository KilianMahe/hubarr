// SPDX-License-Identifier: AGPL-3.0-or-later
// Protection CSRF de **toutes** les mutations ; l'original ne
// protégeait que ses formulaires HTML.
//
// 1. Métadonnées de requête : `Sec-Fetch-Site` `cross-site` ou `same-site` est
//    refusé ; à défaut (navigateur ancien, client non navigateur), un en-tête
//    `Origin` doit désigner l'hôte servi.
// 2. Jeton de synchronisation : l'en-tête `X-CSRF-Token` doit être égal au jeton
//    rangé dans la session (anonyme avant la connexion, régénérée après). C'est
//    plus strict qu'un double-submit cookie et ne demande aucun secret.

import { timingSafeEqual } from 'node:crypto';
import { CSRF_HEADER } from '@hubarr/shared';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { ApiError } from '../http/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function sameValue(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Vrai si la requête ne vient visiblement pas d'une page de l'application. */
export function isCrossSiteRequest(request: FastifyRequest): boolean {
  const site = request.headers['sec-fetch-site'];
  if (site !== undefined) return site === 'cross-site' || site === 'same-site';
  const origin = request.headers.origin;
  if (origin === undefined) return false;
  try {
    // `request.host` suit X-Forwarded-Host derrière un proxy de confiance.
    return new URL(origin).host !== request.host;
  } catch {
    return true; // `Origin: null` (iframe sandboxée, redirection) ou valeur invalide
  }
}

const csrfPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    const provided = request.headers[CSRF_HEADER];
    const expected = request.session?.data.csrfToken;
    if (
      isCrossSiteRequest(request) ||
      typeof provided !== 'string' ||
      expected === undefined ||
      !sameValue(provided, expected)
    ) {
      throw new ApiError(403, 'CSRF');
    }
  });
};

export default fp(csrfPlugin, { name: 'hubarr-csrf', dependencies: ['hubarr-sessions'] });
