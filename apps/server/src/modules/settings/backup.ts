// SPDX-License-Identifier: AGPL-3.0-or-later
// Export et import de la configuration : port de `AdminSettingsController::
// export`, `import` et `exportCounts`, au format propre à Hubarr.
//
// Contenu de l'export (version 1) :
// - `settings` : préférences d'affichage, mise en page du dashboard, visibilité
//   dans le menu (rien d'autre : l'état de l'installation n'a pas à voyager) ;
// - `services` : URL, utilisateur et interrupteur de chaque service unique ;
// - `instances` : instances Radarr/Sonarr (slug, nom, URL, activation, position,
//   défaut, profil de qualité par défaut).
// Aucune clé d'API ni mot de passe : l'admin les ressaisit après l'import.
//
// Import additif : une instance existante (même type et slug) est mise à jour
// en gardant sa clé ; une nouvelle est créée sans clé ; rien n'est supprimé.
// Un secret glissé dans le fichier est ignoré.

import {
  DASHBOARD_SECTIONS,
  EXPORT_FORMAT_KEY,
  EXPORT_VERSION,
  INSTANCE_TYPES,
  SERVICE_IDS,
  isDisplayOptionKey,
  isInstanceType,
  isServiceId,
  type FlatServiceId,
  type ImportResult,
  type ExportCounts,
} from '@hubarr/shared';
import type { Db, DbExecutor } from '../../db/client';
import type { HostResolver } from '../../integrations/http';
import {
  apiKeyOf,
  createInstance,
  defaultQualityProfileIdOf,
  getInstanceBySlug,
  listInstances,
  setDefaultInstance,
  updateInstance,
} from '../instances/instances';
import { applyServicePatch, isSaved, readServiceConfig } from '../services/config';
import {
  DASHBOARD_ORDER_KEY,
  applyDisplayPatch,
  saveDashboardLayout,
  readDashboardLayout,
} from './preferences';
import { deleteSetting, listSettings, setSetting } from './settings';

const FLAT_IDS = SERVICE_IDS.filter(
  (id): id is FlatServiceId => id !== 'radarr' && id !== 'sonarr',
);

/** Noms de clé qui trahissent un secret (`EXPORT_SENSITIVE_PATTERNS`). */
const SENSITIVE = ['api_key', 'apikey', 'password', 'secret', 'token'];

export function isSensitiveKey(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE.some((pattern) => lower.includes(pattern));
}

/** Réglages exportables : préférences, mise en page, menu. */
function isExportableSetting(key: string): boolean {
  return (
    !isSensitiveKey(key) &&
    (isDisplayOptionKey(key) ||
      key === DASHBOARD_ORDER_KEY ||
      key.startsWith('dashboard_hide_') ||
      key.startsWith('sidebar_hide_'))
  );
}

export interface ConfigExport {
  [EXPORT_FORMAT_KEY]: number;
  exported_at: string;
  settings: Record<string, unknown>;
  services: Record<string, { url: string; user: string; enabled: boolean }>;
  instances: {
    type: string;
    slug: string;
    name: string;
    url: string;
    enabled: boolean;
    position: number;
    is_default: boolean;
    default_quality_profile_id: number | null;
  }[];
}

export function buildExport(db: Db, now: Date = new Date()): ConfigExport {
  const settings: Record<string, unknown> = {};
  for (const { key, value } of listSettings(db).sort((a, b) => a.key.localeCompare(b.key))) {
    if (isExportableSetting(key)) settings[key] = value;
  }
  const services: ConfigExport['services'] = {};
  for (const id of FLAT_IDS) {
    const config = readServiceConfig(db, id);
    if (isSaved(config) || !config.enabled) {
      services[id] = { url: config.url, user: config.user, enabled: config.enabled };
    }
  }
  const instances = INSTANCE_TYPES.flatMap((type) =>
    listInstances(db, type).map((row) => ({
      type,
      slug: row.slug,
      name: row.name,
      url: row.url,
      enabled: row.enabled,
      position: row.position,
      is_default: row.isDefault,
      default_quality_profile_id: defaultQualityProfileIdOf(row),
    })),
  );
  return {
    [EXPORT_FORMAT_KEY]: EXPORT_VERSION,
    exported_at: now.toISOString(),
    settings,
    services,
    instances,
  };
}

/** Compteurs de la section « Sauvegarde » : entrées exportées, secrets laissés de côté. */
export function exportCounts(db: Db): ExportCounts {
  const data = buildExport(db);
  let skipped = 0;
  for (const id of FLAT_IDS) {
    const config = readServiceConfig(db, id);
    if (config.apiKey !== '') skipped++;
    if (config.password !== '') skipped++;
  }
  for (const type of INSTANCE_TYPES) {
    skipped += listInstances(db, type).filter((row) => apiKeyOf(row) !== null).length;
  }
  return {
    exportable:
      Object.keys(data.settings).length + Object.keys(data.services).length + data.instances.length,
    skipped,
  };
}

export type ImportFailure = 'invalid_json' | 'unknown_format';

/** Profondeur maximale d'un fichier importé (8 niveaux, comme `json_decode`). */
const MAX_DEPTH = 8;

function depthOf(value: unknown, level = 1): number {
  if (typeof value !== 'object' || value === null) return level;
  let deepest = level;
  for (const child of Object.values(value)) deepest = Math.max(deepest, depthOf(child, level + 1));
  return deepest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Lit et vérifie le fichier ; renvoie l'objet ou la raison du refus. */
export function parseImport(
  raw: string,
): { ok: true; payload: Record<string, unknown> } | { ok: false; reason: ImportFailure } {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
  if (depthOf(payload) > MAX_DEPTH) return { ok: false, reason: 'invalid_json' };
  if (
    !isRecord(payload) ||
    payload[EXPORT_FORMAT_KEY] !== EXPORT_VERSION ||
    !isRecord(payload.settings)
  ) {
    return { ok: false, reason: 'unknown_format' };
  }
  return { ok: true, payload };
}

function importSetting(db: DbExecutor, key: string, value: unknown): boolean {
  if (isSensitiveKey(key)) return false;
  if (isDisplayOptionKey(key)) {
    if (typeof value !== 'string') return false;
    // Les préférences de langue sont masquées dans « Affichage » mais voyagent avec l'export.
    if (key === 'display_language' || key === 'display_metadata_language') {
      setSetting(db, key, value);
      return true;
    }
    applyDisplayPatch(db, { [key]: value });
    return true;
  }
  if (key === DASHBOARD_ORDER_KEY) {
    const order = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(',')
        : null;
    if (order === null) return false;
    const hidden = readDashboardLayout(db)
      .filter((row) => !row.visible)
      .map((row) => row.key);
    saveDashboardLayout(db, {
      order: order.filter((entry): entry is string => typeof entry === 'string'),
      hidden,
    });
    return true;
  }
  const hide = /^dashboard_hide_(.+)$/.exec(key)?.[1] ?? null;
  if (hide !== null) {
    if (!(DASHBOARD_SECTIONS as readonly string[]).includes(hide)) return false;
    if (value === true || value === '1') setSetting(db, `dashboard_hide_${hide}`, true);
    else deleteSetting(db, `dashboard_hide_${hide}`);
    return true;
  }
  const sidebar = /^sidebar_hide_(.+)$/.exec(key)?.[1] ?? null;
  if (sidebar !== null && (isServiceId(sidebar) || sidebar === 'calendar')) {
    if (value === true || value === '1') setSetting(db, `sidebar_hide_${sidebar}`, true);
    else deleteSetting(db, `sidebar_hide_${sidebar}`);
    return true;
  }
  return false;
}

export async function applyImport(
  db: Db,
  payload: Record<string, unknown>,
  options: { resolve?: HostResolver | undefined } = {},
): Promise<ImportResult> {
  let applied = 0;
  let skipped = 0;
  const settings = isRecord(payload.settings) ? payload.settings : {};
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(settings)) {
      if (importSetting(tx, key, value)) applied++;
      else skipped++;
    }
    const services = isRecord(payload.services) ? payload.services : {};
    for (const [id, raw] of Object.entries(services)) {
      if (!isServiceId(id) || id === 'radarr' || id === 'sonarr' || !isRecord(raw)) {
        skipped++;
        continue;
      }
      // Seuls URL, utilisateur et interrupteur sont lus : un secret est ignoré.
      applyServicePatch(tx, id, {
        ...(typeof raw.url === 'string' ? { url: raw.url.trim() } : {}),
        ...(typeof raw.user === 'string' ? { user: raw.user.trim() } : {}),
        ...(typeof raw.enabled === 'boolean' ? { enabled: raw.enabled } : {}),
      });
      applied++;
    }
  });

  let instancesApplied = 0;
  let instancesSkipped = 0;
  const defaults = new Map<string, string>();
  const rows = Array.isArray(payload.instances) ? payload.instances : [];
  for (const raw of rows) {
    if (!isRecord(raw)) {
      instancesSkipped++;
      continue;
    }
    const type = raw.type;
    const slug = typeof raw.slug === 'string' ? raw.slug : '';
    const name = typeof raw.name === 'string' ? raw.name : '';
    const url = typeof raw.url === 'string' ? raw.url : '';
    if (!isInstanceType(type) || slug === '' || name === '' || url === '') {
      instancesSkipped++;
      continue;
    }
    const enabled = typeof raw.enabled === 'boolean' ? raw.enabled : true;
    const position =
      typeof raw.position === 'number' && Number.isInteger(raw.position) && raw.position >= 0
        ? raw.position
        : null;
    const profile = raw.default_quality_profile_id;
    const defaultQualityProfileId =
      typeof profile === 'number' && Number.isInteger(profile) && profile > 0 ? profile : null;
    try {
      const existing = getInstanceBySlug(db, type, slug);
      if (existing !== null) {
        // Clé d'API vide : celle déjà saisie est conservée.
        await updateInstance(
          db,
          existing,
          { name, url, slug, enabled, position, defaultQualityProfileId },
          options,
        );
      } else {
        await createInstance(
          db,
          type,
          { name, url, slug, enabled, position, defaultQualityProfileId },
          options,
        );
      }
      instancesApplied++;
      if (raw.is_default === true) defaults.set(type, slug);
    } catch {
      instancesSkipped++;
    }
  }
  // Drapeaux « par défaut » posés à la fin, une fois tous les slugs en place.
  for (const [type, slug] of defaults) {
    const row = getInstanceBySlug(db, type as 'radarr' | 'sonarr', slug);
    if (row !== null) setDefaultInstance(db, row);
  }
  return { applied, skipped, instancesApplied, instancesSkipped };
}
