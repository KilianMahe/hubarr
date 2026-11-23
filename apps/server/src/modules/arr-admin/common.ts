// SPDX-License-Identifier: AGPL-3.0-or-later
// Outils partagés des routes d'administration Radarr/Sonarr (P3b) : contexte
// d'un service (`kind`, base des chemins, garde de service, client), schémas
// de paramètres, fusion des configurations.
//
// Chemins : `/api` + chemin source (règle R1), soit
// `/api/medias/:slug/<kind>/<page>` ; les mêmes routes servent Radarr et
// Sonarr, enregistrées une fois par service (`routes.ts`).

import { ARR_ADMIN_CAPABILITIES, type ArrAdminCapability, type ArrKind } from '@hubarr/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import { ArrAdminClient, type ArrRecord, type ConfigSection } from '../../integrations/arr/admin';
import type { InstanceRow } from '../instances/instances';
import { boundInstance } from '../movies/common';
import { arrClient } from '../services/clients';

export { idParams, positiveInt, rawQuery, scalar, slugParams } from '../movies/common';

export interface AdminContext {
  kind: ArrKind;
  /** `/api/medias/:slug/<kind>`. */
  base: string;
  /** Garde de service (instance liée à `:slug`, D67). */
  config: { service: ArrKind };
  instanceOf(request: FastifyRequest): InstanceRow;
  clientOf(request: FastifyRequest): ArrAdminClient;
  /** Vide la bibliothèque en cache de l'instance (films ou séries modifiés). */
  invalidateLibrary(request: FastifyRequest): void;
  has(capability: ArrAdminCapability): boolean;
}

export function adminContext(app: FastifyInstance, kind: ArrKind): AdminContext {
  const instanceOf = (request: FastifyRequest) => boundInstance(request, kind);
  return {
    kind,
    base: `/api/medias/:slug/${kind}`,
    config: { service: kind },
    instanceOf,
    clientOf: (request) => new ArrAdminClient(arrClient(app, instanceOf(request)), kind),
    invalidateLibrary: (request) => {
      app.cache.library.invalidate(kind, instanceOf(request).slug);
    },
    has: (capability) => ARR_ADMIN_CAPABILITIES[kind][capability],
  };
}

/** Identifiant numérique positif d'un élément (`:id`). */
export const itemParams = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  id: z.coerce.number().int().positive(),
});

/** Section absente de l'instance → 404 `media.api.config_not_found` (comme l'original). */
export function configNotFound(service: ArrKind): ApiError {
  return new ApiError(404, 'NOT_FOUND', { service, message: 'media.api.config_not_found' });
}

/**
 * Enregistre une section de configuration fusionnée avec la section actuelle
 * (`array_merge($current, $request->toArray())` de l'original) et renvoie la
 * section enregistrée.
 */
export async function mergeConfig(
  client: ArrAdminClient,
  section: ConfigSection,
  patch: ArrRecord,
): Promise<ArrRecord> {
  const current = await client.config(section);
  if (current === null) throw configNotFound(client.kind);
  const saved = await client.saveConfig(section, { ...current, ...patch, id: current.id });
  return saved ?? { ...current, ...patch };
}

/** Ressource renvoyée par l'instance après un ajout ou une modification (corps vide → l'envoi). */
export function savedOr(saved: ArrRecord | null, sent: ArrRecord): ArrRecord {
  return saved ?? sent;
}

/** `{ id, name }` des éléments nommés (profils, formats, langues). */
export function namedRefs(items: ArrRecord[], key: 'name' | 'label' = 'name') {
  return items.flatMap((item) =>
    typeof item.id === 'number'
      ? [{ id: item.id, name: typeof item[key] === 'string' ? item[key] : `#${item.id}` }]
      : [],
  );
}

/** Éléments conformes au schéma ; les autres (forme inattendue) sont écartés. */
export function validItems<T>(schema: z.ZodType<T>, items: readonly unknown[]): T[] {
  return items.flatMap((item) => {
    const result = schema.safeParse(item);
    return result.success ? [result.data] : [];
  });
}
