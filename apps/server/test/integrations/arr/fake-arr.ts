// SPDX-License-Identifier: AGPL-3.0-or-later
// Faux serveur *arr pour les tests des clients : chaque appel est enregistré
// (méthode, chemin, requête, corps JSON) et reçoit la réponse déclarée par
// `on()`, sinon un 404.

import { MockAgent } from 'undici';
import { HttpClient, ServiceHealthCache, apiKeyHeader } from '../../../src/integrations/http';

export const ARR_ORIGIN = 'http://radarr.test:7878';

export interface RecordedCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}

type Responder = (call: RecordedCall) => { status: number; body?: unknown };

export interface FakeArr {
  agent: MockAgent;
  health: ServiceHealthCache;
  calls: RecordedCall[];
  http: HttpClient;
  /** Réponse d'une route (`body` sérialisé en JSON ; absent = corps vide). */
  on(method: string, path: string, body?: unknown, status?: number): void;
  onCall(method: string, path: string, responder: Responder): void;
  /** Dernier appel reçu (lève s'il n'y en a pas). */
  last(): RecordedCall;
}

export function fakeArr(service: 'radarr' | 'sonarr' = 'radarr', instance = 'radarr'): FakeArr {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const health = new ServiceHealthCache();
  const calls: RecordedCall[] = [];
  const routes = new Map<string, Responder>();

  agent
    .get(ARR_ORIGIN)
    .intercept({ path: () => true, method: () => true })
    .reply((options) => {
      const url = new URL(options.path, ARR_ORIGIN);
      const raw = typeof options.body === 'string' ? options.body : '';
      const call: RecordedCall = {
        method: options.method,
        path: url.pathname,
        query: url.searchParams,
        body: raw === '' ? undefined : (JSON.parse(raw) as unknown),
        headers: Object.fromEntries(
          Object.entries((options.headers ?? {}) as Record<string, string>).map(([k, v]) => [
            k.toLowerCase(),
            v,
          ]),
        ),
      };
      calls.push(call);
      const responder = routes.get(`${call.method} ${call.path}`);
      const response = responder ? responder(call) : { status: 404, body: { message: 'NotFound' } };
      return {
        statusCode: response.status,
        data: response.body === undefined ? '' : JSON.stringify(response.body),
        responseOptions: { headers: { 'content-type': 'application/json' } },
      };
    })
    .persist();

  const http = new HttpClient({
    service,
    instance,
    baseUrl: ARR_ORIGIN,
    auth: apiKeyHeader('X-Api-Key', 'secret'),
    health,
    dispatcher: agent,
  });

  return {
    agent,
    health,
    calls,
    http,
    on(method, path, body, status = 200) {
      routes.set(`${method} ${path}`, () => ({ status, body }));
    },
    onCall(method, path, responder) {
      routes.set(`${method} ${path}`, responder);
    },
    last() {
      const call = calls.at(-1);
      if (call === undefined) throw new Error('aucun appel reçu');
      return call;
    },
  };
}
