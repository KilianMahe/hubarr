// SPDX-License-Identifier: AGPL-3.0-or-later
// Configuration des services à configuration unique (tous sauf Radarr/Sonarr).
//
// Dans l'original, ces valeurs vivaient en clés plates de `setting`
// (`prowlarr_url`, `prowlarr_api_key`, `prowlarr_enabled`…). Hubarr range
// chaque service dans **une** ligne `service_instance` (type = slug = id du
// service ; PLAN §3) : URL dans `url`, identifiants dans `credentials`,
// interrupteur dans `enabled`. Une ligne absente vaut « jamais configuré, activé ».

import {
  SERVICE_SETTINGS,
  type FlatServiceId,
  type ServiceId,
  type ServicePatch,
} from '@hubarr/shared';
import { and, eq } from 'drizzle-orm';
import type { Db, DbExecutor } from '../../db/client';
import { serviceInstances } from '../../db/schema';
import { hasAnyEnabledInstance } from '../instances/instances';

export interface FlatServiceConfig {
  url: string;
  apiKey: string;
  user: string;
  password: string;
  enabled: boolean;
}

const EMPTY: FlatServiceConfig = { url: '', apiKey: '', user: '', password: '', enabled: true };

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function rowFor(db: DbExecutor, id: FlatServiceId) {
  return db
    .select()
    .from(serviceInstances)
    .where(and(eq(serviceInstances.type, id), eq(serviceInstances.slug, id)))
    .get();
}

/** Configuration enregistrée (valeurs vides si le service n'a jamais été configuré). */
export function readServiceConfig(db: DbExecutor, id: FlatServiceId): FlatServiceConfig {
  const row = rowFor(db, id);
  if (row === undefined) return { ...EMPTY };
  return {
    url: row.url,
    apiKey: str(row.credentials.apiKey),
    user: str(row.credentials.user),
    password: str(row.credentials.password),
    enabled: row.enabled,
  };
}

/** Une URL ou une clé est enregistrée : le service apparaît « connecté » dans les paramètres. */
export function isSaved(config: FlatServiceConfig): boolean {
  return config.url !== '' || config.apiKey !== '';
}

/** Champs requis présents (sans tenir compte de l'interrupteur). */
export function hasRequiredFields(id: FlatServiceId, config: FlatServiceConfig): boolean {
  return SERVICE_SETTINGS[id].required.every((key) => config[key] !== '');
}

/**
 * Service utilisable (`HealthService::isConfigured`) : champs requis présents
 * et service non désactivé ; Radarr/Sonarr : au moins une instance active.
 */
export function isServiceConfigured(db: DbExecutor, id: ServiceId): boolean {
  if (id === 'radarr' || id === 'sonarr') return hasAnyEnabledInstance(db, id);
  const config = readServiceConfig(db, id);
  if (SERVICE_SETTINGS[id].toggleable && !config.enabled) return false;
  return hasRequiredFields(id, config);
}

/** Service explicitement désactivé par son interrupteur. */
export function isServiceDisabled(db: DbExecutor, id: ServiceId): boolean {
  if (id === 'radarr' || id === 'sonarr' || !SERVICE_SETTINGS[id].toggleable) return false;
  return !readServiceConfig(db, id).enabled;
}

/**
 * Applique une modification (`saveSubmitted` d'origine, pour un service) :
 * champ absent inchangé, texte vide effacé sauf secret, `clear` explicite,
 * `remove` qui retire tout. Renvoie vrai si quelque chose a changé.
 */
export function applyServicePatch(db: DbExecutor, id: FlatServiceId, patch: ServicePatch): boolean {
  const before = readServiceConfig(db, id);
  if (patch.remove === true) {
    db.delete(serviceInstances)
      .where(and(eq(serviceInstances.type, id), eq(serviceInstances.slug, id)))
      .run();
    return isSaved(before) || !before.enabled;
  }

  const allowed = new Set<string>(SERVICE_SETTINGS[id].fields.map((field) => field.key));
  const next: FlatServiceConfig = { ...before };
  if (patch.url !== undefined && allowed.has('url')) next.url = patch.url;
  if (patch.user !== undefined && allowed.has('user')) next.user = patch.user;
  // Secrets : une saisie vide ne les efface pas (voir `servicePatchSchema`).
  if (patch.apiKey !== undefined && patch.apiKey !== '' && allowed.has('apiKey')) {
    next.apiKey = patch.apiKey;
  }
  if (patch.password !== undefined && patch.password !== '' && allowed.has('password')) {
    next.password = patch.password;
  }
  for (const key of patch.clear ?? []) {
    const spec = SERVICE_SETTINGS[id].fields.find((field) => field.key === key);
    if (spec !== undefined && 'clearable' in spec && spec.clearable) next[key] = '';
  }
  if (patch.enabled !== undefined && SERVICE_SETTINGS[id].toggleable) next.enabled = patch.enabled;

  const changed = (Object.keys(next) as (keyof FlatServiceConfig)[]).some(
    (key) => next[key] !== before[key],
  );
  if (!changed) return false;
  writeServiceConfig(db, id, next);
  return true;
}

function writeServiceConfig(db: DbExecutor, id: FlatServiceId, config: FlatServiceConfig): void {
  const credentials: Record<string, string> = {};
  if (config.apiKey !== '') credentials.apiKey = config.apiKey;
  if (config.user !== '') credentials.user = config.user;
  if (config.password !== '') credentials.password = config.password;
  db.insert(serviceInstances)
    .values({
      type: id,
      slug: id,
      name: SERVICE_SETTINGS[id].label,
      url: config.url,
      credentials,
      enabled: config.enabled,
      isDefault: true,
    })
    .onConflictDoUpdate({
      target: [serviceInstances.type, serviceInstances.slug],
      set: { url: config.url, credentials, enabled: config.enabled, updatedAt: new Date() },
    })
    .run();
}

/** Lecture groupée de tous les services à configuration unique. */
export function readAllServiceConfigs(db: Db): Record<FlatServiceId, FlatServiceConfig> {
  const out = {} as Record<FlatServiceId, FlatServiceConfig>;
  for (const id of Object.keys(SERVICE_SETTINGS) as ServiceId[]) {
    if (id === 'radarr' || id === 'sonarr') continue;
    out[id] = readServiceConfig(db, id);
  }
  return out;
}
