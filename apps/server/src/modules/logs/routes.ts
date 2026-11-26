// SPDX-License-Identifier: AGPL-3.0-or-later
// Journaux de l'application, réservés aux admins :
// - `GET /api/admin/logs` : dernières entrées du tampon en mémoire, filtrées
//   (niveau minimal, service, texte) et paginées (curseur `before`) ;
// - `GET /api/admin/logs/export` : les entrées filtrées en JSON Lines
//   (`hubarr-logs-<date>.jsonl`), des plus anciennes aux plus récentes.
//
// Les secrets sont masqués avant d'entrer dans le tampon (`logs/redact.ts`).

import { logsFilterSchema, logsQuerySchema, logsResponseSchema } from '@hubarr/shared';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from '../../http/zod';
import { guardAdminModule } from '../../plugins/access';

export const logsRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  guardAdminModule(app);

  app.get(
    '/api/admin/logs',
    { schema: { querystring: logsQuerySchema, response: { 200: logsResponseSchema } } },
    async (request, reply) => {
      void reply.header('cache-control', 'no-store');
      const page = app.logs.page(request.query);
      return {
        ...page,
        capacity: app.logs.capacity,
        level: app.logs.level,
        services: app.logs.services(),
      };
    },
  );

  app.get(
    '/api/admin/logs/export',
    { schema: { querystring: logsFilterSchema } },
    async (request, reply) => {
      const entries = app.logs.filter(request.query).reverse();
      const body = entries.map((entry) => JSON.stringify(entry)).join('\n');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      return reply
        .header('content-type', 'application/x-ndjson; charset=utf-8')
        .header('content-disposition', `attachment; filename="hubarr-logs-${stamp}.jsonl"`)
        .header('cache-control', 'no-store')
        .send(body === '' ? '' : `${body}\n`);
    },
  );
};
