// SPDX-License-Identifier: AGPL-3.0-or-later
// Erreurs de l'API au format unique `{ code, message?, service?, details? }`
//. Les routes lèvent une `ApiError` ; le gestionnaire global convertit
// aussi les erreurs de validation zod et celles de Fastify (corps illisible ou trop gros).

import type { ApiErrorBody, ApiErrorCode } from '@hubarr/shared';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { UpstreamError } from '../integrations/http/errors';

export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    readonly extra: Omit<ApiErrorBody, 'code'> = {},
  ) {
    super(extra.message ?? code);
  }

  toBody(): ApiErrorBody {
    return { code: this.code, ...this.extra };
  }
}

function hasStatusCode(error: unknown): error is Error & { statusCode: number; code?: string } {
  return (
    error instanceof Error && typeof (error as { statusCode?: unknown }).statusCode === 'number'
  );
}

/** Convertit n'importe quelle erreur en statut HTTP et corps normalisé. */
export function toApiError(error: unknown): { status: number; body: ApiErrorBody } {
  if (error instanceof ApiError) return { status: error.statusCode, body: error.toBody() };
  if (error instanceof UpstreamError) return upstreamToApiError(error);
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        code: 'VALIDATION',
        details: error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          code: issue.code,
          message: issue.message,
        })),
      },
    };
  }
  if (hasStatusCode(error) && error.statusCode >= 400 && error.statusCode < 500) {
    if (error.statusCode === 413) return { status: 413, body: { code: 'PAYLOAD_TOO_LARGE' } };
    if (error.statusCode === 404) return { status: 404, body: { code: 'NOT_FOUND' } };
    // JSON invalide, type de contenu non pris en charge, etc.
    return { status: 400, body: { code: 'VALIDATION', message: error.message } };
  }
  return { status: 500, body: { code: 'INTERNAL' } };
}

/**
 * Erreur d'un service tiers (`ApiClientErrorTrait` d'origine) : 409 si le service
 * n'est pas configuré, 503 s'il est injoignable, 502 s'il a répondu en erreur.
 * `details` porte la méthode, le chemin et le statut reçus (jamais l'URL ni une clé).
 */
export function upstreamToApiError(error: UpstreamError): { status: number; body: ApiErrorBody } {
  const { info } = error;
  const details = {
    kind: error.kind,
    ...(info.instance === undefined ? {} : { instance: info.instance }),
    ...(info.method === undefined ? {} : { method: info.method }),
    ...(info.path === undefined ? {} : { path: info.path }),
    ...(info.status === undefined ? {} : { status: info.status }),
    ...(info.networkCode === undefined ? {} : { networkCode: info.networkCode }),
  };
  const body = (code: ApiErrorCode): ApiErrorBody => ({
    code,
    service: info.service,
    ...(info.message === undefined ? {} : { message: info.message }),
    details,
  });
  if (error.kind === 'not_configured') return { status: 409, body: body('SERVICE_NOT_CONFIGURED') };
  if (error.unreachable) return { status: 503, body: body('SERVICE_UNREACHABLE') };
  return { status: 502, body: body('UPSTREAM_ERROR') };
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const { status, body } = toApiError(error);
    if (status >= 500) request.log.error({ err: error }, 'erreur interne');
    return reply.code(status).send(body);
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ code: 'NOT_FOUND' }));
}
