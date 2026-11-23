// SPDX-License-Identifier: AGPL-3.0-or-later
// Environnement de test des clients de téléchargement (P3d) : application,
// admin connecté, faux upstream générique (corps JSON, formulaire ou texte,
// en-têtes de réponse) par origine.

import type { FastifyInstance } from 'fastify';
import { MockAgent } from 'undici';
import { buildApp } from '../../../src/app';
import type { AppDatabase } from '../../../src/db/client';
import { applyServicePatch } from '../../../src/modules/services/config';
import { TestBrowser, UNUSED_DATA_DIR, createTestDatabase, createUser } from '../../helpers';
import { EMAIL, PASSWORD, noDns } from '../movies/radarr-env';

export interface UpstreamCall {
  method: string;
  path: string;
  query: URLSearchParams;
  raw: string;
  body: unknown;
  headers: Record<string, string>;
}
export interface UpstreamReply {
  status?: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string | string[]>;
}
type Responder = (call: UpstreamCall) => UpstreamReply;

export function fakeUpstream(agent: MockAgent, origin: string) {
  const calls: UpstreamCall[] = [];
  const routes = new Map<string, Responder>();
  agent
    .get(origin)
    .intercept({ path: () => true, method: () => true })
    .reply((options) => {
      const url = new URL(options.path, origin);
      const raw =
        typeof options.body === 'string'
          ? options.body
          : options.body instanceof Uint8Array
            ? Buffer.from(options.body).toString('latin1')
            : '';
      let body: unknown;
      if (raw !== '') {
        try {
          body = JSON.parse(raw) as unknown;
        } catch {
          body = Object.fromEntries(new URLSearchParams(raw));
        }
      }
      const headers = Object.fromEntries(
        Object.entries((options.headers ?? {}) as Record<string, string>).map(([k, v]) => [
          k.toLowerCase(),
          v,
        ]),
      );
      const call = {
        method: options.method,
        path: url.pathname,
        query: url.searchParams,
        raw,
        body,
        headers,
      };
      calls.push(call);
      const rpc = isRpc(body) ? `${call.method} ${call.path}#${body.method}` : null;
      const responder =
        (rpc === null ? undefined : routes.get(rpc)) ?? routes.get(`${call.method} ${call.path}`);
      const reply = responder ? responder(call) : { status: 404, text: 'Not Found' };
      return {
        statusCode: reply.status ?? 200,
        data: reply.text ?? (reply.body === undefined ? '' : JSON.stringify(reply.body)),
        responseOptions: {
          headers: {
            'content-type': reply.text === undefined ? 'application/json' : 'text/plain',
            ...reply.headers,
          },
        },
      };
    })
    .persist();
  return {
    calls,
    /** Route `METHODE /chemin`, ou `METHODE /chemin#méthode-rpc` pour un corps JSON-RPC. */
    on(route: string, reply: UpstreamReply | Responder) {
      routes.set(route, typeof reply === 'function' ? reply : () => reply);
    },
    callsTo(route: string) {
      const [method, rest] = route.split(' ');
      const [path, rpcMethod] = (rest ?? '').split('#');
      return calls.filter(
        (call) =>
          call.method === method &&
          call.path === path &&
          (rpcMethod === undefined || (isRpc(call.body) && call.body.method === rpcMethod)),
      );
    },
  };
}
export type FakeUpstream = ReturnType<typeof fakeUpstream>;

function isRpc(body: unknown): body is { method: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { method?: unknown }).method === 'string'
  );
}

export const ORIGINS = {
  qbittorrent: 'http://qbit.test:8080',
  transmission: 'http://transmission.test:9091',
  deluge: 'http://deluge.test:8112',
  gluetun: 'http://gluetun.test:8000',
  sabnzbd: 'http://sab.test:8080',
  nzbget: 'http://nzbget.test:6789',
} as const;

export interface TorrentEnv {
  database: AppDatabase;
  agent: MockAgent;
  app: FastifyInstance;
  browser: TestBrowser;
  upstream: Record<keyof typeof ORIGINS, FakeUpstream>;
  close(): Promise<void>;
}

export async function torrentEnv(
  options: {
    role?: 'admin' | 'user';
    configure?: Partial<Record<keyof typeof ORIGINS, Record<string, string>>>;
  } = {},
): Promise<TorrentEnv> {
  const database = await createTestDatabase();
  const agent = new MockAgent();
  agent.disableNetConnect();
  const upstream = Object.fromEntries(
    Object.entries(ORIGINS).map(([id, origin]) => [id, fakeUpstream(agent, origin)]),
  ) as Record<keyof typeof ORIGINS, FakeUpstream>;
  const app = buildApp({ database, dataDir: UNUSED_DATA_DIR, dispatcher: agent, ...noDns });
  await createUser(database, { email: EMAIL, password: PASSWORD, role: options.role ?? 'admin' });
  const configure = options.configure ?? {
    qbittorrent: { user: 'admin', password: 'secret' },
    transmission: { user: 'u', password: 'p' },
    deluge: { password: 'deluge' },
  };
  for (const [id, fields] of Object.entries(configure)) {
    applyServicePatch(database.db, id as keyof typeof ORIGINS, {
      url: ORIGINS[id as keyof typeof ORIGINS],
      ...fields,
    });
  }
  const browser = new TestBrowser(() => app);
  const login = await browser.login({ email: EMAIL, password: PASSWORD });
  if (login.statusCode !== 200) throw new Error(`connexion refusée (${login.statusCode})`);
  return {
    database,
    agent,
    app,
    browser,
    upstream,
    async close() {
      await app.close();
      await agent.close();
    },
  };
}
