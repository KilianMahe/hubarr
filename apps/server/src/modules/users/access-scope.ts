// SPDX-License-Identifier: AGPL-3.0-or-later
// Périmètre d'accès d'un compte, pour les pages qui agrègent plusieurs
// services (dashboard, calendrier, découverte, recherche, flux temps réel,
// bootstrap) : elles ne lisent que les services et les instances que le
// compte peut lire, au lieu de répondre 403 en bloc.
//
// `cacheKey` distingue les agrégats mis en cache : vide pour un admin (les
// clés restent celles d'avant), dérivé des droits de lecture sinon (deux
// comptes aux mêmes droits partagent l'entrée).

import { hasAccess, type AccessLevel, type AuthUser, type ServiceId } from '@hubarr/shared';
import type { DbExecutor } from '../../db/client';
import { listEnabledInstances, type InstanceRow } from '../instances/instances';
import { isServiceConfigured } from '../services/config';

export interface AccessScope {
  readonly admin: boolean;
  /** Suffixe des clés de cache des agrégats (`''` pour un admin). */
  readonly cacheKey: string;
  /** Niveau d'accès au service (instance Radarr/Sonarr ; sans slug : au moins une). */
  can(service: ServiceId, slug: string | null, level?: AccessLevel): boolean;
  /** Instances actives que le compte peut lire (ou modifier). */
  instances(type: 'radarr' | 'sonarr', level?: AccessLevel): InstanceRow[];
  /** Service utilisable et lisible (Radarr/Sonarr : une instance active lisible). */
  configured(service: ServiceId): boolean;
}

export function accessScope(db: DbExecutor, user: AuthUser | null): AccessScope {
  const admin = user?.role === 'admin';
  const can = (service: ServiceId, slug: string | null, level: AccessLevel = 'read') =>
    hasAccess(user, service, slug, level);
  const instances = (type: 'radarr' | 'sonarr', level: AccessLevel = 'read') =>
    listEnabledInstances(db, type).filter((row) => admin || can(type, row.slug, level));
  const granted = user === null || admin ? [] : Object.keys(user.permissions).sort();
  return {
    admin,
    cacheKey: admin ? '' : `:u[${granted.join(',')}]`,
    can,
    instances,
    configured: (service) => {
      if (!isServiceConfigured(db, service)) return false;
      if (admin) return true;
      if (service === 'radarr' || service === 'sonarr') return instances(service).length > 0;
      return can(service, null);
    },
  };
}
