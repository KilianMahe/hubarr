// SPDX-License-Identifier: AGPL-3.0-or-later
// Client HTTP de base des intégrations, sur undici.
//
// Reprend les réglages communs des clients cURL d'origine :
// - http et https seulement, aucune redirection suivie ;
// - délai de connexion de 4 s, délai total de 8 s par défaut (réglable par appel) ;
// - disjoncteur par service et instance (`ServiceHealthCache`) : seul un échec de
//   **connexion** l'ouvre ; une lecture trop lente après connexion ne marque pas
//   le service injoignable (issue #41 de Prismarr) ; un succès le referme ;
// - erreurs normalisées (`UpstreamError`) avec le message extrait de la réponse,
//   et corps nettoyé (clés, magnets) avant d'aller dans les logs.
//
// Pas de rejeu automatique des requêtes, comme l'original, sauf le rejeu unique
// demandé par une stratégie d'authentification (session expirée, jeton
// Transmission).

import type { ServiceId } from '@hubarr/shared';
import { Agent, request as undiciRequest, type Dispatcher } from 'undici';
import { noAuth, type AuthStrategy, type OutgoingRequest, type ResponseHead } from './auth';
import type { ServiceHealthCache } from './circuit-breaker';
import { UpstreamError, extractApiErrorMessage, sanitizeLogBody } from './errors';
import { staticUrlBlockedReason } from './url-guard';

export const CONNECT_TIMEOUT_MS = 4_000;
export const DEFAULT_TIMEOUT_MS = 8_000;

/** Codes réseau d'une connexion non établie (le disjoncteur s'ouvre). */
const CONNECT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EHOSTDOWN',
  'ETIMEDOUT',
  'ECONNRESET',
  'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_SSL_WRONG_VERSION_NUMBER',
  'EPROTO',
]);

/** Codes d'une réponse trop lente, connexion établie (le disjoncteur reste fermé). */
const READ_TIMEOUT_CODES = new Set(['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);

let sharedAgent: Agent | null = null;

/** Agent partagé : pool de connexions par origine, délai de connexion de 4 s. */
export function defaultDispatcher(): Dispatcher {
  sharedAgent ??= new Agent({ connect: { timeout: CONNECT_TIMEOUT_MS } });
  return sharedAgent;
}

export interface UpstreamLogger {
  warn(obj: object, msg: string): void;
}

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue | readonly QueryValue[]>;

export type ResponseType = 'json' | 'text' | 'bytes' | 'none';

export interface RequestOptions {
  method?: string;
  /** Chemin relatif à l'URL de base du service (`/api/v3/movie`). */
  path: string;
  query?: Query;
  /** Corps JSON (sérialisé, `Content-Type: application/json`). */
  json?: unknown;
  /** Corps formulaire (`application/x-www-form-urlencoded`). */
  form?: Record<string, string>;
  /** Corps brut (le `Content-Type` va dans `headers`). */
  body?: string | Uint8Array;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** `json` par défaut ; un corps vide donne `null`. */
  responseType?: ResponseType;
  /** Statuts acceptés en plus des 2xx (Transmission : 409 traité par la stratégie). */
  acceptStatus?: (status: number) => boolean;
  /** Appel sans les identifiants (connexion d'une session par cookie). */
  skipAuth?: boolean;
  /**
   * `false` : l'appel ne consulte ni ne modifie le disjoncteur ; l'appelant
   * applique sa propre règle (`multiGet` : seul l'échec du lot entier compte).
   */
  trackHealth?: boolean;
}

export interface UpstreamResponse<T> {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  data: T;
  latencyMs: number;
}

/** Résultat d'une sonde (`probe`) : jamais d'exception, aucun effet sur le disjoncteur. */
export interface ProbeResult {
  status: number | null;
  headers: Record<string, string | string[] | undefined>;
  body: string | null;
  /** Échec avant toute réponse (réseau, délai, URL refusée). */
  error: UpstreamError | null;
  latencyMs: number;
}

export interface HttpClientOptions {
  service: ServiceId;
  /** Slug de l'instance (disjoncteur par instance pour Radarr/Sonarr). */
  instance?: string | undefined;
  baseUrl: string;
  auth?: AuthStrategy;
  health: ServiceHealthCache;
  dispatcher?: Dispatcher;
  logger?: UpstreamLogger;
  timeoutMs?: number;
  /** En-têtes ajoutés à chaque requête (`Accept`, `Referer` de qBittorrent…). */
  headers?: Record<string, string>;
  /** Horloge monotone (latence) injectable. */
  clock?: () => number;
}

interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Dispatcher.ResponseData['body'];
}

export class HttpClient {
  readonly service: ServiceId;
  readonly instance: string | undefined;
  readonly baseUrl: string;
  readonly #auth: AuthStrategy;
  readonly #health: ServiceHealthCache;
  readonly #dispatcher: Dispatcher;
  readonly #logger: UpstreamLogger | undefined;
  readonly #timeoutMs: number;
  readonly #headers: Record<string, string>;
  readonly #clock: () => number;

  constructor(options: HttpClientOptions) {
    this.service = options.service;
    this.instance = options.instance;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#auth = options.auth ?? noAuth;
    this.#health = options.health;
    this.#dispatcher = options.dispatcher ?? defaultDispatcher();
    this.#logger = options.logger;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#headers = lowerKeys({ accept: 'application/json', ...options.headers });
    this.#clock = options.clock ?? (() => performance.now());
  }

  get auth(): AuthStrategy {
    return this.#auth;
  }

  /** Disjoncteur partagé (règles propres à un appelant, `multiGet`). */
  get health(): ServiceHealthCache {
    return this.#health;
  }

  async get<T = unknown>(
    path: string,
    query?: Query,
    options: Partial<RequestOptions> = {},
  ): Promise<T> {
    return (await this.request<T>({ ...options, method: 'GET', path, ...(query ? { query } : {}) }))
      .data;
  }

  async post<T = unknown>(
    path: string,
    json?: unknown,
    options: Partial<RequestOptions> = {},
  ): Promise<T> {
    return (await this.request<T>({ ...options, method: 'POST', path, json })).data;
  }

  async put<T = unknown>(
    path: string,
    json?: unknown,
    options: Partial<RequestOptions> = {},
  ): Promise<T> {
    return (await this.request<T>({ ...options, method: 'PUT', path, json })).data;
  }

  async delete<T = unknown>(
    path: string,
    query?: Query,
    options: Partial<RequestOptions> = {},
  ): Promise<T> {
    return (
      await this.request<T>({ ...options, method: 'DELETE', path, ...(query ? { query } : {}) })
    ).data;
  }

  /**
   * Appel normal : passe par le disjoncteur, lève une `UpstreamError` sur tout
   * échec (réseau, délai, statut hors 2xx, JSON illisible).
   */
  async request<T = unknown>(options: RequestOptions): Promise<UpstreamResponse<T>> {
    const method = (options.method ?? 'GET').toUpperCase();
    const base = { service: this.service, instance: this.instance, method, path: options.path };
    const track = options.trackHealth !== false;
    if (track && this.#health.isDown(this.service, this.instance)) {
      throw new UpstreamError('circuit_open', { ...base, message: 'service marked down' });
    }

    const started = this.#clock();
    let response: RawResponse;
    try {
      response = await this.#send(options, method);
      if (this.#auth.shouldRetry && (await this.#auth.shouldRetry(head(response)))) {
        await response.body.dump();
        response = await this.#send(options, method);
      }
    } catch (error) {
      const upstream = this.#toUpstreamError(error, base);
      if (track && upstream.kind === 'network') this.#health.markDown(this.service, this.instance);
      this.#logger?.warn(
        {
          service: this.service,
          instance: this.instance,
          method,
          path: options.path,
          kind: upstream.kind,
          code: upstream.info.networkCode,
        },
        `${this.service}: ${method} ${options.path} → ${upstream.message}`,
      );
      throw upstream;
    }

    const status = response.status;
    const accepted = (status >= 200 && status < 300) || (options.acceptStatus?.(status) ?? false);
    if (!accepted) {
      const body = await safeText(response.body);
      if (track) this.#health.clear(this.service, this.instance);
      this.#logger?.warn(
        {
          service: this.service,
          instance: this.instance,
          method,
          path: options.path,
          status,
          body: sanitizeLogBody(body),
        },
        `${this.service}: ${method} ${options.path} → HTTP ${status}`,
      );
      throw new UpstreamError('http', {
        ...base,
        status,
        message: extractApiErrorMessage(body, status),
      });
    }

    if (track) this.#health.clear(this.service, this.instance);
    const data = await this.#parse<T>(response, options.responseType ?? 'json', {
      ...base,
      status,
    });
    return {
      status,
      headers: response.headers,
      data,
      latencyMs: Math.round(this.#clock() - started),
    };
  }

  /**
   * Sonde du « Tester la connexion » et du diagnostic : ignore le disjoncteur,
   * ne le modifie pas, ne lève jamais et renvoie le statut et le corps bruts.
   */
  async probe(options: RequestOptions): Promise<ProbeResult> {
    const method = (options.method ?? 'GET').toUpperCase();
    const started = this.#clock();
    const elapsed = () => Math.round(this.#clock() - started);
    try {
      let response = await this.#send(options, method);
      if (this.#auth.shouldRetry && (await this.#auth.shouldRetry(head(response)))) {
        await response.body.dump();
        response = await this.#send(options, method);
      }
      const body = await safeText(response.body);
      return {
        status: response.status,
        headers: response.headers,
        body,
        error: null,
        latencyMs: elapsed(),
      };
    } catch (error) {
      return {
        status: null,
        headers: {},
        body: null,
        error: this.#toUpstreamError(error, {
          service: this.service,
          instance: this.instance,
          method,
          path: options.path,
        }),
        latencyMs: elapsed(),
      };
    }
  }

  /** URL complète d'un chemin, sans identifiants (logs, tests). */
  urlFor(path: string, query?: Query): URL {
    const url = new URL(this.baseUrl + (path.startsWith('/') ? path : `/${path}`));
    if (query) appendQuery(url, query);
    return url;
  }

  async #send(options: RequestOptions, method: string): Promise<RawResponse> {
    const reason = staticUrlBlockedReason(this.baseUrl);
    if (reason !== null) throw new BlockedUrlError(reason);

    const outgoing: OutgoingRequest = {
      method,
      url: this.urlFor(options.path, options.query),
      headers: { ...this.#headers, ...lowerKeys(options.headers ?? {}) },
    };
    let body: string | Uint8Array | undefined = options.body;
    if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      outgoing.headers['content-type'] ??= 'application/json';
    } else if (options.form !== undefined) {
      body = new URLSearchParams(options.form).toString();
      outgoing.headers['content-type'] ??= 'application/x-www-form-urlencoded';
    }
    if (options.skipAuth !== true) await this.#auth.apply(outgoing);

    const timeoutMs = options.timeoutMs ?? this.#timeoutMs;
    const response = await undiciRequest(outgoing.url, {
      method: outgoing.method,
      headers: outgoing.headers,
      body: body ?? null,
      dispatcher: this.#dispatcher,
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: response.statusCode, headers: response.headers, body: response.body };
  }

  async #parse<T>(
    response: RawResponse,
    type: ResponseType,
    info: ConstructorParameters<typeof UpstreamError>[1],
  ): Promise<T> {
    if (type === 'none') {
      await response.body.dump();
      return null as T;
    }
    if (type === 'bytes') return new Uint8Array(await response.body.arrayBuffer()) as T;
    const text = await response.body.text();
    if (type === 'text') return text as T;
    if (text.trim() === '') return null as T;
    try {
      return JSON.parse(text) as T;
    } catch (cause) {
      throw new UpstreamError('invalid_response', { ...info, message: 'invalid JSON', cause });
    }
  }

  #toUpstreamError(
    error: unknown,
    base: { service: ServiceId; instance: string | undefined; method: string; path: string },
  ): UpstreamError {
    if (error instanceof UpstreamError) return error;
    if (error instanceof BlockedUrlError) {
      return new UpstreamError('blocked', {
        ...base,
        networkCode: error.reason,
        message: `blocked: ${error.reason}`,
      });
    }
    const code = errorCode(error);
    const message = error instanceof Error ? error.message : String(error);
    if (isTimeout(error) || (code !== undefined && READ_TIMEOUT_CODES.has(code))) {
      return new UpstreamError('timeout', {
        ...base,
        networkCode: code ?? 'TIMEOUT',
        message: 'timeout',
        cause: error,
      });
    }
    // Tout autre échec survient avant une réponse : connexion non établie.
    const known = code !== undefined && CONNECT_ERROR_CODES.has(code);
    return new UpstreamError('network', {
      ...base,
      networkCode: code,
      message: known ? code : message,
      cause: error,
    });
  }
}

class BlockedUrlError extends Error {
  constructor(readonly reason: string) {
    super(`blocked: ${reason}`);
  }
}

function head(response: RawResponse): ResponseHead {
  return { status: response.status, headers: response.headers };
}

function lowerKeys(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function appendQuery(url: URL, query: Query): void {
  for (const [key, raw] of Object.entries(query)) {
    const values = Array.isArray(raw) ? (raw as readonly QueryValue[]) : [raw as QueryValue];
    for (const value of values) {
      if (value === undefined || value === null) continue;
      url.searchParams.append(key, String(value));
    }
  }
}

async function safeText(body: RawResponse['body']): Promise<string> {
  try {
    return await body.text();
  } catch {
    return '';
  }
}

/** Code d'erreur réseau, en suivant la chaîne des causes (undici enveloppe les erreurs système). */
function errorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && code !== '' && code !== 'UND_ERR_ABORTED') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function isTimeout(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth++) {
    if ((current as { name?: unknown }).name === 'TimeoutError') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
