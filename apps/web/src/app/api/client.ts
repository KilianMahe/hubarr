// SPDX-License-Identifier: AGPL-3.0-or-later
// Client HTTP de l'API Hubarr : JSON, cookie de session, jeton CSRF sur toutes
// les mutations (en-tête `x-csrf-token`) et erreurs au format
// `{ code, message?, details? }` converties en `ApiError` (messages traduits
// par le front d'après `code`).
//
// Le jeton vient de `GET /api/bootstrap` ; la connexion et l'assistant
// régénèrent la session, l'appelant remplace alors le jeton (`setCsrfToken`).
// Un 403 `CSRF` (session expirée entre-temps) est rejoué une fois après avoir
// redemandé un jeton.

import {
  CSRF_HEADER,
  apiErrorSchema,
  csrfTokenResponseSchema,
  type ApiErrorCode,
} from '@hubarr/shared';
import type { z } from 'zod';
import { appUrl } from '../base-path';

export class ApiError extends Error {
  override readonly name = 'ApiError';
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | 'NETWORK' | 'INVALID_RESPONSE',
    readonly details?: unknown,
    readonly retryAfter?: number,
    /** Message du serveur (texte d'un service tiers pour `UPSTREAM_ERROR`), non traduit. */
    readonly serverMessage?: string,
  ) {
    super(code);
  }
}

/** Problème de validation tel que l'API le renvoie dans `details` (clé i18n dans `message`). */
export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

/** Messages (clés i18n) des problèmes de validation d'une `ApiError`, dans l'ordre. */
export function validationMessages(error: unknown): string[] {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return [];
  return (error.details as Partial<ValidationIssue>[])
    .map((issue) => issue.message)
    .filter((message): message is string => typeof message === 'string');
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions<T> {
  method?: HttpMethod;
  /** Corps JSON, ou corps brut (`Blob`, `File`) envoyé tel quel. */
  body?: unknown;
  /** Schéma de la réponse ; sans schéma, la réponse est ignorée (204 attendu). */
  schema?: z.ZodType<T>;
  signal?: AbortSignal;
}

const MUTATIONS = new Set<HttpMethod>(['POST', 'PUT', 'PATCH', 'DELETE']);

export class ApiClient {
  private csrfToken: string | null = null;

  // Chemins `/api/…` préfixés au moment de l'appel (reverse proxy, matrice n° 65).
  constructor(
    private readonly fetcher: typeof fetch = (input, init) =>
      fetch(typeof input === 'string' ? appUrl(input) : input, init),
  ) {}

  setCsrfToken(token: string | null): void {
    this.csrfToken = token;
  }

  get<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    return this.request(path, { schema, ...(signal ? { signal } : {}) });
  }

  post<T = void>(path: string, body?: unknown, schema?: z.ZodType<T>): Promise<T> {
    return this.request(path, { method: 'POST', body, ...(schema ? { schema } : {}) });
  }

  async request<T>(path: string, options: RequestOptions<T> = {}, retried = false): Promise<T> {
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = { Accept: 'application/json' };
    let body: BodyInit | undefined;
    if (options.body instanceof Blob) {
      body = options.body;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    if (MUTATIONS.has(method) && this.csrfToken !== null) headers[CSRF_HEADER] = this.csrfToken;

    let response: Response;
    try {
      response = await this.fetcher(path, {
        method,
        headers,
        credentials: 'same-origin',
        ...(body === undefined ? {} : { body }),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ApiError(0, 'NETWORK');
    }

    if (!response.ok) {
      const error = await toApiError(response);
      if (error.code === 'CSRF' && MUTATIONS.has(method) && !retried) {
        await this.refreshCsrfToken();
        return this.request(path, options, true);
      }
      throw error;
    }
    if (!options.schema) return undefined as T;
    const parsed = options.schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw new ApiError(response.status, 'INVALID_RESPONSE');
    return parsed.data;
  }

  async refreshCsrfToken(): Promise<void> {
    const { token } = await this.get('/api/auth/csrf', csrfTokenResponseSchema);
    this.csrfToken = token;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  const retryAfter = Number(response.headers.get('retry-after'));
  const parsed = apiErrorSchema.safeParse(await response.json().catch(() => undefined));
  const code = parsed.success ? parsed.data.code : 'INTERNAL';
  return new ApiError(
    response.status,
    code,
    parsed.success ? parsed.data.details : undefined,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    parsed.success ? parsed.data.message : undefined,
  );
}

/** Client partagé de l'application. */
export const api = new ApiClient();
