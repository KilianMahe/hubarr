// SPDX-License-Identifier: AGPL-3.0-or-later
// « Vu » via Tracearr (lot 7) :
//   GET  /api/profil/tracearr        identités proposées, association, état de la synchronisation
//   POST /api/profil/tracearr        associe (ou dissocie) son identité Tracearr
//   POST /api/admin/tracearr/resync  réimport complet des identités associées (admin)
//   GET  /api/tracearr/watched       titres vus par l'utilisateur connecté
// Sans garde de service : un Tracearr absent donne une réponse vide, pas une
// erreur (les badges disparaissent simplement). Les identités ne circulent que
// sous forme de jeton (`tracearrUserKey`).

import {
  tracearrLinkRequestSchema,
  tracearrLinkSchema,
  tracearrWatchedSchema,
  type TracearrLink,
} from '@hubarr/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { users } from '../../db/schema';
import { ApiError } from '../../http/errors';
import type { ZodTypeProvider } from '../../http/zod';
import { tracearrUserKey, type TracearrIdentity } from '../../integrations/activity/tracearr';
import { requireRole } from '../../plugins/access';
import { findUserById, type UserRow } from '../users/users';
import { forgetIdentityIfUnused, syncStateOf, tracearrClient, watchedOf } from './sync';

export const tracearrWatchRoutes: FastifyPluginAsync = async (instance) => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const sync = instance.watchSync;

  function currentUser(request: FastifyRequest): UserRow {
    const row = request.user === null ? undefined : findUserById(app.db, request.user.id);
    if (row === undefined) throw new ApiError(401, 'UNAUTHENTICATED');
    return row;
  }

  async function identities(): Promise<
    { ok: true; list: TracearrIdentity[] } | { ok: false; reason: TracearrLink['unavailable'] }
  > {
    const client = tracearrClient(instance);
    if (client === null) return { ok: false, reason: 'unconfigured' };
    const list = await client.identities();
    if (list === 'unsupported') return { ok: false, reason: 'unsupported' };
    if (list === null) return { ok: false, reason: 'unreachable' };
    return { ok: true, list };
  }

  async function linkOf(user: UserRow): Promise<TracearrLink> {
    const found = await identities();
    const list = found.ok ? found.list : [];
    const linkedId = user.tracearrUserId;
    const linkedName =
      linkedId === null ? null : (list.find((identity) => identity.id === linkedId)?.name ?? null);
    const linkedKey = tracearrUserKey(linkedId);
    return {
      unavailable: found.ok ? null : found.reason,
      accounts: list
        .flatMap((identity) => {
          const key = tracearrUserKey(identity.id);
          return key === null ? [] : [{ key, name: identity.name }];
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      linked: linkedKey === null ? null : { key: linkedKey, name: linkedName },
      sync: linkedId === null ? null : syncStateOf(app.db, linkedId),
    };
  }

  app.get(
    '/api/profil/tracearr',
    { schema: { response: { 200: tracearrLinkSchema } } },
    async (request) => linkOf(currentUser(request)),
  );

  app.post(
    '/api/profil/tracearr',
    { schema: { body: tracearrLinkRequestSchema, response: { 200: tracearrLinkSchema } } },
    async (request) => {
      const user = currentUser(request);
      const { key } = request.body;
      let next: string | null = null;
      if (key !== null) {
        const found = await identities();
        if (!found.ok) throw new ApiError(503, 'SERVICE_UNREACHABLE', { service: 'tracearr' });
        const identity = found.list.find((candidate) => tracearrUserKey(candidate.id) === key);
        if (identity === undefined) throw new ApiError(404, 'NOT_FOUND', { service: 'tracearr' });
        next = identity.id;
      }
      const previous = user.tracearrUserId;
      if (next === previous) return linkOf(user);
      const [row] = app.db
        .update(users)
        .set({ tracearrUserId: next })
        .where(eq(users.id, user.id))
        .returning()
        .all();
      if (previous !== null) forgetIdentityIfUnused(app.db, previous);
      // Premier import en arrière-plan : il peut parcourir tout l'historique.
      if (next !== null) {
        sync.sync(next).catch((error: unknown) => {
          app.log.warn({ err: error }, 'synchronisation Tracearr en échec');
        });
      }
      return linkOf(row ?? user);
    },
  );

  void app.register(async (scope) => {
    scope.addHook('onRequest', requireRole('admin'));
    scope
      .withTypeProvider<ZodTypeProvider>()
      .post(
        '/api/admin/tracearr/resync',
        { schema: { response: { 200: tracearrLinkSchema } } },
        async (request) => {
          await sync.syncAll({ full: true });
          return linkOf(currentUser(request));
        },
      );
  });

  app.get(
    '/api/tracearr/watched',
    { schema: { response: { 200: tracearrWatchedSchema } } },
    async (request) => {
      const id = currentUser(request).tracearrUserId;
      if (id === null) return { linked: false, movies: [], shows: [] };
      return { linked: true, ...watchedOf(app.db, id) };
    },
  );
};
