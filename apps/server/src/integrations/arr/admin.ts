// SPDX-License-Identifier: AGPL-3.0-or-later
// Client d'administration Radarr/Sonarr (P3b) : port des méthodes
// d'administration de `RadarrClient.php` et `SonarrClient.php` (indexeurs,
// clients, listes, notifications, métadonnées, profils, formats, étiquettes,
// configurations, sauvegardes, mises à jour, tâches, journaux…).
//
// Les deux services exposent les mêmes chemins `/api/v3/…` pour toutes ces
// ressources ; seules les exclusions d'import diffèrent (`/exclusions` pour
// Radarr, `/importlistexclusion` pour Sonarr). Un seul client, paramétré par
// `kind`, sert donc les deux (P3b).
//
// Les ressources sont renvoyées telles quelles (schémas ouverts, D97), avec
// leurs secrets masqués (`secrets.ts`). Une erreur lève une `UpstreamError`
// (D63) ; les tests d'une ressource renvoient le refus de validation de
// l'instance comme bilan (`{ ok: false, message }`) au lieu de lever.

import type { ArrKind, ProviderTestResponse } from '@hubarr/shared';
import { isUpstreamError, type HttpClient, type Query } from '../http';
import { ARR_ACTION_TIMEOUT_MS } from './client';

/** Ressources à schéma dynamique (« providers ») communes aux deux services. */
export const PROVIDER_RESOURCES = {
  indexers: '/api/v3/indexer',
  downloadClients: '/api/v3/downloadclient',
  importLists: '/api/v3/importlist',
  notifications: '/api/v3/notification',
  metadata: '/api/v3/metadata',
} as const;
export type ProviderResource = keyof typeof PROVIDER_RESOURCES;

/** Ressources à identifiant numérique, sans schéma. */
export const SIMPLE_RESOURCES = {
  qualityProfiles: '/api/v3/qualityprofile',
  delayProfiles: '/api/v3/delayprofile',
  customFormats: '/api/v3/customformat',
  autoTags: '/api/v3/autotagging',
  tags: '/api/v3/tag',
  rootFolders: '/api/v3/rootfolder',
  remotePathMappings: '/api/v3/remotepathmapping',
  customFilters: '/api/v3/customfilter',
  backups: '/api/v3/system/backup',
} as const;
export type SimpleResource = keyof typeof SIMPLE_RESOURCES;

/** Sections de configuration (`/api/v3/config/<nom>`). */
export const CONFIG_SECTIONS = [
  'host',
  'ui',
  'naming',
  'mediamanagement',
  'indexer',
  'downloadclient',
  'importlist',
  'metadata',
] as const;
export type ConfigSection = (typeof CONFIG_SECTIONS)[number];

/** Chemin des exclusions d'import, propre à chaque service. */
export function exclusionPath(kind: ArrKind): string {
  return kind === 'radarr' ? '/api/v3/exclusions' : '/api/v3/importlistexclusion';
}

export type ArrRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ArrRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Liste attendue : un corps vide ou d'une autre forme donne `[]`. */
function records(value: unknown): ArrRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/**
 * Lecture et écriture génériques des ressources d'une API *arr (Radarr,
 * Sonarr en v3, Prowlarr en v1), chemin complet fourni par l'appelant.
 */
export class ArrResourceClient {
  constructor(readonly http: HttpClient) {}

  // ── Lecture et écriture génériques ─────────────────────────────────────────

  async list(path: string, query?: Query): Promise<ArrRecord[]> {
    return records(await this.http.get(path, query));
  }

  /** Ressource unique (configuration, élément) ; `null` si le corps est vide. */
  async one(path: string, query?: Query): Promise<ArrRecord | null> {
    const value = await this.http.get(path, query);
    return isRecord(value) ? value : null;
  }

  async create(path: string, body: unknown): Promise<ArrRecord | null> {
    const value = await this.http.post(path, body, { timeoutMs: ARR_ACTION_TIMEOUT_MS });
    return isRecord(value) ? value : null;
  }

  async update(path: string, id: number, body: unknown): Promise<ArrRecord | null> {
    const value = await this.http.put(`${path}/${id}`, body, {
      timeoutMs: ARR_ACTION_TIMEOUT_MS,
    });
    return isRecord(value) ? value : null;
  }

  async remove(path: string, id: number): Promise<void> {
    await this.http.delete(`${path}/${id}`);
  }

  /** Suppression groupée (`DELETE …/bulk`, ids dans le corps). */
  async removeBulk(path: string, ids: readonly number[]): Promise<void> {
    await this.http.request({
      method: 'DELETE',
      path: `${path}/bulk`,
      json: { ids: [...ids] },
      responseType: 'none',
    });
  }

  /** Modèles de création (`…/schema`). */
  async schema(path: string): Promise<ArrRecord[]> {
    return this.list(`${path}/schema`);
  }

  /**
   * Test d'une ressource (`POST …/test`). Un refus de l'instance (4xx, erreurs
   * de validation) devient un bilan `ok: false` avec son message ; une
   * instance injoignable ou en erreur 5xx lève comme le reste.
   */
  async test(path: string, body: unknown): Promise<ProviderTestResponse> {
    try {
      await this.http.request({
        method: 'POST',
        path: `${path}/test`,
        json: body,
        timeoutMs: 30_000,
        responseType: 'none',
      });
      return { ok: true, message: null };
    } catch (error) {
      if (
        isUpstreamError(error) &&
        error.kind === 'http' &&
        error.info.status !== undefined &&
        error.info.status >= 400 &&
        error.info.status < 500
      ) {
        return { ok: false, message: error.info.message ?? null };
      }
      throw error;
    }
  }
}

/** Administration d'une instance Radarr ou Sonarr (`/api/v3`). */
export class ArrAdminClient extends ArrResourceClient {
  constructor(
    http: HttpClient,
    readonly kind: ArrKind,
  ) {
    super(http);
  }

  // ── Configurations ─────────────────────────────────────────────────────────

  config(section: ConfigSection): Promise<ArrRecord | null> {
    return this.one(`/api/v3/config/${section}`);
  }

  /** Enregistre une section complète (`PUT /config/<nom>/<id>`). */
  async saveConfig(section: ConfigSection, config: ArrRecord): Promise<ArrRecord | null> {
    const id = typeof config.id === 'number' ? config.id : 1;
    return this.update(`/api/v3/config/${section}`, id, config);
  }

  // ── Commandes ──────────────────────────────────────────────────────────────

  /** Lance une commande et renvoie son identifiant (`null` si l'instance n'en donne pas). */
  async command(name: string, extra: ArrRecord = {}): Promise<number | null> {
    const value = await this.http.post('/api/v3/command', { ...extra, name });
    return isRecord(value) && typeof value.id === 'number' ? value.id : null;
  }
}
