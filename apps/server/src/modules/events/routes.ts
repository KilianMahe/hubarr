// SPDX-License-Identifier: AGPL-3.0-or-later
// Flux temps réel `GET /api/events?topics=a,b` (P5.1) : Server-Sent
// Events multiplexés, utilisateur connecté requis. Chaque sujet accepté (droits
// et service configuré, `topics.ts`) abonne la connexion au poller partagé du
// sujet ; chaque relecture est envoyée en `data: {"topic","data"}`. Les sujets
// refusés sont annoncés dans l'événement `ready` (le navigateur garde alors le
// polling pour eux). Battement toutes les 15 s, `retry` de 3 s ; la connexion
// se ferme proprement à l'arrêt du serveur.
//
// Toute mutation (`POST`) sur un jeu de données partagé (torrents, file
// Usenet, file d'attente d'une instance) invalide sa lecture partagée : la
// relecture suivante montre aussitôt l'effet de l'action.

import type { ServicesHealthResponse } from '@hubarr/shared';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { scopeHealth } from '../health/routes';
import { resolveTopic, sharedKeysFor } from './topics';

/**
 * Invalidation des lectures partagées après une mutation, posée à la racine de
 * l'application (un hook de plugin ne verrait que ses propres routes).
 */
export function registerSharedInvalidation(app: FastifyInstance): void {
  app.addHook('onResponse', async (request, reply) => {
    if (request.method !== 'POST' || reply.statusCode >= 400) return;
    const keys = sharedKeysFor(request.url);
    if (keys === 'all') app.live.invalidateAll();
    else for (const key of keys) app.live.invalidate(key);
  });
}

export const HEARTBEAT_MS = 15_000;
const MAX_TOPICS = 32;

const querySchema = z.object({ topics: z.string().max(2_000).catch('') });

function write(reply: FastifyReply, chunk: string): void {
  if (!reply.raw.writableEnded && !reply.raw.destroyed) reply.raw.write(chunk);
}

export const eventsRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const open = new Set<FastifyReply>();

  instance.addHook('onClose', async () => {
    for (const reply of open) reply.raw.end();
    open.clear();
    instance.live.close();
  });

  app.get(
    '/api/events',
    { config: { access: 'user' }, schema: { querystring: querySchema } },
    async (request, reply) => {
      const user = request.user;
      if (user === null) throw new ApiError(401, 'UNAUTHENTICATED');
      const names = [
        ...new Set(
          request.query.topics
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t !== ''),
        ),
      ].slice(0, MAX_TOPICS);
      const accepted: string[] = [];
      const rejected: string[] = [];
      const specs = names.flatMap((name) => {
        const spec = resolveTopic(instance, name, user);
        (spec === null ? rejected : accepted).push(name);
        return spec === null ? [] : [spec];
      });

      // Réponse prise en main : les en-têtes posés jusqu'ici (cookie de session
      // glissante) sont repris, plus ceux d'un flux SSE.
      reply.hijack();
      const headers: Record<string, string | string[] | number> = {};
      for (const [name, value] of Object.entries(reply.getHeaders())) {
        if (value !== undefined) headers[name] = value;
      }
      reply.raw.writeHead(200, {
        ...headers,
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        'x-content-type-options': 'nosniff',
      });
      open.add(reply);
      write(
        reply,
        `retry: 3000\nevent: ready\ndata: ${JSON.stringify({ accepted, rejected })}\n\n`,
      );

      // Le sujet `health` est commun à tous : chacun n'en reçoit que ce qu'il peut lire.
      const scope = request.access;
      const view = (name: string, data: unknown) =>
        name === 'health' ? scopeHealth(data as ServicesHealthResponse, scope) : data;
      const unsubscribe = specs.map((spec) =>
        instance.live.subscribe(spec, (data) => {
          write(
            reply,
            `data: ${JSON.stringify({ topic: spec.name, data: view(spec.name, data) })}\n\n`,
          );
        }),
      );
      const heartbeat = setInterval(() => {
        write(reply, ': ping\n\n');
      }, HEARTBEAT_MS);
      const cleanup = () => {
        clearInterval(heartbeat);
        for (const stop of unsubscribe) stop();
        open.delete(reply);
      };
      request.raw.on('close', cleanup);
      reply.raw.on('close', cleanup);
    },
  );
};
