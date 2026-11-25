// SPDX-License-Identifier: AGPL-3.0-or-later
// Erreurs des services tiers (« upstream »). Port de `extractApiErrorMessage`,
// `recordError` et `sanitizeLogBody` des clients PHP, et de
// `ApiClientErrorTrait` : l'erreur garde la méthode, le chemin, le statut et le
// message extrait de la réponse, que l'API renvoie au front.

import type { ServiceId } from '@hubarr/shared';

/**
 * - `not_configured` : URL ou identifiants absents (ou service désactivé) ;
 * - `circuit_open` : le service a été vu injoignable il y a moins de 10 s ;
 * - `blocked` : URL refusée avant toute connexion (schéma, hôte, lien local) ;
 * - `network` : échec de connexion (DNS, refus, délai de connexion, TLS) ;
 * - `timeout` : connecté, mais la réponse n'est pas arrivée à temps ;
 * - `http` : réponse hors 2xx ;
 * - `invalid_response` : corps illisible (JSON invalide, forme inattendue).
 */
export const UPSTREAM_ERROR_KINDS = [
  'not_configured',
  'circuit_open',
  'blocked',
  'network',
  'timeout',
  'http',
  'invalid_response',
] as const;
export type UpstreamErrorKind = (typeof UPSTREAM_ERROR_KINDS)[number];

export interface UpstreamErrorInfo {
  service: ServiceId;
  /** Slug de l'instance (Radarr/Sonarr). */
  instance?: string | undefined;
  method?: string | undefined;
  /** Chemin appelé, sans la requête (jamais de clé d'API). */
  path?: string | undefined;
  /** Statut HTTP reçu (`http`, `invalid_response`). */
  status?: number | undefined;
  /** Code de l'erreur réseau (`ECONNREFUSED`, `ENOTFOUND`, `UND_ERR_CONNECT_TIMEOUT`…). */
  networkCode?: string | undefined;
  /** Message lisible extrait de la réponse ou de l'erreur réseau. */
  message?: string | undefined;
  cause?: unknown;
}

export class UpstreamError extends Error {
  override readonly name = 'UpstreamError';

  constructor(
    readonly kind: UpstreamErrorKind,
    readonly info: UpstreamErrorInfo,
  ) {
    super(info.message ?? kind, info.cause === undefined ? undefined : { cause: info.cause });
  }

  get service(): ServiceId {
    return this.info.service;
  }

  /** Le service n'a pas pu être joint (par opposition à une réponse en erreur). */
  get unreachable(): boolean {
    return (
      this.kind === 'circuit_open' ||
      this.kind === 'network' ||
      this.kind === 'timeout' ||
      this.kind === 'blocked'
    );
  }
}

export function isUpstreamError(error: unknown): error is UpstreamError {
  return error instanceof UpstreamError;
}

/** Clés de message reconnues dans les corps d'erreur JSON, par priorité. */
const MESSAGE_KEYS = ['errorMessage', 'error', 'message', 'detail'] as const;

function messageOf(entry: Record<string, unknown>): string | null {
  for (const key of MESSAGE_KEYS) {
    const value = entry[key];
    if (typeof value === 'string' && value !== '') return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Message lisible tiré d'une réponse en erreur : objet JSON (`errorMessage`,
 * `error`, `message`, `detail`), tableau d'erreurs de validation
 * (`[{ propertyName, errorMessage }]`, joints par « ; »), corps brut de moins de
 * 200 caractères, sinon l'erreur réseau, sinon `HTTP <code>`.
 */
export function extractApiErrorMessage(body: string, status: number, networkError = ''): string {
  const trimmed = body.trim();
  let decoded: unknown = null;
  if (trimmed !== '') {
    try {
      decoded = JSON.parse(trimmed);
    } catch {
      decoded = null;
    }
  }

  if (Array.isArray(decoded) && isRecord(decoded[0])) {
    const messages: string[] = [];
    for (const entry of decoded) {
      if (!isRecord(entry)) continue;
      const message = messageOf(entry);
      if (message === null) continue;
      const property = typeof entry.propertyName === 'string' ? entry.propertyName : '';
      messages.push(property === '' ? message : `${property}: ${message}`);
    }
    if (messages.length > 0) return messages.join('; ');
  }
  if (isRecord(decoded)) {
    // Erreur Fastify (`{ statusCode, error, message }`, Tracearr…) : `error`
    // n'est que le nom du statut (« InternalServerError »), la cause est dans `message`.
    if (
      typeof decoded.statusCode === 'number' &&
      typeof decoded.message === 'string' &&
      decoded.message !== ''
    )
      return decoded.message;
    const message = messageOf(decoded);
    if (message !== null) return message;
  }

  if (trimmed !== '' && trimmed.length < 200) return trimmed;
  if (networkError !== '') return networkError;
  return `HTTP ${status}`;
}

/**
 * Corps de réponse nettoyé avant d'aller dans les logs : liens magnet, clés
 * d'API (forme `api_key=…` et forme JSON `"apiKey": "…"`), puis tronqué à 200
 * caractères.
 */
export function sanitizeLogBody(body: string | null | undefined): string {
  if (body === null || body === undefined || body === '') return '';
  let clean = body
    .replace(/magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^\s"']*/g, '[magnet]')
    .replace(/(api[_-]?key)=[^&"'\s]+/gi, '$1=[redacted]')
    .replace(/("api[_-]?[Kk]ey"\s*:\s*)"[^"]+"/g, '$1"[redacted]"');
  // Tronqué en points de code (`mb_substr` de l'original), pas en unités UTF-16.
  const chars = Array.from(clean);
  if (chars.length > 200) clean = `${chars.slice(0, 200).join('')}…`;
  return clean;
}
