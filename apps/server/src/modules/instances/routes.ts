// SPDX-License-Identifier: AGPL-3.0-or-later
// Instances Radarr/Sonarr (`AdminInstancesController`), réservées aux admins.
// Chaque mutation renvoie la liste à jour des instances du type concerné et
// invalide l'état de santé (la sonde suivante utilise la nouvelle URL).

import {
  instanceCreateRequestSchema,
  instanceListResponseSchema,
  instanceTestResponseSchema,
  instanceTypeSchema,
  instanceUpdateRequestSchema,
  type InstanceListResponse,
  type InstanceType,
} from '@hubarr/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { requireRole } from '../../plugins/access';
import { diagnose } from '../services/diagnose';
import {
  InstanceError,
  apiKeyOf,
  createInstance,
  deleteInstance,
  findInstanceById,
  listInstances,
  setDefaultInstance,
  setInstanceEnabled,
  toPublicInstance,
  updateInstance,
  type InstanceRow,
} from './instances';

const idParams = z.object({ id: z.coerce.number().int().positive() });
const typeParams = z.object({ type: instanceTypeSchema });

/** Saisie refusée → 400 `VALIDATION`, clé i18n `admin.instances.error.<raison>`. */
export function instanceErrorToApi(error: InstanceError): ApiError {
  return new ApiError(400, 'VALIDATION', {
    details: [
      {
        path: error.field,
        code: error.reason,
        message: `admin.instances.error.${error.reason}`,
        ...(error.detail === undefined ? {} : { reason: error.detail }),
      },
    ],
  });
}

export const instanceRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  app.addHook('onRequest', requireRole('admin'));

  const list = (type: InstanceType): InstanceListResponse => ({
    type,
    instances: listInstances(app.db, type).map(toPublicInstance),
  });
  const find = (id: number): InstanceRow => {
    const row = findInstanceById(app.db, id);
    if (row === null)
      throw new ApiError(404, 'NOT_FOUND', { message: 'admin.instances.flash.not_found' });
    return row;
  };
  const guard = async <T>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action();
    } catch (error) {
      if (error instanceof InstanceError) throw instanceErrorToApi(error);
      throw error;
    }
  };
  const afterMutation = () => {
    app.serviceHealth.invalidate();
  };
  const listResponse = { response: { 200: instanceListResponseSchema } };

  app.post(
    '/api/admin/instances/:type/add',
    { schema: { params: typeParams, body: instanceCreateRequestSchema, ...listResponse } },
    async (request) => {
      const { type } = request.params;
      await guard(() =>
        createInstance(app.db, type, request.body, { resolve: app.upstream.resolve }),
      );
      afterMutation();
      return list(type);
    },
  );

  app.post(
    '/api/admin/instances/:id/edit',
    { schema: { params: idParams, body: instanceUpdateRequestSchema, ...listResponse } },
    async (request) => {
      const row = find(request.params.id);
      await guard(() =>
        updateInstance(app.db, row, request.body, { resolve: app.upstream.resolve }),
      );
      afterMutation();
      return list(row.type as InstanceType);
    },
  );

  app.post(
    '/api/admin/instances/:id/delete',
    { schema: { params: idParams, ...listResponse } },
    async (request) => {
      const row = find(request.params.id);
      app.db.transaction((tx) => {
        deleteInstance(tx, row);
      });
      afterMutation();
      return list(row.type as InstanceType);
    },
  );

  app.post(
    '/api/admin/instances/:id/set-default',
    { schema: { params: idParams, ...listResponse } },
    async (request) => {
      const row = find(request.params.id);
      app.db.transaction((tx) => {
        setDefaultInstance(tx, row);
      });
      afterMutation();
      return list(row.type as InstanceType);
    },
  );

  app.post(
    '/api/admin/instances/:id/toggle-enabled',
    { schema: { params: idParams, ...listResponse } },
    async (request) => {
      const row = find(request.params.id);
      setInstanceEnabled(app.db, row, !row.enabled);
      afterMutation();
      return list(row.type as InstanceType);
    },
  );

  app.post(
    '/api/admin/instances/:id/test',
    { schema: { params: idParams, response: { 200: instanceTestResponseSchema } } },
    async (request, reply) => {
      const row = find(request.params.id);
      const type = row.type as InstanceType;
      // Sonde de **cette** instance, avec ses valeurs enregistrées.
      const result = await diagnose(
        app.db,
        type,
        { url: row.url, apiKey: apiKeyOf(row) ?? '' },
        app.upstream,
        row.slug,
      );
      void reply.header('cache-control', 'no-store');
      return result;
    },
  );
};
