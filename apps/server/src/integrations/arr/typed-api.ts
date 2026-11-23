// SPDX-License-Identifier: AGPL-3.0-or-later
// Appels typés d'après les types OpenAPI générés (`openapi-typescript`), sur le
// client de base `HttpClient` (disjoncteur, délais, erreurs normalisées). On
// n'utilise pas `openapi-fetch`, qui passerait par `fetch` et contournerait ce
// socle.
//
// Le chemin est le gabarit de la spec (`/api/v3/movie/{id}`) : ses paramètres,
// la requête, le corps et la réponse sont déduits de l'opération.

import type { HttpClient, Query, RequestOptions } from '../http';

export type HttpMethod = 'get' | 'post' | 'put' | 'delete';

/** Chemins de la spec qui déclarent la méthode `M`. */
export type PathsWith<P, M extends HttpMethod> = {
  [K in keyof P]: P[K] extends Record<M, infer O> ? ([O] extends [never] ? never : K) : never;
}[keyof P] &
  string;

export type Operation<P, K extends keyof P, M extends HttpMethod> =
  P[K] extends Record<M, infer O> ? O : never;

type ParametersOf<O> = O extends { parameters: infer A } ? A : never;

type PathParamsOf<O> = ParametersOf<O> extends { path: infer A } ? A : never;

type QueryOf<O> = ParametersOf<O> extends { query?: infer Q } ? Exclude<Q, undefined> : never;

type BodyOf<O> = O extends { requestBody?: infer B }
  ? Exclude<B, undefined> extends { content: { 'application/json': infer J } }
    ? J
    : never
  : never;

type SuccessStatus = 200 | 201 | 202 | 204;

/** Corps JSON de la première réponse 2xx (`unknown` si la spec n'en décrit pas). */
export type ResponseOf<O> = O extends { responses: infer R }
  ? {
      [S in keyof R]: S extends SuccessStatus
        ? R[S] extends { content: { 'application/json': infer J } }
          ? J
          : unknown
        : never;
    }[keyof R]
  : never;

/** Options d'un appel : paramètres de chemin (obligatoires s'il y en a), requête, corps. */
export type CallOptions<O> = ([PathParamsOf<O>] extends [never]
  ? { params?: never }
  : { params: PathParamsOf<O> }) &
  ([QueryOf<O>] extends [never] ? { query?: never } : { query?: QueryOf<O> }) &
  ([BodyOf<O>] extends [never] ? { body?: never } : { body?: BodyOf<O> }) &
  Pick<Partial<RequestOptions>, 'timeoutMs' | 'trackHealth'>;

type CallArgs<O> = [PathParamsOf<O>] extends [never]
  ? [options?: CallOptions<O>]
  : [options: CallOptions<O>];

/** Spécification d'une requête de `multiGet`. */
export interface MultiGetSpec<P> {
  path: PathsWith<P, 'get'>;
  params?: PathParams;
  query?: Query;
}

/** Remplace les `{nom}` du gabarit par les paramètres encodés. */
export type PathParams = Record<string, string | number>;

export function expandPath(template: string, params: PathParams | undefined): string {
  return template.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = params?.[name];
    if (value === undefined) {
      throw new TypeError(`paramètre de chemin manquant : ${name} (${template})`);
    }
    return encodeURIComponent(String(value));
  });
}

/**
 * Appels typés. Chaque méthode renvoie `null` si le corps de la réponse est
 * vide (`HttpClient`), ce que la spec ne dit pas : à l'appelant de choisir un
 * repli (`?? []`) ou d'exiger la ressource.
 */
export class TypedApi<P> {
  constructor(readonly http: HttpClient) {}

  get<K extends PathsWith<P, 'get'>>(
    path: K,
    ...args: CallArgs<Operation<P, K, 'get'>>
  ): Promise<ResponseOf<Operation<P, K, 'get'>> | null> {
    return this.#call('GET', path, args[0]);
  }

  post<K extends PathsWith<P, 'post'>>(
    path: K,
    ...args: CallArgs<Operation<P, K, 'post'>>
  ): Promise<ResponseOf<Operation<P, K, 'post'>> | null> {
    return this.#call('POST', path, args[0]);
  }

  put<K extends PathsWith<P, 'put'>>(
    path: K,
    ...args: CallArgs<Operation<P, K, 'put'>>
  ): Promise<ResponseOf<Operation<P, K, 'put'>> | null> {
    return this.#call('PUT', path, args[0]);
  }

  delete<K extends PathsWith<P, 'delete'>>(
    path: K,
    ...args: CallArgs<Operation<P, K, 'delete'>>
  ): Promise<ResponseOf<Operation<P, K, 'delete'>> | null> {
    return this.#call('DELETE', path, args[0]);
  }

  async #call<T>(
    method: string,
    template: string,
    options:
      | {
          params?: unknown;
          query?: unknown;
          body?: unknown;
          timeoutMs?: number;
          trackHealth?: boolean;
        }
      | undefined,
  ): Promise<T> {
    const request: RequestOptions = {
      method,
      path: expandPath(template, options?.params as PathParams | undefined),
    };
    // Les types de requête générés (nombres, booléens, tableaux, énumérations)
    // sont tous des `Query` valides.
    if (options?.query !== undefined) request.query = options.query as Query;
    if (options?.body !== undefined) request.json = options.body;
    if (options?.timeoutMs !== undefined) request.timeoutMs = options.timeoutMs;
    if (options?.trackHealth !== undefined) request.trackHealth = options.trackHealth;
    return (await this.http.request<T>(request)).data;
  }
}
